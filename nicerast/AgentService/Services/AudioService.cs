using System;
using System.Linq;
using NAudio.CoreAudioApi;

public class AudioService
{
    // 🎧 Verifica se headset está conectado
    public bool IsHeadsetConnected()
    {
        try
        {
            var enumerator = new MMDeviceEnumerator();

            var devices = enumerator.EnumerateAudioEndPoints(
                DataFlow.Render,
                DeviceState.Active
            );

            return devices.Any(d =>
                d.FriendlyName.ToLower().Contains("headset") ||
                d.FriendlyName.ToLower().Contains("fone") ||
                d.FriendlyName.ToLower().Contains("usb") ||
                d.FriendlyName.ToLower().Contains("jabra") ||
                d.FriendlyName.ToLower().Contains("logitech")
            );
        }
        catch
        {
            return false;
        }
    }

    // 🎧 Nome do dispositivo
    public string GetHeadsetName()
    {
        try
        {
            var enumerator = new MMDeviceEnumerator();

            var devices = enumerator.EnumerateAudioEndPoints(
                DataFlow.Render,
                DeviceState.Active
            );

            var headset = devices.FirstOrDefault(d =>
                d.FriendlyName.ToLower().Contains("headset") ||
                d.FriendlyName.ToLower().Contains("fone") ||
                d.FriendlyName.ToLower().Contains("usb") ||
                d.FriendlyName.ToLower().Contains("jabra") ||
                d.FriendlyName.ToLower().Contains("logitech")
            );

            return headset?.FriendlyName ?? "Unknown";
        }
        catch
        {
            return "Unknown";
        }
    }
}