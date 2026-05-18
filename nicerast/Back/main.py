from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from pydantic import BaseModel, Field

from datetime import datetime, timedelta

import sqlite3
import uvicorn

app = FastAPI()

# =========================================================
# STATIC
# =========================================================

app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

# =========================================================
# MODEL
# =========================================================

class Metrics(BaseModel):

    machineName: str = Field(alias="MachineName")

    username: str = Field(alias="Username")

    cpu: float = Field(alias="Cpu")

    memory: float = Field(alias="Memory")

    disk: float = Field(alias="Disk")

    uptime: float = Field(alias="Uptime")

    ping: int = Field(alias="Ping")

    jitter: float = Field(alias="Jitter")

    packetLoss: float = Field(alias="PacketLoss")

    voipScore: int = Field(alias="VoipScore")

    headsetConnected: bool = Field(alias="HeadsetConnected")

    headsetName: str = Field(alias="HeadsetName")

    timestamp: datetime = Field(alias="Timestamp")

    model_config = {
        "populate_by_name": True
    }

# =========================================================
# DATABASE
# =========================================================

def init_db():

    conn = sqlite3.connect("monitor.db")

    c = conn.cursor()

    c.execute("""

    CREATE TABLE IF NOT EXISTS metrics (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        machine TEXT,

        username TEXT,

        cpu REAL,

        memory REAL,

        disk REAL,

        uptime REAL,

        ping INTEGER,

        jitter REAL,

        packet_loss REAL,

        voip_score INTEGER,

        headset_connected INTEGER,

        headset_name TEXT,

        timestamp TEXT

    )

    """)

    conn.commit()

    conn.close()

init_db()

# =========================================================
# IA
# =========================================================

def detect_anomaly(cpu, ping, jitter):

    if cpu > 90:
        return "CPU OVERLOAD"

    if ping > 200:
        return "NETWORK LATENCY"

    if jitter > 50:
        return "VOICE ROBOTIZATION"

    return "NORMAL"

# =========================================================
# ALERTAS
# =========================================================

def check_alerts(ping, jitter, loss):

    alerts = []

    if ping > 150:
        alerts.append("HIGH PING")

    if jitter > 30:
        alerts.append("HIGH JITTER")

    if loss > 1:
        alerts.append("PACKET LOSS")

    return alerts

# =========================================================
# RECEBER DADOS
# =========================================================

@app.post("/metrics")
def receive(data: Metrics):

    conn = sqlite3.connect("monitor.db")

    c = conn.cursor()

    c.execute("""

    INSERT INTO metrics (

        machine,
        username,
        cpu,
        memory,
        disk,
        uptime,
        ping,
        jitter,
        packet_loss,
        voip_score,
        headset_connected,
        headset_name,
        timestamp

    )

    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

    """, (

        data.machineName,

        data.username,

        data.cpu,

        data.memory,

        data.disk,

        data.uptime,

        data.ping,

        data.jitter,

        data.packetLoss,

        data.voipScore,

        int(data.headsetConnected),

        data.headsetName,

        str(data.timestamp)

    ))

    conn.commit()

    conn.close()

    return {
        "status": "ok"
    }

# =========================================================
# MÁQUINAS
# =========================================================

@app.get("/machines")
def machines():

    conn = sqlite3.connect("monitor.db")

    c = conn.cursor()

    c.execute("""

    SELECT
        m1.machine,
        m1.username,
        m1.cpu,
        m1.memory,
        m1.disk,
        m1.uptime,
        m1.ping,
        m1.jitter,
        m1.packet_loss,
        m1.voip_score,
        m1.headset_connected,
        m1.headset_name,
        m1.timestamp

    FROM metrics m1

    INNER JOIN (
        SELECT machine, MAX(timestamp) as max_time
        FROM metrics
        GROUP BY machine
    ) m2

    ON m1.machine = m2.machine
    AND m1.timestamp = m2.max_time

    """)

    rows = c.fetchall()

    conn.close()

    result = []

    for r in rows:

        last_update = datetime.fromisoformat(r[12])

        online = (
            datetime.now(last_update.tzinfo) - last_update
        ) < timedelta(seconds=60)

        anomaly = detect_anomaly(
            r[2],
            r[6],
            r[7]
        )

        alerts = check_alerts(
            r[6],
            r[7],
            r[8]
        )

        result.append({

            "machine": r[0],

            "username": r[1],

            "cpu": r[2],

            "memory": r[3],

            "disk": r[4],

            "uptime": r[5],

            "ping": r[6],

            "jitter": r[7],

            "packet_loss": r[8],

            "voip_score": r[9],

            "headset_connected": bool(r[10]),

            "headset_name": r[11],

            "timestamp": r[12],

            "online": online,

            "anomaly": anomaly,

            "alerts": alerts

        })

    return result

# =========================================================
# DASHBOARD
# =========================================================

@app.get("/", response_class=HTMLResponse)
def dashboard():

    return """
    
    <!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VoIP Monitor PRO</title>
    <!-- Bootstrap 5 + Icons -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <style>
        /* Estilos complementares */
        body {
            background: #0f172a;
            color: #f8f9fa;
            font-family: 'Segoe UI', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        }
        h1 {
            font-weight: 600;
            letter-spacing: -0.5px;
        }
        .card {
            background: #1e293b;
            border: none;
            border-radius: 1.25rem;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        }
        .card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 28px rgba(0,0,0,0.4);
        }
        .card-title {
            font-size: 1.5rem;
            font-weight: 600;
            border-left: 4px solid #0d6efd;
            padding-left: 0.75rem;
            margin-bottom: 1rem;
        }
        .badge-status {
            font-size: 0.85rem;
            padding: 0.35rem 0.65rem;
            border-radius: 2rem;
        }
        .progress {
            height: 10px;
            border-radius: 1rem;
            background-color: #334155;
            margin-top: 0.25rem;
            margin-bottom: 1rem;
        }
        .progress-bar {
            border-radius: 1rem;
            transition: width 0.3s ease;
        }
        hr {
            border-color: #334155;
            margin: 1rem 0;
        }
        .small-text {
            font-size: 0.7rem;
            color: #94a3b8;
        }
        i.bi {
            margin-right: 0.5rem;
            vertical-align: middle;
        }
        .card-text i {
            width: 1.75rem;
            display: inline-block;
        }
        .alert-danger-custom {
            color: #f8d7da;
            background-color: rgba(220,53,69,0.2);
            border-left: 4px solid #dc3545;
        }
    </style>
</head>
<body class="p-3 p-md-4">

<div class="container-fluid px-0 px-lg-2">
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4">
        <h1><i class="bi bi-headset"></i> VoIP Monitor PRO</h1>
        <div class="mt-2 mt-sm-0">
            <span class="badge bg-secondary"><i class="bi bi-arrow-repeat"></i> Live · 3s</span>
        </div>
    </div>

    <div id="machines" class="row g-4"></div>
</div>

<script>
    // Função auxiliar para determinar cor (texto e barra) baseada no percentual
    function getStatusClass(value) {
        if (value >= 85) return { text: 'text-danger', bg: 'bg-danger' };
        if (value >= 50) return { text: 'text-warning', bg: 'bg-warning' };
        return { text: 'text-success', bg: 'bg-success' };
    }

    async function load() {
        try {
            const res = await fetch('/machines');
            const data = await res.json();
            let cardsHtml = '';

            data.forEach(m => {
                // Valores numéricos com fallback
                const cpu = Number(m.cpu) || 0;
                const ram = Number(m.memory) || 0;
                const disk = Number(m.disk) || 0;
                const ping = Number(m.ping) || 0;
                const jitter = Number(m.jitter) || 0;
                const packetLoss = Number(m.packet_loss) || 0;
                const voipScore = Number(m.voip_score) || 0;
                const online = m.online === true || m.online === 'true';
                const headsetConnected = m.headset_connected === true || m.headset_connected === 'true';
                const alerts = Array.isArray(m.alerts) ? m.alerts : (m.alerts ? [m.alerts] : []);

                // Status geral da chamada (ping, jitter, loss)
                let globalStatusClass = 'ok';
                if (ping > 150 || jitter > 30 || packetLoss > 1) {
                    globalStatusClass = 'alert';
                }
                const globalBadgeClass = globalStatusClass === 'ok' ? 'bg-success' : 'bg-danger';

                // Cores dinâmicas para CPU, RAM, DISCO
                const cpuStyle = getStatusClass(cpu);
                const ramStyle = getStatusClass(ram);
                const diskStyle = getStatusClass(disk);

                cardsHtml += `
                    <div class="col-12 col-sm-6 col-xl-4">
                        <div class="card h-100">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-start">
                                    <h5 class="card-title">
                                        <i class="bi bi-pc-display"></i> ${escapeHtml(m.machine || '?')}
                                    </h5>
                                    <span class="badge ${globalBadgeClass} badge-status">
                                        <i class="bi ${globalStatusClass === 'ok' ? 'bi-check-circle' : 'bi-exclamation-triangle'}"></i>
                                        ${globalStatusClass === 'ok' ? 'Estável' : 'Crítico'}
                                    </span>
                                </div>

                                <p class="card-text mt-2">
                                    <i class="bi bi-person-circle"></i> <strong>Usuário:</strong> ${escapeHtml(m.username || '—')}
                                </p>
                                <p class="card-text">
                                    <i class="bi ${online ? 'bi-plug-fill text-success' : 'bi-plug text-danger'}"></i>
                                    <strong>Status:</strong>
                                    <span class="${online ? 'text-success' : 'text-danger'} fw-bold">
                                        ${online ? 'ONLINE' : 'OFFLINE'}
                                    </span>
                                </p>

                                <hr>

                                <!-- CPU -->
                                <div>
                                    <div class="d-flex justify-content-between">
                                        <span><i class="bi bi-cpu"></i> CPU</span>
                                        <span class="${cpuStyle.text} fw-bold">${cpu.toFixed(2)}%</span>
                                    </div>
                                    <div class="progress">
                                        <div class="progress-bar ${cpuStyle.bg}" role="progressbar" style="width: ${cpu}%;" aria-valuenow="${cpu}" aria-valuemin="0" aria-valuemax="100"></div>
                                    </div>
                                </div>

                                <!-- RAM -->
                                <div>
                                    <div class="d-flex justify-content-between">
                                        <span><i class="bi bi-memory"></i> RAM</span>
                                        <span class="${ramStyle.text} fw-bold">${ram.toFixed(2)}%</span>
                                    </div>
                                    <div class="progress">
                                        <div class="progress-bar ${ramStyle.bg}" role="progressbar" style="width: ${ram}%;" aria-valuenow="${ram}" aria-valuemin="0" aria-valuemax="100"></div>
                                    </div>
                                </div>

                                <!-- Disco -->
                                <div>
                                    <div class="d-flex justify-content-between">
                                        <span><i class="bi bi-hdd-stack"></i> Disco</span>
                                        <span class="${diskStyle.text} fw-bold">${disk.toFixed(2)}%</span>
                                    </div>
                                    <div class="progress">
                                        <div class="progress-bar ${diskStyle.bg}" role="progressbar" style="width: ${disk}%;" aria-valuenow="${disk}" aria-valuemin="0" aria-valuemax="100"></div>
                                    </div>
                                </div>

                                <hr>

                                <div class="row g-2">
                                    <div class="col-6">
                                        <i class="bi bi-wifi"></i> Ping: <strong class="${ping > 150 ? 'text-danger' : 'text-info'}">${ping} ms</strong>
                                    </div>
                                    <div class="col-6">
                                        <i class="bi bi-graph-up"></i> Jitter: <strong class="${jitter > 30 ? 'text-danger' : 'text-info'}">${jitter} ms</strong>
                                    </div>
                                    <div class="col-6">
                                        <i class="bi bi-exclamation-triangle"></i> Packet Loss: <strong class="${packetLoss > 1 ? 'text-danger' : 'text-info'}">${packetLoss}%</strong>
                                    </div>
                                    <div class="col-6">
                                        <i class="bi bi-mic"></i> VoIP Score: <strong class="${voipScore < 70 ? 'text-danger' : 'text-success'}">${voipScore}</strong>
                                    </div>
                                </div>

                                <div class="mt-2">
                                    <i class="bi bi-robot"></i> IA: <span class="small">${escapeHtml(m.anomaly || 'Nenhuma anomalia')}</span>
                                </div>

                                <div class="mt-2">
                                    <i class="bi bi-headset"></i> Headset: 
                                    <span class="badge ${headsetConnected ? 'bg-success' : 'bg-secondary'}">${headsetConnected ? 'CONECTADO' : 'DESCONECTADO'}</span>
                                    ${headsetConnected && m.headset_name ? `<span class="ms-1 small text-muted">(${escapeHtml(m.headset_name)})</span>` : ''}
                                </div>

                                ${alerts.length > 0 ? `
                                <div class="mt-2 p-2 rounded alert-danger-custom small">
                                    <i class="bi bi-bell"></i> <strong>Alertas:</strong> ${alerts.map(a => escapeHtml(a)).join(', ')}
                                </div>
                                ` : ''}

                                <div class="small-text mt-3 text-end">
                                    <i class="bi bi-clock-history"></i> ${escapeHtml(m.timestamp) || 'sem informação'}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });

            document.getElementById('machines').innerHTML = cardsHtml || '<div class="col-12 text-center text-muted">Nenhuma máquina encontrada.</div>';
        } catch (err) {
            console.error('Erro ao carregar dados:', err);
            document.getElementById('machines').innerHTML = '<div class="col-12 text-center text-danger"><i class="bi bi-exclamation-octagon"></i> Erro ao conectar com a API. Verifique o backend.</div>';
        }
    }

    function escapeHtml(str) {

    if (!str) return '';

    return String(str)
        .replace(/[&<>]/g, function(m) {

            if (m === '&') return '&amp;';

            if (m === '<') return '&lt;';

            if (m === '>') return '&gt;';

            return m;
        });
}

    // Carrega a cada 3 segundos
    setInterval(load, 3000);
    load();
</script>

<!-- Bootstrap JS bundle (opcional para componentes interativos, mas não obrigatório) -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
"""

# =========================================================
# START
# =========================================================

if __name__ == "__main__":

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )