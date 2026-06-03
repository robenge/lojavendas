print("=== Iniciando aplicação Flask ===")

from flask import Flask, render_template, jsonify, request, redirect, url_for
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from urllib.parse import unquote
import json
import threading
from monitor import PrinterMonitor

CONFIG_FILE = 'config.json'
USERS_FILE = 'users.json'

app = Flask(__name__)
app.secret_key = 'sua-chave-secreta-aqui'  # Altere

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# ----- Gerenciamento de usuários -----
def load_users():
    try:
        with open(USERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        default = {"admin": "admin"}
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(default, f, indent=4)
        return default

def save_users(users):
    with open(USERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, indent=4)

class User(UserMixin):
    def __init__(self, id):
        self.id = id

@login_manager.user_loader
def load_user(user_id):
    users = load_users()
    if user_id in users:
        return User(user_id)
    return None

# ----- Configuração -----
def load_config():
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = json.load(f)
        config.setdefault('snmp_community', 'public')
        config.setdefault('printers', [])
        config.setdefault('email', {})
        return config
    except:
        return {"printers": [], "email": {}, "snmp_community": "public"}

def save_config(config):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=4)

# ----- Inicia o monitor -----
PRINTERS_DATA = {}
data_lock = threading.Lock()
config = load_config()
monitor = PrinterMonitor(
    config,
    PRINTERS_DATA,
    data_lock,
    snmp_community=config.get('snmp_community', 'public')
)
monitor.start()

# ========== ROTAS ==========

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        users = load_users()
        if username in users and users[username] == password:
            login_user(User(username))
            next_page = request.args.get('next')
            return redirect(next_page or url_for('dashboard'))
        else:
            return render_template('login.html', error='Credenciais inválidas')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/admin')
@login_required
def admin_page():
    return render_template('admin.html', config=load_config())

@app.route('/')
def index():
    return redirect(url_for('dashboard'))

# ========== APIs ==========
@app.route('/api/printers')
def api_printers():
    with data_lock:
        printers = list(PRINTERS_DATA.values())
    return jsonify(printers)

@app.route('/api/history')
def api_history():
    # Retorna o histórico de eventos persistidos
    with monitor.lock:
        history_copy = list(monitor.history)
    return jsonify(history_copy)

@app.route('/api/printers/add', methods=['POST'])
@login_required
def api_add_printer():
    data = request.json
    ip = data.get('ip', '').strip()
    location = data.get('location', '').strip()
    site = data.get('site', '').strip()
    if not ip:
        return jsonify({'error': 'IP obrigatório'}), 400
    config = load_config()
    if any(p['ip'] == ip for p in config['printers']):
        return jsonify({'error': 'IP já cadastrado'}), 400
    config['printers'].append({"ip": ip, "location": location, "site": site})
    save_config(config)
    monitor.reload_config(config)
    return jsonify({'success': True})

@app.route('/api/printers/remove/<path:ip>', methods=['DELETE'])
@login_required
def api_remove_printer(ip):
    ip = unquote(ip)
    config = load_config()
    new_list = [p for p in config['printers'] if p['ip'] != ip]
    if len(new_list) == len(config['printers']):
        return jsonify({'error': 'IP não encontrado'}), 404
    config['printers'] = new_list
    save_config(config)
    monitor.reload_config(config)
    return jsonify({'success': True})

@app.route('/api/printers/upload', methods=['POST'])
@login_required
def api_upload_printers():
    if 'file' not in request.files:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Arquivo vazio'}), 400
    content = file.read().decode('utf-8')
    lines = content.splitlines()
    added = 0
    config = load_config()
    existing_ips = {p['ip'] for p in config['printers']}
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = [p.strip() for p in line.split(',')]
        if len(parts) < 1:
            continue
        ip = parts[0]
        if ip in existing_ips:
            continue
        location = parts[1] if len(parts) > 1 else ''
        site = parts[2] if len(parts) > 2 else ''
        config['printers'].append({"ip": ip, "location": location, "site": site})
        existing_ips.add(ip)
        added += 1
    save_config(config)
    monitor.reload_config(config)
    return jsonify({'success': True, 'added': added})

@app.route('/api/email', methods=['POST'])
@login_required
def api_save_email():
    data = request.json
    config = load_config()
    config['email'] = {
        "server": data.get('server', ''),
        "port": int(data.get('port', 587)),
        "sender": data.get('sender', ''),
        "password": data.get('password', ''),
        "recipient": data.get('recipient', '')
    }
    save_config(config)
    monitor.update_email_config(config['email'])
    return jsonify({'success': True})

@app.route('/api/snmp', methods=['POST'])
@login_required
def api_save_snmp():
    data = request.json
    community = data.get('community', 'public')
    config = load_config()
    config['snmp_community'] = community
    save_config(config)
    monitor.update_snmp_community(community)
    return jsonify({'success': True})

@app.route('/api/users')
@login_required
def api_get_users():
    users = load_users()
    return jsonify(list(users.keys()))

@app.route('/api/users/add', methods=['POST'])
@login_required
def api_add_user():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    if not username or not password:
        return jsonify({'error': 'Usuário e senha obrigatórios'}), 400
    users = load_users()
    if username in users:
        return jsonify({'error': 'Usuário já existe'}), 400
    users[username] = password
    save_users(users)
    return jsonify({'success': True})

@app.route('/api/users/remove/<username>', methods=['DELETE'])
@login_required
def api_remove_user(username):
    if username == 'admin':
        return jsonify({'error': 'Não é possível remover o admin'}), 400
    users = load_users()
    if username not in users:
        return jsonify({'error': 'Usuário não encontrado'}), 404
    del users[username]
    save_users(users)
    return jsonify({'success': True})

if __name__ == '__main__':
    print("=== Servidor Flask rodando em http://0.0.0.0:8050 ===")
    app.run(debug=True, host='0.0.0.0', port=8050)