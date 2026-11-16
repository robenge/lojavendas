using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using System.ServiceProcess;
using System.Runtime.Versioning;

public sealed class Coletor(ColetorDiscoRede discoRede)
{
    private readonly InventarioAgente inventario = CriarInventario();
    private (ulong Idle, ulong Total)? anteriorCpu;
    private Dictionary<int, (long Inicio, double Cpu, long Tempo, ulong? Leitura, ulong? Escrita)> anteriores = new();

    public InventarioAgente ObterInventario() => inventario;

    public ServicoAgente[] ColetarServicos()
    {
        if (!OperatingSystem.IsWindows()) return [];
        return ColetarServicosWindows();
    }

    [SupportedOSPlatform("windows")]
    private static ServicoAgente[] ColetarServicosWindows()
    {
        try
        {
            return ServiceController.GetServices().Select(service =>
            {
                using (service)
                {
                    var status = service.Status.ToString();
                    var display = string.IsNullOrWhiteSpace(service.DisplayName) ? service.ServiceName : service.DisplayName;
                    return new ServicoAgente(service.ServiceName, display, status, TipoInicial(service.ServiceName), ProcessoId(service));
                }
            }).ToArray();
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception or
            System.Security.SecurityException or System.IO.IOException or PlatformNotSupportedException)
        {
            return [];
        }
    }

    [SupportedOSPlatform("windows")]
    private static int? ProcessoId(ServiceController service)
    {
        try
        {
            if (service.Status != ServiceControllerStatus.Running) return null;
            var handle = service.ServiceHandle;
            if (!QueryServiceStatusEx(handle.DangerousGetHandle(), 0, out var status,
                Marshal.SizeOf<ServiceStatusProcess>(), out _)) return null;
            return status.ProcessId > 0 ? (int)status.ProcessId : null;
        }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception or
            System.Security.SecurityException or PlatformNotSupportedException)
        {
            return null;
        }
    }

    [DllImport("advapi32.dll", EntryPoint = "QueryServiceStatusEx", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryServiceStatusEx(IntPtr serviceHandle, int infoLevel,
        out ServiceStatusProcess serviceStatus, int bufferSize, out int bytesNeeded);

    [StructLayout(LayoutKind.Sequential)]
    private struct ServiceStatusProcess
    {
        public uint ServiceType, CurrentState, ControlsAccepted, Win32ExitCode,
            ServiceSpecificExitCode, CheckPoint, WaitHint, ProcessId, ServiceFlags;
    }

    private static string TipoInicial(string serviceName)
    {
        if (!OperatingSystem.IsWindows()) return "Unknown";
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey($@"SYSTEM\CurrentControlSet\Services\{serviceName}");
            return key?.GetValue("Start") switch
            {
                0 => "Boot", 1 => "System", 2 => "Automatic", 3 => "Manual", 4 => "Disabled", _ => "Unknown"
            };
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException)
        {
            return "Unknown";
        }
    }

    private static InventarioAgente CriarInventario()
    {
        var build = OperatingSystem.IsWindows() ? Environment.OSVersion.Version.Build : 0;
        var product = LerRegistro(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "ProductName");
        var displayVersion = LerRegistro(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "DisplayVersion");
        var version = string.Join(" · ", new[] { displayVersion, build > 0 ? $"build {build}" : null }
            .Where(value => !string.IsNullOrWhiteSpace(value)));
        if (string.IsNullOrWhiteSpace(version)) version = Environment.OSVersion.Version.ToString();

        var memoria = new Memoria { Length = (uint)Marshal.SizeOf<Memoria>() };
        var memoriaOk = GlobalMemoryStatusEx(ref memoria);
        var assemblyVersion = typeof(Coletor).Assembly.GetName().Version;
        return new InventarioAgente(
            string.IsNullOrWhiteSpace(product) ? RuntimeInformation.OSDescription : product,
            version,
            RuntimeInformation.OSArchitecture.ToString(),
            LerRegistro(@"HARDWARE\DESCRIPTION\System\BIOS", "SystemManufacturer"),
            LerRegistro(@"HARDWARE\DESCRIPTION\System\BIOS", "SystemProductName"),
            LerRegistro(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0", "ProcessorNameString"),
            Environment.ProcessorCount,
            memoriaOk ? memoria.TotalPhys : null,
            assemblyVersion?.ToString(3) ?? "desconhecida",
            DateTimeOffset.UtcNow);
    }

    private static string? LerRegistro(string caminho, string valor)
    {
        if (!OperatingSystem.IsWindows()) return null;
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(caminho);
            return key?.GetValue(valor)?.ToString()?.Trim();
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException)
        {
            return null;
        }
    }

    public object Coletar()
    {
        double? cpu = null;
        if (GetSystemTimes(out var idle, out var kernel, out var user))
        {
            var atual = (Idle: idle, Total: kernel + user);
            if (anteriorCpu is { } anterior && atual.Total > anterior.Total && idle >= anterior.Idle)
                cpu = Math.Clamp(100.0 * (1 - (double)(idle - anterior.Idle) / (atual.Total - anterior.Total)), 0, 100);
            anteriorCpu = atual;
        }
        var memoria = new Memoria { Length = (uint)Marshal.SizeOf<Memoria>() };
        var memoriaOk = GlobalMemoryStatusEx(ref memoria);
        var processos = new List<object>();
        var proximos = new Dictionary<int, (long Inicio, double Cpu, long Tempo, ulong? Leitura, ulong? Escrita)>();
        foreach (var processo in Process.GetProcesses())
        {
            using (processo)
            {
                try
                {
                    var id = processo.Id;
                    var nome = processo.ProcessName;
                    var ram = processo.WorkingSet64;
                    double? uso = null;
                    double? leituraBps = null, escritaBps = null;
                    try
                    {
                        var inicio = processo.StartTime.ToUniversalTime().Ticks;
                        var total = processo.TotalProcessorTime.TotalSeconds;
                        var tempo = Stopwatch.GetTimestamp();
                        var ioValido = GetProcessIoCounters(processo.Handle, out var io);
                        if (id != 0 && anteriores.TryGetValue(id, out var antes) && antes.Inicio == inicio)
                        {
                            var segundos = (double)(tempo - antes.Tempo) / Stopwatch.Frequency;
                            if (segundos > 0 && total >= antes.Cpu)
                                uso = Math.Clamp((total - antes.Cpu) / segundos / Environment.ProcessorCount * 100, 0, 100);
                            if (segundos > 0 && ioValido && antes.Leitura is { } leituraAnterior &&
                                antes.Escrita is { } escritaAnterior &&
                                io.ReadTransferCount >= leituraAnterior && io.WriteTransferCount >= escritaAnterior)
                            {
                                leituraBps = (io.ReadTransferCount - leituraAnterior) / segundos;
                                escritaBps = (io.WriteTransferCount - escritaAnterior) / segundos;
                            }
                        }
                        proximos[id] = (inicio, total, tempo,
                            ioValido ? io.ReadTransferCount : null,
                            ioValido ? io.WriteTransferCount : null);
                    }
                    catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException or NotSupportedException)
                    {
                        // Processos protegidos podem restringir acesso aos tempos de CPU.
                    }
                    processos.Add(new { pid = id, nome, cpu = uso, memoriaBytes = ram,
                        leituraIoBps = leituraBps, escritaIoBps = escritaBps });
                }
                catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException or NotSupportedException)
                {
                    // O processo pode encerrar durante a leitura.
                }
            }
        }
        anteriores = proximos;
        return new
        {
            cpu,
            memoriaTotalBytes = memoriaOk ? (ulong?)memoria.TotalPhys : null,
            memoriaDisponivelBytes = memoriaOk ? (ulong?)memoria.AvailPhys : null,
            processos,
            disco = discoRede.Disco(),
            volumes = discoRede.Volumes(),
            rede = discoRede.Rede(),
            uptimeSegundos = Math.Max(0, Environment.TickCount64 / 1000)
        };
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetSystemTimes(out ulong idle, out ulong kernel, out ulong user);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref Memoria memoria);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetProcessIoCounters(IntPtr process, out ContadoresIo counters);

    [StructLayout(LayoutKind.Sequential)]
    private struct ContadoresIo
    {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Memoria
    {
        public uint Length, MemoryLoad;
        public ulong TotalPhys, AvailPhys, TotalPageFile, AvailPageFile;
        public ulong TotalVirtual, AvailVirtual, AvailExtendedVirtual;
    }
}

public sealed record InventarioAgente(
    string SistemaOperacional, string VersaoSistema, string Arquitetura,
    string? Fabricante, string? Modelo, string? Processador,
    int ProcessadoresLogicos, ulong? MemoriaTotalBytes,
    string VersaoAgente, DateTimeOffset ColetadoEm);
public sealed record ServicoAgente(string Nome, string NomeExibicao, string Estado, string TipoInicial, int? ProcessoId = null);

