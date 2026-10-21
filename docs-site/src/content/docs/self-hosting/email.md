---
title: Email
description: Connect an SMTP account so guests get booking confirmations.
sidebar:
  order: 5
---

This page helps you send booking confirmation emails. OpenResto sends mail through any SMTP
account (the outgoing mail account from your email provider). Email is optional. Without it,
bookings still work and guests just don't get a confirmation email.

## Configure it in the admin

SMTP is set in the admin (the note at the end covers pre-filling it from `.env`). Go to **Settings → Email** and fill in:

| Field                  | Notes |
| ---------------------- | ----- |
| Host and port          | From your provider, e.g. `smtp.example.com` and `587`. |
| Username and password  | The password is stored encrypted in the database and not shown again. |
| Use SSL                | See below. |
| From name and address  | What guests see. Many providers need this to be an address you have verified. |
| Send booking confirmation emails | Off by default. Turn it on once the test passes. |

Press **Send a test email** before you rely on it. It saves the settings and tries to connect,
so a wrong host or password shows up straight away. The same page shows a preview of the
confirmation guests receive, and a list of recent send failures.

### Port and encryption

- **Port 587** always uses STARTTLS, whatever the SSL toggle says. Most providers use this.
- **Any other port** uses an implicit TLS connection (`465`) when **Use SSL** is on, and an
  unencrypted connection when it is off. Only turn SSL off for a relay on a network you trust.

## What gets sent

- Booking confirmations and cancellations to the guest, when confirmations are enabled.
- "Table ready" notices for the walk-in waitlist.

Emails link back to your site using your public address: the **Website URL** in the brand
settings if set, otherwise `WEBSITE_URL`, otherwise the first entry of `CORS_ORIGINS`. See
[Which URL goes where](/self-hosting/domains-and-urls/).

## If mail does not arrive

1. Re-run the test in **Settings → Email**.
2. Check the provider's own log. Common causes are a sender address the provider hasn't
   verified, or SPF/DKIM (settings that prove mail is really from your domain) not set up,
   which can send the mail to spam.
3. Look at the backend logs: `docker compose logs backend`.

:::note
The `EmailSettings__*` variables (`SMTP_HOST`, `SMTP_PORT`, … in the compose files) fill this page
once: on a start where no email settings have been saved yet and a host is set. After that the
admin page is the source of truth and the variables are ignored, so change the password here, not
in `.env`.
:::
