using System.IO;

public class BufferService
{
    private string file = "buffer.log";

    public void Save(string json)
    {
        File.AppendAllText(file, json + "\n");
    }
}