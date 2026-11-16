# Monitor Network

**Autoria:** Robson Oliveira — Gerência de Serviços de TI  
**Agente atual:** 1.3.0  
**API:** ASP.NET Core no .NET 10  
**Banco:** SQLite

Este documento descreve a arquitetura, a configuração, a compilação, a publicação, a instalação e a operação do Monitor Network para que outra pessoa consiga reproduzir a implantação a partir do código-fonte deste projeto.

> Os comandos são para Windows PowerShell. Substitua nomes de pastas, IPs e portas pelos valores do ambiente de destino. Nunca publique senhas ou URLs secretas de webhook neste arquivo.

## 1. O que o projeto faz

O sistema monitora computadores Windows dentro de uma rede. Um serviço de agente roda em cada computador e envia amostras para uma API central. A API valida as amostras, grava o estado atual e o histórico em SQLite, calcula a saúde das máquinas e serve o painel web.

```text
Máquinas Windows                                 Servidor central
+----------------------------+   HTTP / JSON    +-----------------------------+
| Serviço MonitorAgent       | ----------------> | MonitorApi                  |
| coleta a cada 5 segundos    |                   | ASP.NET Core + SQLite       |
| processos e serviços        |                   | páginas web, relatórios     |
+----------------------------+                   | alertas e webhook opcional  |
                                                  +-----------------------------+
```

O agente envia métricas aproximadamente a cada **5 segundos** e o inventário de serviços do Windows a cada **60 segundos**. A API considera a máquina offline após **30 segundos** sem receber dados.

## 2. Estrutura do código

```text
README.md
outputs/
  MonitorAgent/
    MonitorAgent.csproj
    Program.cs                 # serviço, ciclo de envio HTTP e retry
    Coletor.cs                 # CPU, memória, processos, uptime, inventário e serviços
    ColetorDiscoRede.cs        # disco, volumes e interfaces de rede
    appsettings.json           # URL da API para o agente publicado
  MonitorApi/
    MonitorApi.csproj
    Program.cs                 # rotas HTTP, autenticação, validação e configuração
    Armazenamento.cs           # SQLite, histórico, serviços e evidências
    Pontuacao.cs               # nota de saúde e limiares de alerta
    LimitesMonitoramento.cs    # configuração e validação dos limites
    Relatorios.cs              # agregação do dashboard e dos relatórios
    ApresentacaoPdf.cs         # geração de apresentações e evidências em PDF
    EvidenciasSeguranca.cs     # modelos/agregação de evidência EDR
    ComparacaoEvidencia.cs     # seleção de pares com hardware semelhante
    NotificadorGoogleChat.cs   # notificação de alertas e máquinas offline
    appsettings.json           # porta, limites, versão recomendada e bootstrap
    App_Data/                  # banco e dados da instalação local
    wwwroot/                   # HTML, CSS e JavaScript do painel
```

`outputs/MonitorAgent` e `outputs/MonitorApi` são os projetos de origem. Pastas `bin/` e `obj/` são saídas locais do .NET, não são a fonte do projeto. Se houver uma cópia em `Backup/`, trate-a como arquivo antigo: publique a partir de `outputs/`.

## 3. Pré-requisitos

### Máquina de compilação

- Windows x64.
- .NET 10 SDK. Confirme com `dotnet --info`.
- Acesso aos pacotes NuGet usados pelos projetos durante `dotnet restore`.
- Permissão para criar e atualizar arquivos nas pastas de publicação.

### Dependências NuGet

| Projeto | Pacote | Versão de referência |
|---|---|---:|
| Agente | `Microsoft.Extensions.Hosting` | 10.0.15 |
| Agente e API | `Microsoft.Extensions.Hosting.WindowsServices` | 10.0.15 |
| API | `Microsoft.Data.Sqlite` | 10.0.14 |
| API | `System.Security.Cryptography.ProtectedData` | 10.0.13 |

### Servidor da API

- Windows x64.
- Se a API for publicada como *self-contained*, o runtime .NET não precisa ser instalado separadamente.
- A conta do serviço precisa poder ler a publicação e gravar em `App_Data`.
- Porta TCP configurada liberada no Firewall do Windows e acessível pela rede dos clientes.

### Computadores clientes

- Windows x64.
- Para o agente publicado como DLL *framework-dependent*: .NET 10 Runtime. Confira com `dotnet --list-runtimes`; é esperado `Microsoft.NETCore.App 10.x`.
- Permissão administrativa local para instalar ou atualizar o serviço Windows.
- Acesso de saída à URL da API.

## 4. Portas e endereços deste projeto

A API usa a chave `Urls` de `outputs/MonitorApi/appsettings.json`. **Na configuração atual do código, o valor é `http://0.0.0.0:5180`**. `0.0.0.0` faz a API escutar nas interfaces de rede da máquina.

Há dois valores que podem confundir:

1. `outputs/MonitorApi/Properties/launchSettings.json` tem um perfil de desenvolvimento na porta **5000**. Ele é usado quando se executa `dotnet run` sem `--no-launch-profile`.
2. `outputs/MonitorAgent/appsettings.json` contém um endereço de agente de exemplo/ambiente anterior na porta **5000**. Antes de publicar agentes, ajuste-o para o **IP e a porta atuais da API**. Um agente que aponta para 5000 não chegará a uma API que escuta em 5180.

Para executar usando `Urls` do `appsettings.json`:

```powershell
dotnet run --project .\outputs\MonitorApi\MonitorApi.csproj --no-launch-profile
```

Para definir explicitamente a porta durante execução em desenvolvimento:

```powershell
dotnet run --project .\outputs\MonitorApi\MonitorApi.csproj --no-launch-profile -- --urls http://0.0.0.0:5180
```

Confirme a porta publicada no servidor e a conectividade de um cliente:

```powershell
Get-NetTCPConnection -LocalPort 5180 -State Listen
Test-NetConnection <IP-DO-SERVIDOR> -Port 5180
```

Regra de firewall de exemplo, executada como administrador no servidor:

```powershell
New-NetFirewallRule -DisplayName "MonitorApi TCP 5180" `
  -Direction Inbound -Protocol TCP -LocalPort 5180 `
  -RemoteAddress LocalSubnet -Action Allow
```

Se outra aplicação já usa 5180, escolha uma porta livre. Atualize `Urls`, a regra de firewall, o endereço em `Api:Endpoint` de **todos** os agentes e os comandos de teste para que usem a mesma porta. Só rode uma instância da API por porta; `address already in use` significa que outro processo já está escutando nela. Identifique-o antes de parar qualquer serviço:

```powershell
$pidApi = (Get-NetTCPConnection -LocalPort 5180 -State Listen).OwningProcess
Get-Process -Id $pidApi
Get-CimInstance Win32_Service | Where-Object ProcessId -eq $pidApi |
  Select-Object Name, State, PathName
```

## 5. Configurar a API do zero

Edite `outputs/MonitorApi/appsettings.json` antes da primeira execução/publicação. Estrutura de exemplo:

```json
{
  "Urls": "http://0.0.0.0:5180",
  "Agente": {
    "VersaoAtual": "1.3.0"
  },
  "Monitoramento": {
    "CpuNormal": 55,
    "CpuAlerta": 85,
    "CpuCritico": 98,
    "MemoriaNormal": 65,
    "MemoriaAlerta": 90,
    "MemoriaCritico": 98,
    "DiscoNormalMs": 5,
    "DiscoAlertaMs": 20,
    "DiscoCriticoMs": 50,
    "RedeNormal": 55,
    "RedeAlerta": 85,
    "RedeCritico": 98,
    "UptimeAlertaDias": 5,
    "DuracaoMinimaAlertaSegundos": 60,
    "DuracaoRecuperacaoSegundos": 15,
    "ToleranciaSemAmostraSegundos": 15,
    "RetencaoHistoricoDias": 7
  },
  "Administracao": {
    "SenhaInicial": "DEFINA-LOCALMENTE-UMA-SENHA-COM-12-OU-MAIS-CARACTERES"
  },
  "GruposMaquinas": {},
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Microsoft.Hosting.Lifetime": "Information"
    }
  }
}
```

O bloco `Administracao:SenhaInicial` serve para bootstrap da primeira senha administrativa, com pelo menos 12 caracteres. A API armazena um hash no SQLite. Depois da primeira inicialização e criação do banco, remova o valor inicial do `appsettings.json`; a senha salva no banco continuará funcionando. Alternativamente, defina a variável de ambiente `MONITOR_ADMIN_PASSWORD` no ambiente do processo do serviço.

Não use o texto de exemplo como senha real. Não coloque senhas neste README, em um CSV, no pacote do PDQ, no Git ou em mensagens. A chave `Agente:VersaoAtual` é a versão mínima/recomendada que aparece na tela Administração para verificar a cobertura dos agentes.

### Limites atuais

| Recurso | Normal (nota 100) | Alerta | Crítico (nota 0) |
|---|---:|---:|---:|
| CPU | 55% | 85% | 98% |
| Memória usada | 65% | 90% | 98% |
| Latência do disco | 5 ms | 20 ms | 50 ms |
| Uso de rede | 55% | 85% | 98% |

O alerta exige que a condição persista por 60 segundos e considera recuperada depois de 15 segundos abaixo do limite. A tolerância de ausência de amostra para a continuidade do alerta é 15 segundos. Uptime de 5 dias gera alerta. Estes valores podem ser alterados em `Monitoramento`; a API valida faixas coerentes ao iniciar.

### Primeira execução da API

Na raiz do projeto:

```powershell
dotnet restore .\outputs\MonitorApi\MonitorApi.csproj
dotnet run --project .\outputs\MonitorApi\MonitorApi.csproj --no-launch-profile
```

Abra `http://localhost:5180/`. O navegador pode abrir o painel; `/api/maquinas` retorna o JSON da frota. Para encerrar uma instância de desenvolvimento, pressione `Ctrl+C` no terminal.

## 6. Publicar e instalar a API como serviço

Na raiz do projeto, crie uma publicação *self-contained* para Windows x64:

```powershell
dotnet publish .\outputs\MonitorApi\MonitorApi.csproj `
  -c Release -r win-x64 --self-contained true `
  -o C:\MonitorApi-Novo
```

Confira `C:\MonitorApi-Novo\appsettings.json`: a porta e a senha/bootstrap precisam refletir o servidor. Na primeira inicialização, verifique se a API cria `C:\MonitorApi-Novo\App_Data\monitoramento.db` e se a tela `/admin-login.html` abre.

Crie o serviço em um PowerShell **como Administrador**:

```powershell
sc.exe create MonitorApi binPath= "C:\MonitorApi-Novo\MonitorApi.exe" start= auto
sc.exe start MonitorApi
sc.exe query MonitorApi
```

O código registra o serviço com o nome `MonitorApi`. Se ele já existir, não execute `create` novamente: configure o caminho da nova publicação e reinicie:

```powershell
sc.exe stop MonitorApi
sc.exe config MonitorApi binPath= "C:\MonitorApi-Novo\MonitorApi.exe" start= auto
sc.exe start MonitorApi
sc.exe query MonitorApi
```

### Atualizar uma instalação sem perder dados

1. Consulte `sc.exe qc MonitorApi` e anote a pasta de `BINARY_PATH_NAME`.
2. Publique em uma **pasta nova**. Não publique sobre arquivos que estejam sendo usados pelo serviço.
3. Copie o `appsettings.json` da instalação anterior para a nova se quiser manter a porta, os limites e outras opções personalizadas.
4. Pare o serviço **antes de copiar `App_Data`**, para não copiar um banco SQLite ativo/WAL.
5. Copie a pasta inteira `App_Data` da instalação anterior para a nova. Ela contém o banco, a senha administrativa já configurada, grupos, webhook e histórico.
6. Altere o `binPath` para o novo `MonitorApi.exe` e inicie o serviço novamente.
7. Teste `http://<IP-DO-SERVIDOR>:5180/` e `http://<IP-DO-SERVIDOR>:5180/api/maquinas`; faça `Ctrl+F5` no navegador para recarregar os arquivos do painel.

Exemplo, supondo que a instalação anterior esteja em `C:\MonitorApi-1.3`:

```powershell
dotnet publish .\outputs\MonitorApi\MonitorApi.csproj -c Release -r win-x64 `
  --self-contained true -o C:\MonitorApi-Novo
Copy-Item C:\MonitorApi-1.3\appsettings.json C:\MonitorApi-Novo\appsettings.json -Force
sc.exe stop MonitorApi
robocopy C:\MonitorApi-1.3\App_Data C:\MonitorApi-Novo\App_Data /E /COPY:DAT /DCOPY:DAT
sc.exe config MonitorApi binPath= "C:\MonitorApi-Novo\MonitorApi.exe" start= auto
sc.exe start MonitorApi
```

Os códigos de saída `robocopy` de 0 a 7 indicam cópia concluída (com ou sem arquivos copiados); 8 ou superior indicam erro. Em uma instalação nova, deixe a nova pasta `App_Data` vazia para que a API crie um banco novo. Não distribua a pasta `App_Data` da máquina de desenvolvimento se ela contiver dados reais.

Se for serviço novo, configure antes de iniciar. Se a API foi iniciada manualmente em terminal, feche a instância antiga com `Ctrl+C`; tentar abrir a segunda na mesma porta produz `address already in use`. Não apague `App_Data` ao atualizar. Para um backup consistente, pare a API antes de copiar os arquivos do banco SQLite.

## 7. Agente: coleta, configuração e publicação como DLL

O agente Windows 1.3.0 envia:

- CPU total do sistema, calculada entre amostras.
- Memória física total e disponível.
- Processos visíveis ao contexto do serviço: PID, nome, CPU, memória residente e taxas de leitura/escrita de E/S. CPU e E/S são calculadas por diferença entre amostras; a primeira pode aparecer sem valor.
- Disco físico: latência média de leitura/escrita, bytes por segundo, fila e operações por segundo, quando o contador PDH estiver disponível.
- Interfaces de rede: estado, velocidade, taxas RX/TX, uso percentual e contadores de erro. Loopback e interfaces sem nome são ignoradas.
- Volumes fixos prontos: capacidade total e espaço livre.
- Uptime do Windows.
- Inventário: Windows, arquitetura, fabricante/modelo, processador, processadores lógicos, RAM total e versão do agente.
- Inventário de serviços Windows, estado, tipo de inicialização e PID para serviços em execução; atualização a cada 60 segundos.

Alguns processos protegidos podem ocultar CPU ou E/S do coletor. Nesses casos o agente envia o que conseguiu medir; campos ausentes não significam consumo zero. O agente coleta nome do processo, PID e uso de recursos, não linhas de comando.

### Configurar o destino da API

Edite `outputs/MonitorAgent/appsettings.json` **antes** de publicar. Troque host e porta para corresponder à API:

```json
{
  "Api": {
    "Endpoint": "http://<IP-DO-SERVIDOR>:5180/api/maquinas"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.Hosting.Lifetime": "Information"
    }
  }
}
```

O endereço atual no arquivo do agente de origem usa a porta **5000**, enquanto a API do projeto está configurada para **5180**. Portanto, a edição do `Endpoint` é necessária para esta implantação, salvo se a porta da API tiver sido alterada para 5000. O agente não usa token, conforme o desenho atual; veja a seção Segurança.

### Publicar o agente DLL

Na raiz do projeto:

```powershell
dotnet restore .\outputs\MonitorAgent\MonitorAgent.csproj
dotnet publish .\outputs\MonitorAgent\MonitorAgent.csproj `
  -c Release -r win-x64 --self-contained false `
  -p:UseAppHost=false -o C:\MonitorAgent-DLL
```

Copie **todos** os arquivos produzidos, não apenas `MonitorAgent.dll`. São necessários DLL, arquivos `.deps.json` e `.runtimeconfig.json`, dependências e `appsettings.json`. Para teste manual:

```powershell
cd C:\MonitorAgent-DLL
dotnet .\MonitorAgent.dll
```

O log deve mostrar o início do processo e, aproximadamente a cada cinco segundos, o envio ou o motivo da falha. Pare o teste com `Ctrl+C` antes de iniciar o serviço para não executar duas instâncias do mesmo agente na máquina.

### Instalar o serviço do agente

Abra PowerShell como administrador. Na instalação inicial:

```powershell
$binPath = '"C:\Program Files\dotnet\dotnet.exe" "C:\MonitorAgent-DLL\MonitorAgent.dll"'
sc.exe create MonitorAgent binPath= $binPath start= auto
sc.exe start MonitorAgent
sc.exe query MonitorAgent
```

Para atualizar um serviço instalado, pare-o, copie todos os arquivos publicados para a pasta do agente (sem apagar configuração local diferente), configure o mesmo binPath e inicie:

```powershell
sc.exe stop MonitorAgent
$binPath = '"C:\Program Files\dotnet\dotnet.exe" "C:\MonitorAgent-DLL\MonitorAgent.dll"'
sc.exe config MonitorAgent binPath= $binPath start= auto
sc.exe start MonitorAgent
sc.exe query MonitorAgent
```

Se a saída de `dotnet --list-runtimes` não mostrar `Microsoft.NETCore.App 10.x`, instale o .NET 10 Runtime aprovado pela TI antes de iniciar o agente DLL. O serviço precisa conseguir ler o `appsettings.json` na pasta da DLL e alcançar a API.

### Distribuição usando PDQ Deploy

Crie o pacote do PDQ na seguinte ordem:

1. **PowerShell:** pare `MonitorAgent`, caso esteja instalado (`sc.exe stop MonitorAgent`). Trate o erro 1062 como “já estava parado” somente se essa for a condição esperada.
2. **File Copy:** copie todos os arquivos da publicação para a pasta escolhida no destino, por exemplo `C:\Program Files\MonitorAgent`.
3. **PowerShell:** confirme .NET 10 Runtime e instale ou atualize o serviço `MonitorAgent`, usando `dotnet.exe` e o caminho completo da DLL.
4. **PowerShell:** inicie o serviço e verifique com `sc.exe query MonitorAgent`; falhe o pacote se não ficar `RUNNING`.

Use credenciais de implantação com privilégios para criar serviço e gravar na pasta. Teste primeiro em um computador. Em modo PDQ *Pull*, a conta do computador destino precisa ler o compartilhamento; em modo *Push*, o PDQ copia os arquivos. Confirme também que antivírus e AppLocker/WDAC permitem o runtime `dotnet.exe` e os arquivos DLL assinados/aprovados pela política da organização.

## 8. Dados, saúde e alertas

### Nota de saúde (0 a 100)

Para cada recurso medido, a nota fica em 100 até o limite `Normal`, cai linearmente entre `Normal` e `Critico`, e chega a 0 no limite crítico. A nota exibida para a máquina é a menor nota entre CPU, memória, latência de disco e uso de rede que tenham valores válidos. Recursos sem leitura não entram no cálculo. A nota é um indicador operacional configurável, não uma certificação de desempenho.

### Incidentes

CPU, memória, disco, rede e uptime são avaliados usando os limites configurados. Uma condição precisa persistir pelo intervalo de confirmação antes de abrir um alerta; a recuperação também tem seu próprio intervalo. Máquinas sem mensagem por 30 segundos aparecem offline. Se um webhook estiver configurado, a API verifica o estado offline/recuperado a cada 15 segundos.

### Banco e retenção

- Arquivo principal: `App_Data\monitoramento.db`, relativo à pasta em que a API está publicada.
- O banco guarda o último estado/processos, amostras temporais, serviços, evidências de segurança, grupos, senha administrativa em hash e configuração protegida do webhook.
- SQLite usa WAL. Pare o serviço da API antes de copiar o banco como backup, para incluir um conjunto consistente de arquivos.
- A retenção padrão é 7 dias (`Monitoramento:RetencaoHistoricoDias`), válida de 1 a 365 dias. Amostras antigas são agregadas/resumidas e removidas conforme a política.
- `App_Data\maquinas` é compatibilidade com armazenamento JSON legado. A migração para SQLite é feita uma vez na inicialização quando necessário.
- A exclusão administrativa de máquina remove seu estado, histórico, inventário de serviços, evidência de EDR e associação a grupo. Se o agente continuar ativo, o próximo POST cadastrará a máquina novamente; pare/desinstale o agente para que ela permaneça removida.

## 9. Investigar CrowdStrike e Trend

`/evidencias.html` registra observações do CrowdStrike Falcon e Trend Micro / TrendAI. A API identifica serviços Windows pelo nome de exibição, associa o PID informado pelo inventário do agente aos processos da amostra e agrega CPU, memória e E/S por minuto junto com CPU, memória e latência de disco da máquina.

Para iniciar a coleta:

1. Instale/atualize o agente para 1.3.0 ou posterior em uma máquina que tenha o produto.
2. Confirme em Administração que a versão aparece como atualizada e que o serviço do agente está ativo.
3. Abra `/evidencias.html` e clique em **Atualizar**; aguarde os primeiros envios. O inventário de serviços é atualizado a cada 60 segundos e as evidências são agregadas por minuto.
4. Se não surgir uma linha, confira se o produto está instalado, se o serviço está em execução e se o agente recebeu o PID. Serviços com PID compartilhado (por exemplo, hospedados em `svchost`) são marcados.

A página oferece séries temporais, CSV, PDF e comparação com máquinas de arquitetura/CPU/RAM semelhantes. Os pares precisam ter o mesmo produto e período, mesma arquitetura e processador igual, ou processadores lógicos com diferença de até um núcleo e RAM dentro de ±20%. A comparação é observacional: diferenças de hardware, carga de trabalho, horário e configuração podem afetar os resultados. Coincidência entre uso do processo e pressão da máquina **não prova causalidade**. Evidências anteriores à atualização não são preenchidas retroativamente.

## 10. Painel, relatórios e administração

| Caminho | Função |
|---|---|
| `/` | Visão da frota, alertas, filtros, estado, saúde e detalhes de uma máquina; processos, histórico, inventário, uptime e serviços. Atualiza automaticamente. |
| `/dashboard.html` | Gráficos executivos de disponibilidade, alertas, CPU, memória, disco e saúde; exporta apresentação PDF e HTML autônomo com fotografia dos dados e tabela das máquinas. |
| `/evidencias.html` | Investigação de desempenho CrowdStrike/Trend, série por minuto, comparação por pares e exportação CSV/PDF. |
| `/report.html` | Relatório operacional e exportação CSV. |
| `/admin-login.html` | Login administrativo. |
| `/admin.html` | Cobertura de versão, grupos, importação CSV, webhook, mudança de senha, atribuição e exclusão de máquinas. |

A Administração usa cookie HTTP-only, expiração de até 8 horas com renovação em atividade e limite de tentativas de login por IP. O cookie é protegido pela infraestrutura de autenticação do ASP.NET Core. A interface pede confirmação antes de excluir uma máquina.

Na importação CSV, os cabeçalhos aceitos para máquina incluem `Máquina`, `Host`, `Hostname`, `Computador` ou `Machine`; para grupo, `Grupo`, `Setor` ou `Group`. O separador pode ser vírgula ou ponto e vírgula. O upload aceita até 1 MB e 5.000 linhas; as máquinas e grupos também podem ser criados na tela Administração.

### Webhook Google Chat

Configure a URL em Administração. A API aceita somente HTTPS em `chat.googleapis.com/v1/spaces/.../messages`, protege a URL com Windows DPAPI e não a devolve ao painel. O botão de teste envia uma mensagem de confirmação. A API notifica alertas abertos/recuperados e perda/retorno de comunicação. Mantenha a pasta da API e `App_Data` no mesmo servidor Windows para preservar a configuração protegida.

## 11. Endpoints da API

| Método | Caminho | Uso / autenticação |
|---|---|---|
| `POST` | `/api/maquinas` | Entrada do agente. Não exige token no desenho atual. |
| `GET` | `/api/maquinas` | Lista estado atual, saúde, alertas, grupo e versões. |
| `GET` | `/api/maquinas/{host}` | Detalhes de uma máquina. |
| `GET` | `/api/maquinas/{host}/historico?dias=7` | Histórico da máquina dentro da retenção. |
| `GET` | `/api/maquinas/{host}/servicos` | Último inventário dos serviços Windows. |
| `GET` | `/api/evidencias/seguranca?dias=7` | Resumo de evidências CrowdStrike/Trend. |
| `GET` | `/api/evidencias/seguranca/{host}?produto=...&dias=7` | Pontos detalhados por minuto. |
| `GET` | `/api/evidencias/seguranca/{host}/apresentacao?produto=...&dias=7` | PDF da investigação. |
| `GET` | `/api/evidencias/seguranca/{host}/comparacao?produto=...&dias=7` | Comparação com hardware semelhante. |
| `GET` | `/api/evidencias/seguranca/{host}/comparacao/apresentacao?produto=...&dias=7` | PDF comparativo. |
| `GET` | `/api/relatorios?dias=7` | Dados do dashboard e relatório. |
| `GET` | `/api/relatorios/apresentacao?dias=7` | Apresentação PDF executiva. |
| `GET` | `/api/exportacao` | Exportação detalhada de máquinas para o painel. |
| `POST` | `/api/auth/login` | Login com senha; limita tentativas por IP. |
| `POST` | `/api/auth/logout` | Finaliza a sessão administrativa. |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/admin/*` | Grupos, atribuição, senha e webhook; exige sessão administrativa. |
| `DELETE` | `/api/admin/maquinas/{host}` | Exclui máquina, métricas, histórico, serviços, evidências e grupo; exige sessão administrativa. |

Os parâmetros `dias` não podem exceder `Monitoramento:RetencaoHistoricoDias`.

Endpoints de Administração disponíveis após login:

| Método | Caminho | Efeito |
|---|---|---|
| `GET` | `/api/admin/grupos` | Lista grupos, atribuições e versão dos agentes. |
| `POST` | `/api/admin/grupos` | Cria um grupo. Corpo: `{"nome":"Servidores"}`. |
| `PUT` | `/api/admin/maquinas/{host}/grupo` | Atribui/remove grupo. Corpo: `{"grupo":"Servidores"}` ou `{"grupo":null}`. |
| `POST` | `/api/admin/grupos/importar` | Importa atribuições validadas. Corpo: `{"linhas":[{"maquina":"PC-01","grupo":"Financeiro"}]}`. |
| `PUT` | `/api/admin/senha` | Altera senha. Corpo: `{"senhaAtual":"...","novaSenha":"..."}`; nova senha de 12 a 256 caracteres. |
| `GET` | `/api/admin/webhook` | Informa se o webhook está configurado sem revelar o segredo. |
| `PUT` | `/api/admin/webhook` | Salva o webhook. Corpo: `{"url":"https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=..."}`. |
| `DELETE` | `/api/admin/webhook` | Remove o webhook. |
| `POST` | `/api/admin/webhook/teste` | Envia uma mensagem de teste. |

### Formato de envio do agente

O agente envia JSON em `POST /api/maquinas`. Exemplo reduzido de contrato (valores ilustrativos):

```json
{
  "maquina": "PC-01",
  "enviadoEm": "2026-11-16T12:00:00Z",
  "inventario": {
    "sistemaOperacional": "Windows 11 Pro",
    "versaoSistema": "24H2",
    "arquitetura": "X64",
    "fabricante": "Fabricante",
    "modelo": "Modelo",
    "processador": "CPU de exemplo",
    "processadoresLogicos": 8,
    "memoriaTotalBytes": 17179869184,
    "versaoAgente": "1.3.0",
    "coletadoEm": "2026-11-16T12:00:00Z"
  },
  "metricas": {
    "cpu": 18.5,
    "memoriaTotalBytes": 17179869184,
    "memoriaDisponivelBytes": 8589934592,
    "processos": [
      { "pid": 1234, "nome": "processo", "cpu": 2.5, "memoriaBytes": 104857600,
        "leituraIoBps": 0, "escritaIoBps": 0 }
    ],
    "disco": { "leituraMs": 2.1, "escritaMs": 1.8 },
    "volumes": [{ "nome": "C:\\", "totalBytes": 500000000000, "livreBytes": 200000000000 }],
    "rede": [],
    "uptimeSegundos": 86400
  },
  "servicos": null
}
```

`servicos` pode ser `null` nos envios entre inventários; quando informado, contém serviços com `nome`, `nomeExibicao`, `estado`, `tipoInicial` e opcionalmente `processoId`. Estados/tipos usam os valores do Windows serializados pelo agente (`Running`, `Stopped`, `Automatic`, `Manual`, etc.). A API valida comprimentos, intervalos, duplicatas e valores finitos antes de persistir. Os nomes das propriedades do JSON são camelCase.

## 12. Atualização de versão

### Atualizar a API

1. Publique o projeto `outputs/MonitorApi/MonitorApi.csproj` em uma nova pasta.
2. Copie o `appsettings.json` da API instalada para a nova pasta (porta, versão esperada e limites locais).
3. Copie `App_Data` da instalação atual para a nova.
4. Pare `MonitorApi`, altere o caminho do serviço para o novo `MonitorApi.exe` e inicie-o.
5. Verifique estado do serviço, porta, `/api/maquinas` e as páginas com `Ctrl+F5`.

Os agentes não precisam ser atualizados quando a mudança for apenas painel, API ou relatório. Se a API introduzir campos novos de coleta, será necessário atualizar os agentes correspondentes.

### Atualizar os agentes

1. Mude a versão do projeto `MonitorAgent.csproj` e o valor `Agente:VersaoAtual` da API conforme o release.
2. Atualize o `Api:Endpoint` no `appsettings.json` de origem para o servidor e porta atuais.
3. Publique o agente DLL e distribua todos os arquivos.
4. Pare o serviço antigo, substitua os arquivos sem alterar o endpoint local, ajuste o binPath se a pasta mudou e reinicie.
5. Confirme em `/api/maquinas` ou Administração que `versaoAgente` está na versão esperada.

## 13. Segurança e limites conhecidos

- O agente atualmente envia dados sem token, conforme requisito do projeto. Qualquer equipamento que consiga alcançar a rota pode tentar enviar dados com um nome de máquina; use firewall, VLAN e escopo de rede confiável.
- A configuração atual é HTTP. HTTP não criptografa amostras, cookies administrativos ou senha durante o transporte. Não exponha a API diretamente à Internet. Para outra zona de rede, coloque HTTPS com certificado/reverse proxy e restrinja o acesso.
- A senha inicial deve ser removida do arquivo depois do bootstrap. Não distribua cópias do `appsettings.json` da API com segredo dentro.
- O webhook é segredo operacional; não registre URL em log ou screenshot. A URL armazenada usa Windows DPAPI e é dependente do ambiente local.
- Dados de processo e serviços podem ser considerados inventário sensível. Restrinja acesso ao painel, SQLite e backups de acordo com a política interna.
- O agente é um coletor de telemetria: não encerra processos, não altera configurações do computador e não executa comandos remotos.
- DLL não é método para contornar AppLocker/WDAC. As políticas da organização precisam permitir o host `dotnet.exe` e os arquivos publicados.

## 14. Solução de problemas

### API não inicia: `address already in use`

Outra instância ocupa a porta. Identifique o processo com `Get-NetTCPConnection -LocalPort 5180 -State Listen` e consulte o serviço associado antes de iniciar/encerrar processos. Não tente manter duas APIs na mesma porta. Em `dotnet run`, use `--no-launch-profile` se quiser ignorar o perfil que usa a porta 5000.

### Página continua mostrando a versão antiga

Confirme `sc.exe qc MonitorApi` e atualize a pasta indicada em `BINARY_PATH_NAME`, preserve `appsettings.json` e `App_Data`, reinicie o serviço e use `Ctrl+F5`. `dotnet run` que falha por conflito de porta não substitui a API já em execução.

### Agente fica offline

Confira `Api:Endpoint` no diretório do agente instalado (não só no fonte), o serviço e a conectividade:

```powershell
sc.exe query MonitorAgent
dotnet --list-runtimes
Test-NetConnection <IP-DO-SERVIDOR> -Port 5180
```

Veja os logs no terminal ao iniciar o DLL manualmente ou no Visualizador de Eventos do Windows para o serviço. HTTP 400 inclui a explicação no corpo da resposta; HTTP 503 indica falha ao persistir/atender a solicitação na API.

### Agente envia para a porta errada

Alinhe exatamente: `Urls` da API, porta TCP do firewall, `Api:Endpoint` no arquivo instalado no cliente e URL do navegador. A página atual acessível em `:5180` não implica que o serviço do agente esteja configurado para `:5180`.

### Máquina excluída reaparece

O agente continua ativo e envia novo POST. Pare ou desinstale `MonitorAgent` nesse cliente antes de apagar a máquina na Administração.

### Evidências EDR vazias

Atualize o agente para 1.3.0 ou posterior numa máquina com CrowdStrike/Trend, confirme o serviço e o PID, aguarde o inventário de serviços (até 60 s), e clique **Atualizar** em `/evidencias.html`. O painel não cria evidência se o produto não está instalado ou se o PID/processo não pôde ser associado.

### Erro ao compilar/publicar

Execute os comandos a partir da raiz do projeto ou indique o `.csproj` explicitamente. Se estiver em `outputs\MonitorApi`, use `dotnet publish .\MonitorApi.csproj ...`; `dotnet publish MonitorApi` não é caminho válido para um projeto nesse diretório. Use o .NET 10 SDK e restaure os pacotes antes da publicação.

## 15. Lista de conferência para nova implantação

- [ ] A porta/IP da API foram escolhidos e não conflitam com outro serviço.
- [ ] Firewall permite a porta somente a partir da rede autorizada.
- [ ] A API está com `Urls` e limites corretos; senha administrativa inicial definida localmente.
- [ ] API publicada, serviço `MonitorApi` em execução e `App_Data` gravável/preservado.
- [ ] Login administrativo criado; segredo de bootstrap removido do arquivo.
- [ ] `Api:Endpoint` dos agentes aponta para o mesmo host/porta da API.
- [ ] Runtime .NET 10 instalado em clientes para agente DLL.
- [ ] Serviço `MonitorAgent` instalado e com estado `RUNNING`.
- [ ] Versão observada na Administração é compatível com `Agente:VersaoAtual`.
- [ ] Uma máquina de teste aparece online; depois ampliar a distribuição pelo PDQ.
- [ ] Backup periódico de `App_Data` definido, com cópia feita após parar a API.
