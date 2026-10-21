---
title: Feature reference
description: How each booking feature behaves, and the API fields, error codes and settings behind it.
sidebar:
  order: 1
---

This page explains how OpenResto's booking features work, and the API fields, error codes and
settings behind them. The [changelog](https://github.com/karanshukla/openresto/blob/main/CHANGELOG.md)
tells you when each feature arrived. To call the API, see the [API guide](/api/authentication/).
For the native app, reminders and Wallet passes, see the [native app guide](/guides/native-app/).

When a request is rejected, the reply includes an error code in the `code` field, plus a message
in the caller's language.

## Opening hours and schedules

Use these settings to say when each location takes bookings.

- **Per-day hours.** Each day of the week can have its own open and close times. A service
  that closes after midnight belongs to the day it opened, so Saturday's 18:00–02:00 slots are
  Saturday's.
- **Slot interval.** Bookings start on a 15, 30 or 60 minute grid (default 30). This is separate
  from how long a booking lasts.
- **Schedule conflicts.** Changing hours, dropping an open day or changing the timezone never
  touches existing bookings. If some upcoming bookings no longer fit, the Locations page lists
  them and the dashboard shows the total. A walk-in-only day does not count as a conflict,
  because the location is still open. You can also list them from the CLI with
  `openresto locations conflicts`.
- **Timezone changes.** Bookings are stored in UTC, so the guest is still expected at the same
  real moment. The local time in their confirmation email, however, is now out of date. Nothing is
  re-sent. The admin shows a warning when the location has upcoming bookings.

## Booking length (turn times)

A location has a default booking length. Turn-time rules let larger parties stay longer. Each
rule is a party size and a length, and a party gets the rule with the largest party size at or
below its own. A party smaller than every rule gets the default.

- API: `turnTimes` on the restaurant, e.g. `[{ "minSeats": 3, "minutes": 90 }]`. On update,
  `null` leaves the rules alone and `[]` clears them.
- Availability, holds, auto-assign, admin bookings, waitlist seating and wait estimates all use
  the party's own length. Because of that, a hold request includes the party size.
- An existing booking keeps the length it was booked with.

## Booking status

Status tracks what happens on the day. It sits alongside cancellation, not instead of it. A
booking moves forward through **Booked → Arrived → Seated → Finished**, or **Booked → No-show**.

- No-show is offered once the sitting has started.
- You can undo the last change for 5 minutes.
- Finishing early or marking a no-show ends the sitting at that moment, so the table is free
  for availability, holds and the waitlist. Undoing restores the original end time.
- Parties seated from the waitlist start as Seated.
- In the bookings list, an unmarked booking reads **Due** once its sitting starts and
  **Unmarked** once it ends.
- A guest's no-show count comes from their bookings under the same email, across every
  location. It is not stored, so the GDPR purge removes it along with the bookings.
- Guests don't see status, and nothing is charged or blocked for a no-show.

API: `POST /api/admin/bookings/{id}/status` with `{ "status": "Seated" }` (`bookings:write`,
audited as `booking.status`). Admin booking reads carry `status`, `nextStatuses`,
`undoStatus` and `previousNoShows`; the last is withheld from keys without `guests:read`.
`status=noshow` filters the list.

## Walk-ins

Use these settings when you want to keep some capacity for people who arrive without booking.

- **Walk-in-only location or days.** The location stays listed, but online booking is
  replaced by a walk-in notice. Holds and bookings are declined and availability is empty.
  Staff can still record bookings from the admin.
- **Walk-in-only table.** One table is kept for the door every day. It is not offered
  online, auto-assign skips it, and a booking or hold that names it is declined with
  `table.walk_in_only` (409). A combinable group containing it is held back too. Staff and
  the waitlist can still seat it. API: `walkInOnly` on tables.

## Walk-in waitlist

The waitlist lets guests queue for a table. It is available online while a location is
walk-in-only and open. Staff can add parties at the door on any day.

- The guest picks a party size, sees the estimated wait, and leaves a name and, if they like, an
  email. Their ticket shows their place in the queue and the estimated wait, and has its own
  page at `/waitlist/{ref}`.
- **Call** tells the guest their table is ready: on the ticket, by push if they opted in, and by
  email if they left an address and SMTP is configured. **Seat** turns the entry into a normal
  booking on the smallest free table that fits.
- Estimates replay the queue against the floor: each table frees when its current sitting ends,
  and each party takes the first suitable table to free up, for a sitting of its own length.
- Sometimes a party could be seated now but is quoted a wait, because the replay gave the free
  table to a party ahead. The board shows "Free now, skips #N" for these. API: `skipsNumber` on
  board entries.
- An entry still waiting 6 hours after joining expires. Every entry is deleted after 7 days,
  since it holds a name and email.
- Admin endpoints are under the `bookings` scope, with names and emails withheld from keys
  without `guests:read`. There is no SMS.

## Cover pacing

Pacing helps you spread arrivals out. `maxCoversPerSlot` caps how many guests can **start** in
one booking slot (`null` means no cap). Parties already seated from an earlier slot don't count.

- A slot the party would overfill is not offered. If two guests race for the last seats, the
  later booking is declined with `booking.pacing_full` (409), which includes the cap and how many
  seats remain.
- A booking at an off-grid time counts in the slot it falls in (19:10 counts in 19:00).
- Staff bookings and waitlist seating aren't limited, but they still count toward the total.
- The cap applies per slot, so a location on a 15-minute grid gets a tighter limit than one on 30.
- The admin overview carries `todayPacing` for the dashboard's "Arrivals per Slot Today" card.

## Pausing bookings

A pause closes sittings that **start** inside the pause window. Think of it as "stop seating new
arrivals for the next hour", not "stop taking bookings". Bookings for later tonight or next
week are unaffected, and the message the guest sees names the local time the pause ends.

## Tables and combinable groups

- **Groups** mark tables that can be pushed together. A group seats more than its largest
  table and no more than the total of its tables. Each table in a group can still be booked on
  its own. Auto-assign fills single tables first, then grouped tables, then groups.
- Booking a group blocks each of its tables, and booking one of its tables blocks the group.
- Deleting or resizing a table in a group shrinks the group to fit, or removes it if fewer
  than two tables are left.
- **Oversize cap.** `maxTableOversizeSeats` on the restaurant limits how many spare seats an
  auto-assigned table can have beyond the party size.
- Deleting a table or section keeps its bookings and clears their table or section. The delete
  confirmation shows how many upcoming bookings are affected.
- Seat counts are 1–50.

## Menus

Each location can have any number of menus ("Lunch", "Drinks"), each with ordered categories
and dishes. Guests see a menu only once it is **published**. Menus are edited in the admin under
**Menus** (Owners and Managers), or through the API under `/api/admin/restaurants/{id}/menus`
with an API key carrying the `menus` scope (`read` or `write`).

In the editor, categories and dishes are reordered with the arrows beside them, and dishes,
categories and menus save as you edit. **Service mode** lists every dish of the published menus
as one large button that flips it between available and sold out; it is the one admin screen
built for a phone, so it opens below the admin's usual 600px width.

- **Prices** are whole numbers in the currency's smallest unit (`priceMinor`: 1250 is €12.50).
  Leave the price empty for "price on request"; 0 means free. Each menu has one ISO 4217
  currency (`EUR` by default, set per menu in the editor). A new menu in the admin starts in
  the currency of the location's first menu. In French, euros read `9,00 €`.
- **Allergens** are the 14 the EU requires a menu to declare (`Gluten`, `Crustaceans`, `Eggs`,
  `Fish`, `Peanuts`, `Soybeans`, `Milk`, `Nuts`, `Celery`, `Mustard`, `Sesame`, `Sulphites`,
  `Lupin`, `Molluscs`). Dietary tags are `Vegetarian`, `Vegan` and `GlutenFree`.
- A dish is `Available`, `SoldOut` (shown, marked) or `Hidden` (left out of the public menu). A
  category can be hidden too.
- Dish photos are JPEG, PNG or WebP under 2 MB, and the file's own bytes have to match the
  type it declares. Each is stored under a random name, so the public photo URL does not reveal
  a dish id. Deleting a dish, a category or a menu deletes
  the photos that go with it.
- Reordering takes the full list of ids in the new order; a list that leaves one out, repeats
  one or names another menu's is refused with `menu.reorder_ids_mismatch`.

**Public menu links.** Every location and every table has a public token, the value a QR code
carries. `GET /api/menus/r/{token}` returns the location's published menus and
`GET /api/menus/t/{token}` the same plus the table's name. No account is needed, and no internal
id appears in the response. An unknown token, an archived location and a location with nothing
published all return the same 404 (`menu.not_found`). A token never changes on its own: an
Owner can regenerate it (`POST .../public-token/regenerate`, or
`.../tables/{tableId}/public-token/regenerate`), which retires every QR code printed with the
old one.

**QR codes and the public page.** The admin's **QR codes** page draws a code for the location
and one for each table in the browser (no outside service is called), black on white whatever
the brand colour. Each can be downloaded as PNG or SVG, and the page prints an A4 sheet with six
table codes to a page and A6 easel cards, one code each. A code carries the instance's website
address when one is set under Brand, and the address the admin is open on otherwise; the address
is printed under every code so you can check it before printing. A code opens
`/menu/r/{token}` or `/menu/t/{token}`, a page that opens in French for a guest who has not
picked a language (the language picker is on the page), lets a guest filter by diet and avoid
allergens, shows sold-out dishes greyed and marked, and ends in a **Book a table** button into
the booking flow. The filters rely on what the restaurant declared for each dish, and the page
says so.

## Website ("Mon site")

Every location can have a one-page public website, generated from what the location already
holds: name, address, opening hours, phone, e-mail, published menus. It lives at
`/r/{address}` (for example `/r/brasserie-de-la-senne-doree`), in French, with a header (logo,
cover photo, tagline), a **Book a table** button into the booking flow, the menu, the opening
hours, a map link, click-to-call, social links, a gallery of up to six photos and the legal
notice. It is edited in the admin under **Mon site** (Owners and Managers), or through the API
under `/api/admin/restaurants/{id}/site` with an API key carrying the `sites` scope.

- **Three looks**: `Brasserie` (warm paper, serif headings), `Gastronomique` (dark, spaced
  capitals) and `Cafe` (light, rounded, tinted with the brand colour). The main colour is the
  brand colour from **Settings → Brand**. A colour that would be hard to read as text is darkened
  or lightened, keeping its hue, until it meets WCAG AA contrast on the page.
- **Preview** shows the page as it would render now, marked as a draft and kept out of search
  engines, and shows another theme without saving it (`GET .../site/preview?theme=Cafe`).
- **Publishing** is a switch. A site cannot go live until it has a **legal name**, a **company
  number**, a **contact e-mail** (the location's, or the brand's) and a public **website
  address** for the instance (set under **Brand** or `WEBSITE_URL`), because the page's canonical
  link, Open Graph tags and sitemap must not name `localhost`. The screen lists what is missing,
  and the API answers `site.not_publishable`. Clearing the legal fields on a live site is refused
  for the same reason; unpublishing always works. An unpublished site, an unknown address
  and an archived location all answer the same 404 page.
- **The address** is derived from the location's name (`Brasserie de la Senne Dorée` becomes
  `brasserie-de-la-senne-doree`) and can be changed: lower-case letters, digits and single
  hyphens, 3 to 60 characters, one site per address. Changing it breaks links already given out.
- **Photos** are JPEG, PNG or WebP up to 6 MB. The server shrinks them for the web (1600 px for
  the cover, 1200 px for the gallery, 480 px for the logo), turns them into JPEG (the logo stays
  PNG, so it keeps its transparency), applies the camera's rotation and **drops everything the
  camera wrote into the file**, GPS position included. Each gallery photo needs a text
  description, which becomes its `alt`; the gallery holds at most six (`site.photos_full`).
  Files are stored under random names, so a public photo URL reveals no id.
- **Social links** are `Facebook`, `Instagram`, `TikTok`, `X`, `YouTube`, `TripAdvisor` and
  `LinkedIn`, one per network, `https` only.
- **No cookie, no tracker, no third-party request.** The page is a single HTML document with an
  inline stylesheet, system fonts and no script (the one exception is a data block for search
  engines, which is not executable). A `Content-Security-Policy` allows only this origin's images
  and that one stylesheet, so there is no cookie banner to show. Like any web server, yours still
  keeps technical access logs (IP address and time of each request), and the page's legal notice
  says so. The map link is a plain link to OpenStreetMap that the visitor follows; nothing is
  loaded from it.
- **Search engines** get a title and description, a canonical address, Open Graph tags, a
  schema.org `Restaurant` description (hours, address, menu with prices and allergen-related
  diets, reservation action), and a `/sitemap.xml` of the live sites. `/robots.txt` keeps
  crawlers out of the admin and the API and names the sitemap. Absolute addresses come from the
  website address set under **Brand** (or `WEBSITE_URL`).
- **The booking button** goes to `/r/{address}/reserver`, which redirects into the location's
  booking flow, so the page itself holds no internal id. A walk-in-only location has no button
  and says so.
- **The menu** on the page is the published menus exactly as the QR page shows them: unpublished
  menus, hidden categories and hidden dishes never appear, sold-out dishes are marked and greyed
  with the theme's muted text colour (never by fading the row, which would drop the allergen line
  below readable contrast).

If you run your own reverse proxy instead of the bundled nginx, send `/r/*`, `/sitemap.xml` and
`/robots.txt` to the backend, next to `/api/`.

## Booking references

- The **word** format (default) ends in four random digits: `crispy-basil-thyme-0482`. The
  **numeric** format is 8 digits with no leading zero. You set the format per location.
- References are generated with a cryptographically secure random number generator. Every
  reference ever issued still works, whatever the location's current format.
- Guest endpoints that take a reference (lookup, cancel, reminders, waitlist tickets) allow
  10 requests per minute per IP, so nobody can guess references by trying thousands. The limit
  is built in. Guests sharing one IP address share it too, so make sure your proxy forwards
  `X-Forwarded-For` (see [HTTPS](/self-hosting/https/)).

## Locations: archive and delete

Deleting a location removes its sections, tables and bookings, so you archive it first. The
server won't delete an active location. Restoring an archived location takes one press.
Only an Owner can delete, and `GET /api/admin/restaurants/{id}/delete-preview` returns the
counts shown in the confirmation.

## Contact details

A location's phone and email override the brand-wide defaults **per field**, so a location
that lists only a phone still shows the brand email. Social links are set for the whole brand only.

## Admin accounts and roles

- **Owner** can also manage users, API keys and the activity log, and delete locations.
  **Manager** can do everything else.
- There is always at least one active Owner. You can't deactivate yourself or change your own
  role.
- The first account is created from `ADMIN_EMAIL`/`ADMIN_PASSWORD` on first start.

## Activity log

Every change made through the admin or an API key is recorded at **Activity** (Owner only),
including declined attempts and failed sign-ins. Entries name the API key when one was used.

- Entries don't hold passwords, secrets or guest names, emails or phone numbers. Bookings are
  referred to by reference.
- Entries can't be edited or deleted by hand. They are removed after `Audit:RetentionDays`
  (default 365).

## Autosave

Brand and location settings save 800 ms after you stop typing, and you get a 10-second undo.
If a value isn't valid, it isn't sent and the form tells you why. SMTP settings, password
changes, booking edits and deletes need an explicit press.

## Language

OpenResto speaks English, French, Spanish, German and Dutch. Dutch covers the guest pages (home,
locations, booking, confirmation and lookup) but not the admin, which shows French, then English,
for a Dutch visitor. It uses the visitor's own choice first, then the language the visitor's
browser asks for, then the instance default (`OPENRESTO_DEFAULT_LOCALE` or `Locale:Default`),
then English. The native app follows the phone's language instead of the browser's, and the
admin ignores the browser's language and follows the instance default.

## Configuration reference

| Setting                                                                           | Purpose                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `OPENRESTO_DEFAULT_LOCALE` / `Locale:Default`                                     | Default language (`en`, `fr`, `es`, `de`)                    |
| `Audit:RetentionDays`                                                             | Days to keep activity log entries (default 365)              |
| `GuestPush__ReminderLeadHours`                                                    | Reminder times before a booking, in hours (default `24,2`)   |
| `Wallet__Apple__*`, `Wallet__Google__*`                                           | Wallet pass issuers, see [native app guide](/guides/native-app/)    |
| `Vapid__*`                                                                        | Web Push keys for admin notifications and browser reminders  |
| `OPENRESTO_CLI_PACKAGE_URL`, `OPENRESTO_API_DOCS_URL`, `OPENRESTO_REPOSITORY_URL` | Where the API Keys screen links, for forks                   |
| `WEBSITE_URL`                                                                     | Public address for email links, if not set in brand settings |
