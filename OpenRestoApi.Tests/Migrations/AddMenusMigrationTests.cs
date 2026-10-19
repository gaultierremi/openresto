using System.Globalization;
using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Infrastructure.Persistence;
using OpenRestoApi.Tests.Integration;

namespace OpenRestoApi.Tests.Migrations;

/// <summary>
/// AddMenus adds a NOT NULL, unique <c>PublicToken</c> to two tables that already hold rows on
/// every real install, and reaches NOT NULL by rebuilding <c>Restaurants</c> and <c>Tables</c>.
/// Both halves are where an upgrade breaks while a fresh install passes: the backfill has to give
/// every existing row its own token, and the rebuild must not fire the cascades hanging off those
/// tables, which would delete sections and null out every booking's table.
/// </summary>
public class AddMenusMigrationTests : IDisposable
{
    private const string LastMigrationBeforeMenus = "20261001210431_AddSessionVersion";
    private const int RowsPerTable = 200;

    private readonly SqliteConnection _connection;

    public AddMenusMigrationTests()
    {
        _connection = OpenWithForeignKeys();
    }

    /// <summary>
    /// Production turns foreign keys on for every connection (<see cref="SqlitePragmaInterceptor"/>),
    /// and that is the setting under which a careless rebuild cascades. An already-open connection
    /// never reaches the interceptor, so the pragma is set here.
    /// </summary>
    private static SqliteConnection OpenWithForeignKeys()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        using SqliteCommand pragma = connection.CreateCommand();
        pragma.CommandText = "PRAGMA foreign_keys = ON;";
        pragma.ExecuteNonQuery();
        return connection;
    }

    public void Dispose()
    {
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }

    private static AppDbContext CreateContext(SqliteConnection connection)
        => new(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);

    [Fact]
    public async Task Upgrade_GivesEveryExistingRestaurantAndTableItsOwnToken()
    {
        await SeedAtBaselineAsync();

        using (AppDbContext db = CreateContext(_connection))
        {
            await db.Database.MigrateAsync();
        }

        foreach (string table in new[] { "Restaurants", "Tables" })
        {
            List<string> tokens = Column(_connection, $"SELECT PublicToken FROM \"{table}\";");
            Assert.Equal(RowsPerTable, tokens.Count);
            Assert.Equal(tokens.Count, tokens.Distinct(StringComparer.Ordinal).Count());
            Assert.All(tokens, t => Assert.Matches("^[A-Za-z0-9_-]{22}$", t));
        }
    }

    [Fact]
    public async Task Upgrade_KeepsSectionsAndBookingsAttached_ThroughTheTableRebuild()
    {
        await SeedAtBaselineAsync();
        List<string> before = Column(_connection, "SELECT Id || ':' || RestaurantId || ':' || TableId || ':' || SectionId FROM Bookings ORDER BY Id;");
        string sectionsBefore = Scalar(_connection, "SELECT COUNT(*) FROM Sections;");

        using (AppDbContext db = CreateContext(_connection))
        {
            await db.Database.MigrateAsync();
        }

        Assert.Equal(before, Column(_connection, "SELECT Id || ':' || RestaurantId || ':' || TableId || ':' || SectionId FROM Bookings ORDER BY Id;"));
        Assert.Equal(sectionsBefore, Scalar(_connection, "SELECT COUNT(*) FROM Sections;"));
        Assert.Empty(Column(_connection, "PRAGMA foreign_key_check;"));
        Assert.Equal("1", Scalar(_connection, "PRAGMA foreign_keys;"));
    }

    [Fact]
    public async Task Upgrade_NeverReusesTheIdOfADeletedRestaurantOrTable()
    {
        await SeedAtBaselineAsync();
        Execute($"DELETE FROM Restaurants WHERE Id = {RowsPerTable};");

        using (AppDbContext db = CreateContext(_connection))
        {
            await db.Database.MigrateAsync();
        }

        Insert("Restaurants", new() { ["Name"] = "New", ["PublicToken"] = "restaurant-after-upgrade" });
        Insert("Sections", new() { ["Name"] = "New", ["RestaurantId"] = RowsPerTable + 1 });
        Insert("Tables", new() { ["Seats"] = 2, ["SectionId"] = RowsPerTable + 1, ["PublicToken"] = "table-after-upgrade" });
        Assert.Equal((RowsPerTable + 1).ToString(CultureInfo.InvariantCulture), Scalar(_connection, "SELECT Id FROM Restaurants WHERE Name = 'New';"));
        Assert.Equal((RowsPerTable + 1).ToString(CultureInfo.InvariantCulture), Scalar(_connection, "SELECT Id FROM Tables WHERE PublicToken = 'table-after-upgrade';"));
    }

    [Fact]
    public async Task Upgrade_KeepsTheColumnDefaultsRawSqlInsertsRelyOn()
    {
        await SeedAtBaselineAsync();
        using (AppDbContext db = CreateContext(_connection))
        {
            await db.Database.MigrateAsync();
        }

        Execute("INSERT INTO Restaurants (Name, OpenTime, CloseTime, OpenDays, Timezone, PublicToken) VALUES ('Raw', '09:00', '22:00', '1,2,3,4,5,6,7', 'UTC', 'raw-insert-token');");

        Assert.Equal("0|60|0|30|0", Scalar(_connection,
            "SELECT IsArchived || '|' || DefaultBookingDurationMinutes || '|' || WalkInOnly || '|' || BookingSlotIntervalMinutes || '|' || BookingRefFormat FROM Restaurants WHERE Name = 'Raw';"));
    }

    [Fact]
    public async Task Upgrade_RefusesARestaurantWithoutAToken()
    {
        await SeedAtBaselineAsync();
        using (AppDbContext db = CreateContext(_connection))
        {
            await db.Database.MigrateAsync();
        }

        SqliteException ex = Assert.Throws<SqliteException>(() =>
            Execute("INSERT INTO Restaurants (Name, OpenTime, CloseTime, OpenDays, Timezone) VALUES ('NoToken', '09:00', '22:00', '1', 'UTC');"));
        Assert.Contains("NOT NULL constraint failed: Restaurants.PublicToken", ex.Message, StringComparison.Ordinal);
        Assert.Equal("0", Scalar(_connection, "SELECT COUNT(*) FROM Restaurants WHERE Name = 'NoToken';"));
    }

    /// <summary>
    /// The tokens the migration writes come from SQL, not from <c>PublicTokenGenerator</c>, so
    /// this proves they are tokens the public endpoints actually accept, end to end.
    /// </summary>
    [Fact]
    public async Task Upgrade_TokensFilledByTheMigration_ResolveThroughThePublicEndpoints()
    {
        await SeedAtBaselineAsync();
        using (AppDbContext db = CreateContext(_connection))
        {
            await db.Database.MigrateAsync();
        }
        string restaurantToken = Scalar(_connection, "SELECT PublicToken FROM Restaurants WHERE Id = 1;");
        string tableToken = Scalar(_connection, "SELECT PublicToken FROM Tables WHERE Id = 1;");
        Insert("Menus", new() { ["Id"] = 1, ["RestaurantId"] = 1, ["Name"] = "Migrated lunch", ["Currency"] = "EUR", ["IsPublished"] = 1 });
        Insert("MenuCategories", new() { ["Id"] = 1, ["MenuId"] = 1, ["Name"] = "Mains", ["IsVisible"] = 1 });
        Insert("MenuItems", new() { ["Id"] = 1, ["CategoryId"] = 1, ["Name"] = "Soup", ["Availability"] = "Available" });

        using var factory = new TestWebAppFactory();
        using WebApplicationFactory<Program> app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            foreach (ServiceDescriptor descriptor in services.Where(d =>
                d.ServiceType == typeof(DbContextOptions<AppDbContext>) ||
                d.ServiceType == typeof(DbContextOptions) ||
                d.ServiceType == typeof(AppDbContext) ||
                d.ServiceType == typeof(IDbContextOptionsConfiguration<AppDbContext>)).ToList())
            {
                services.Remove(descriptor);
            }
            services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection));
        }));
        HttpClient guest = app.CreateClient();

        HttpResponseMessage byRestaurant = await guest.GetAsync($"/api/menus/r/{restaurantToken}");
        HttpResponseMessage byTable = await guest.GetAsync($"/api/menus/t/{tableToken}");

        Assert.Equal(HttpStatusCode.OK, byRestaurant.StatusCode);
        Assert.Contains("Migrated lunch", await byRestaurant.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.OK, byTable.StatusCode);
        Assert.Contains("\"name\":\"T1\"", await byTable.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task FreshInstall_MakesBothTokenColumnsRequiredAndUnique()
    {
        using (AppDbContext db = CreateContext(_connection))
        {
            await db.Database.MigrateAsync();
        }

        Assert.Equal("1", Scalar(_connection, "SELECT \"notnull\" FROM pragma_table_info('Restaurants') WHERE name = 'PublicToken';"));
        Assert.Equal("1", Scalar(_connection, "SELECT \"notnull\" FROM pragma_table_info('Tables') WHERE name = 'PublicToken';"));
        Assert.Equal("1", Scalar(_connection, "SELECT \"unique\" FROM pragma_index_list('Restaurants') WHERE name = 'IX_Restaurants_PublicToken';"));
        Assert.Equal("1", Scalar(_connection, "SELECT \"unique\" FROM pragma_index_list('Tables') WHERE name = 'IX_Tables_PublicToken';"));
    }

    [Fact]
    public async Task Upgrade_ProducesSameSchema_AsFreshInstall()
    {
        using SqliteConnection freshConnection = OpenWithForeignKeys();
        using (AppDbContext freshDb = CreateContext(freshConnection))
        {
            await freshDb.Database.MigrateAsync();
        }

        await SeedAtBaselineAsync();
        using (AppDbContext upgradeDb = CreateContext(_connection))
        {
            await upgradeDb.Database.MigrateAsync();
        }

        Assert.Equal(Schema(freshConnection), Schema(_connection));
    }

    /// <summary>
    /// Migrates to the last schema before AddMenus and fills it the way a live install looks:
    /// restaurants with sections and tables, and a booking on every table.
    /// </summary>
    private async Task SeedAtBaselineAsync()
    {
        using (AppDbContext db = CreateContext(_connection))
        {
            IMigrator migrator = db.GetInfrastructure().GetRequiredService<IMigrator>();
            await migrator.MigrateAsync(LastMigrationBeforeMenus);
        }

        for (int id = 1; id <= RowsPerTable; id++)
        {
            Insert("Restaurants", new()
            {
                ["Id"] = id, ["Name"] = $"R{id}", ["OpenTime"] = "09:00", ["CloseTime"] = "22:00",
                ["OpenDays"] = "1,2,3,4,5,6,7", ["Timezone"] = "UTC",
            });
            Insert("Sections", new() { ["Id"] = id, ["Name"] = $"S{id}", ["RestaurantId"] = id });
            Insert("Tables", new() { ["Id"] = id, ["Name"] = $"T{id}", ["Seats"] = 4, ["SectionId"] = id });
            Insert("Bookings", new() { ["Id"] = id, ["RestaurantId"] = id, ["SectionId"] = id, ["TableId"] = id, ["Status"] = "Booked" });
        }
    }

    /// <summary>
    /// Inserts a row giving every NOT NULL column without a default a type-appropriate value, so the
    /// test names only the columns it cares about and survives columns it does not.
    /// </summary>
    private void Insert(string table, Dictionary<string, object> values)
    {
        using (SqliteCommand info = _connection.CreateCommand())
        {
            info.CommandText = $"SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_info('{table}');";
            using SqliteDataReader reader = info.ExecuteReader();
            while (reader.Read())
            {
                string name = reader.GetString(0);
                bool required = reader.GetInt64(2) == 1 && reader.IsDBNull(3) && reader.GetInt64(4) == 0;
                if (required && !values.ContainsKey(name))
                {
                    values[name] = reader.GetString(1).Contains("INT", StringComparison.OrdinalIgnoreCase) ? 0 : "2026-01-01 00:00:00";
                }
            }
        }

        using SqliteCommand insert = _connection.CreateCommand();
        List<string> columns = [.. values.Keys];
        insert.CommandText =
            $"INSERT INTO \"{table}\" ({string.Join(", ", columns.Select(c => $"\"{c}\""))}) " +
            $"VALUES ({string.Join(", ", columns.Select((_, i) => $"$p{i}"))});";
        for (int i = 0; i < columns.Count; i++)
        {
            insert.Parameters.AddWithValue($"$p{i}", values[columns[i]]);
        }
        insert.ExecuteNonQuery();
    }

    private void Execute(string sql)
    {
        using SqliteCommand cmd = _connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    private static string Schema(SqliteConnection connection)
        => string.Join("\n", Column(connection,
            "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE '__EFMigrationsHistory%' ORDER BY type, name;"));

    private static string Scalar(SqliteConnection connection, string sql)
        => Column(connection, sql).Single();

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
