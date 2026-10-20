using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OpenRestoApi.Migrations
{
    /// <inheritdoc />
    public partial class AddRestaurantSites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RestaurantSites",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    RestaurantId = table.Column<int>(type: "INTEGER", nullable: false),
                    Slug = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false),
                    IsPublished = table.Column<bool>(type: "INTEGER", nullable: false),
                    Theme = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    Tagline = table.Column<string>(type: "TEXT", maxLength: 160, nullable: true),
                    LogoUrl = table.Column<string>(type: "TEXT", nullable: true),
                    CoverUrl = table.Column<string>(type: "TEXT", nullable: true),
                    PhotosJson = table.Column<string>(type: "TEXT", nullable: true),
                    SocialLinksJson = table.Column<string>(type: "TEXT", nullable: true),
                    LegalName = table.Column<string>(type: "TEXT", maxLength: 120, nullable: true),
                    CompanyNumber = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    VatNumber = table.Column<string>(type: "TEXT", maxLength: 20, nullable: true),
                    LegalAddress = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RestaurantSites", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RestaurantSites_Restaurants_RestaurantId",
                        column: x => x.RestaurantId,
                        principalTable: "Restaurants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantSites_RestaurantId",
                table: "RestaurantSites",
                column: "RestaurantId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RestaurantSites_Slug",
                table: "RestaurantSites",
                column: "Slug",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RestaurantSites");
        }
    }
}
