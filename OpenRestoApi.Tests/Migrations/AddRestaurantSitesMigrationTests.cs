using System.Globalization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using OpenRestoApi.Infrastructure.Persistence;

namespace OpenRestoApi.Tests.Migrations;

/// <summary>
/// AddRestaurantSites only creates a table, which is why it needs no rebuild of anything that
/// already holds rows. What matters on an upgrade is that it leaves those rows alone, that the
/// slug stays unique (the page's address), that one location has at most one site, and that
/// deleting a location takes its site with it and nothing else.
/// </summary>
public class AddRestaurantSitesMigrationTests : IDisposable
{
    private const string LastMigrationBeforeSites = "20261018230818_AddMenus";

    private readonly SqliteConnection _connection = OpenWithForeignKeys();

    private static SqliteConnection OpenWithForeignKeys()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        Execute(connection, "PRAGMA foreign_keys = ON;");
        return connection;
    }

    public void Dispose()
    {
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }

    private AppDbContext CreateContext()
        => new(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options);

    private async Task UpgradeFromBaselineWithRestaurantsAsync()
    {
        using (AppDbContext db = CreateContext())
        {
            await db.GetService<IMigrator>().MigrateAsync(LastMigrationBeforeSites);
        }
        for (int i = 1; i <= 3; i++)
        {
            Execute(_connection,
                $"INSERT INTO Restaurants (Name, OpenTime, CloseTime, OpenDays, Timezone, PublicToken) VALUES ('R{i}', '09:00', '22:00', '1,2,3,4,5,6,7', 'UTC', 'token-{i}');");
        }
        using (AppDbContext db = CreateContext())
        {
            await db.Database.MigrateAsync();
        }
    }

    private static void InsertSite(SqliteConnection connection, int restaurantId, string slug)
        => Execute(connection,
            $"INSERT INTO RestaurantSites (RestaurantId, Slug, IsPublished, Theme, CreatedAt, UpdatedAt) VALUES ({restaurantId}, '{slug}', 0, 'Brasserie', '2026-10-20', '2026-10-20');");

    [Fact]
    public async Task Upgrade_LeavesTheExistingRestaurantsAlone_AndAddsTheEmptyTable()
    {
        await UpgradeFromBaselineWithRestaurantsAsync();

        Assert.Equal("3", Scalar(_connection, "SELECT COUNT(*) FROM Restaurants;"));
        Assert.Equal("0", Scalar(_connection, "SELECT COUNT(*) FROM RestaurantSites;"));
        Assert.Equal("token-1|token-2|token-3", string.Join('|', Column(_connection, "SELECT PublicToken FROM Restaurants ORDER BY Id;")));
    }

    [Fact]
    public async Task TheSlugIsUnique_ButAnythingElseMayRepeat()
    {
        await UpgradeFromBaselineWithRestaurantsAsync();
        InsertSite(_connection, 1, "la-senne");

        Assert.Throws<SqliteException>(() => InsertSite(_connection, 2, "la-senne"));
        InsertSite(_connection, 2, "la-senne-2");
        Assert.Equal("2", Scalar(_connection, "SELECT COUNT(*) FROM RestaurantSites;"));
    }

    [Fact]
    public async Task ALocationHasAtMostOneSite()
    {
        await UpgradeFromBaselineWithRestaurantsAsync();
        InsertSite(_connection, 1, "first");

        Assert.Throws<SqliteException>(() => InsertSite(_connection, 1, "second"));
    }

    [Fact]
    public async Task ASiteCannotPointAtALocationThatDoesNotExist()
    {
        await UpgradeFromBaselineWithRestaurantsAsync();

        Assert.Throws<SqliteException>(() => InsertSite(_connection, 99, "ghost"));
    }

    [Fact]
    public async Task DeletingALocation_DeletesItsSite_AndNoOtherSite()
    {
        await UpgradeFromBaselineWithRestaurantsAsync();
        InsertSite(_connection, 1, "gone");
        InsertSite(_connection, 2, "kept");

        Execute(_connection, "DELETE FROM Restaurants WHERE Id = 1;");

        Assert.Equal(["kept"], Column(_connection, "SELECT Slug FROM RestaurantSites;"));
    }

    private static void Execute(SqliteConnection connection, string sql)
    {
        using SqliteCommand cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    private static string Scalar(SqliteConnection connection, string sql) => Column(connection, sql).Single();

    private static List<string> Column(SqliteConnection connection, string sql)
    {
        using SqliteCommand cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        using SqliteDataReader reader = cmd.ExecuteReader();
        var values = new List<string>();
        while (reader.Read())
        {
            values.Add(Convert.ToString(reader.GetValue(0), CultureInfo.InvariantCulture) ?? string.Empty);
        }
        return values;
    }
}
