import threading
import time
import datetime
import json
import smtplib
import subprocess
import platform
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from apscheduler.schedulers.background import BackgroundScheduler

# --- Importação condicional do pysnmp ---
try:
    from pysnmp.hlapi import (
        getCmd, SnmpEngine, CommunityData,
        UdpTransportTarget, ContextData,
        ObjectType, ObjectIdentity
    )
    SNMP_AVAILABLE = True
except ImportError:
    SNMP_AVAILABLE = False
    print("AVISO: pysnmp não disponível. Apenas ping será usado.")

def snmp_get(ip, oid, community='public'):
    """Retorna string SNMP ou None em caso de falha."""
    if not SNMP_AVAILABLE:
        return None
    try:
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
    except Exception:
        return None

def ping(host):
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
        self.alert_cooldown = 300
        self.last_alert = {}
        
        # Histórico persistente de eventos
        self.history_file = 'history.json'
        self.history = self.load_history()
        
        self.init_data_store()
        self.scheduler = BackgroundScheduler()
        self.scheduler.add_job(self.daily_report, 'cron', hour=8, minute=0)
        self.scheduler.start()

    def load_history(self):
        if os.path.exists(self.history_file):
            try:
                with open(self.history_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
        return []

    def save_history(self):
        try:
            with open(self.history_file, 'w', encoding='utf-8') as f:
                json.dump(self.history, f, indent=4)
        except Exception as e:
            print("Erro ao salvar histórico:", e)

    def log_event(self, ip, event_type, message):
        event = {
            'timestamp': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'ip': ip,
            'type': event_type,
            'message': message
        }
        with self.lock:
            self.history.append(event)
            if len(self.history) > 2000: # Mantém os últimos 2000 eventos para não pesar
                self.history.pop(0)
        self.save_history()

    def init_data_store(self):
        with self.lock:
            config_ips = {p['ip'] for p in self.config.get('printers', [])}
            for ip in list(self.data_store.keys()):
                if ip not in config_ips:
                    del self.data_store[ip]
            for p in self.config.get('printers', []):
                ip = p['ip']
                if ip not in self.data_store:
                    self.data_store[ip] = {
                        'ip': ip,
                        'location': p.get('location', ''),
                        'site': p.get('site', ''),
                        'status': 'unknown',
                        'toner_black': None,
                        'page_count': None,
                        'uptime': None,
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
        
        subject = f"Alerta Impressora {printer_ip} - {alert_type.upper()}"
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Versão Texto Simples (Fallback)
        body_plain = f"Impressora: {printer_ip}\nAlerta: {alert_type.upper()}\nMensagem: {message}\nData: {timestamp}"
        
        # Versão HTML Futurista / Sci-Fi
        color_main = "#00ff66" if alert_type == 'online' else "#ff3366"
        glow_color = "0, 255, 102" if alert_type == 'online' else "255, 51, 102"
        title_text = "✅ SISTEMA RESTABELECIDO" if alert_type == 'online' else "⚠️ STATUS CRÍTICO DETECTADO"
        
        body_html = f"""
        <html>
        <body style="background-color: #03050a; color: #e0f2fe; font-family: 'Courier New', Courier, monospace; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; border: 1px solid {color_main}; background-color: #0a0f1a; padding: 30px; box-shadow: 0 0 20px rgba({glow_color}, 0.2);">
                <h2 style="color: {color_main}; border-bottom: 1px solid {color_main}; padding-bottom: 10px; font-weight: normal; letter-spacing: 2px;">
                    [ PRINTMONITOR_PORTO // ALERTA_SISTEMA ]
                </h2>
                <h3 style="color: {color_main}; margin-top: 25px; letter-spacing: 1px;">{title_text}</h3>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 25px; font-size: 15px;">
                    <tr>
                        <td style="padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); color: #7dd3fc; width: 35%;"><strong>>> ALVO_IP:</strong></td>
                        <td style="padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); color: #ffffff; font-weight: bold; font-size: 16px;">{printer_ip}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); color: #7dd3fc;"><strong>>> CÓDIGO_ALERTA:</strong></td>
                        <td style="padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); color: {color_main}; font-weight: bold;">{alert_type.upper()}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); color: #7dd3fc;"><strong>>> DIAGNÓSTICO:</strong></td>
                        <td style="padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); color: #ffffff;">{message}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); color: #7dd3fc;"><strong>>> TIMESTAMP:</strong></td>
                        <td style="padding: 12px; border: 1px solid rgba(255, 255, 255, 0.1); color: #aaaaaa;">{timestamp}</td>
                    </tr>
                </table>
                
                <p style="margin-top: 50px; font-size: 11px; color: #555555; text-align: center; border-top: 1px dashed #333; padding-top: 15px;">
                    TRANSMISSÃO AUTOMATIZADA // PRINTMONITOR_PORTO CENTRAL CORE
                </p>
            </div>
        </body>
        </html>
        """

        try:
            msg = MIMEMultipart('alternative')
            msg['From'] = self.email_config['sender']
            
            # Divide os e-mails por vírgula e remove espaços extras
            recipients = [r.strip() for r in self.email_config['recipient'].split(',')]
            msg['To'] = ", ".join(recipients)
            msg['Subject'] = subject
            
            # Anexa as duas versões (Texto Simples e HTML)
            msg.attach(MIMEText(body_plain, 'plain'))
            msg.attach(MIMEText(body_html, 'html'))
            
            port = int(self.email_config['port'])
            if port == 465:
                # Porta 465 requer SSL implicito desde o começo
                server = smtplib.SMTP_SSL(self.email_config['server'], port, timeout=15)
            else:
                # Porta 587 (ou outras) usam TLS explícito
                server = smtplib.SMTP(self.email_config['server'], port, timeout=15)
                server.starttls()
                
            server.login(self.email_config['sender'], self.email_config['password'])
            server.sendmail(self.email_config['sender'], recipients, msg.as_string())
            server.quit()
            print(f"Alerta de e-mail enviado: {subject}")
        except Exception as e:
            print(f"Erro ao enviar alerta de e-mail: {e}")

    def get_toner_levels(self, ip):
        levels = {}
        mapping = {1: 'toner_black'} # Simplificado para toner preto (principal)
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
        
    def get_uptime(self, ip):
        val = snmp_get(ip, "1.3.6.1.2.1.1.3.0", self.snmp_community)
        if val:
            try:
                return int(val)
            except:
                pass
        return None

    def get_extended_errors(self, ip):
        errors = []
        # Papel
        status = snmp_get(ip, "1.3.6.1.2.1.43.8.2.1.10.1.1", self.snmp_community)
        if status:
            try:
                status = int(status)
                if status == 2: errors.append("no_paper")
                elif status == 3: errors.append("paper_jam")
            except: pass
            
        # Tampa Aberta (prtCoverStatus)
        cover = snmp_get(ip, "1.3.6.1.2.1.43.6.1.1.3.1.1", self.snmp_community)
        if cover and str(cover) == '3':
            errors.append("cover_open")
            
        # Erro SC Ricoh (lendo o display da impressora)
        display = snmp_get(ip, "1.3.6.1.2.1.43.16.5.1.2.1.1", self.snmp_community)
        if display and "SC" in str(display).upper():
            errors.append("ricoh_sc_error")
            
        return errors

    def check_printer(self, printer):
        ip = printer['ip']
        result = {
            'ip': ip,
            'location': printer.get('location', ''),
            'site': printer.get('site', ''),
            'status': 'offline',
            'toner_black': None,
            'page_count': None,
            'uptime': None,
            'errors': [],
            'last_update': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        if not ping(ip):
            result['errors'].append('offline')
            return result
            
        # Obtém dados SNMP
        if SNMP_AVAILABLE:
            try:
                # Toner
                toners = self.get_toner_levels(ip)
                if toners.get('toner_black') is not None:
                    result['toner_black'] = toners['toner_black']
                    if result['toner_black'] < 10:
                        result['errors'].append("toner_black_critical")
                    elif result['toner_black'] < 20:
                        result['errors'].append("toner_black_low")
                
                # Contador
                pages = self.get_page_count(ip)
                if pages is not None:
                    result['page_count'] = pages
                    
                # Uptime (Para verificar reinicialização)
                uptime = self.get_uptime(ip)
                if uptime is not None:
                    result['uptime'] = uptime
                    
                # Erros Extras (Papel, Tampa, Ricoh SC)
                extended_errors = self.get_extended_errors(ip)
                if extended_errors:
                    result['errors'].extend(extended_errors)

                if result['toner_black'] is not None or pages is not None or extended_errors:
                    result['status'] = 'online'
                else:
                    result['status'] = 'online (no snmp)'
            except Exception:
                result['status'] = 'online (snmp error)'
        else:
            result['status'] = 'online'
        return result

    def evaluate_alerts(self, printer, old_data, new_data):
        ip = printer['ip']
        
        # Alertas de Conexão
        if old_data and old_data.get('status') != 'online' and new_data['status'] == 'online':
            self.send_alert(ip, 'online', 'A impressora voltou online e está acessível.')
            self.log_event(ip, 'online', 'Dispositivo voltou online')
            
        if old_data and old_data.get('status') == 'online' and new_data['status'] != 'online':
            self.send_alert(ip, 'offline', 'A impressora perdeu comunicação com o servidor.')
            self.log_event(ip, 'offline', 'Dispositivo ficou offline')

        # Alerta de Reinicialização (Uptime caiu)
        if old_data and old_data.get('uptime') and new_data.get('uptime'):
            if new_data['uptime'] < old_data['uptime']:
                self.send_alert(ip, 'reboot', 'A impressora foi reinicializada recentemente.')
                self.log_event(ip, 'reboot', 'Reinicialização detectada pelo sensor de Uptime.')

        # Alerta de Erros (Toner, Papel, Tampa, SC)
        new_errors = set(new_data.get('errors', []))
        old_errors = set(old_data.get('errors', [])) if old_data else set()
        
        for err in new_errors - old_errors:
            if err == 'offline': continue
            msg = f"Novo erro detectado: {err.upper()}"
            if err == 'toner_black_low': msg = f"Toner Preto baixo (< 20%). Nível atual: {new_data.get('toner_black')}%"
            elif err == 'toner_black_critical': msg = f"Toner Preto em nível CRÍTICO (< 10%). Nível atual: {new_data.get('toner_black')}%"
            
            self.send_alert(ip, err, msg)
            self.log_event(ip, err, msg)

    def run(self):
        while self.running:
            printers = self.config.get('printers', [])
            for printer in printers:
                try:
                    new_data = self.check_printer(printer)
                    with self.lock:
                        old_data = self.data_store.get(printer['ip'])
                        self.data_store[printer['ip']] = new_data
                    self.evaluate_alerts(printer, old_data, new_data)
                except Exception as e:
                    print(f"Erro ao verificar {printer['ip']}: {e}")
            time.sleep(60) # Acelerado para respostas mais rápidas no log

    def daily_report(self):
        if not self.email_config or not self.email_config.get('recipient'):
            return
        with self.lock:
            printers = list(self.data_store.values())
            
        subject = f"Relatório Diário de Impressoras - {datetime.date.today().strftime('%d/%m/%Y')}"
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # === VERSÃO TEXTO SIMPLES ===
        body_plain = "Relatório Diário de Impressoras (Status Consolidado):\n\n" if printers else "Nenhuma impressora configurada.\n"
        for p in printers:
            body_plain += f"[{p['status'].upper()}] IP: {p['ip']} | Local: {p.get('location','')} | Site: {p.get('site','')}\n"
            if p.get('toner_black') is not None:
                body_plain += f"   - Toner Preto: {p['toner_black']}%\n"
            if p.get('errors') and p['errors'] != ['offline']:
                erros_formatados = [e for e in p['errors'] if e != 'offline']
                body_plain += f"   - Alertas Ativos: {', '.join(erros_formatados)}\n"
            body_plain += f"   - Última verificação: {p.get('last_update','')}\n\n"

        # === VERSÃO HTML (FUTURISTA) ===
        body_html = f"""
        <html>
        <body style="background-color: #03050a; color: #e0f2fe; font-family: 'Courier New', Courier, monospace; padding: 20px;">
            <div style="max-width: 800px; margin: 0 auto; border: 1px solid #00f3ff; background-color: #0a0f1a; padding: 25px; box-shadow: 0 0 20px rgba(0, 243, 255, 0.15);">
                <h2 style="color: #00f3ff; border-bottom: 1px solid #00f3ff; padding-bottom: 10px; font-weight: normal; letter-spacing: 1px;">
                    [ PRINTMONITOR_PORTO // RELATÓRIO GLOBAL DE STATUS ]
                </h2>
                <p style="color: #7dd3fc; font-size: 14px; margin-bottom: 30px;"><strong>>> TIMESTAMP CONSOLIDADO:</strong> {timestamp}</p>
                
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background-color: rgba(0, 243, 255, 0.1); color: #00f3ff; text-align: left;">
                            <th style="padding: 12px; border: 1px solid #00f3ff;">DISPOSITIVO / LOCAL</th>
                            <th style="padding: 12px; border: 1px solid #00f3ff; text-align: center;">STATUS</th>
                            <th style="padding: 12px; border: 1px solid #00f3ff; text-align: center;">TONER (K)</th>
                            <th style="padding: 12px; border: 1px solid #00f3ff;">ALERTAS ATIVOS</th>
                        </tr>
                    </thead>
                    <tbody>
        """

        if not printers:
            body_html += """<tr><td colspan="4" style="padding: 15px; text-align: center; border: 1px solid rgba(0, 243, 255, 0.3); color: #7dd3fc;">NENHUMA IMPRESSORA NA MATRIZ</td></tr>"""
        else:
            for p in printers:
                is_online = 'online' in p['status'].lower()
                status_color = "#00ff66" if is_online else "#ff3366"
                status_text = "ONLINE" if is_online else "OFFLINE"
                
                toner_val = f"{p['toner_black']}%" if p.get('toner_black') is not None else "---"
                
                alert_list = [e for e in p.get('errors', []) if e != 'offline']
                alertas = ", ".join([e.upper().replace('_', ' ') for e in alert_list]) if alert_list else "NENHUM"
                alert_color = "#ffaa00" if alert_list else "#aaaaaa"

                body_html += f"""
                <tr>
                    <td style="padding: 12px; border: 1px solid rgba(0, 243, 255, 0.3); color: #ffffff;">
                        <strong style="font-size: 14px;">{p['ip']}</strong><br>
                        <span style="font-size: 11px; color: #7dd3fc;">{p.get('location', 'N/A')} | {p.get('site', 'N/A')}</span>
                    </td>
                    <td style="padding: 12px; border: 1px solid rgba(0, 243, 255, 0.3); text-align: center; font-weight: bold; color: {status_color};">
                        [{status_text}]
                    </td>
                    <td style="padding: 12px; border: 1px solid rgba(0, 243, 255, 0.3); text-align: center; color: #ffffff;">
                        {toner_val}
                    </td>
                    <td style="padding: 12px; border: 1px solid rgba(0, 243, 255, 0.3); color: {alert_color}; font-weight: {'bold' if alert_list else 'normal'};">
                        {alertas}
                    </td>
                </tr>
                """
                
        body_html += """
                    </tbody>
                </table>
                <p style="margin-top: 50px; font-size: 11px; color: #555555; text-align: center; border-top: 1px dashed #333; padding-top: 15px;">
                    GERADO AUTOMATICAMENTE PELO NÚCLEO DE MONITORAÇÃO // PRINTMONITOR_PORTO
                </p>
            </div>
        </body>
        </html>
        """

        try:
            msg = MIMEMultipart('alternative')
            msg['From'] = self.email_config['sender']
            
            # Divide os e-mails por vírgula e remove espaços extras
            recipients = [r.strip() for r in self.email_config['recipient'].split(',')]
            msg['To'] = ", ".join(recipients)
            
            msg['Subject'] = subject
            
            # Anexa as duas versões (Texto Simples e HTML)
            msg.attach(MIMEText(body_plain, 'plain'))
            msg.attach(MIMEText(body_html, 'html'))
            
            port = int(self.email_config['port'])
            if port == 465:
                # Porta 465 requer SSL implicito desde o começo
                server = smtplib.SMTP_SSL(self.email_config['server'], port, timeout=15)
            else:
                # Porta 587 (ou outras) usam TLS explícito
                server = smtplib.SMTP(self.email_config['server'], port, timeout=15)
                server.starttls()
                
            server.login(self.email_config['sender'], self.email_config['password'])
            server.sendmail(self.email_config['sender'], recipients, msg.as_string())
            server.quit()
            print("Relatório diário por e-mail enviado com sucesso.")
        except Exception as e:
            print(f"Erro ao enviar o relatório diário por e-mail: {e}")

    def stop(self):
        self.running = False
        self.scheduler.shutdown()