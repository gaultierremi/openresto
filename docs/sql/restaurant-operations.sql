BEGIN TRANSACTION;
ALTER TABLE "Restaurants" ADD "ServiceExceptionsJson" TEXT NULL;

ALTER TABLE "Restaurants" ADD "SimulateEmailReminders" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "MenuItems" ADD "QrViews" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Bookings" ADD "EmailReminderOutcome" TEXT NULL;

ALTER TABLE "Bookings" ADD "EmailReminderProcessedAt" TEXT NULL;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261023095000_RestaurantOperations', '10.0.13');

COMMIT;
