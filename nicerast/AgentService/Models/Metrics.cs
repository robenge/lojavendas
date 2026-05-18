using System;
using System.Collections.Generic;

public class Metrics
{
    public string MachineName { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;

    public float Cpu { get; set; }

    public float Memory { get; set; }

    public float Disk { get; set; }

    public double Uptime { get; set; }

    public int Ping { get; set; }

    public double Jitter { get; set; }

    public double PacketLoss { get; set; }

    public int VoipScore { get; set; }

    public bool HeadsetConnected { get; set; }

    public string HeadsetName { get; set; } = string.Empty;

    public List<ProcessInfo> Processes { get; set; } = new();

    public DateTime Timestamp { get; set; }
}