using System;
using System.Net.NetworkInformation;

public class NetworkService
{
    public (int ping, double jitter, double loss) GetNetworkStats(string host = "8.8.8.8")
    {
        int attempts = 5;

        long totalPing = 0;
        int success = 0;

        long lastPing = -1;
        double totalJitter = 0;

        Ping pingSender = new Ping();

        for (int i = 0; i < attempts; i++)
        {
            try
            {
                var reply = pingSender.Send(host, 1000);

                if (reply.Status == IPStatus.Success)
                {
                    success++;

                    totalPing += reply.RoundtripTime;

                    if (lastPing != -1)
                    {
                        totalJitter += Math.Abs(reply.RoundtripTime - lastPing);
                    }

                    lastPing = reply.RoundtripTime;
                }
            }
            catch
            {
                // ignora falha
            }
        }

        double avgPing = success > 0 ? (double)totalPing / success : 0;

        double avgJitter = success > 1
            ? totalJitter / (success - 1)
            : 0;

        double packetLoss = ((double)(attempts - success) / attempts) * 100;

        return (
            (int)Math.Round(avgPing),
            Math.Round(avgJitter, 2),
            Math.Round(packetLoss, 2)
        );
    }
}