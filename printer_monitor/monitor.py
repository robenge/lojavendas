import threading
import time
import datetime
import json
import smtplib
import subprocess
import platform
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from apscheduler.schedulers.background import BackgroundScheduler
from pysnmp.hlapi import *

def snmp_get(ip, oid, community='public'):
    """Consulta SNMP GET e retorna valor string, ou None se falhar."""
    iterator = getCmd(SnmpEngine(),
                      CommunityData(community),
                      UdpTransportTarget((ip, 161), timeout=1, retries=1),
                      ContextData(),
                      ObjectType(ObjectIdentity(oid)))
    errorIndication, errorStatus, errorIndex, varBinds = next(iterator)
    if errorIndication or errorStatus:
        return None
    for varBind in varBinds:
        return varBind[1].prettyPrint()
    return None

def ping(host):
    """Retorna True se o host responder ao ping."""
    param = '-n' if platform.system().lower() == 'windows' else '-c'
    timeout_param = '-w' if platform.system().lower() == 'windows' else '-W'
    command = ['ping', param, '1', timeout_param, '1', host]
    try:
        return subprocess.call(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
    except:
        return False

class PrinterMonitor(threading.Thread):
    def __init__(self, config, data_store, lock, snmp_community='public'):
        super().__init__(daemon=True)
        self.config = config
        self.data_store = data_store
        self.lock = lock
        self.snmp_community = snmp_community
        self.running = True
        self.email_config = config.get('email', {})
        self.alert_cooldown = 300  # 5 minutos
        self.last_alert = {}
        self.init_data_store()
        # Agendador de relatório diário
        self.scheduler = BackgroundScheduler()
        self.scheduler.add_job(self.daily_report, 'cron', hour=8, minute=0)
        self.scheduler.start()

    def init_data_store(self):
        with self.lock:
            for p in self.config.get('printers', []):
                ip = p['ip']
                if ip not in self.data_store:
                    self.data_store[ip] = {
                        'ip': ip,
                        'location': p.get('location', ''),
                        'site': p.get('site', ''),
                        'status': 'unknown',
                        'toner_black': None,
                        'toner_cyan': None,
                        'toner_magenta': None,
                        'toner_yellow': None,
                        'page_count': None,
                        'errors': [],
                        'last_update': None
                    }

    def reload_config(self, new_config):
        self.config = new_config
        self.email_config = new_config.get('email', {})
        self.snmp_community = new_config.get('snmp_community', 'public')
        self.init_data_store()

    def update_email_config(self, email_config):
        self.email_config = email_config

    def update_snmp_community(self, community):
        self.snmp_community = community

    def send_alert(self, printer_ip, alert_type, message):
        if not self.email_config or not self.email_config.get('recipient'):
            return
        now = time.time()
        key = (printer_ip, alert_type)
        if key in self.last_alert and (now - self.last_alert[key]) < self.alert_cooldown:
            return
        self.last_alert[key] = now
        subject = f"Alerta Impressora {printer_ip} - {alert_type}"
        body = f"Impressora: {printer_ip}\nAlerta: {alert_type}\nMensagem: {message}\nData: {datetime.datetime.now()}"
        try:
            msg = MIMEMultipart()
            msg['From'] = self.email_config['sender']
            msg['To'] = self.email_config['recipient']
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))
            server = smtplib.SMTP(self.email_config['server'], self.email_config['port'])
            server.starttls()
            server.login(self.email_config['sender'], self.email_config['password'])
            server.sendmail(self.email_config['sender'], self.email_config['recipient'], msg.as_string())
            server.quit()
            print(f"Alerta enviado: {subject}")
        except Exception as e:
            print(f"Erro ao enviar alerta: {e}")

    def get_toner_levels(self, ip):
        levels = {}
        mapping = {1: 'toner_black', 2: 'toner_cyan', 3: 'toner_magenta', 4: 'toner_yellow'}
        for i, name in mapping.items():
            val = snmp_get(ip, f"1.3.6.1.2.1.43.11.1.1.9.1.{i}", self.snmp_community)
            if val is not None:
                try:
                    levels[name] = int(val) if 0 <= int(val) <= 100 else None
                except:
                    levels[name] = None
            else:
                levels[name] = None
        return levels

    def get_page_count(self, ip):
        val = snmp_get(ip, "1.3.6.1.2.1.43.10.2.1.4.1.1", self.snmp_community)
        return int(val) if val and val.isdigit() else None

    def get_paper_status(self, ip):
        errors = []
        status = snmp_get(ip, "1.3.6.1.2.1.43.8.2.1.10.1.1", self.snmp_community)
        if status:
            try:
                status = int(status)
                if status == 2:
                    errors.append("no_paper")
                elif status == 3:
                    errors.append("paper_jam")
            except:
                pass
        return errors

    def check_printer(self, printer):
        ip = printer['ip']
        result = {
            'ip': ip,
            'location': printer.get('location', ''),
            'site': printer.get('site', ''),
            'status': 'offline',
            'toner_black': None,
            'toner_cyan': None,
            'toner_magenta': None,
            'toner_yellow': None,
            'page_count': None,
            'errors': [],
            'last_update': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        if not ping(ip):
            result['errors'].append('offline')
            return result
        snmp_ok = False
        toners = self.get_toner_levels(ip)
        if any(v is not None for v in toners.values()):
            snmp_ok = True
            result.update(toners)
        pages = self.get_page_count(ip)
        if pages is not None:
            snmp_ok = True
            result['page_count'] = pages
        paper_errors = self.get_paper_status(ip)
        if paper_errors:
            snmp_ok = True
            result['errors'].extend(paper_errors)
        if snmp_ok:
            result['status'] = 'online'
            for color in ['toner_black','toner_cyan','toner_magenta','toner_yellow']:
                if result.get(color) is not None and result[color] <= 10:
                    result['errors'].append(f"{color}_low")
        else:
            result['status'] = 'online (no snmp)'
        return result

    def evaluate_alerts(self, printer, old_data, new_data):
        ip = printer['ip']
        if old_data and old_data.get('status') != 'online' and new_data['status'] == 'online':
            self.send_alert(ip, 'online', 'Impressora voltou online.')
        if old_data and old_data.get('status') == 'online' and new_data['status'] != 'online':
            self.send_alert(ip, 'offline', 'Impressora está offline.')
        for color in ['toner_black','toner_cyan','toner_magenta','toner_yellow']:
            new_val = new_data.get(color)
            old_val = old_data.get(color) if old_data else None
            if new_val is not None and new_val <= 10:
                if old_val is None or old_val > 10:
                    self.send_alert(ip, f'{color}_low', f'Nível de {color} abaixo de 10% ({new_val}%).')
        new_errors = set(new_data.get('errors',[]))
        old_errors = set(old_data.get('errors',[])) if old_data else set()
        for err in new_errors - old_errors:
            if err in ('paper_jam', 'no_paper'):
                self.send_alert(ip, err, f'Erro detectado: {err}')

    def run(self):
        while self.running:
            printers = self.config.get('printers', [])
            for printer in printers:
                new_data = self.check_printer(printer)
                with self.lock:
                    old_data = self.data_store.get(printer['ip'])
                    self.data_store[printer['ip']] = new_data
                self.evaluate_alerts(printer, old_data, new_data)
            time.sleep(120)  # 2 minutos

    def daily_report(self):
        if not self.email_config or not self.email_config.get('recipient'):
            return
        with self.lock:
            printers = list(self.data_store.values())
        body = "Relatório diário de impressoras:\n\n" if printers else "Nenhuma impressora monitorada."
        for p in printers:
            body += f"IP: {p['ip']} ({p.get('location','')} - {p.get('site','')}) - Status: {p['status']}\n"
            if p.get('toner_black') is not None:
                body += f"  Toner Preto: {p['toner_black']}%\n"
            if p.get('errors'):
                body += f"  Erros: {', '.join(p['errors'])}\n"
            body += f"  Última atualização: {p.get('last_update','')}\n\n"
        subject = f"Relatório Diário de Impressoras - {datetime.date.today()}"
        try:
            msg = MIMEMultipart()
            msg['From'] = self.email_config['sender']
            msg['To'] = self.email_config['recipient']
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))
            server = smtplib.SMTP(self.email_config['server'], self.email_config['port'])
            server.starttls()
            server.login(self.email_config['sender'], self.email_config['password'])
            server.sendmail(self.email_config['sender'], self.email_config['recipient'], msg.as_string())
            server.quit()
            print("Relatório diário enviado.")
        except Exception as e:
            print(f"Erro no relatório: {e}")

    def stop(self):
        self.running = False
        self.scheduler.shutdown()