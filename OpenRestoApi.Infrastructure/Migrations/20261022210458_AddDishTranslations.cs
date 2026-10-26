using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OpenRestoApi.Migrations
{
    /// <inheritdoc />
    public partial class AddDishTranslations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PrimaryLanguage",
                table: "MenuItems",
                type: "TEXT",
                maxLength: 2,
                nullable: false,
                defaultValue: "fr");

            migrationBuilder.AddColumn<string>(
                name: "TranslationsJson",
                table: "MenuItems",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PrimaryLanguage",
                table: "MenuItems");

            migrationBuilder.DropColumn(
                name: "TranslationsJson",
                table: "MenuItems");
        }
    }
}
