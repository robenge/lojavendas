"use strict";
const $ = id => document.getElementById(id);
let reportData = null;
let periodDays = 7;
let loading = false;
const percent = value => value == null ? "—" : value.toLocaleString("pt-BR", {maximumFractionDigits:1}) + "%";
const number = (value, suffix = "") => value == null ? "—" : value.toLocaleString("pt-BR", {maximumFractionDigits:1}) + suffix;
function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text != null) item.textContent = text;
  if (className) item.className = className;
  return item;
}
function formatDate(value) { return new Date(value).toLocaleString("pt-BR"); }
async function loadReport() {
  if (loading) return;
  loading = true; $("refreshReport").disabled = true;
  $("reportError").textContent = "";
  try {
    const response = await fetch(`/api/relatorios?dias=${periodDays}`, {cache:"no-store", signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
    reportData = await response.json();
    renderReport();
  } catch (error) {
    $("reportError").textContent = "Não foi possível gerar o relatório. " + error.message;
  } finally {
    loading = false; $("refreshReport").disabled = false;
  }
}
function renderReport() {
  const summary = reportData.resumo;
  $("periodCaption").textContent = `${reportData.dias} dia(s) · ${formatDate(reportData.desde)} até ${formatDate(reportData.geradoEm)}`;
  $("reportUpdated").textContent = "Gerado às " + new Date(reportData.geradoEm).toLocaleTimeString("pt-BR");
  $("period1").setAttribute("aria-pressed", String(periodDays === 1));
  $("period7").setAttribute("aria-pressed", String(periodDays === 7));
  const cards = [
    ["Máquinas", summary.maquinas, `${summary.online} online agora · ${summary.offline} offline`],
    ["Alertas no período", summary.alertas, `${summary.saudeCritica} máquina(s) com saúde crítica`],
    ["Disponibilidade estimada", percent(summary.disponibilidadeMedia), "Média das máquinas com dados"],
    ["CPU média", percent(summary.cpuMedia), "Média ponderada por tempo"],
    ["Memória média", percent(summary.memoriaMedia), "Média ponderada por tempo"],
    ["Latência média de disco", number(summary.discoMedioMs, " ms"), "Média ponderada por tempo"]
  ].map(([label, value, note]) => {
    const card = element("article", null, "report-kpi");
    card.append(element("span", label), element("strong", value), element("span", note));
    return card;
  });
  $("kpis").replaceChildren(...cards);

  if (reportData.alertasPorRecurso.length) {
    const table = element("table"), head = table.createTHead().insertRow();
    head.append(element("th", "Recurso"), element("th", "Ocorrências"));
    const body = table.createTBody();
    for (const item of reportData.alertasPorRecurso) {
      const row = body.insertRow(); row.append(element("td", item.recurso), element("td", item.ocorrencias));
    }
    $("resourceTable").replaceChildren(table);
  } else $("resourceTable").replaceChildren(element("p", "Nenhum incidente registrado nesse período.", "admin-note"));

  const machineTable = element("table"), machineHead = machineTable.createTHead().insertRow();
  for (const title of ["Máquina", "Grupo", "Estado", "Saúde", "Alertas", "Disponibilidade", "Cobertura", "CPU média", "CPU máx.", "RAM média", "Disco médio"])
    machineHead.append(element("th", title));
  const machineBody = machineTable.createTBody();
  for (const machine of reportData.maquinas) {
    const row = machineBody.insertRow();
    const values = [machine.maquina, machine.grupo, machine.online ? "Online" : "Offline",
      machine.saude == null ? "—" : machine.saude + "/100", machine.alertas,
      percent(machine.disponibilidade), machine.coberturaHoras == null ? "—" : number(machine.coberturaHoras, " h"),
      percent(machine.cpuMedia), percent(machine.cpuMaxima), percent(machine.memoriaMedia), number(machine.discoMedioMs, " ms")];
    for (let i = 0; i < values.length; i++) {
      const cell = element("td", values[i]);
      if (i === 2) cell.className = machine.online ? "green" : "red";
      if (i === 3 && machine.saude != null) cell.className = machine.saude < 50 ? "red" : machine.saude < 80 ? "yellow" : "green";
      row.append(cell);
    }
  }
  $("machineTable").replaceChildren(machineTable);
}
function csvCell(value) {
  if (value == null) return "";
  let text = String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function exportCsv() {
  if (!reportData) return;
  const rows = [["Máquina", "Grupo", "Estado", "Saúde", "Alertas", "Disponibilidade estimada (%)",
    "Cobertura (h)", "CPU média (%)", "CPU máxima (%)", "Memória média (%)", "Memória máxima (%)",
    "Disco médio (ms)", "Disco máximo (ms)"]];
  for (const machine of reportData.maquinas) rows.push([
    machine.maquina, machine.grupo, machine.online ? "Online" : "Offline", machine.saude,
    machine.alertas, machine.disponibilidade, machine.coberturaHoras, machine.cpuMedia, machine.cpuMaxima,
    machine.memoriaMedia, machine.memoriaMaxima, machine.discoMedioMs, machine.discoMaximoMs
  ]);
  const blob = new Blob(["\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n")], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob), link = element("a");
  link.href = url; link.download = `relatorio-monitor-${periodDays}d-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
$("period1").addEventListener("click", () => { if (periodDays !== 1) { periodDays = 1; loadReport(); } });
$("period7").addEventListener("click", () => { if (periodDays !== 7) { periodDays = 7; loadReport(); } });
$("refreshReport").addEventListener("click", loadReport);
$("exportReport").addEventListener("click", exportCsv);
loadReport();
