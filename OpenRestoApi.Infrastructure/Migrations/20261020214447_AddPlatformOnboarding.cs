using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OpenRestoApi.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformOnboarding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PrimaryColor",
                table: "RestaurantSites",
                type: "TEXT",
                maxLength: 9,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BookingRetentionMonths",
                table: "Restaurants",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OnboardingSteps",
                table: "Restaurants",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PublishedAt",
                table: "Restaurants",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Restaurants",
                type: "TEXT",
                maxLength: 16,
                nullable: false,
                defaultValue: "Published");

            migrationBuilder.AddColumn<DateTime>(
                name: "SuspendedAt",
                table: "Restaurants",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SuspensionReason",
                table: "Restaurants",
                type: "TEXT",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VatNumber",
                table: "Restaurants",
                type: "TEXT",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "AnonymizedAt",
                table: "Bookings",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Locale",
                table: "Bookings",
                type: "TEXT",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastLoginAt",
                table: "AdminCredentials",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "LegalAcceptances",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<int>(type: "INTEGER", nullable: false),
                    RestaurantId = table.Column<int>(type: "INTEGER", nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 254, nullable: false),
                    DocumentKey = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    Version = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    ContentSha256 = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    AcceptedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LegalAcceptances", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RestaurantInvitations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    RestaurantId = table.Column<int>(type: "INTEGER", nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 254, nullable: false),
                    TokenHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Locale = table.Column<string>(type: "TEXT", maxLength: 8, nullable: false),
                    CreatedByUserId = table.Column<int>(type: "INTEGER", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    AcceptedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    AcceptedByUserId = table.Column<int>(type: "INTEGER", nullable: true),
                    RevokedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RestaurantInvitations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RestaurantInvitations_Restaurants_RestaurantId",
                        column: x => x.RestaurantId,
                        principalTable: "Restaurants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RestaurantMembers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<int>(type: "INTEGER", nullable: false),
                    RestaurantId = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RestaurantMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RestaurantMembers_AdminCredentials_UserId",
                        column: x => x.UserId,
                        principalTable: "AdminCredentials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RestaurantMembers_Restaurants_RestaurantId",
                        column: x => x.RestaurantId,
                        principalTable: "Restaurants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LegalAcceptances_RestaurantId_AcceptedAt",
                table: "LegalAcceptances",
                columns: new[] { "RestaurantId", "AcceptedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantInvitations_RestaurantId",
                table: "RestaurantInvitations",
                column: "RestaurantId");

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantInvitations_TokenHash",
                table: "RestaurantInvitations",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantMembers_RestaurantId",
                table: "RestaurantMembers",
                column: "RestaurantId");

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantMembers_UserId_RestaurantId",
                table: "RestaurantMembers",
                columns: new[] { "UserId", "RestaurantId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LegalAcceptances");

            migrationBuilder.DropTable(
                name: "RestaurantInvitations");

            migrationBuilder.DropTable(
                name: "RestaurantMembers");

            migrationBuilder.DropColumn(
                name: "PrimaryColor",
                table: "RestaurantSites");

            migrationBuilder.DropColumn(
                name: "BookingRetentionMonths",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "OnboardingSteps",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "PublishedAt",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "SuspendedAt",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "SuspensionReason",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "VatNumber",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "AnonymizedAt",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "Locale",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "LastLoginAt",
                table: "AdminCredentials");
        }
    }
}
