using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System;
using System.Drawing;
using System.Text.Json;
using System.Threading.Tasks;

namespace GHelper
{
    public class RgbKeyboardApi
    {
        private readonly AsusACPI _acpi;
        private const int ApiPort = 7890; // You can change this port as needed
        private IHost? host;

        public RgbKeyboardApi(AsusACPI acpi)
        {
            _acpi = acpi;
        }

        public async Task StartAsync()
        {
            try
            {
                Logger.WriteLine("Starting RGB Keyboard API...");

                var builder = WebApplication.CreateBuilder();

                // Add CORS services
                builder.Services.AddCors(options =>
                {
                    options.AddDefaultPolicy(policy =>
                    {
                        policy.AllowAnyOrigin()
                              .AllowAnyHeader()
                              .AllowAnyMethod();
                    });
                });

                var app = builder.Build();

                // Enable CORS
                app.UseCors();

                app.MapGet("/", () => "TUF RGB Keyboard API is running. Use /set-rgb?r=255&g=0&b=0 to set colors.");

                app.MapGet("/set-rgb", async (HttpContext context) =>
                {
                    try
                    {
                        // Parse RGB values from query string
                        if (!int.TryParse(context.Request.Query["r"], out int r))
                            r = 255;

                        if (!int.TryParse(context.Request.Query["g"], out int g))
                            g = 255;

                        if (!int.TryParse(context.Request.Query["b"], out int b))
                            b = 255;

                        // Clamp values to valid range
                        r = Math.Clamp(r, 0, 255);
                        g = Math.Clamp(g, 0, 255);
                        b = Math.Clamp(b, 0, 255);

                        // Create color and set keyboard RGB
                        Color color = Color.FromArgb(r, g, b);

                        // Call the TUFKeyboardRGB function using acpi instance
                        // Using 0 for static mode, based on the original function
                        _acpi.TUFKeyboardRGB(0, color, 0, "API RGB Control");

                        await context.Response.WriteAsJsonAsync(new
                        {
                            status = "success",
                            message = $"RGB set to R:{r} G:{g} B:{b}",
                            color = $"#{r:X2}{g:X2}{b:X2}"
                        });
                    }
                    catch (Exception ex)
                    {
                        context.Response.StatusCode = 500;
                        await context.Response.WriteAsJsonAsync(new
                        {
                            status = "error",
                            message = ex.Message
                        });
                    }
                }).RequireCors(builder => builder.AllowAnyOrigin());

                host = app;
                await app.RunAsync($"http://localhost:{ApiPort}");
                Logger.WriteLine($"RGB Keyboard API started on http://localhost:{ApiPort}");
            }
            catch (Exception ex)
            {
                Logger.WriteLine($"Failed to start RGB Keyboard API: {ex.Message}");
            }
        }

        public async Task StopAsync()
        {
            if (host != null)
            {
                await host.StopAsync();
                Logger.WriteLine("RGB Keyboard API stopped");
            }
        }
    }
}
