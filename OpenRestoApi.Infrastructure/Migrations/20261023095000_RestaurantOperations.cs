using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OpenRestoApi.Migrations
{
    /// <inheritdoc />
    public partial class RestaurantOperations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ServiceExceptionsJson",
                table: "Restaurants",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SimulateEmailReminders",
                table: "Restaurants",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<long>(
                name: "QrViews",
                table: "MenuItems",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<string>(
                name: "EmailReminderOutcome",
                table: "Bookings",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EmailReminderProcessedAt",
                table: "Bookings",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ServiceExceptionsJson",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "SimulateEmailReminders",
                table: "Restaurants");

            migrationBuilder.DropColumn(
                name: "QrViews",
                table: "MenuItems");

            migrationBuilder.DropColumn(
                name: "EmailReminderOutcome",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "EmailReminderProcessedAt",
                table: "Bookings");
        }
    }
}
