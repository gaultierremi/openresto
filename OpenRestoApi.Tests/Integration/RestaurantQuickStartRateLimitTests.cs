using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.Interfaces;

namespace OpenRestoApi.Tests.Integration;

public sealed class RestaurantQuickStartRateLimitTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>
{
    [Theory]
    [InlineData("Development", 10)]
    [InlineData("Production", 10)]
    [InlineData("Testing", 12)]
    public async Task PhotoQuotaIsSeparateFromLogin_AndNeverSavesProposals(string environment, int acceptedPhotos)
    {
        var reader = new PhotoReader();
        using var h = new PlatformHarness(factory, builder =>
        {
            builder.UseEnvironment(environment);
            builder.ConfigureServices(services => services.AddSingleton<IMenuPhotoReader>(reader));
        });
        var (id, owner) = await h.RunningRestaurantAsync();
        using (owner)
        {
            int before = await h.InDbAsync(db => db.MenuItems.CountAsync());
            for (int photo = 0; photo < 12; photo++)
            {
                using var form = Photo();
                var response = await owner.PostAsync($"/api/onboarding/restaurants/{id}/menu/import/photo", form);
                Assert.Equal(photo < acceptedPhotos ? HttpStatusCode.OK : HttpStatusCode.TooManyRequests, response.StatusCode);
            }
            Assert.Equal(acceptedPhotos, reader.Calls);
            Assert.Equal(before, await h.InDbAsync(db => db.MenuItems.CountAsync()));
            Assert.Equal(HttpStatusCode.OK, (await owner.PostAsJsonAsync($"/api/onboarding/restaurants/{id}/menu/import",
                new { text = "Soupe 8,50", language = "fr" })).StatusCode);

            using var anotherUser = h.Client();
            var login = await anotherUser.PostAsJsonAsync("/api/admin/auth/login",
                new { email = TestWebAppFactory.AdminEmail, password = TestWebAppFactory.AdminPassword });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            if (environment != "Testing")
            {
                for (int attempt = 0; attempt < 10; attempt++)
                    login = await anotherUser.PostAsJsonAsync("/api/admin/auth/login",
                        new { email = TestWebAppFactory.AdminEmail, password = TestWebAppFactory.AdminPassword });
                Assert.Equal(HttpStatusCode.TooManyRequests, login.StatusCode);
            }
        }
        Assert.Empty(h.Mail.Sent.Where(mail => !mail.To.EndsWith(".example", StringComparison.Ordinal)));
    }

    private sealed class PhotoReader : IMenuPhotoReader
    {
        public int Calls { get; private set; }
        public Task<string> ReadAsync(Stream source, string contentType, string language, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult("Soupe 8,50");
        }
    }

    private static MultipartFormDataContent Photo()
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YD0f4sAAAAASUVORK5CYII="));
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "carte-exemple.png");
        form.Add(new StringContent("fr"), "language");
        return form;
    }
}
