"use strict";
const $ = id => document.getElementById(id);
let adminData = {grupos:[], maquinas:[]};
let importRows = null;
let webhookConfigurado = false;

function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text != null) item.textContent = text;
  if (className) item.className = className;
  return item;
}
function message(id, text, isError = false) {
  const target = $(id);
  target.textContent = text;
  target.classList.toggle("error", isError);
}
async function request(url, options = {}) {
  const response = await fetch(url, {cache:"no-store", ...options});
  if (response.status === 401) { location.href = "/admin-login.html?returnUrl=%2Fadmin.html"; throw new Error("Sessão encerrada."); }
  const text = response.status === 204 ? "" : await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* respostas simples da API */ }
  if (!response.ok) throw new Error(typeof body === "string" ? body : body?.detail || body?.title || "Falha na solicitação.");
  return body;
}
function option(value, label) {
  const item = node("option", label);
  item.value = value;
  return item;
}
function renderGroups() {
  $("groupCount").textContent = adminData.grupos.length
    ? `${adminData.grupos.length} grupo(s) · ${adminData.maquinas.length} máquina(s) cadastrada(s)`
    : "Nenhum grupo criado ainda.";
  const cards = adminData.grupos.length ? adminData.grupos.map(group => {
    const card = node("div", null, "group-card");
    card.append(node("strong", group.nome), node("span", `${group.maquinas} máquina(s)`));
    return card;
  }) : [node("p", "Crie um grupo ou importe uma planilha CSV para começar.", "admin-note")];
  $("groupsList").replaceChildren(...cards);
}
function renderAgentCoverage() {
  const expected = adminData.versaoAgenteEsperada || "—";
  const machines = adminData.maquinas;
  const current = machines.filter(machine => machine.agenteAtualizado).length;
  const pending = machines.length - current;
  $("agentCoverageSummary").textContent = `${current} de ${machines.length} atualizado(s) · ${pending} precisa(m) de atualização · recomendada v${expected}`;
  const filter = $("agentFilter").value;
  const visible = machines.filter(machine => filter === "todos" ||
    (filter === "atualizado" ? machine.agenteAtualizado : !machine.agenteAtualizado));
  if (!visible.length) {
    $("agentCoverageTable").replaceChildren(node("p", "Nenhuma máquina neste filtro.", "admin-note"));
    return;
  }
  const table = node("table"), head = table.createTHead().insertRow();
  for (const title of ["Máquina", "Grupo", "Versão instalada", "Versão recomendada", "Situação"])
    head.append(node("th", title));
  const body = table.createTBody();
  for (const machine of visible) {
    const row = body.insertRow();
    const status = !machine.inventarioRecebido ? "Inventário ausente · atualizar agente"
      : machine.agenteAtualizado ? "Atualizado" : "Versão antiga · atualizar";
    for (const value of [machine.maquina, machine.grupo || "Sem grupo",
      machine.versaoAgente ? "v" + machine.versaoAgente : "Não recebida", "v" + expected, status])
      row.append(node("td", value));
    row.cells[4].className = machine.agenteAtualizado ? "green" : "yellow";
  }
  $("agentCoverageTable").replaceChildren(table);
}
function renderMachines() {
  if (!adminData.maquinas.length) {
    $("machineTable").replaceChildren(node("p", "Nenhum agente registrado na API ainda.", "admin-note"));
    return;
  }
  const table = node("table");
  const head = table.createTHead().insertRow();
  for (const title of ["Máquina", "Grupo", "Ações"]) head.append(node("th", title));
  const body = table.createTBody();
  for (const machine of adminData.maquinas) {
    const row = body.insertRow();
    row.append(node("td", machine.maquina));
    const groupCell = row.insertCell();
    const select = node("select", null, "machine-group-select");
    select.append(option("", "Sem grupo"));
    for (const group of adminData.grupos) select.append(option(group.nome, group.nome));
    select.value = machine.grupo || "";
    groupCell.append(select);
    const actionCell = row.insertCell();
    const save = node("button", "Salvar");
    save.type = "button";
    save.onclick = async () => {
      save.disabled = true;
      try {
        await request(`/api/admin/maquinas/${encodeURIComponent(machine.maquina)}/grupo`, {
          method:"PUT", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({grupo:select.value || null})
        });
        message("machineMessage", `Grupo de ${machine.maquina} atualizado.`);
        await load();
      } catch (error) {
        message("machineMessage", error.message, true);
      } finally { save.disabled = false; }
    };
    const remove = node("button", "Excluir", "danger-button");
    remove.type = "button";
    remove.onclick = async () => {
      const confirmed = window.confirm(`Excluir ${machine.maquina} e apagar permanentemente suas métricas, histórico, serviços e evidências? Se o agente continuar ativo, a máquina voltará a aparecer.`);
      if (!confirmed) return;
      remove.disabled = true;
      try {
        await request(`/api/admin/maquinas/${encodeURIComponent(machine.maquina)}`, {method:"DELETE"});
        message("machineMessage", `${machine.maquina} e os dados associados foram excluídos.`);
        await load();
      } catch (error) {
        message("machineMessage", error.message, true);
        remove.disabled = false;
      }
    };
    actionCell.append(save, remove);
  }
  $("machineTable").replaceChildren(table);
}
async function load() {
  try {
    adminData = await request("/api/admin/grupos");
    renderAgentCoverage(); renderGroups(); renderMachines();
  } catch (error) {
    message("machineMessage", error.message, true);
    $("groupCount").textContent = "Não foi possível carregar os dados da API.";
  }
}
async function loadWebhook() {
  try {
    const result = await request("/api/admin/webhook");
    webhookConfigurado = result.configurado;
    $("webhookStatus").textContent = webhookConfigurado ? "Webhook configurado · eventos de alerta ativos" : "Nenhum webhook configurado";
    $("removeWebhook").disabled = !webhookConfigurado;
    $("testWebhook").disabled = !webhookConfigurado;
  } catch (error) { message("webhookMessage", error.message, true); }
}
$("webhookForm").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("webhookUrl"), button = event.submitter, url = input.value.trim();
  if (!url) { message("webhookMessage", "Cole a URL do webhook do Google Chat.", true); return; }
  button.disabled = true;
  try {
    await request("/api/admin/webhook", {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url})});
    input.value = "";
    message("webhookMessage", "Webhook salvo. Envie um teste para confirmar o recebimento.");
    await loadWebhook();
  } catch (error) { message("webhookMessage", error.message, true); }
  finally { button.disabled = false; }
});
$("testWebhook").addEventListener("click", async event => {
  const button = event.currentTarget; button.disabled = true;
  try { const result = await request("/api/admin/webhook/teste", {method:"POST"}); message("webhookMessage", result.mensagem); }
  catch (error) { message("webhookMessage", error.message, true); }
  finally { button.disabled = !webhookConfigurado; }
});
$("removeWebhook").addEventListener("click", async event => {
  const button = event.currentTarget; button.disabled = true;
  try { await request("/api/admin/webhook", {method:"DELETE"}); message("webhookMessage", "Webhook removido."); await loadWebhook(); }
  catch (error) { message("webhookMessage", error.message, true); button.disabled = false; }
});
$("groupForm").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("groupName"), button = event.submitter;
  button.disabled = true;
  try {
    await request("/api/admin/grupos", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({nome:input.value.trim()})
    });
    input.value = "";
    message("groupMessage", "Grupo criado.");
    await load();
  } catch (error) { message("groupMessage", error.message, true); }
  finally { button.disabled = false; }
});

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === delimiter) { row.push(field.trim()); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("O CSV tem aspas sem fechamento.");
  row.push(field.trim());
  if (row.some(value => value !== "")) rows.push(row);
  if (rows.length < 2) throw new Error("O CSV precisa ter cabeçalho e pelo menos uma máquina.");
  return rows;
}
function normalizeHeader(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function prepareCsv(text) {
  const rows = parseCsv(text);
  const headers = rows[0].map(normalizeHeader);
  const machineColumn = headers.findIndex(value => ["maquina", "host", "hostname", "computador", "machine"].includes(value));
  const groupColumn = headers.findIndex(value => ["grupo", "setor", "group"].includes(value));
  if (machineColumn < 0 || groupColumn < 0)
    throw new Error("Não encontrei as colunas Máquina e Grupo no cabeçalho.");
  const result = rows.slice(1).map((row, index) => {
    const maquina = row[machineColumn]?.trim();
    const grupo = row[groupColumn]?.trim();
    if (!maquina || !grupo) throw new Error(`Linha ${index + 2}: informe máquina e grupo.`);
    if (maquina.length > 255 || grupo.length > 80) throw new Error(`Linha ${index + 2}: máquina ou grupo excede o tamanho permitido.`);
    return {maquina, grupo};
  });
  if (result.length > 5000) throw new Error("O limite de importação é 5000 máquinas por arquivo.");
  const seen = new Set();
  for (const line of result) {
    const key = line.maquina.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) throw new Error(`A máquina ${line.maquina} aparece mais de uma vez no CSV.`);
    seen.add(key);
  }
  return result;
}
function renderCsvPreview(rows) {
  const preview = $("csvPreview");
  const table = node("table");
  const head = table.createTHead().insertRow();
  head.append(node("th", "Máquina"), node("th", "Grupo"));
  const body = table.createTBody();
  for (const line of rows.slice(0, 25)) {
    const row = body.insertRow(); row.append(node("td", line.maquina), node("td", line.grupo));
  }
  const info = node("p", `${rows.length} atribuição(ões) · ${new Set(rows.map(line => line.grupo.toLocaleLowerCase("pt-BR"))).size} grupo(s) · exibindo até 25 linhas`, "admin-note");
  $("csvPreviewInfo").replaceChildren(info, table);
  preview.hidden = false;
  $("importCsv").disabled = false;
}
$("csvFile").addEventListener("change", async event => {
  importRows = null;
  $("importCsv").disabled = true;
  $("csvPreview").hidden = true;
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 1024 * 1024) { message("csvMessage", "O arquivo deve ter no máximo 1 MB.", true); return; }
  try {
    importRows = prepareCsv(await file.text());
    message("csvMessage", "Revise a prévia antes de importar.");
    renderCsvPreview(importRows);
  } catch (error) { message("csvMessage", error.message, true); }
});
$("downloadCsvTemplate").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob(["\uFEFFMáquina;Grupo\r\n"], {type:"text/csv;charset=utf-8"}));
  const link = node("a"); link.href = url; link.download = "modelo-grupos-monitor.csv";
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
});
$("cancelCsv").addEventListener("click", () => {
  importRows = null; $("csvFile").value = ""; $("csvPreview").hidden = true;
  $("importCsv").disabled = true; message("csvMessage", "Importação cancelada.");
});
$("importCsv").addEventListener("click", async () => {
  if (!importRows) return;
  const button = $("importCsv"); button.disabled = true;
  try {
    const result = await request("/api/admin/grupos/importar", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({linhas:importRows})
    });
    message("csvMessage", `${result.maquinasImportadas} máquina(s) importada(s) em ${result.gruposCriadosOuAtualizados} grupo(s).`);
    importRows = null; $("csvFile").value = ""; $("csvPreview").hidden = true;
    await load();
  } catch (error) { message("csvMessage", error.message, true); button.disabled = false; }
});
$("agentFilter").addEventListener("change", renderAgentCoverage);

$("passwordForm").addEventListener("submit", async event => {
  event.preventDefault();
  const current = $("currentPassword"), next = $("newPassword"), confirm = $("confirmPassword"), button = event.submitter;
  if (next.value !== confirm.value) { message("passwordMessage", "As novas senhas não coincidem.", true); return; }
  button.disabled = true;
  try {
    const result = await request("/api/admin/senha", {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({senhaAtual:current.value, novaSenha:next.value})});
    message("passwordMessage", result.mensagem);
    current.value = ""; next.value = ""; confirm.value = "";
  } catch (error) { message("passwordMessage", error.message, true); }
  finally { button.disabled = false; }
});
$("logoutAdmin").addEventListener("click", async () => {
  try { await fetch("/api/auth/logout", {method:"POST", cache:"no-store"}); }
  finally { location.href = "/admin-login.html"; }
});

load();
loadWebhook();
