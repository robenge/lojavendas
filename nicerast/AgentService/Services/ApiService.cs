using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

public class ApiService
{
    private readonly HttpClient http;
    private readonly string url;

    public ApiService(string apiUrl, string token)
    {
        http = new HttpClient();

        url = apiUrl;

        http.DefaultRequestHeaders.Add(
            "Authorization",
            $"Bearer {token}"
        );
    }

    public async Task<bool> Send(Metrics data)
    {
        try
        {
            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = null
            };

            string json = JsonSerializer.Serialize(data, options);

            Console.WriteLine($"[JSON] {json}");

            var response = await http.PostAsync(
                url,
                new StringContent(
                    json,
                    Encoding.UTF8,
                    "application/json"
                )
            );

            Console.WriteLine($"[HTTP] {response.StatusCode}");

            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[API ERROR] {ex.Message}");

            return false;
        }
    }
}