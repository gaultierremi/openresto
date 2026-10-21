using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;
using OpenRestoApi.Tests.TestInfrastructure;

namespace OpenRestoApi.Tests.Infrastructure;

/// <summary>
/// SMTP from the environment is a first-boot convenience: it fills an empty
/// <see cref="EmailSettings"/> table and then steps aside for the admin's own edits.
/// </summary>
public class EmailSettingsBootstrapTests
{
    private static IConfiguration Config(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.ToDictionary(v => $"EmailSettings:{v.Key}", v => v.Value))
            .Build();

    private static IServiceProvider Services()
    {
        var protector = new Mock<ICredentialProtector>();
        protector.Setup(p => p.Encrypt(It.IsAny<string>())).Returns((string plain) => "enc:" + plain);
        return new ServiceCollection().AddSingleton(protector.Object).BuildServiceProvider();
    }

    [Fact]
    public void SeedsTheSettingsRow_FromConfiguration_WhenNoneExists()
    {
        using AppDbContext db = TestDbFactory.Create(nameof(SeedsTheSettingsRow_FromConfiguration_WhenNoneExists));

        bool seeded = EmailSettingsBootstrap.SeedFromConfiguration(db, Config(
            ("Host", "smtp.example.be"), ("Port", "465"), ("Username", "mailer"), ("Password", "s3cret"),
            ("FromEmail", "noreply@example.be"), ("FromName", "Chez Louise"),
            ("EnableSsl", "false"), ("SendBookingConfirmations", "false")), Services());

        Assert.True(seeded);
        EmailSettings row = Assert.Single(db.EmailSettings);
        Assert.Equal("smtp.example.be", row.Host);
        Assert.Equal(465, row.Port);
        Assert.Equal("mailer", row.Username);
        Assert.Equal("noreply@example.be", row.FromEmail);
        Assert.Equal("Chez Louise", row.FromName);
        Assert.False(row.EnableSsl);
        Assert.False(row.SendBookingConfirmations);
    }

    [Fact]
    public void StoresThePassword_OnlyThroughTheCredentialProtector()
    {
        using AppDbContext db = TestDbFactory.Create(nameof(StoresThePassword_OnlyThroughTheCredentialProtector));

        EmailSettingsBootstrap.SeedFromConfiguration(db, Config(("Host", "smtp.example.be"), ("Password", "s3cret")), Services());

        Assert.Equal("enc:s3cret", db.EmailSettings.Single().EncryptedPassword);
    }

    [Fact]
    public void DefaultsToStartTlsPort_Ssl_AndConfirmationsOn_WhenOnlyTheHostIsGiven()
    {
        using AppDbContext db = TestDbFactory.Create(nameof(DefaultsToStartTlsPort_Ssl_AndConfirmationsOn_WhenOnlyTheHostIsGiven));

        EmailSettingsBootstrap.SeedFromConfiguration(db, Config(("Host", "smtp.example.be")), Services());

        EmailSettings row = db.EmailSettings.Single();
        Assert.Equal(587, row.Port);
        Assert.True(row.EnableSsl);
        Assert.True(row.SendBookingConfirmations);
        Assert.Equal(string.Empty, row.EncryptedPassword);
        Assert.Null(row.FromEmail);
    }

    [Fact]
    public void LeavesAnExistingRowAlone_SoTheAdminsEditsSurviveARestart()
    {
        using AppDbContext db = TestDbFactory.Create(nameof(LeavesAnExistingRowAlone_SoTheAdminsEditsSurviveARestart));
        db.EmailSettings.Add(new EmailSettings { Host = "smtp.chosen-in-admin.be", Port = 25 });
        db.SaveChanges();

        bool seeded = EmailSettingsBootstrap.SeedFromConfiguration(db, Config(("Host", "smtp.example.be"), ("Port", "587")), Services());

        Assert.False(seeded);
        EmailSettings row = Assert.Single(db.EmailSettings);
        Assert.Equal("smtp.chosen-in-admin.be", row.Host);
        Assert.Equal(25, row.Port);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void WritesNothing_WhenNoHostIsConfigured(string? host)
    {
        using AppDbContext db = TestDbFactory.Create("no-host-" + (host?.Length ?? -1));

        bool seeded = EmailSettingsBootstrap.SeedFromConfiguration(db, Config(("Host", host), ("Password", "s3cret")), new ServiceCollection().BuildServiceProvider());

        Assert.False(seeded);
        Assert.Empty(db.EmailSettings);
    }

    [Theory]
    [InlineData("Port", "smtp")]
    [InlineData("Port", "0")]
    [InlineData("Port", "70000")]
    [InlineData("EnableSsl", "maybe")]
    [InlineData("SendBookingConfirmations", "yes please")]
    public void RejectsAValueItCannotRead_RatherThanGuessing(string key, string value)
    {
        using AppDbContext db = TestDbFactory.Create($"bad-{key}-{value}");

        InvalidOperationException error = Assert.Throws<InvalidOperationException>(() =>
            EmailSettingsBootstrap.SeedFromConfiguration(db, Config(("Host", "smtp.example.be"), (key, value)), Services()));

        Assert.Contains($"EmailSettings:{key}", error.Message);
        Assert.Empty(db.EmailSettings);
    }
}
