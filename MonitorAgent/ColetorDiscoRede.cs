using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;

public sealed class ColetorDiscoRede : IDisposable
{
    private IntPtr query;
    private readonly Dictionary<string, IntPtr> counters = new();
    private Dictionary<string, (long Rx, long Tx, long Tempo)> anteriores = new();

    public ColetorDiscoRede()
    {
        if (PdhOpenQueryW(null, IntPtr.Zero, out query) != 0)
        {
            query = IntPtr.Zero;
            return;
        }
        foreach (var (key, name) in new[]
        {
            ("leituraMs", "Avg. Disk sec/Read"), ("escritaMs", "Avg. Disk sec/Write"),
            ("leituraBps", "Disk Read Bytes/sec"), ("escritaBps", "Disk Write Bytes/sec"),
            ("fila", "Current Disk Queue Length"), ("leituras", "Disk Reads/sec"),
            ("escritas", "Disk Writes/sec")
        })
        {
            if (PdhAddEnglishCounterW(query, @"\PhysicalDisk(_Total)\" + name, IntPtr.Zero, out var counter) == 0)
                counters[key] = counter;
        }
    }

    public Dictionary<string, double?> Disco()
    {
        var ok = query != IntPtr.Zero && PdhCollectQueryData(query) == 0;
        var values = new Dictionary<string, double?>();
        foreach (var key in new[] { "leituraMs", "escritaMs", "leituraBps", "escritaBps", "fila", "leituras", "escritas" })
        {
            double? result = null;
            if (ok && counters.TryGetValue(key, out var counter) &&
                PdhGetFormattedCounterValue(counter, 0x200 | 0x8000, IntPtr.Zero, out var value) == 0 &&
                value.Status <= 1 && double.IsFinite(value.Value) && value.Value >= 0)
                result = value.Value * (key.EndsWith("Ms") ? 1000 : 1);
            values[key] = result;
        }
        return values;
    }

    public object[] Volumes()
    {
        var result = new List<object>();
        foreach (var drive in DriveInfo.GetDrives())
        {
            try
            {
                if (drive.DriveType != DriveType.Fixed || !drive.IsReady) continue;
                result.Add(new { nome = drive.Name, totalBytes = drive.TotalSize, livreBytes = drive.TotalFreeSpace });
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Volumes removidos ou sem permissão permanecem fora desta amostra.
            }
        }
        return result.ToArray();
    }

    public object[] Rede()
    {
        var result = new List<object>();
        var next = new Dictionary<string, (long Rx, long Tx, long Tempo)>();
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                // Adaptadores virtuais/filtro (Hyper-V, WSL, VPNs, WAN Miniports, etc.)
                // frequentemente retornam Name vazio; a API rejeita a mensagem inteira.
                if (string.IsNullOrWhiteSpace(nic.Name)) continue;

                try
                {
                    var stats = nic.GetIPStatistics();
                    var now = Stopwatch.GetTimestamp();
                    double? rx = null, tx = null;
                    if (nic.OperationalStatus == OperationalStatus.Up)
                    {
                        if (anteriores.TryGetValue(nic.Id, out var before))
                        {
                            var elapsed = (double)(now - before.Tempo) / Stopwatch.Frequency;
                            if (elapsed > 0 && stats.BytesReceived >= before.Rx && stats.BytesSent >= before.Tx)
                            {
                                rx = (stats.BytesReceived - before.Rx) / elapsed;
                                tx = (stats.BytesSent - before.Tx) / elapsed;
                            }
                        }
                        next[nic.Id] = (stats.BytesReceived, stats.BytesSent, now);
                    }
                    var speed = Math.Max(0, nic.Speed);
                    result.Add(new
                    {
                        nome = nic.Name,
                        estado = nic.OperationalStatus.ToString(),
                        velocidadeBits = speed,
                        recebidoBps = rx,
                        enviadoBps = tx,
                        uso = speed > 0 && rx.HasValue && tx.HasValue
                            ? (double?)Math.Clamp(Math.Max(rx.Value, tx.Value) * 8 / speed * 100, 0, 100) : null,
                        errosRecepcao = stats.IncomingPacketsWithErrors >= 0 ? (long?)stats.IncomingPacketsWithErrors : null,
                        errosEnvio = stats.OutgoingPacketsWithErrors >= 0 ? (long?)stats.OutgoingPacketsWithErrors : null
                    });
                }
                catch (Exception ex) when (ex is NetworkInformationException or NotSupportedException)
                {
                    // A interface pode desaparecer durante a coleta.
                }
            }
        }
        catch (NetworkInformationException)
        {
            // A coleta de outros recursos continua se a enumeração de rede falhar.
        }
        anteriores = next;
        return result.ToArray();
    }

    public void Dispose()
    {
        if (query != IntPtr.Zero) PdhCloseQuery(query);
        query = IntPtr.Zero;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct CounterValue
    {
        [FieldOffset(0)] public uint Status;
        [FieldOffset(8)] public double Value;
    }
    [DllImport("pdh.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint PdhOpenQueryW(string? source, IntPtr userData, out IntPtr query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint PdhAddEnglishCounterW(IntPtr query, string path, IntPtr userData, out IntPtr counter);
    [DllImport("pdh.dll")]
    private static extern uint PdhCollectQueryData(IntPtr query);
    [DllImport("pdh.dll")]
    private static extern uint PdhGetFormattedCounterValue(IntPtr counter, uint format, IntPtr type, out CounterValue value);
    [DllImport("pdh.dll")]
    private static extern uint PdhCloseQuery(IntPtr query);
}