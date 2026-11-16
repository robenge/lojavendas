using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.ServiceProcess;

var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory
});

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "MonitorAgent";
});

var endpoint = builder.Configuration["Api:Endpoint"]
    ?? throw new InvalidOperationException("Configure Api:Endpoint.");

var apiUri = new Uri(endpoint, UriKind.Absolute);

builder.Services.AddSingleton(new HttpClient
{
    Timeout = TimeSpan.FromSeconds(10)
});

builder.Services.AddSingleton(apiUri);
builder.Services.AddSingleton<ColetorDiscoRede>();
builder.Services.AddSingleton<Coletor>();
builder.Services.AddHostedService<Agente>();

await builder.Build().RunAsync();

public sealed class Agente(
    Coletor coletor,
    HttpClient http,
    Uri endpoint,
    ILogger<Agente> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var ultimoEnvioServicos = DateTimeOffset.MinValue;
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var agora = DateTimeOffset.UtcNow;
                var servicos = agora - ultimoEnvioServicos >= TimeSpan.FromSeconds(60)
                    ? coletor.ColetarServicos() : null;
                if (servicos is not null) ultimoEnvioServicos = agora;
                var mensagem = new
                {
                    Maquina = Environment.MachineName,
                    EnviadoEm = agora,
                    Inventario = coletor.ObterInventario(),
                    Servicos = servicos,
                    Metricas = coletor.Coletar()
                };

                try
                {
                    using var resposta = await http.PostAsJsonAsync(
                        endpoint,
                        mensagem,
                        stoppingToken);

                    if (!resposta.IsSuccessStatusCode)
                    {
                        var detalhe = await resposta.Content.ReadAsStringAsync(stoppingToken);
                        logger.LogWarning("API respondeu {Status}: {Detalhe}",
                            (int)resposta.StatusCode, detalhe);
                    }
                    else
                    {
                        logger.LogInformation("Dados enviados para a API.");
                    }
                }
                catch (HttpRequestException ex)
                {
                    logger.LogWarning(ex, "Falha no envio. Tentando no próximo ciclo.");
                }
                catch (OperationCanceledException)
                    when (!stoppingToken.IsCancellationRequested)
                {
                    logger.LogWarning("Tempo limite de comunicação com a API.");
                }

                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
        catch (OperationCanceledException)
            when (stoppingToken.IsCancellationRequested)
        {
            // Encerramento solicitado pelo Windows.
        }
    }
}

