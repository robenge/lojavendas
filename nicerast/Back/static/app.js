// app.js - compatível com o CSS fornecido

const charts = {};
const loadedHistory = new Set();

function sanitizeId(name) {
    return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
}

async function loadHistory(machineName) {
    const safeId = sanitizeId(machineName);
    const canvas = document.getElementById(`chart-${safeId}`);
    if (!canvas) return;

    if (charts[safeId]) {
        charts[safeId].destroy();
    }

    try {
        const res = await fetch(`/history/${machineName}`);
        if (!res.ok) throw new Error(`Erro ao buscar histórico: ${res.status}`);
        const data = await res.json();

        const labels = data.map(x => new Date(x.timestamp).toLocaleTimeString());
        const cpu = data.map(x => x.cpu);
        const ping = data.map(x => x.ping);
        const jitter = data.map(x => x.jitter);

        const ctx = canvas.getContext('2d');
        charts[safeId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'CPU %', data: cpu, borderColor: 'red', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 },
                    { label: 'Ping (ms)', data: ping, borderColor: 'cyan', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 },
                    { label: 'Jitter (ms)', data: jitter, borderColor: 'yellow', backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'white' } } },
                scales: {
                    x: { ticks: { color: 'white', maxRotation: 45, autoSkip: true } },
                    y: { ticks: { color: 'white' }, beginAtZero: true }
                }
            }
        });
    } catch (error) {
        console.error(`Erro ao carregar histórico de ${machineName}:`, error);
    }
}

async function loadMachines() {
    try {
        const response = await fetch('/api/machines');
        if (!response.ok) throw new Error(`Erro na API: ${response.status}`);
        const machines = await response.json();

        const container = document.getElementById('container');
        if (!container) {
            console.error('Elemento container não encontrado');
            return;
        }

        // Contar máquinas críticas (CPU > 80 ou packet_loss > 10)
        let critical = 0;
        machines.forEach(m => {
            if (m.cpu > 80 || m.packet_loss > 10) critical++;
        });
        document.getElementById('criticalMachines').innerText = critical;

        // Gerar HTML dos cards
        container.innerHTML = machines.map(m => {
            const safeId = sanitizeId(m.machine);

            // Definir classes baseadas nos limites (usa 'alert' para problema, 'ok' para normal)
            const cpuClass = (m.cpu > 80) ? 'alert' : 'ok';
            const pingClass = (m.ping > 100) ? 'alert' : 'ok';
            const jitterClass = (m.jitter > 30) ? 'alert' : 'ok';
            const lossClass = (m.packet_loss > 5) ? 'alert' : 'ok';
            const voipClass = (m.voip_status === 'Ruim') ? 'alert' : 'ok';
            const voipScoreClass = (m.voip_score < 70) ? 'alert' : 'ok';
            const statusClass = m.online ? 'ok' : 'alert';

            return `
                <div class="card">
                    <h2>${escapeHtml(m.machine)}</h2>
                    <canvas id="chart-${safeId}" width="400" height="200"></canvas>
                    
                    <p>👤 Usuário: ${escapeHtml(m.username)}</p>
                    
                    <p>CPU: <span class="${cpuClass}">${m.cpu}%</span></p>
                    <div class="bar"><div style="width:${m.cpu}%; background:red;"></div></div>
                    
                    <p>RAM: <span class="${m.memory > 90 ? 'alert' : 'ok'}">${m.memory}%</span></p>
                    <div class="bar"><div style="width:${m.memory}%; background:orange;"></div></div>
                    
                    <p>Disco: <span class="${m.disk > 90 ? 'alert' : 'ok'}">${m.disk}%</span></p>
                    <div class="bar"><div style="width:${m.disk}%; background:cyan;"></div></div>
                    
                    <hr>
                    <p>🌐 Ping: <span class="${pingClass}">${m.ping} ms</span></p>
                    <p>📶 Jitter: <span class="${jitterClass}">${m.jitter} ms</span></p>
                    <p>📉 Packet Loss: <span class="${lossClass}">${m.packet_loss}%</span></p>
                    <p>📞 VoIP: <span class="${voipClass}">${escapeHtml(m.voip_status)}</span></p>
                    <p>📞 Score VoIP: <span class="${voipScoreClass}">${m.voip_score}</span></p>
                    <p>🧠 IA: ${escapeHtml(m.anomaly)}</p>
                    <p>🟢 Status: <span class="${statusClass}">${m.online ? 'ONLINE' : 'OFFLINE'}</span></p>
                    <small>Atualizado: ${escapeHtml(m.timestamp)}</small>
                </div>
            `;
        }).join('');

        // Carregar histórico apenas uma vez por máquina
        for (const m of machines) {
            const safeId = sanitizeId(m.machine);
            if (!loadedHistory.has(safeId)) {
                loadedHistory.add(safeId);
                await loadHistory(m.machine);
            }
        }
    } catch (error) {
        console.error('Erro em loadMachines:', error);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

setInterval(loadMachines, 3000);
loadMachines();