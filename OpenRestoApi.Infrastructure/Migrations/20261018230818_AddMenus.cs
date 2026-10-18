using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OpenRestoApi.Migrations
{
    /// <inheritdoc />
    public partial class AddMenus : Migration
    {
        /// <summary>
        /// A SQLite expression yielding a fresh 22-character base64url token each time it is
        /// evaluated, the shape <c>PublicTokenGenerator</c> mints. A migration emits SQL, so the
        /// .NET CSPRNG cannot reach the rows; <c>random()</c> is SQLite's own ChaCha20 generator,
        /// seeded by the VFS from OS entropy (<c>/dev/urandom</c> on the Linux images). It is
        /// evaluated per row and per occurrence, so every row gets its own value. It must never be
        /// wrapped in a subquery: SQLite may evaluate an uncorrelated subquery once and hand every
        /// row the same token.
        /// </summary>
        private static readonly string RandomTokenSql = string.Join(
            " || ",
            Enumerable.Repeat(
                "substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', (random() & 63) + 1, 1)",
                22));

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Existing rows need a token each, and no column default can mint a distinct random
            // value per row. So, as in AddMultiUserAccounts: add the column nullable, fill it,
            // then rebuild the table to make it NOT NULL (SQLite has no ALTER COLUMN). Fresh
            // installs and upgrades run the same steps and land on the same table definition.
            migrationBuilder.AddColumn<string>(
                name: "PublicToken",
                table: "Tables",
                type: "TEXT",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublicToken",
                table: "Restaurants",
                type: "TEXT",
                maxLength: 32,
                nullable: true);

            migrationBuilder.Sql($"UPDATE \"Tables\" SET \"PublicToken\" = {RandomTokenSql} WHERE \"PublicToken\" IS NULL;");
            migrationBuilder.Sql($"UPDATE \"Restaurants\" SET \"PublicToken\" = {RandomTokenSql} WHERE \"PublicToken\" IS NULL;");

            // Dropping the old tables with foreign keys on would fire everything hanging off them:
            // Restaurants cascades to sections, bookings, the waitlist and notifications, and
            // Tables sets every booking's TableId to NULL. The pragma is a no-op inside a
            // transaction, hence suppressTransaction, the same bracket EF puts around its own rebuilds.
            migrationBuilder.Sql("PRAGMA foreign_keys = 0;", suppressTransaction: true);

            // The rebuilt tables are the previous definitions verbatim, column order and DEFAULTs
            // included (raw-SQL inserts in scripts/ rely on those defaults), plus PublicToken. The
            // AUTOINCREMENT high-water mark is carried over before the rows are, so an id freed by
            // a deletion is never handed out again.
            migrationBuilder.Sql(
                """
                CREATE TABLE "Tables_temp" (
                    "Id" INTEGER NOT NULL CONSTRAINT "PK_Tables" PRIMARY KEY AUTOINCREMENT,
                    "Name" TEXT NULL,
                    "Seats" INTEGER NOT NULL,
                    "SectionId" INTEGER NOT NULL,
                    "WalkInOnly" INTEGER NOT NULL DEFAULT 0,
                    "PublicToken" TEXT NOT NULL,
                    CONSTRAINT "FK_Tables_Sections_SectionId" FOREIGN KEY ("SectionId") REFERENCES "Sections" ("Id") ON DELETE CASCADE
                );

                INSERT INTO sqlite_sequence ("name", "seq")
                SELECT 'Tables_temp', "seq" FROM sqlite_sequence WHERE "name" = 'Tables';

                INSERT INTO "Tables_temp" ("Id", "Name", "Seats", "SectionId", "WalkInOnly", "PublicToken")
                SELECT "Id", "Name", "Seats", "SectionId", "WalkInOnly", "PublicToken"
                FROM "Tables";

                DROP TABLE "Tables";

                ALTER TABLE "Tables_temp" RENAME TO "Tables";

                CREATE INDEX "IX_Tables_SectionId" ON "Tables" ("SectionId");

                CREATE TABLE "Restaurants_temp" (
                    "Id" INTEGER NOT NULL CONSTRAINT "PK_Restaurants" PRIMARY KEY AUTOINCREMENT,
                    "Name" TEXT NOT NULL,
                    "Address" TEXT NULL,
                    "OpenTime" TEXT NOT NULL,
                    "CloseTime" TEXT NOT NULL,
                    "OpenDays" TEXT NOT NULL,
                    "Timezone" TEXT NOT NULL,
                    "BookingsPausedUntil" TEXT NULL,
                    "Tags" TEXT NULL,
                    "ImageUrl" TEXT NULL,
                    "IsArchived" INTEGER NOT NULL DEFAULT 0,
                    "DefaultBookingDurationMinutes" INTEGER NOT NULL DEFAULT 60,
                    "OpenHoursJson" TEXT NULL,
                    "WalkInDays" TEXT NULL,
                    "WalkInOnly" INTEGER NOT NULL DEFAULT 0,
                    "Description" TEXT NULL,
                    "MenuUrl" TEXT NULL,
                    "BookingSlotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
                    "MaxTableOversizeSeats" INTEGER NULL,
                    "EmailAddress" TEXT NULL,
                    "PhoneNumber" TEXT NULL,
                    "BookingRefFormat" INTEGER NOT NULL DEFAULT 0,
                    "TurnTimesJson" TEXT NULL,
                    "MaxCoversPerSlot" INTEGER NULL,
                    "PublicToken" TEXT NOT NULL
                );

                INSERT INTO sqlite_sequence ("name", "seq")
                SELECT 'Restaurants_temp', "seq" FROM sqlite_sequence WHERE "name" = 'Restaurants';

                INSERT INTO "Restaurants_temp" ("Id", "Name", "Address", "OpenTime", "CloseTime", "OpenDays", "Timezone", "BookingsPausedUntil", "Tags", "ImageUrl", "IsArchived", "DefaultBookingDurationMinutes", "OpenHoursJson", "WalkInDays", "WalkInOnly", "Description", "MenuUrl", "BookingSlotIntervalMinutes", "MaxTableOversizeSeats", "EmailAddress", "PhoneNumber", "BookingRefFormat", "TurnTimesJson", "MaxCoversPerSlot", "PublicToken")
                SELECT "Id", "Name", "Address", "OpenTime", "CloseTime", "OpenDays", "Timezone", "BookingsPausedUntil", "Tags", "ImageUrl", "IsArchived", "DefaultBookingDurationMinutes", "OpenHoursJson", "WalkInDays", "WalkInOnly", "Description", "MenuUrl", "BookingSlotIntervalMinutes", "MaxTableOversizeSeats", "EmailAddress", "PhoneNumber", "BookingRefFormat", "TurnTimesJson", "MaxCoversPerSlot", "PublicToken"
                FROM "Restaurants";

                DROP TABLE "Restaurants";

                ALTER TABLE "Restaurants_temp" RENAME TO "Restaurants";
                """);

            migrationBuilder.Sql("PRAGMA foreign_keys = 1;", suppressTransaction: true);

            migrationBuilder.CreateTable(
                name: "Menus",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    RestaurantId = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    Currency = table.Column<string>(type: "TEXT", maxLength: 3, nullable: false),
                    IsPublished = table.Column<bool>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Menus", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Menus_Restaurants_RestaurantId",
                        column: x => x.RestaurantId,
                        principalTable: "Restaurants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MenuCategories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    MenuId = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    IsVisible = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MenuCategories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MenuCategories_Menus_MenuId",
                        column: x => x.MenuId,
                        principalTable: "Menus",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MenuItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    CategoryId = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    PriceMinor = table.Column<long>(type: "INTEGER", nullable: true),
                    ImageUrl = table.Column<string>(type: "TEXT", nullable: true),
                    Availability = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    Allergens = table.Column<int>(type: "INTEGER", nullable: false),
                    DietaryTags = table.Column<int>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MenuItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MenuItems_MenuCategories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "MenuCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tables_PublicToken",
                table: "Tables",
                column: "PublicToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Restaurants_PublicToken",
                table: "Restaurants",
                column: "PublicToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MenuCategories_MenuId_SortOrder",
                table: "MenuCategories",
                columns: new[] { "MenuId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_MenuItems_CategoryId_SortOrder",
                table: "MenuItems",
                columns: new[] { "CategoryId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Menus_RestaurantId_SortOrder",
                table: "Menus",
                columns: new[] { "RestaurantId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MenuItems");

            migrationBuilder.DropTable(
                name: "MenuCategories");

            migrationBuilder.DropTable(
                name: "Menus");

            migrationBuilder.DropIndex(
                name: "IX_Tables_PublicToken",
                table: "Tables");

            migrationBuilder.DropIndex(
                name: "IX_Restaurants_PublicToken",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "PublicToken",
                table: "Tables");

            migrationBuilder.DropColumn(
                name: "PublicToken",
                table: "Restaurants");
        }
    }
}
