"use strict";
const $ = id => document.getElementById(id);
let periodDays = 7, latest = null;
const colors = {blue:"#39a7ff", cyan:"#43d8e8", green:"#2bd59a", red:"#ff647c", amber:"#ffbd5a", text:"#a9bfd5", grid:"rgba(94,133,170,.18)"};

function kpi(label, value, note, tone = "") {
  const card = document.createElement("article"); card.className = "report-kpi";
  const title = document.createElement("span"); title.textContent = label;
  const number = document.createElement("strong"); number.textContent = value; if (tone) number.className = tone;
  const subtitle = document.createElement("small"); subtitle.textContent = note;
  card.append(title, number, subtitle); return card;
}
function formatPercent(value) { return value == null ? "N/D" : `${value.toFixed(1)}%`; }
function formatMs(value) { return value == null ? "N/D" : `${value.toFixed(1)} ms`; }
function renderKpis(report) {
  const s = report.resumo;
  $("dashboardKpis").replaceChildren(
    kpi("Máquinas online", `${s.online}/${s.maquinas}`, `${s.offline} offline`, s.offline ? "red" : "green"),
    kpi("Alertas no período", String(s.alertas), `${periodDays} dia(s)`, s.alertas ? "yellow" : "green"),
    kpi("CPU média", formatPercent(s.cpuMedia), "na infraestrutura"),
    kpi("Memória média", formatPercent(s.memoriaMedia), "na infraestrutura"),
    kpi("Disco médio", formatMs(s.discoMedioMs), "latência média"),
    kpi("Saúde crítica", String(s.saudeCritica), "nota abaixo de 50", s.saudeCritica ? "red" : "green"),
    kpi("Disponibilidade", formatPercent(s.disponibilidadeMedia), "estimativa no período"),
    kpi("Histórico retido", `${report.diasRetidos} d`, "configurado na API")
  );
}
function canvasContext(canvas) {
  const rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio)); canvas.height = Math.max(1, Math.floor(280 * ratio));
  const ctx = canvas.getContext("2d"); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return {ctx, width:rect.width, height:280};
}
function donut(id, online, offline) {
  const {ctx, width, height} = canvasContext($(id)), total = online + offline, cx = width/2, cy = 115, radius = 72;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 20; ctx.beginPath(); ctx.strokeStyle = "#173451"; ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.stroke();
  if (total) {
    ctx.beginPath(); ctx.strokeStyle = colors.green; ctx.arc(cx, cy, radius, -Math.PI/2, -Math.PI/2 + Math.PI*2*online/total); ctx.stroke();
    if (offline) { ctx.beginPath(); ctx.strokeStyle = colors.red; ctx.arc(cx, cy, radius, -Math.PI/2 + Math.PI*2*online/total, Math.PI*1.5); ctx.stroke(); }
  }
  ctx.textAlign = "center"; ctx.fillStyle = "#eff7ff"; ctx.font = "700 27px Segoe UI, sans-serif"; ctx.fillText(String(total), cx, cy+8);
  ctx.fillStyle = colors.text; ctx.font = "12px Segoe UI, sans-serif"; ctx.fillText("máquinas", cx, cy+28);
  ctx.textAlign = "left"; ctx.fillStyle = colors.green; ctx.fillText(`● Online ${online}`, Math.max(12,cx-85), 235);
  ctx.fillStyle = colors.red; ctx.fillText(`● Offline ${offline}`, Math.max(12,cx+15), 235);
}
function bars(id, rows, getValue, suffix, color, maxValue = null) {
  const {ctx, width, height} = canvasContext($(id)); ctx.clearRect(0,0,width,height);
  const data = rows.filter(row => Number.isFinite(getValue(row))).sort((a,b) => getValue(b)-getValue(a)).slice(0,10);
  if (!data.length) { ctx.fillStyle=colors.text; ctx.font="13px Segoe UI, sans-serif"; ctx.fillText("Sem dados disponíveis para este período.", 12, 34); return; }
  const left=Math.min(150,Math.max(90,width*.32)), right=52, top=10, rowH=25, barH=11;
  const scaleMax=maxValue || Math.max(...data.map(getValue),1);
  ctx.font="11px Segoe UI, sans-serif";
  data.forEach((row,index) => {
    const y=top+index*rowH, value=getValue(row), label=row.maquina.length>22?row.maquina.slice(0,21)+"…":row.maquina;
    ctx.fillStyle=colors.text; ctx.textAlign="right"; ctx.fillText(label,left-10,y+11);
    ctx.fillStyle="#142e49"; ctx.fillRect(left,y,left < width-right ? width-left-right : 0,barH);
    ctx.fillStyle=color; ctx.fillRect(left,y,Math.max(2,(width-left-right)*Math.min(value/scaleMax,1)),barH);
    ctx.fillStyle="#e7f2fc"; ctx.textAlign="left"; ctx.fillText(`${value.toFixed(1)}${suffix}`,width-right+5,y+11);
  });
  ctx.strokeStyle=colors.grid; ctx.beginPath(); ctx.moveTo(left,0); ctx.lineTo(left,Math.min(height,top+data.length*rowH)); ctx.stroke();
}
function draw(report) {
  const machines=report.maquinas;
  donut("onlineChart",report.resumo.online,report.resumo.offline);
  bars("alertsChart", report.alertasPorRecurso.map(item=>({maquina:item.recurso, value:item.ocorrencias})), item=>item.value, "", colors.amber);
  bars("cpuChart",machines,item=>item.cpuMedia,"%",colors.blue,100);
  bars("memoryChart",machines,item=>item.memoriaMedia,"%",colors.cyan,100);
  bars("diskChart",machines,item=>item.discoMedioMs," ms",colors.amber);
  bars("healthChart",machines.filter(item=>item.saude!=null),item=>item.saude,"",colors.green,100);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
}
function standaloneBars(title, rows, getValue, suffix, color, maxValue = null) {
  const data=rows.filter(row=>Number.isFinite(getValue(row))).sort((a,b)=>getValue(b)-getValue(a)).slice(0,10);
  if(!data.length) return `<section class="panel"><h2>${escapeHtml(title)}</h2><p class="empty">Sem dados disponíveis para este período.</p></section>`;
  const width=900, rowH=34, height=Math.max(105,data.length*rowH+25), left=220, right=85, barW=width-left-right;
  const scaleMax=maxValue||Math.max(...data.map(getValue),1);
  const rowsSvg=data.map((row,index)=>{
    const y=12+index*rowH, value=getValue(row), label=String(row.maquina??"");
    const shown=label.length>31?label.slice(0,30)+"…":label;
    return `<text x="${left-12}" y="${y+15}" text-anchor="end">${escapeHtml(shown)}</text><rect x="${left}" y="${y}" width="${barW}" height="13" rx="6" fill="#142e49"/><rect x="${left}" y="${y}" width="${Math.max(2,barW*Math.min(value/scaleMax,1))}" height="13" rx="6" fill="${color}"/><text x="${left+barW+10}" y="${y+12}">${value.toFixed(1)}${escapeHtml(suffix)}</text>`;
  }).join("");
  return `<section class="panel"><h2>${escapeHtml(title)}</h2><svg class="bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}">${rowsSvg}</svg></section>`;
}
function buildStandaloneHtml(report) {
  const s=report.resumo, generated=new Date(report.geradoEm), timestamp=generated.toLocaleString("pt-BR");
  const pct=value=>value==null?"N/D":`${value.toFixed(1)}%`, ms=value=>value==null?"N/D":`${value.toFixed(1)} ms`;
  const kpis=[
    ["Máquinas online",`${s.online}/${s.maquinas}`,`${s.offline} offline`],
    ["Alertas no período",String(s.alertas),`${report.dias} dia(s)`],
    ["CPU média",pct(s.cpuMedia),"na infraestrutura"],
    ["Memória média",pct(s.memoriaMedia),"na infraestrutura"],
    ["Disco médio",ms(s.discoMedioMs),"latência média"],
    ["Saúde crítica",String(s.saudeCritica),"nota abaixo de 50"],
    ["Disponibilidade",pct(s.disponibilidadeMedia),"estimativa no período"],
    ["Histórico retido",`${report.diasRetidos} d`,"configurado na API"]
  ];
  const cards=kpis.map(([label,value,note])=>`<article class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`).join("");
  const machines=report.maquinas.map(machine=>`<tr><td>${escapeHtml(machine.maquina)}</td><td>${escapeHtml(machine.grupo)}</td><td><span class="status ${machine.online?"online":"offline"}">${machine.online?"Online":"Offline"}</span></td><td>${machine.saude==null?"N/D":machine.saude}</td><td>${machine.alertas}</td><td>${pct(machine.cpuMedia)}</td><td>${pct(machine.cpuMaxima)}</td><td>${pct(machine.memoriaMedia)}</td><td>${pct(machine.memoriaMaxima)}</td><td>${ms(machine.discoMedioMs)}</td><td>${ms(machine.discoMaximoMs)}</td><td>${pct(machine.disponibilidade)}</td></tr>`).join("");
  const alertRows=report.alertasPorRecurso.map(item=>({maquina:item.recurso,value:item.ocorrencias}));
  const machineTable=report.maquinas.length?`<div class="table-wrap"><table><thead><tr><th>Máquina</th><th>Grupo</th><th>Status</th><th>Saúde</th><th>Alertas</th><th>CPU média</th><th>CPU máx.</th><th>Memória média</th><th>Memória máx.</th><th>Disco médio</th><th>Disco máx.</th><th>Disponibilidade</th></tr></thead><tbody>${machines}</tbody></table></div>`:`<p class="empty">Nenhuma máquina no relatório.</p>`;
  const onlinePercent=s.maquinas?100*s.online/s.maquinas:0;
  const donut=`<section class="panel"><h2>Disponibilidade atual</h2><div class="donut-wrap"><div class="donut" style="--online:${onlinePercent}%"><div><strong>${s.maquinas}</strong><span>máquinas</span></div></div><p><span class="legend green">● Online ${s.online}</span><br><span class="legend red">● Offline ${s.offline}</span></p></div></section>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cenário da rede · ${escapeHtml(report.dias)} dias</title><style>
*{box-sizing:border-box}body{margin:0;background:#071321;color:#eaf4ff;font:14px/1.55 Segoe UI,Arial,sans-serif}.wrap{max-width:1280px;margin:auto;padding:34px 24px 56px}.hero{border:1px solid #173451;border-radius:18px;padding:28px;background:linear-gradient(120deg,#0e2740,#0a1828)}.brand{color:#49a9ff;font-size:12px;font-weight:700;letter-spacing:.18em}.eyebrow{color:#66baff;text-transform:uppercase;letter-spacing:.14em;font-size:11px;margin:20px 0 5px}h1{font-size:34px;margin:0 0 6px}.sub,.muted{color:#a9bfd5}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}.kpi,.panel{background:#0c1b2b;border:1px solid #173451;border-radius:14px;padding:18px}.kpi span,.kpi small{display:block;color:#a9bfd5}.kpi strong{display:block;font-size:25px;margin:7px 0;color:#eff7ff}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel h2{font-size:16px;margin:0 0 16px}.panel:first-child{min-width:0}.bars{width:100%;height:auto;overflow:visible}.bars text{fill:#c8d9e9;font:12px Segoe UI,Arial,sans-serif}.donut-wrap{display:flex;justify-content:center;align-items:center;gap:30px;min-height:220px}.donut{width:160px;height:160px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#2bd59a 0 var(--online),#ff647c var(--online) 100%)}.donut:before{content:"";grid-area:1/1;background:#0c1b2b;width:120px;height:120px;border-radius:50%}.donut div{grid-area:1/1;z-index:1;text-align:center}.donut strong,.donut span{display:block}.donut strong{font-size:30px}.donut span,.legend{color:#a9bfd5}.green{color:#2bd59a}.red{color:#ff647c}.section{margin-top:16px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:1050px}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #173451;white-space:nowrap}th{color:#93b8d8;font-size:11px;text-transform:uppercase;letter-spacing:.05em;background:#10243a;position:sticky;top:0}td{color:#dbe9f6}.status{font-weight:700}.status.online{color:#2bd59a}.status.offline{color:#ff647c}.empty{color:#a9bfd5}.footer{margin-top:24px;padding-top:16px;border-top:1px solid #173451;color:#a9bfd5;font-size:12px}.note{margin-top:14px;color:#a9bfd5;font-size:12px}@media(max-width:800px){.kpis{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.wrap{padding:18px 12px}h1{font-size:26px}}
</style></head><body><main class="wrap"><header class="hero"><div class="brand">M · MONITOR NETWORK</div><p class="eyebrow">Apresentação do cenário atual</p><h1>Resumo executivo da infraestrutura</h1><p class="sub">Período: últimos ${report.dias} dia(s) · Gerado em ${escapeHtml(timestamp)} · Cobertura histórica configurada: ${report.diasRetidos} dia(s)</p></header><section class="kpis">${cards}</section><section class="grid">${donut}${standaloneBars("Incidentes por recurso",alertRows,row=>row.value,"", "#ffbd5a")}${standaloneBars("CPU média por máquina",report.maquinas,row=>row.cpuMedia,"%","#39a7ff",100)}${standaloneBars("Memória média por máquina",report.maquinas,row=>row.memoriaMedia,"%","#43d8e8",100)}${standaloneBars("Latência de disco",report.maquinas,row=>row.discoMedioMs," ms","#ffbd5a")}${standaloneBars("Saúde geral por máquina",report.maquinas.filter(row=>row.saude!=null),row=>row.saude,"","#2bd59a",100)}</section><section class="panel section"><h2>Detalhamento de todas as máquinas</h2>${machineTable}</section><p class="note">As médias usam as amostras de histórico disponíveis e respeitam a retenção configurada. Este arquivo contém uma fotografia dos dados no momento da geração; ele não se atualiza sozinho.</p><footer class="footer">MONITOR NETWORK · Relatório HTML autônomo · Gerado em ${escapeHtml(timestamp)} · © Robson Oliveira — Gerência de Serviços de TI</footer></main></body></html>`;
}
function downloadHtml() {
  if(!latest) return;
  const html=buildStandaloneHtml(latest), blob=new Blob(["\uFEFF",html],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(blob), link=document.createElement("a"), date=new Date(latest.geradoEm).toISOString().slice(0,10);
  link.href=url; link.download=`cenario-monitoramento-${latest.dias}-dias-${date}.html`; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function load() {
  const error=$("dashboardError"); error.textContent="";
  try {
    const response=await fetch(`/api/relatorios?dias=${periodDays}`,{cache:"no-store"});
    if(!response.ok) throw new Error(`API respondeu ${response.status}.`);
    latest=await response.json(); renderKpis(latest); draw(latest);
    $("dashboardCaption").textContent=`Resumo dos últimos ${periodDays} dia(s) · histórico disponível por ${latest.diasRetidos} dia(s).`;
    $("dashboardUpdated").textContent=`Atualizado às ${new Date(latest.geradoEm).toLocaleTimeString("pt-BR")}`;
  } catch(e) { error.textContent=`Não foi possível carregar o dashboard: ${e.message}`; }
}
$("period1").onclick=()=>{periodDays=1;load();};
$("period7").onclick=()=>{periodDays=7;load();};
$("refreshDashboard").onclick=load;
$("downloadHtml").onclick=downloadHtml;
$("downloadPresentation").onclick=()=>{window.location.href=`/api/relatorios/apresentacao?dias=${periodDays}`;};
window.addEventListener("resize",()=>{if(latest)draw(latest);});
load();
