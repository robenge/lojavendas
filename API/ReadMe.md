# 🚀 NEXTQS Enterprise Monitor

Sistema enterprise de monitoramento operacional em tempo real integrado com a API da NextQS utilizando:

* Google Apps Script
* Google Sheets
* Google Chat
* HTML Dashboard
* Bootstrap 5
* Chart.js

---

# 📌 Objetivo do Projeto

O projeto foi desenvolvido para criar um:

✅ Centro Operacional Realtime
✅ Dashboard Executivo
✅ Monitor SLA
✅ Auditor Operacional
✅ Monitor de Atendimento
✅ Painel Workplace Support

---

# 🏗️ Arquitetura

```text
                    NEXTQS API
                         │
                         ▼
               Apps Script Backend
               ├── Webhook Realtime
               ├── API Realtime
               ├── Alertas
               ├── Relatórios
               ├── Dashboard Backend
               └── Logs
                         │
                         ▼
                  Google Sheets
               ├── Dados
               ├── Alertas
               ├── Emails
               └── Logs
                         │
                         ▼
                  Dashboard HTML
               ├── Bootstrap 5
               ├── Chart.js
               ├── Dark Mode
               ├── Realtime
               └── TV Mode
                         │
                         ▼
                    Google Chat
                         │
                         ▼
                  Relatórios E-mail
```

---

# 🚀 Funcionalidades

# ✅ Webhook Realtime

Recebe automaticamente eventos da NextQS:

* end_service
* no_show

---

# ✅ Dashboard Realtime

Painel operacional em tempo real:

* Fila atual
* Serviços em andamento
* Total atendimentos
* No-show
* Clientes inválidos
* Ranking unidades

---

# ✅ Google Chat

Envia alertas automáticos:

* Cliente inválido
* Cliente vazio

---

# ✅ Relatório Diário

Enviado automaticamente:

📅 Segunda a Sexta
🕕 18:00

---

# ✅ Histórico Operacional

Todos os atendimentos ficam registrados:

* Unidade
* Fila
* Senha
* Cliente
* Gerado em
* Chamado por
* No-show

---

# 📦 Tecnologias Utilizadas

| Tecnologia           | Uso                |
| -------------------- | ------------------ |
| Google Apps Script   | Backend            |
| Google Sheets        | Banco de dados     |
| Bootstrap 5          | Interface          |
| Chart.js             | Gráficos           |
| Google Chat Webhooks | Alertas            |
| NextQS API           | Dados operacionais |

---

# 📂 Estrutura do Projeto

```text
Projeto Apps Script
│
├── Code.gs
├── index.html
├── style.html
└── script.html
```

---

# 🔥 Funcionalidades Enterprise

# ✅ Multi-Site

Monitoramento simultâneo:

* WORKPLACE - MATRIZ
* WORKPLACE - BARRA FUNDA

---

# ✅ Multi-Filas Automático

O sistema monitora automaticamente TODAS as filas dessas unidades.

Não é necessário cadastrar filas manualmente.

---

# ✅ Realtime API

Utiliza os endpoints:

```text
GET /v1/organization/reports/service/queue/:site_id
```

```text
GET /v1/organization/reports/service/opened/:site_id
```

---

# ✅ Logs Operacionais

Registro automático:

* Erros
* Falhas API
* Timeout
* Eventos

---

# 🛠️ Implantação

# 1. Criar Google Sheets

Acesse:

https://sheets.google.com/

Crie uma nova planilha.

---

# 2. Abrir Apps Script

Na planilha:

```text
Extensões → Apps Script
```

---

# 3. Criar Arquivos

Criar:

| Arquivo     | Tipo   |
| ----------- | ------ |
| Code.gs     | Script |
| index.html  | HTML   |
| style.html  | HTML   |
| script.html | HTML   |

---

# 4. Copiar os Códigos

Copiar os arquivos:

* Code.gs
* index.html
* style.html
* script.html

---

# ⚙️ Configuração

# Token NextQS

No `Code.gs`:

```javascript
const NEXTQS_TOKEN =
  "SEU_TOKEN"
```

---

# Site IDs

```javascript
const SITE_IDS = [

  "63a07b7b2fe532fe9604adfc",

  "63c005bfe47430b5e6072d91"
]
```

---

# Unidades Monitoradas

```javascript
const UNIDADES_PERMITIDAS = [

  "WORKPLACE - MATRIZ",

  "WORKPLACE - BARRA FUNDA"
]
```

---

# Google Chat

```javascript
const WEBHOOK_GOOGLE_CHAT =
  "SUA_URL_WEBHOOK"
```

---

# 🔑 Como obter Token

Endpoint:

```text
POST /v1/organization/token
```

---

# 🔑 Como obter Sites

Endpoint:

```text
GET /v1/organization/sites
```

---

# 🔗 Configurar Webhook NextQS

Endpoint:

```text
POST /v1/organization/webhooks
```

---

# Exemplo PowerShell

```powershell
$token = "SEU_TOKEN"

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}

$body = @{

    endpoint = "SUA_URL_APPS_SCRIPT"

    events = @(
        "end_service",
        "no_show"
    )

} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
    -Uri "https://api.nextqs.com/v1/organization/webhooks" `
    -Method POST `
    -Headers $headers `
    -Body $body
```

---

# 🚀 Publicar Aplicação

No Apps Script:

```text
Implantar → Nova implantação
```

Tipo:

```text
Aplicativo da Web
```

---

# Configuração

| Campo         | Valor           |
| ------------- | --------------- |
| Executar como | Você            |
| Acesso        | Qualquer pessoa |

---

# 📌 URL Final

Exemplo:

```text
https://script.google.com/macros/s/XXXXX/exec
```

---

# 📊 Dashboard

O painel possui:

✅ Bootstrap 5
✅ Dark Mode
✅ Atualização automática
✅ Charts.js
✅ Realtime
✅ TV Mode

---

# 📺 TV Mode

Pode ser utilizado em:

* TVs
* Monitores
* NOC
* Central Operacional

---

# 📧 Relatório Diário

# Criar aba:

```text
Emails
```

---

# Estrutura

| E-mail                                          |
| ----------------------------------------------- |
| [gestor@empresa.com](mailto:gestor@empresa.com) |
| [ti@empresa.com](mailto:ti@empresa.com)         |

---

# ⏰ Agendamento

No Apps Script:

```text
Relógio → Acionadores
```

Criar acionador:

```text
enviarRelatorioDiario
```

---

# 📈 Indicadores Disponíveis

✅ Atendimentos
✅ No-show
✅ SLA
✅ Clientes inválidos
✅ Ranking unidades
✅ Ranking filas
✅ Tempo médio
✅ Histórico operacional

---

# 🧠 Conceito do Projeto

O sistema transforma a API da NextQS em um:

✅ Centro Operacional
✅ Painel Executivo
✅ Dashboard Realtime
✅ Auditor Operacional
✅ Monitor SLA
✅ Plataforma Workplace Support

---

# 🔥 Futuras Evoluções

* SLA automático
* Ranking operadores
* Monitor pausas
* Exportação Excel
* Login corporativo
* Multi-site avançado
* Dashboard executivo
* Painel supervisor
* CacheService
* Alertas inteligentes

---

# 📜 Licença

Projeto corporativo interno.
