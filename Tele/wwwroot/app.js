"use strict";
const $ = id => document.getElementById(id);
let data = null, detailData = null, selected = null, pending = false, available = false, receivedAt = 0;
let processSort = "cpu";
let historyMetric = "nota";
let historyHours = 0.5;
const historyCache = new Map();
const historyLoadingHosts = new Set();
let historyErrorHost = null;
const servicesCache = new Map(), servicesLoading = new Set(), servicesErrors = new Map(), servicesFetchedAt = new Map();
let serviceFilter = "todos";
const percent = v => v == null ? "—" : v.toLocaleString("pt-BR", {maximumFractionDigits: 1}) + "%";
const memory = v => v == null ? "—" : (v / 1024 ** 3).toLocaleString("pt-BR", {maximumFractionDigits: 2}) + " GiB";
const number = (v, unit = "") => v == null ? "—" : v.toLocaleString("pt-BR", {maximumFractionDigits: 2}) + unit;
const rate = v => v == null ? "—" : number(v / 1024 ** 2, " MiB/s");
const uptime = seconds => {
  if (seconds == null) return "—";
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600);
  return days + " d " + hours + " h";
};
function metricTable(title, columns, rows) {
  const section = element("section", "", "resource-section");
  section.append(element("h3", title));
  if (!rows?.length) {
    section.append(element("p", "Sem dados nesta amostra. Verifique se o agente está atualizado."));
    return section;
  }
  const table = element("table", "");
  const head = table.createTHead().insertRow();
  for (const [title] of columns) {
    const th = element("th", title); th.scope = "col"; head.append(th);
  }
  const body = table.createTBody();
  for (const item of rows) {
    const row = body.insertRow();
    for (const [, key, format] of columns)
      row.append(element("td", format ? format(item[key]) : item[key]));
  }
  const wrapper = element("div", "", "process-table");
  wrapper.append(table); section.append(wrapper);
  return section;
}
async function carregarServicos(host) {
  if (servicesLoading.has(host)) return;
  servicesLoading.add(host);
  try {
    const response = await fetch(`/api/maquinas/${encodeURIComponent(host)}/servicos`,
      {cache:"no-store", signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
    servicesCache.set(host, await response.json());
    servicesErrors.delete(host);
  } catch (error) {
    servicesErrors.set(host, error.message);
  } finally {
    servicesFetchedAt.set(host, Date.now());
    servicesLoading.delete(host);
    if (selected === host) renderDetail();
  }
}
function servicosPanel(machine) {
  const panel = element("section", "", "resource-section");
  const snapshot = servicesCache.get(machine.maquina);
  panel.append(element("h3", "Serviços do Windows"));
  if (!snapshot) {
    const error = servicesErrors.get(machine.maquina);
    panel.append(element("p", error
      ? "Ainda não há snapshot de serviços. Atualize o agente e aguarde a próxima coleta (até 60 segundos)."
      : "Carregando serviços do Windows…"));
    return panel;
  }
  const services = snapshot.servicos ?? [];
  const running = services.filter(service => service.estado === "Running").length;
  const stopped = services.filter(service => service.estado === "Stopped").length;
  const automaticStopped = services.filter(service => service.estado === "Stopped" && service.tipoInicial === "Automatic").length;
  const toolbar = element("div", "", "toolbar service-toolbar");
  toolbar.append(element("p", `${services.length} serviços · ${running} em execução · ${stopped} parados · ${automaticStopped} automáticos parados · amostra ${date(snapshot.coletadoEm)}`));
  const filter = element("select", "");
  for (const [value,label] of [["todos","Todos"],["Running","Em execução"],["Stopped","Parados"],["automaticos-parados","Automáticos parados"]]) {
    const option = element("option", label); option.value = value; filter.append(option);
  }
  filter.value = serviceFilter;
  filter.addEventListener("change", () => { serviceFilter = filter.value; renderDetail(); });
  toolbar.append(filter); panel.append(toolbar);
  const filtered = services.filter(service => serviceFilter === "todos" ||
    (serviceFilter === "automaticos-parados" ? service.estado === "Stopped" && service.tipoInicial === "Automatic" : service.estado === serviceFilter))
    .sort((a,b) => Number(b.estado === "Stopped" && b.tipoInicial === "Automatic") -
      Number(a.estado === "Stopped" && a.tipoInicial === "Automatic") || a.nomeExibicao.localeCompare(b.nomeExibicao,"pt-BR"));
  if (!filtered.length) { panel.append(element("p", "Nenhum serviço corresponde a esse filtro.")); return panel; }
  const table = element("table", ""), head = table.createTHead().insertRow();
  for (const title of ["Serviço", "Nome do sistema", "Estado", "Inicialização"]) head.append(element("th", title));
  const body = table.createTBody();
  const states = {Running:"Em execução",Stopped:"Parado",StartPending:"Iniciando",StopPending:"Parando",ContinuePending:"Retomando",PausePending:"Pausando",Paused:"Pausado"};
  const startTypes = {Boot:"Inicialização",System:"Sistema",Automatic:"Automática",Manual:"Manual",Disabled:"Desativada",Unknown:"Desconhecida"};
  for (const service of filtered) {
    const row = body.insertRow();
    for (const value of [service.nomeExibicao, service.nome, states[service.estado] ?? service.estado, startTypes[service.tipoInicial] ?? service.tipoInicial])
      row.append(element("td", value));
    if (service.estado === "Stopped" && service.tipoInicial === "Automatic") row.cells[2].className = "yellow";
  }
  const wrapper = element("div", "", "process-table"); wrapper.append(table); panel.append(wrapper);
  return panel;
}
function ramUsage(m) {
  return m?.memoriaTotalBytes > 0 && m.memoriaDisponivelBytes != null
    ? 100 * (1 - m.memoriaDisponivelBytes / m.memoriaTotalBytes) : null;
}
const date = value => new Date(value).toLocaleString("pt-BR");
function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function online(machine) {
  const now = Date.parse(data.agora) + (performance.now() - receivedAt);
  return (now - Date.parse(machine.recebidoEm)) / 1000 < data.offlineAposSegundos;
}
function groupName(machine) { return machine.grupo || "Sem grupo"; }
function state(machine) {
  if (!available) return ["Estado desconhecido", ""];
  return online(machine) ? ["● Online", "green"] : ["● Offline", "red"];
}
function alertsFor(machine) {
  if (!online(machine)) return [{message:"Agente sem comunicação há mais de 30 segundos", severity:"red"}];
  return (machine.incidentes ?? []).filter(event => !event.fim)
    .map(event => ({message:event.mensagem, severity:event.nivel === "critico" ? "red" : "yellow"}));
}
function renderAlertHistory() {
  const events = data.maquinas.flatMap(machine =>
    (machine.incidentes ?? []).map(event => ({machine, event})))
    .sort((a,b) => Date.parse(b.event.inicio) - Date.parse(a.event.inicio)).slice(0,50);
  const section = element("section", "", "alert-history");
  section.append(element("h3", "Histórico · últimos 30 dias"));
  if (!events.length) {
    section.append(element("p", "Os eventos aparecerão quando uma condição de alerta começar."));
    $("alertHistory").replaceChildren(section);
    return;
  }
  const table = element("table", "");
  const head = table.createTHead().insertRow();
  for (const title of ["Máquina", "Recurso", "Condição", "Início", "Fim"])
    head.append(element("th", title));
  const body = table.createTBody();
  for (const {machine, event} of events) {
    const row = body.insertRow();
    for (const value of [machine.maquina, event.recurso, event.mensagem,
      date(event.inicio), event.fim ? date(event.fim) : "Ativo"])
      row.append(element("td", value, event.fim ? "" : "red"));
    row.onclick = () => {
      selected = machine.maquina; detailData = null; render(); refresh();
      $("detail").scrollIntoView({behavior:"smooth", block:"start"});
    };
    row.tabIndex = 0;
    row.setAttribute("role", "button");
  }
  const wrapper = element("div", "", "process-table");
  wrapper.append(table); section.append(wrapper);
  $("alertHistory").replaceChildren(section);
}
function renderAlerts() {
  const active = data.maquinas.flatMap(machine =>
    alertsFor(machine).map(alert => ({machine, ...alert})));
  const pending = data.maquinas.flatMap(machine =>
    (machine.condicoesPendentes ?? []).map(condition => ({machine, condition})));
  $("alertCount").textContent = active.length;
  renderAlertHistory();
  $("alertCount").className = active.length ? "health red" : "health green";
  $("alertList").replaceChildren(...(active.length ? active.map(alert => {
    const button = element("button", "", "alert " + alert.severity);
    button.append(element("strong", alert.machine.maquina),
      element("span", alert.message),
      element("small", "Último envio · " + date(alert.machine.recebidoEm)));
    button.onclick = () => {
      selected = alert.machine.maquina; detailData = null; render(); refresh();
      $("detail").scrollIntoView({behavior:"smooth", block:"start"});
    };
    return button;
  }) : [element("p", available ? "Nenhum alerta ativo." : "Aguardando conexão com a API.", "muted")]));
  const starting = pending.filter(item => item.condition.estado === "entrada");
  const recovering = pending.filter(item => item.condition.estado === "recuperacao");
  const summary = [];
  if (starting.length) {
    const examples = starting.slice(0, 3).map(({machine, condition}) => {
      const seconds = Math.max(0, Math.floor((Date.parse(data.agora) - Date.parse(condition.inicio)) / 1000));
      return machine.maquina + " · " + condition.recurso + " " + seconds + "/" + data.limites.duracaoMinimaAlertaSegundos + " s";
    });
    summary.push("Em observação: " + examples.join("; ") + (starting.length > 3 ? "; +" + (starting.length - 3) : ""));
  }
  if (recovering.length) summary.push(recovering.length + " recuperação(ões) sendo confirmada(s)");
  $("pendingSummary").textContent = summary.length
    ? summary.join(" · ") + " · alerta após " + data.limites.duracaoMinimaAlertaSegundos + " s contínuos"
    : "Desempenho: alerta após " + data.limites.duracaoMinimaAlertaSegundos + " s contínuos; normalização após " + data.limites.duracaoRecuperacaoSegundos + " s estáveis.";
}
function healthBadge(machine) {
  if (!available || !online(machine)) return element("span", "Saúde — · sem leitura atual", "health muted");
  const health = machine.saude;
  if (health?.nota == null) return element("span", "Saúde — · aguardando métricas", "health muted");
  const partial = health.recursos.length < 4;
  const color = health.nota < 50 ? "red" : health.nota < 80 || partial ? "yellow" : "green";
  return element("span", "Saúde " + health.nota + "/100" +
    (partial ? " · parcial " + health.recursos.length + "/4" : ""), "health " + color);
}
function healthPanel(machine) {
  const panel = element("section", "", "health-panel");
  panel.append(healthBadge(machine));
  const health = machine.saude;
  if (health?.recursos.length) {
    panel.append(element("p", health.limitante
      ? "Recurso que mais reduziu a nota da última amostra: " + health.limitante + "."
      : "Os recursos avaliados estão dentro das faixas iniciais."));
    panel.append(element("p", health.recursos.map(r => r.nome + " " + number(r.valor, " " + r.unidade) +
      " → " + r.nota + "/100").join(" · ")));
  }
  const explanation = element("details", "");
  explanation.append(element("summary", "Como a nota é calculada"));
  explanation.append(element("p", "A nota geral é a menor nota dos recursos disponíveis. Verde de 80 a 100, amarelo de 50 a 79 e vermelho de 0 a 49. Avaliações parciais aparecem em amarelo quando a nota é 50 ou mais."));
  const limits = data.limites;
  explanation.append(element("p", "Faixas da nota no servidor: CPU " + limits.cpuNormal + "–" + limits.cpuCritico + "%, memória " + limits.memoriaNormal + "–" + limits.memoriaCritico + "%, disco " + limits.discoNormalMs + "–" + limits.discoCriticoMs + " ms e rede " + limits.redeNormal + "–" + limits.redeCritico + "%. A nota cai de 100 a 0 entre os limites. Alertas a partir de CPU " + limits.cpuAlerta + "%, memória " + limits.memoriaAlerta + "%, disco " + limits.discoAlertaMs + " ms, rede " + limits.redeAlerta + "% e uptime de " + limits.uptimeAlertaDias + " dias."));
  panel.append(explanation);
  return panel;
}
function diagnostico(machine) {
  const metrics = machine.metricas;
  const health = machine.saude;
  const candidate = health?.limitante;
  if (!metrics || health?.nota == null)
    return {title:"Aguardando métricas", reason:"O agente ainda não enviou dados suficientes para analisar a causa.", advice:"Confirme se o serviço do agente está enviando amostras atualizadas."};
  if (!candidate || health.nota >= 80)
    return {title:"Nenhum gargalo claro nesta amostra", reason:"Os indicadores estão fora das faixas de atenção configuradas.", advice:"Consulte o gráfico de 24 horas para detectar picos e recorrências."};
  const processes = metrics.processos ?? [];
  let suspect = null, reason = "";
  let advice = "";
  if (candidate === "CPU") {
    suspect = [...processes].filter(p => p.cpu != null).sort((a,b) => b.cpu-a.cpu)[0];
    reason = "A CPU é o recurso que mais reduziu a nota.";
    advice = "Confira a atividade e os horários de execução deste processo. Se o pico for recorrente, avalie limitar concorrência ou distribuir a carga.";
  } else if (candidate === "Memória") {
    suspect = [...processes].sort((a,b) => b.memoriaBytes-a.memoriaBytes)[0];
    reason = "A memória é o recurso que mais reduziu a nota.";
    advice = "Verifique se o consumo deste processo cresce ao longo do tempo e compare com a memória necessária para a carga de trabalho.";
  } else if (candidate === "Disco") {
    suspect = [...processes].filter(p => p.leituraIoBps != null || p.escritaIoBps != null)
      .sort((a,b) => (b.leituraIoBps??0)+(b.escritaIoBps??0)-(a.leituraIoBps??0)-(a.escritaIoBps??0))[0];
    reason = "A latência de disco é o recurso que mais reduziu a nota.";
    advice = suspect ? "Compare a E/S deste processo com os picos de latência. Considere escalonar ou limitar tarefas intensivas em disco." : "A coleta de E/S por processo ainda está indisponível nesta amostra. Consulte a latência e a fila do disco.";
  } else {
    reason = "A utilização de rede é o recurso que mais reduziu a nota.";
    advice = "Compare o tráfego da interface com a velocidade do link e verifique saturação, erros e horários de pico. A coleta atual não identifica o processo responsável pelo tráfego.";
  }
  return {title:"Gargalo provável · " + candidate, reason, suspect, advice};
}
function diagnosisPanel(machine) {
  const diagnosis = diagnostico(machine);
  const panel = element("section", "", "diagnosis-panel");
  panel.append(element("h3", "Resumo da máquina"), element("strong", diagnosis.title),
    element("p", diagnosis.reason));
  if (diagnosis.suspect) {
    const process = diagnosis.suspect;
    const metric = diagnosis.title.includes("CPU") ? "CPU " + percent(process.cpu)
      : diagnosis.title.includes("Memória") ? "RAM " + memory(process.memoriaBytes)
      : "E/S " + rate((process.leituraIoBps ?? 0) + (process.escritaIoBps ?? 0));
    panel.append(element("p", "Processo candidato associado · " + process.nome + " (PID " + process.pid + ") · " + metric));
  }
  panel.append(element("p", "Sugestão · " + diagnosis.advice),
    element("small", "Diagnóstico heurístico baseado na amostra atual. A associação com um processo é indicativa e não comprova causalidade."));
  return panel;
}
function inventoryPanel(machine) {
  const panel = element("section", "", "resource-section");
  panel.append(element("h3", "Inventário de hardware e sistema"));
  const inventory = machine.inventario;
  if (!inventory) {
    panel.append(element("p", "Este agente ainda não enviou o inventário. Atualize o serviço do agente para incluir sistema, processador e versão."));
    return panel;
  }
  const list = element("dl", "", "details");
  for (const [title, value] of [
    ["Sistema operacional", inventory.sistemaOperacional],
    ["Versão / build", inventory.versaoSistema],
    ["Arquitetura", inventory.arquitetura],
    ["Fabricante", inventory.fabricante || "Não informado"],
    ["Modelo", inventory.modelo || "Não informado"],
    ["Processador", inventory.processador || "Não informado"],
    ["Processadores lógicos", number(inventory.processadoresLogicos)],
    ["Memória instalada", memory(inventory.memoriaTotalBytes)],
    ["Versão do agente", inventory.versaoAgente],
    ["Inventário atualizado", date(inventory.coletadoEm)]
  ]) {
    const item = element("div", ""); item.append(element("dt", title), element("dd", value)); list.append(item);
  }
  panel.append(list);
  return panel;
}
const historyLabels = {nota:"Saúde", cpu:"CPU (%)", memoria:"Memória (%)", discoMs:"Disco (ms)", rede:"Rede (%)", uptimeDias:"Uptime (dias)"};
function historyPanel(machine) {
  const panel = element("section", "", "history-panel");
  const rangeLabel = historyHours === 0.5 ? "30 minutos" : historyHours === 168 ? "7 dias" : historyHours + " horas";
  panel.append(element("h3", "Histórico · " + rangeLabel));
  const controls = element("div", "", "chart-controls");
  const ranges = [[0.5, "30 min"], [6, "6 horas"], [24, "24 horas"]];
  if (data.limites.retencaoHistoricoDias >= 7) ranges.push([168, "7 dias"]);
  for (const [hours, label] of ranges) {
    const button = element("button", label);
    button.setAttribute("aria-pressed", String(historyHours === hours));
    button.onclick = () => {
      historyHours = hours;
      renderDetail();
      if (hours === 168 && selected && !historyCache.has(selected)) carregarHistoricoLongo(selected);
    };
    controls.append(button);
  }
  for (const [key, label] of Object.entries(historyLabels)) {
    const button = element("button", label);
    button.setAttribute("aria-pressed", String(historyMetric === key));
    button.onclick = () => { historyMetric = key; renderDetail(); };
    controls.append(button);
  }
  const canvas = element("canvas", "");
  canvas.id = "historyChart";
  canvas.setAttribute("role", "img");
  const caption = element("p", "");
  caption.id = "historyCaption";
  panel.append(controls, canvas, caption);
  requestAnimationFrame(() => { if (canvas.isConnected) drawHistory(machine); });
  return panel;
}
async function carregarHistoricoLongo(host) {
  if (historyLoadingHosts.has(host)) return;
  historyLoadingHosts.add(host); historyErrorHost = null;
  if (selected === host) renderDetail();
  try {
    const response = await fetch(`/api/maquinas/${encodeURIComponent(host)}/historico?dias=7`,
      {cache:"no-store", signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error("HTTP " + response.status);
    const result = await response.json();
    historyCache.set(host, result.historico ?? []);
  } catch {
    historyErrorHost = host;
  } finally {
    historyLoadingHosts.delete(host);
    if (selected === host) renderDetail();
  }
}
function processHistory(machine) {
  const aggregate = new Map();
  for (const point of machine.historico ?? []) {
    if (Date.parse(point.horario) < Date.now() - 30 * 60000) continue;
    for (const process of point.maioresProcessos ?? []) {
      const key = process.pid + ":" + process.nome;
      if (!aggregate.has(key)) aggregate.set(key, {nome:process.nome,pid:process.pid,cpu:[],ram:[],amostras:0});
      const item = aggregate.get(key);
      if (process.cpu != null) item.cpu.push(process.cpu);
      item.ram.push(process.memoriaBytes);
      item.amostras++;
    }
  }
  const rows = [...aggregate.values()].map(item => ({
    ...item,
    cpuMedia:item.cpu.length ? item.cpu.reduce((sum,value)=>sum+value,0)/item.cpu.length : null,
    cpuMax:item.cpu.length ? Math.max(...item.cpu) : null,
    ramMax:Math.max(...item.ram)
  })).sort((a,b) => (b.cpuMedia ?? -1) - (a.cpuMedia ?? -1)).slice(0,20);
  const section = element("section", "", "resource-section");
  section.append(element("h3", "Processos que mais consumiram · 30 minutos"));
  if (!rows.length) {
    section.append(element("p", "Aguardando novas amostras do agente para formar o histórico de processos."));
    return section;
  }
  const table = element("table", ""), head = table.createTHead().insertRow();
  for (const title of ["Processo","PID","CPU média","CPU máxima","RAM máxima","Amostras destacadas"])
    head.append(element("th", title));
  const body = table.createTBody();
  for (const process of rows) {
    const row = body.insertRow();
    for (const value of [process.nome, process.pid, percent(process.cpuMedia), percent(process.cpuMax),
      memory(process.ramMax), process.amostras]) row.append(element("td", value));
  }
  const wrapper = element("div", "", "process-table"); wrapper.append(table); section.append(wrapper);
  section.append(element("p", "A API registra até cinco processos com maior CPU e cinco com maior RAM por amostra. A média considera as amostras em que o processo esteve entre os destaques."));
  return section;
}
function drawHistory(machine) {
  const canvas = $("historyChart");
  if (!canvas || !data) return;
  if (historyHours > 24 && !historyCache.has(machine.maquina)) {
    canvas.setAttribute("aria-label", "Histórico estendido indisponível.");
    $("historyCaption").textContent = historyErrorHost === machine.maquina
      ? "Não foi possível carregar o histórico de 7 dias. Selecione o período novamente para tentar."
      : "Carregando histórico de 7 dias…";
    return;
  }
  const mergedPoints = new Map((historyHours > 24 ? historyCache.get(machine.maquina) ?? [] : [])
    .map(point => [Date.parse(point.horario), point]));
  for (const point of machine.historico ?? []) mergedPoints.set(Date.parse(point.horario), point);
  const points = [...mergedPoints.values()].sort((a,b) => Date.parse(a.horario) - Date.parse(b.horario));
  const end = Date.parse(data.agora);
  const start = end - historyHours * 3600000;
  const visible = points.filter(p => Date.parse(p.horario) >= start);
  const values = visible.map(p => p[historyMetric]).filter(v => v != null);
  const width = Math.max(240, canvas.clientWidth), height = 210;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio; canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  const ceiling = historyMetric === "discoMs" ? Math.max(10, Math.ceil(Math.max(0,...values) / 10) * 10)
    : historyMetric === "uptimeDias" ? Math.max(5, Math.ceil(Math.max(0,...values) / 5) * 5) : 100;
  const x = time => 45 + (time - start) / (end - start) * (width - 60);
  const y = value => 173 - value / ceiling * 150;
  context.font = "12px Segoe UI";
  for (const level of [0, ceiling / 2, ceiling]) {
    context.fillStyle = "#8fa9c4";
    context.fillText(number(level), 0, y(level) + 4);
    context.strokeStyle = "#1b3552";
    context.beginPath(); context.moveTo(45, y(level)); context.lineTo(width-15, y(level)); context.stroke();
  }
  const timeLabel = time => historyHours > 24
    ? new Date(time).toLocaleDateString("pt-BR", {day:"2-digit", month:"2-digit"})
    : new Date(time).toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
  context.fillText(timeLabel(start), 45, 200);
  context.fillText(timeLabel(end), width-50, 200);
  context.strokeStyle = "#39a7ff"; context.fillStyle = "#69d4ff"; context.lineWidth = 2;
  let previous = null;
  for (const point of visible) {
    const value = point[historyMetric], time = Date.parse(point.horario);
    if (value == null || time < start) { previous = null; continue; }
    const maxGap = historyHours === 0.5 ? 30000 : historyHours > 24 ? 120000 : 90000;
    if (previous && time - previous.time < maxGap) {
      context.beginPath(); context.moveTo(x(previous.time), y(previous.value));
      context.lineTo(x(time), y(value)); context.stroke();
    }
    context.beginPath(); context.arc(x(time), y(value), 2, 0, Math.PI*2); context.fill();
    previous = {time, value};
  }
  const text = values.length ? historyLabels[historyMetric] + " · mínimo " + number(Math.min(...values)) +
    " · máximo " + number(Math.max(...values)) + " · " + values.length + " amostras" +
    (historyHours > 24 ? " · amostras acima de 30 min resumidas por minuto" +
      (points.length && Date.parse(points[0].horario) > start + 60000
        ? " · histórico disponível desde " + new Date(Date.parse(points[0].horario)).toLocaleString("pt-BR") : "") : "")
    : "Aguardando amostras desta métrica. O gráfico será preenchido durante a coleta.";
  canvas.setAttribute("aria-label", text);
  $("historyCaption").textContent = text;
}
window.addEventListener("resize", () => {
  const machine = data?.maquinas.find(m => m.maquina === selected);
  if (machine) drawHistory(machine);
});
function renderDetail() {
  const machine = detailData;
  $("detail").hidden = !machine;
  if (!machine) return;
  if (!servicesLoading.has(machine.maquina) && Date.now() - (servicesFetchedAt.get(machine.maquina) ?? 0) >= 60000)
    queueMicrotask(() => carregarServicos(machine.maquina));
  if (historyHours > 24 && !historyCache.has(machine.maquina) &&
      !historyLoadingHosts.has(machine.maquina) && historyErrorHost !== machine.maquina)
    queueMicrotask(() => carregarHistoricoLongo(machine.maquina));
  const heading = element("div", "", "toolbar");
  const close = element("button", "Fechar detalhes");
  close.onclick = () => { selected = null; render(); };
  heading.append(element("h2", machine.maquina), close);
  const [label, color] = state(machine);
  const list = element("dl", "", "details");
  for (const [term, value] of [
    ["Grupo", groupName(machine)],
    ["Comunicação", label],
    ["Último recebimento na API", date(machine.recebidoEm)],
    ["Horário enviado pelo agente", date(machine.enviadoEm)],
    ["Primeiro contato registrado", date(machine.primeiroContato)],
    ["Mensagens recebidas", machine.mensagens.toLocaleString("pt-BR")],
    ["Tempo desde a última inicialização", uptime(machine.metricas?.uptimeSegundos)],
    ["CPU total", percent(machine.metricas?.cpu)],
    ["Memória em uso", percent(ramUsage(machine.metricas))],
    ["Memória disponível", memory(machine.metricas?.memoriaDisponivelBytes)],
    ["Memória total", memory(machine.metricas?.memoriaTotalBytes)]
  ]) {
    const item = element("div", "");
    item.append(element("dt", term), element("dd", value, term === "Comunicação" ? color : ""));
    list.append(item);
  }
  $("detail").replaceChildren(heading, healthPanel(machine), diagnosisPanel(machine), list,
    inventoryPanel(machine), historyPanel(machine));
  if (!machine.metricas) {
    $("detail").append(element("p", "Atualize o agente desta máquina para enviar CPU, memória e processos.", "notice"), servicosPanel(machine));
    return;
  }
  const metrics = machine.metricas;
  $("detail").append(
    metricTable("Discos físicos · agregado da máquina", [
      ["Leitura", "leituraMs", v => number(v, " ms")],
      ["Escrita", "escritaMs", v => number(v, " ms")],
      ["Vazão de leitura", "leituraBps", rate],
      ["Vazão de escrita", "escritaBps", rate],
      ["Fila atual", "fila", number],
      ["Leituras/s", "leituras", number],
      ["Escritas/s", "escritas", number]
    ], metrics.disco ? [metrics.disco] : []),
    metricTable("Volumes locais", [
      ["Volume", "nome"], ["Capacidade", "totalBytes", memory], ["Livre", "livreBytes", memory]
    ], metrics.volumes),
    metricTable("Interfaces de rede", [
      ["Interface", "nome"], ["Estado", "estado", v => v === "Up" ? "Conectada" : v === "Down" ? "Desconectada" : v],
      ["Link", "velocidadeBits", v => v > 0 ? number(v / 1e6, " Mbit/s") : "—"],
      ["Recepção", "recebidoBps", rate], ["Envio", "enviadoBps", rate],
      ["Uso do link", "uso", percent],
      ["Erros RX acumulados", "errosRecepcao", number],
      ["Erros TX acumulados", "errosEnvio", number]
    ], metrics.rede),
    element("p", "Latência média dos discos no intervalo. Rede calculada entre coletas; uso considera a direção mais ocupada. — indica dado indisponível ou coleta inicial.", "notice"),
    servicosPanel(machine)
  );
  const controls = element("div", "", "toolbar");
  controls.append(element("h3", "Processos · " + machine.metricas.processos.length));
  for (const [key, title] of [["cpu", "Ordenar por CPU"], ["memoriaBytes", "Ordenar por memória"]]) {
    const button = element("button", title);
    button.setAttribute("aria-pressed", String(processSort === key));
    button.onclick = () => { processSort = key; renderDetail(); };
    controls.append(button);
  }
  const table = element("table", "");
  const head = table.createTHead().insertRow();
  for (const title of ["Processo", "PID", "CPU", "RAM residente", "E/S leitura", "E/S escrita"]) {
    const th = element("th", title); th.scope = "col"; head.append(th);
  }
  const body = table.createTBody();
  const processes = [...machine.metricas.processos].sort((a,b) => (b[processSort] ?? -1) - (a[processSort] ?? -1));
  for (const process of processes) {
    const row = body.insertRow();
    for (const value of [process.nome, process.pid, percent(process.cpu), memory(process.memoriaBytes),
      rate(process.leituraIoBps), rate(process.escritaIoBps)])
      row.append(element("td", value));
  }
  const wrapper = element("div", "", "process-table");
  wrapper.append(table);
  $("detail").append(processHistory(machine), controls, wrapper, element("p",
    "CPU medida entre coletas e normalizada pela capacidade total. — indica leitura indisponível ou primeira coleta. Processos protegidos ou encerrados podem ter dados incompletos.", "notice"));
}
function csvCell(value) {
  if (value == null) return "";
  let text = String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
async function exportCsv() {
  if (!data) return;
  let exportData;
  try {
    const response = await fetch("/api/exportacao", {cache:"no-store", signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error("HTTP " + response.status);
    exportData = await response.json();
  } catch {
    $("connection").textContent = "Não foi possível preparar o CSV";
    return;
  }
  const rows = [["Tipo","Máquina","Grupo","Horário","CPU (%)","Memória (%)","Disco (ms)",
    "Rede (%)","Saúde","Recurso","Condição","Início","Fim","Processo","PID","CPU do processo (%)","RAM do processo","E/S leitura (B/s)","E/S escrita (B/s)","Uptime (dias)"]];
  for (const machine of exportData) {
    const samples = machine.historico?.length ? machine.historico : [{
      horario: machine.recebidoEm,
      cpu: machine.metricas?.cpu,
      memoria: ramUsage(machine.metricas),
      discoMs: machine.saude?.recursos.find(r => r.nome === "Disco")?.valor,
      rede: machine.saude?.recursos.find(r => r.nome === "Rede")?.valor,
      nota: machine.saude?.nota,
      uptimeDias: machine.metricas?.uptimeSegundos == null ? null : machine.metricas.uptimeSegundos / 86400
    }];
    for (const point of samples)
      rows.push(["Métrica", machine.maquina, machine.grupo, point.horario, point.cpu, point.memoria,
        point.discoMs, point.rede, point.nota, "", "", "", "", "", "", "", "", "", "", point.uptimeDias]);
    for (const point of (machine.historico ?? []).filter(p => Date.parse(p.horario) >= Date.now() - 30 * 60000))
      for (const process of point.maioresProcessos ?? [])
        rows.push(["Processo", machine.maquina, machine.grupo, point.horario, "", "", "", "", "", "", "", "", "",
          process.nome, process.pid, process.cpu, process.memoriaBytes,
          process.leituraIoBps, process.escritaIoBps, point.uptimeDias]);
    for (const event of machine.incidentes ?? [])
      rows.push(["Alerta", machine.maquina, machine.grupo, event.inicio, "", "", "", "", "",
        event.recurso, event.mensagem, event.inicio, event.fim ?? "Ativo", "", "", "", "", "", "", ""]);
  }
  const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"}));
  const link = element("a", "");
  link.href = url;
  link.download = "monitor-" + new Date().toISOString().slice(0,10) + ".csv";
  document.body.append(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}
function render() {
  if (!data) return;
  $("total").textContent = data.maquinas.length;
  renderAlerts();
  $("online").textContent = available ? data.maquinas.filter(online).length : "—";
  $("offline").textContent = available ? data.maquinas.filter(m => !online(m)).length : "—";
  const groupFilter = $("groupFilter");
  const selectedGroup = groupFilter.value;
  const groups = [...new Set(data.maquinas.map(groupName))].sort((a,b) => a.localeCompare(b, "pt-BR"));
  const allGroups = element("option", "Todos os grupos"); allGroups.value = "todos";
  groupFilter.replaceChildren(allGroups, ...groups.map(group => {
    const option = element("option", group); option.value = group; return option;
  }));
  groupFilter.value = selectedGroup === "todos" || groups.includes(selectedGroup) ? selectedGroup : "todos";
  const search = $("search").value.trim().toLocaleLowerCase("pt-BR");
  const selectedState = $("stateFilter").value;
  const selectedGroupValue = groupFilter.value;
  const machines = data.maquinas.filter(machine => {
    if (!machine.maquina.toLocaleLowerCase("pt-BR").includes(search)) return false;
    if (selectedGroupValue !== "todos" && groupName(machine) !== selectedGroupValue) return false;
    const isOnline = online(machine);
    const health = machine.saude?.nota;
    if (selectedState === "online" && !isOnline) return false;
    if (selectedState === "offline" && isOnline) return false;
    if (selectedState === "alertas" && alertsFor(machine).length === 0) return false;
    if (selectedState === "criticas" && (health == null || health >= 50)) return false;
    return true;
  });
  const sort = $("sortMachines").value;
  const value = machine => sort === "saude" ? machine.saude?.nota ?? Infinity
    : sort === "cpu" ? machine.metricas?.cpu ?? -1
    : sort === "memoria" ? ramUsage(machine.metricas) ?? -1
    : sort === "alertas" ? alertsFor(machine).length
    : machine.maquina.toLocaleLowerCase("pt-BR");
  machines.sort((a,b) => {
    const first = value(a), second = value(b);
    return typeof first === "string" ? first.localeCompare(second, "pt-BR") :
      sort === "saude" ? first - second : second - first;
  });
  $("empty").hidden = machines.length > 0;
  $("empty").textContent = data.maquinas.length ? "Nenhuma máquina corresponde à busca." : "Aguardando o primeiro agente. Verifique o endereço da API no appsettings.json do serviço.";
  $("machines").replaceChildren(...machines.map(machine => {
    const button = element("button", "", "machine");
    button.setAttribute("aria-pressed", String(selected === machine.maquina));
    const [label, color] = state(machine);
    button.append(element("span", label, "badge " + color), element("strong", machine.maquina), healthBadge(machine),
      element("small", "Grupo · " + groupName(machine)),
      element("small", "CPU " + percent(machine.metricas?.cpu) + " · RAM " + percent(ramUsage(machine.metricas))),
      element("small", "Ligada há " + uptime(machine.metricas?.uptimeSegundos)),
      element("small", "Último contato · " + date(machine.recebidoEm)));
    button.onclick = () => {
      selected = machine.maquina; detailData = null; render(); refresh();
      $("detail").scrollIntoView({behavior:"smooth", block:"nearest"});
    };
    return button;
  }));
  renderDetail();
}
async function refresh() {
  if (pending) return;
  pending = true; $("refresh").disabled = true;
  try {
    const response = await fetch("/api/maquinas", {cache:"no-store", signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error("HTTP " + response.status);
    data = await response.json();
    detailData = null;
    if (selected) {
      const detailResponse = await fetch("/api/maquinas/" + encodeURIComponent(selected),
        {cache:"no-store", signal:AbortSignal.timeout(8000)});
      if (detailResponse.ok) detailData = await detailResponse.json();
    }
    receivedAt = performance.now(); available = true;
    $("connection").classList.add("is-connected"); $("connection").classList.remove("is-offline");
    $("connection").textContent = "API conectada · " + new Date().toLocaleTimeString("pt-BR");
  } catch {
    available = false;
    $("connection").classList.add("is-offline"); $("connection").classList.remove("is-connected");
    $("connection").textContent = "API indisponível · tentando reconectar";
    if (!data) $("empty").textContent = "Não foi possível consultar a API.";
  } finally {
    pending = false; $("refresh").disabled = false; render();
  }
}
$("search").addEventListener("input", render);
$("stateFilter").addEventListener("change", render);
$("groupFilter").addEventListener("change", render);
$("sortMachines").addEventListener("change", render);
$("exportCsv").addEventListener("click", exportCsv);
$("refresh").addEventListener("click", refresh);
refresh();
setInterval(refresh, 3000);



