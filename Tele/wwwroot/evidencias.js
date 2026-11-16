"use strict";
const $ = id => document.getElementById(id);
let dias = 7, resumo = [], detalhe = null, selecionada = null, comparacao = null;
const colors = {product:"#42d4e8", host:"#428fff", grid:"rgba(94,133,170,.2)", text:"#9bb4ce"};
function el(tag, text, cls) { const n=document.createElement(tag); if(text!=null)n.textContent=text; if(cls)n.className=cls; return n; }
function fmt(value, suffix="") { return value==null?"—":`${Number(value).toFixed(1)}${suffix}`; }
function bytes(value) { if(value==null)return "—"; const mb=value/1048576; return mb>=1024?`${(mb/1024).toFixed(2)} GB`:`${mb.toFixed(1)} MB`; }
function rate(value) { if(value==null)return "—"; const mb=value/1048576; return mb>=1?`${mb.toFixed(2)} MB/s`:`${(value/1024).toFixed(1)} KB/s`; }
function metricCard(title, value, note) { const card=el("article",null,"report-kpi"); card.append(el("span",title),el("strong",value),el("small",note)); return card; }
function renderKpis() {
  const hosts=new Set(resumo.map(item=>item.maquina));
  const minutes=resumo.reduce((sum,item)=>sum+item.minutosMonitorados,0);
  const coincident=resumo.reduce((sum,item)=>sum+item.minutosComCpuAltaCoincidente+item.minutosComMemoriaAltaCoincidente+item.minutosComDiscoAltoCoincidente,0);
  $("evidenceKpis").replaceChildren(
    metricCard("Máquinas com dados",String(hosts.size),"na janela selecionada"),
    metricCard("Produto/máquina",String(resumo.length),"combinações com PID monitorado"),
    metricCard("Minutos observados",String(minutes),"minutos agregados por produto"),
    metricCard("Coincidências de pressão",String(coincident),"CPU, memória ou disco; pode contar o mesmo minuto mais de uma vez")
  );
}
function renderTable() {
  const root=$("evidenceTable");
  if(!resumo.length){root.replaceChildren(el("p","Ainda não há evidências para esses produtos. Atualize o agente das máquinas para a versão 1.3.0 ou posterior; os dados começam a aparecer após a nova coleta de serviços.","admin-note"));return;}
  const table=el("table"), head=table.createTHead().insertRow();
  ["Máquina","Produto","Serviços observados","Processo / PID","Minutos","CPU produto média/máx.","RAM média/máx.","Leitura / escrita máx.","CPU máquina máx.","RAM máquina máx.","Disco máx.","CPU alta coincidente","RAM alta coincidente","Disco alto coincidente","Atribuição"].forEach(t=>head.append(el("th",t)));
  const body=table.createTBody();
  for(const item of resumo){
    const row=body.insertRow(); row.className="evidence-row"; row.title="Clique para abrir amostras detalhadas";
    const shared=item.processoCompartilhado?"Processo compartilhado":"PID exclusivo dos serviços identificados";
    const values=[item.maquina,item.produto,item.servicos.join("; ")||"Serviços sem nome",
      `${item.processos.join(", ")||"processo não lido"} · PID ${item.pids.join(", ")}`,
      String(item.minutosMonitorados),`${fmt(item.cpuProcessoMedia,"%")} / ${fmt(item.cpuProcessoMaxima,"%")}`,
      `${bytes(item.memoriaProcessoMediaBytes)} / ${bytes(item.memoriaProcessoMaximaBytes)}`,
      `${rate(item.leituraIoMaximaBps)} / ${rate(item.escritaIoMaximaBps)}`,
      fmt(item.cpuMaquinaMaxima,"%"),fmt(item.memoriaMaquinaMaxima,"%"),fmt(item.latenciaDiscoMaximaMs," ms"),
      String(item.minutosComCpuAltaCoincidente),String(item.minutosComMemoriaAltaCoincidente),String(item.minutosComDiscoAltoCoincidente),shared];
    values.forEach((value,index)=>{const cell=el("td",value); if(index===14&&item.processoCompartilhado)cell.className="yellow"; row.append(cell);});
    row.addEventListener("click",()=>abrirDetalhe(item));
  }
  root.replaceChildren(table);
}
async function abrirDetalhe(item){
  selecionada=item; comparacao=null; $("peerComparison").hidden=true; $("detailPanel").hidden=false;
  $("detailTitle").textContent=`${item.maquina} · ${item.produto}`;
  $("detailCaption").textContent=`Serviços: ${item.servicos.join("; ")} · PIDs: ${item.pids.join(", ")}${item.processoCompartilhado?" · processo compartilhado":""}`;
  $("detailTable").replaceChildren(el("p","Carregando série temporal…","admin-note"));
  try{
    const url=`/api/evidencias/seguranca/${encodeURIComponent(item.maquina)}?produto=${encodeURIComponent(item.produto)}&dias=${dias}`;
    const response=await fetch(url,{cache:"no-store"}); if(!response.ok)throw new Error(`API respondeu ${response.status}.`);
    detalhe=(await response.json()).pontos; renderDetail(); $("detailPanel").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(error){$("detailTable").replaceChildren(el("p",`Não foi possível carregar os pontos: ${error.message}`,"status-message error"));}
}
function renderDetail(){
  if(!detalhe?.length){$("detailTable").replaceChildren(el("p","Sem amostras nesta janela.","admin-note"));drawChart([]);return;}
  drawChart(detalhe);
  const table=el("table"), head=table.createTHead().insertRow();
  ["Horário","CPU produto média/máx.","CPU máquina média/máx.","RAM produto média/máx.","RAM máquina média/máx.","Leitura E/S média/máx.","Escrita E/S média/máx.","Latência disco média/máx.","Amostras"].forEach(t=>head.append(el("th",t)));
  const body=table.createTBody();
  for(const point of [...detalhe].reverse().slice(0,240)){
    const row=body.insertRow();
    [new Date(point.minuto).toLocaleString("pt-BR"),`${fmt(point.cpuProcesso.media,"%")} / ${fmt(point.cpuProcesso.maximo,"%")}`,
      `${fmt(point.cpuMaquina.media,"%")} / ${fmt(point.cpuMaquina.maximo,"%")}`,
      `${bytes(point.memoriaProcessoBytes.media)} / ${bytes(point.memoriaProcessoBytes.maximo)}`,
      `${fmt(point.memoriaMaquinaPercentual.media,"%")} / ${fmt(point.memoriaMaquinaPercentual.maximo,"%")}`,
      `${rate(point.leituraIoBps.media)} / ${rate(point.leituraIoBps.maximo)}`,
      `${rate(point.escritaIoBps.media)} / ${rate(point.escritaIoBps.maximo)}`,
      `${fmt(point.latenciaDiscoMs.media," ms")} / ${fmt(point.latenciaDiscoMs.maximo," ms")}`,String(point.amostras)]
      .forEach(value=>row.append(el("td",value)));
  }
  $("detailTable").replaceChildren(table);
}
function drawChart(points){
  const canvas=$("cpuChart"), box=canvas.getBoundingClientRect(), ratio=devicePixelRatio||1;
  canvas.width=Math.max(1,Math.floor(box.width*ratio));canvas.height=260*ratio;
  const ctx=canvas.getContext("2d");ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,box.width,260);
  const left=48,right=18,top=18,bottom=34,w=box.width-left-right,h=260-top-bottom;
  ctx.font="11px Segoe UI,sans-serif";ctx.fillStyle=colors.text;ctx.strokeStyle=colors.grid;
  for(let i=0;i<=4;i++){const y=top+h*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+w,y);ctx.stroke();ctx.textAlign="right";ctx.fillText(`${100-i*25}%`,left-8,y+4);}
  if(points.length<2){ctx.textAlign="left";ctx.fillText("Aguardando amostras suficientes para desenhar a série.",left,top+20);return;}
  const ordered=points.slice(-360), lines=[["cpuProcesso",colors.product],["cpuMaquina",colors.host]];
  lines.forEach(([key,color])=>{ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2;let started=false;
    ordered.forEach((point,index)=>{const value=point[key].media;if(value==null){started=false;return;}const x=left+w*index/(ordered.length-1),y=top+h*(1-Math.min(100,value)/100);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);});ctx.stroke();});
  ctx.textAlign="left";ctx.fillStyle=colors.product;ctx.fillText("● CPU dos serviços identificados",left,252);ctx.fillStyle=colors.host;ctx.fillText("● CPU total da máquina",left+230,252);
}
function csv(rows, filename){
  const quote=value=>`"${String(value??"").replaceAll('"','""')}"`;
  const text="\uFEFF"+rows.map(row=>row.map(quote).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);
}
function exportSummary(){
  const headers=["Máquina","Produto","Serviços","PIDs","Processos","Processo compartilhado","Minutos","Amostras","CPU produto média","CPU produto máxima","RAM produto média bytes","RAM produto máxima bytes","Leitura máxima B/s","Escrita máxima B/s","CPU máquina máxima","RAM máquina máxima","Disco máximo ms","Minutos CPU alta coincidente","Minutos RAM alta coincidente","Minutos disco alto coincidente"];
  csv([headers,...resumo.map(x=>[x.maquina,x.produto,x.servicos.join(" | "),x.pids.join(" | "),x.processos.join(" | "),x.processoCompartilhado,x.minutosMonitorados,x.amostras,x.cpuProcessoMedia,x.cpuProcessoMaxima,x.memoriaProcessoMediaBytes,x.memoriaProcessoMaximaBytes,x.leituraIoMaximaBps,x.escritaIoMaximaBps,x.cpuMaquinaMaxima,x.memoriaMaquinaMaxima,x.latenciaDiscoMaximaMs,x.minutosComCpuAltaCoincidente,x.minutosComMemoriaAltaCoincidente,x.minutosComDiscoAltoCoincidente])],`evidencias-seguranca-${dias}-dias.csv`);
}
function exportDetail(){
  if(!detalhe?.length||!selecionada)return;
  const headers=["Horário","Máquina","Produto","Serviços","PIDs","Processos","Compartilhado","Amostras","CPU produto média","CPU produto máxima","RAM média bytes","RAM máxima bytes","Leitura média B/s","Leitura máxima B/s","Escrita média B/s","Escrita máxima B/s","CPU máquina média","CPU máquina máxima","RAM máquina média","RAM máquina máxima","Disco médio ms","Disco máximo ms","Coincidência CPU","Coincidência memória","Coincidência disco"];
  csv([headers,...detalhe.map(x=>[new Date(x.minuto).toISOString(),x.maquina,x.produto,x.servicos.join(" | "),x.pids.join(" | "),x.processos.join(" | "),x.processoCompartilhado,x.amostras,x.cpuProcesso.media,x.cpuProcesso.maximo,x.memoriaProcessoBytes.media,x.memoriaProcessoBytes.maximo,x.leituraIoBps.media,x.leituraIoBps.maximo,x.escritaIoBps.media,x.escritaIoBps.maximo,x.cpuMaquina.media,x.cpuMaquina.maximo,x.memoriaMaquinaPercentual.media,x.memoriaMaquinaPercentual.maximo,x.latenciaDiscoMs.media,x.latenciaDiscoMs.maximo,x.cpuAltaCoincidente,x.memoriaAltaCoincidente,x.discoAltoCoincidente])],`evidencia-${selecionada.maquina}-${dias}-dias.csv`);
}
function downloadPdf(){
  if(!selecionada)return;
  const host=encodeURIComponent(selecionada.maquina), product=encodeURIComponent(selecionada.produto);
  location.href=`/api/evidencias/seguranca/${host}/apresentacao?produto=${product}&dias=${dias}`;
}
function signedDelta(value, reference, suffix=""){
  if(value==null||reference==null)return "—";
  const delta=Number(value)-Number(reference);
  return `${delta>0?"+":""}${delta.toFixed(1)}${suffix}`;
}
async function loadComparison(){
  if(!selecionada)return;
  const button=$("comparePeers");button.disabled=true;
  $("peerComparison").hidden=false;$("comparisonTable").replaceChildren(el("p","Buscando máquinas com hardware semelhante…","admin-note"));
  try{
    const host=encodeURIComponent(selecionada.maquina),product=encodeURIComponent(selecionada.produto);
    const response=await fetch(`/api/evidencias/seguranca/${host}/comparacao?produto=${product}&dias=${dias}`,{cache:"no-store"});
    if(!response.ok)throw new Error(`API respondeu ${response.status}.`);
    comparacao=await response.json();renderComparison();$("peerComparison").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(error){$("comparisonTable").replaceChildren(el("p",`Não foi possível comparar: ${error.message}`,"status-message error"));}
  finally{button.disabled=false;}
}
function renderComparison(){
  if(!comparacao)return;
  const reference=comparacao.maquinas.find(item=>item.referencia)?.evidencia;
  $("comparisonCaption").textContent=`${comparacao.maquinas.length-1} par(es) · ${dias} dia(s) · ${comparacao.produto}`;
  $("comparisonCriteria").textContent=`Critério de comparação: ${comparacao.criterio}`;
  const table=el("table"),head=table.createTHead().insertRow();
  ["Máquina","Similaridade","Processador / núcleos / RAM","CPU EDR média/máx.","Δ CPU EDR","CPU máquina média/máx.","Δ CPU máquina","RAM EDR média/máx.","RAM máquina máx.","Disco médio/máx.","Δ disco","Leitura/escrita máx.","Amostras","Coincidências CPU/RAM/disco"].forEach(title=>head.append(el("th",title)));
  const body=table.createTBody();
  for(const item of comparacao.maquinas){
    const data=item.evidencia,row=body.insertRow();
    if(item.referencia)row.className="reference-row";
    const values=[`${item.referencia?"★ ":""}${data.maquina}`,item.similaridade,
      `${item.processador||"CPU não informada"} · ${item.processadoresLogicos??"—"} núcleos · ${bytes(item.memoriaFisicaBytes)}`,
      `${fmt(data.cpuProcessoMedia,"%")} / ${fmt(data.cpuProcessoMaxima,"%")}`,
      item.referencia?"Referência":signedDelta(data.cpuProcessoMedia,reference?.cpuProcessoMedia,"%"),
      `${fmt(data.cpuMaquinaMedia,"%")} / ${fmt(data.cpuMaquinaMaxima,"%")}`,
      item.referencia?"Referência":signedDelta(data.cpuMaquinaMedia,reference?.cpuMaquinaMedia,"%"),
      `${bytes(data.memoriaProcessoMediaBytes)} / ${bytes(data.memoriaProcessoMaximaBytes)}`,
      fmt(data.memoriaMaquinaMaxima,"%"),
      `${fmt(data.latenciaDiscoMediaMs," ms")} / ${fmt(data.latenciaDiscoMaximaMs," ms")}`,
      item.referencia?"Referência":signedDelta(data.latenciaDiscoMediaMs,reference?.latenciaDiscoMediaMs," ms"),
      `${rate(data.leituraIoMaximaBps)} / ${rate(data.escritaIoMaximaBps)}`,String(data.amostras),
      `${data.minutosComCpuAltaCoincidente} / ${data.minutosComMemoriaAltaCoincidente} / ${data.minutosComDiscoAltoCoincidente}`];
    values.forEach(value=>row.append(el("td",value)));
  }
  $("comparisonTable").replaceChildren(table);
}
function exportComparisonCsv(){
  if(!comparacao)return;
  const headers=["Referência","Máquina","Similaridade","Processador","Núcleos lógicos","RAM física bytes","Produto","Minutos","Amostras","CPU produto média","CPU produto máxima","CPU máquina média","CPU máquina máxima","RAM produto média bytes","RAM produto máxima bytes","RAM máquina média","RAM máquina máxima","Disco médio ms","Disco máximo ms","Leitura máxima B/s","Escrita máxima B/s","Coincidência CPU min","Coincidência RAM min","Coincidência disco min"];
  csv([headers,...comparacao.maquinas.map(item=>{const x=item.evidencia;return[item.referencia,x.maquina,item.similaridade,item.processador,item.processadoresLogicos,item.memoriaFisicaBytes,x.produto,x.minutosMonitorados,x.amostras,x.cpuProcessoMedia,x.cpuProcessoMaxima,x.cpuMaquinaMedia,x.cpuMaquinaMaxima,x.memoriaProcessoMediaBytes,x.memoriaProcessoMaximaBytes,x.memoriaMaquinaMedia,x.memoriaMaquinaMaxima,x.latenciaDiscoMediaMs,x.latenciaDiscoMaximaMs,x.leituraIoMaximaBps,x.escritaIoMaximaBps,x.minutosComCpuAltaCoincidente,x.minutosComMemoriaAltaCoincidente,x.minutosComDiscoAltoCoincidente];})],`comparacao-edr-${selecionada.maquina}-${dias}-dias.csv`);
}
function downloadComparisonPdf(){
  if(!selecionada)return;
  location.href=`/api/evidencias/seguranca/${encodeURIComponent(selecionada.maquina)}/comparacao/apresentacao?produto=${encodeURIComponent(selecionada.produto)}&dias=${dias}`;
}
async function load(){
  $("error").textContent="";
  try{const response=await fetch(`/api/evidencias/seguranca?dias=${dias}`,{cache:"no-store"});if(!response.ok)throw new Error(`API respondeu ${response.status}.`);
    const data=await response.json();resumo=data.evidencias;renderKpis();renderTable();$("updated").textContent=`Atualizado ${new Date(data.geradoEm).toLocaleTimeString("pt-BR")}`;
    if(selecionada){const found=resumo.find(x=>x.maquina===selecionada.maquina&&x.produto===selecionada.produto);if(found)await abrirDetalhe(found);else{$("detailPanel").hidden=true;selecionada=null;}}
  }catch(error){$("error").textContent=`Falha ao carregar evidências: ${error.message}`;}
}
$("period1").onclick=()=>{dias=1;load();};$("period7").onclick=()=>{dias=7;load();};$("refresh").onclick=load;
$("exportSummary").onclick=exportSummary;$("exportDetail").onclick=exportDetail;$("downloadPdf").onclick=downloadPdf;window.addEventListener("resize",()=>{if(detalhe)drawChart(detalhe);});load();
$("comparePeers").onclick=loadComparison;$("exportComparisonCsv").onclick=exportComparisonCsv;$("downloadComparisonPdf").onclick=downloadComparisonPdf;
