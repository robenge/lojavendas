using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Configuration;
using System.Threading;
using System.Threading.Tasks;
using System;
using System.Runtime.Versioning;

[SupportedOSPlatform("windows")]
public class Worker : BackgroundService
{
    private readonly IConfiguration config;

    public Worker(IConfiguration configuration)
    {
        config = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var sys = new SystemService();

        var net = new NetworkService();

        var audio = new AudioService();

        var apiUrl = config["Api:Url"] ?? "";

        var token = config["Api:Token"] ?? "";

        var api = new ApiService(apiUrl, token);

        var buffer = new BufferService();

        int interval = int.TryParse(
            config["Agent:IntervalSeconds"],
            out var i
        ) ? i : 5;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // 🌐 NETWORK
                var netStats = net.GetNetworkStats();

                // 🎧 HEADSET
                bool headsetConnected = audio.IsHeadsetConnected();

                string headsetName = audio.GetHeadsetName();

                // 📞 SCORE VOIP
                int voipScore = 100;

                float cpu = sys.GetCpu();

                if (netStats.ping > 100)
                    voipScore -= 20;

                if (netStats.jitter > 30)
                    voipScore -= 35;

                if (netStats.loss > 1)
                    voipScore -= 40;

                if (cpu > 90)
                    voipScore -= 20;

                if (!headsetConnected)
                    voipScore -= 10;

                if (voipScore < 0)
                    voipScore = 0;

                var data = new Metrics
                {
                    MachineName = Environment.MachineName,

                    Username = Environment.UserName,

                    Cpu = cpu,

                    Memory = sys.GetMemory(),

                    Disk = sys.GetDisk(),

                    Uptime = sys.GetUptime(),

                    Ping = netStats.ping,

                    Jitter = netStats.jitter,

                    PacketLoss = netStats.loss,

                    VoipScore = voipScore,

                    HeadsetConnected = headsetConnected,

                    HeadsetName = headsetName,

                    Processes = sys.GetTopProcesses(),

                    Timestamp = DateTime.Now
                };

                // 📊 LOG
                Console.WriteLine(
                    $"[AGENT] " +
                    $"CPU:{data.Cpu}% " +
                    $"RAM:{data.Memory}% " +
                    $"PING:{data.Ping}ms " +
                    $"JITTER:{data.Jitter}ms " +
                    $"LOSS:{data.PacketLoss}% " +
                    $"HEADSET:{data.HeadsetConnected} " +
                    $"VOIP SCORE:{data.VoipScore}"
                );

                // 🚨 ALERTAS
                if (
                    data.Ping > 150 ||
                    data.Jitter > 30 ||
                    data.PacketLoss > 1
                )
                {
                    Console.WriteLine("🚨 VOIP PROBLEM DETECTED");
                }

                bool ok = await api.Send(data);

                Console.WriteLine($"[API] Status: {ok}");

                if (!ok)
                {
                    buffer.Save(
                        System.Text.Json.JsonSerializer.Serialize(data)
                    );
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] {ex.Message}");
            }

            await Task.Delay(interval * 1000, stoppingToken);
        }
    }
}