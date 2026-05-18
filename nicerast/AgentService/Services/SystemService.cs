using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Runtime.Versioning;

[SupportedOSPlatform("windows")]
public class SystemService
{
    private PerformanceCounter cpu;
    private PerformanceCounter ram;

    public SystemService()
    {
        cpu = new PerformanceCounter("Processor", "% Processor Time", "_Total");
        ram = new PerformanceCounter("Memory", "% Committed Bytes In Use");
    }

    // 🔥 CPU
    public float GetCpu()
    {
        try
        {
            cpu.NextValue();
            System.Threading.Thread.Sleep(500);
            return (float)Math.Round(cpu.NextValue(), 2);
        }
        catch
        {
            return 0;
        }
    }

    // 🔥 MEMÓRIA
    public float GetMemory()
    {
        try
        {
            return (float)Math.Round(ram.NextValue(), 2);
        }
        catch
        {
            return 0;
        }
    }

    // 🔥 DISCO (Drive C:)
    public float GetDisk()
    {
        try
        {
            var drive = DriveInfo.GetDrives()
                .FirstOrDefault(d => d.IsReady && d.Name == "C:\\");

            if (drive == null)
                return 0;

            var used = drive.TotalSize - drive.AvailableFreeSpace;
            var percent = (double)used / drive.TotalSize * 100;

            return (float)Math.Round(percent, 2);
        }
        catch
        {
            return 0;
        }
    }

    // 🔥 UPTIME
    public double GetUptime()
    {
        try
        {
            return Math.Round(TimeSpan.FromMilliseconds(Environment.TickCount64).TotalSeconds, 0);
        }
        catch
        {
            return 0;
        }
    }

    // 🔥 TOP PROCESSOS (TIPADO - CORRETO)
    public List<ProcessInfo> GetTopProcesses()
    {
        try
        {
            return Process.GetProcesses()
                .OrderByDescending(p => p.WorkingSet64)
                .Take(5)
                .Select(p => new ProcessInfo
                {
                    Name = SafeProcessName(p),
                    MemoryMB = p.WorkingSet64 / 1024 / 1024
                })
                .ToList();
        }
        catch
        {
            return new List<ProcessInfo>();
        }
    }

    // 🔒 Evita erro de acesso negado
    private string SafeProcessName(Process p)
    {
        try
        {
            return p.ProcessName;
        }
        catch
        {
            return "unknown";
        }
    }
}