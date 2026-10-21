using System.Net;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Mappings;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Services;

/// <inheritdoc cref="IEmailTemplateService" />
public sealed class EmailTemplateService : IEmailTemplateService
{
    // The en-dash (U+2013) is verbatim from the original inline subject and is deliberately not
    // a hyphen.
    public string BuildConfirmationSubject(Restaurant restaurant, string? language = null) =>
        string.Format(BookingEmailCopy.For(language).SubjectFormat, restaurant.Name);

    public string BuildConfirmationEmail(
        Booking booking, Restaurant restaurant, BrandSettings brand, string websiteUrl, string? language = null)
    {
        BookingEmailCopy copy = BookingEmailCopy.For(language);

        DateTime localDate = TimeZoneHelper.ConvertUtcToLocal(booking.Date, restaurant.Timezone);
        string dateStr = DateFormatter.FormatLongDate(localDate, language);

        // EndTime is always set by CreateBookingAsync before this is called.
        DateTime localEndDate = TimeZoneHelper.ConvertUtcToLocal(booking.EndTime!.Value, restaurant.Timezone);
        string timeRangeStr = DateFormatter.FormatTimeRange(localDate, localEndDate, language);

        string primaryColor = brand.PrimaryColor ?? "#0a7ea4";
        string appName = brand.AppName ?? "Open Resto";
        string cleanWebsiteUrl = websiteUrl.TrimEnd('/');
        string lookupUrl = BookingLinks.Confirmation(cleanWebsiteUrl, booking);

        // Choose header: full-width banner for restaurant photos, small icon for brand SVG, plain text otherwise
        string headerHtml;
        if (!string.IsNullOrEmpty(restaurant.ImageUrl))
        {
            string imageSrc = restaurant.ImageUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? restaurant.ImageUrl
                : $"{cleanWebsiteUrl}/{restaurant.ImageUrl.TrimStart('/')}";
            headerHtml = EmailTemplateBuilder.BannerHeader(imageSrc, restaurant.Name, restaurant.Name, copy.Heading);
        }
        else if (!string.IsNullOrEmpty(brand.FaviconIcon))
        {
            headerHtml = EmailTemplateBuilder.IconHeader(
                $"{cleanWebsiteUrl}/api/brand/pwa-icon.svg", appName, restaurant.Name, copy.Heading);
        }
        else
        {
            headerHtml = $"""
                <tr><td style="padding:40px 40px 24px;text-align:center;background-color:#ffffff;">
                  <h1 style="margin:0;font-size:24px;font-weight:700;color:#111827;">{WebUtility.HtmlEncode(restaurant.Name)}</h1>
                  <p style="margin:8px 0 0;font-size:16px;color:#6b7280;">{copy.Heading}</p>
                </td></tr>
                """;
        }

        string directionsHtml = string.IsNullOrWhiteSpace(restaurant.Address)
            ? ""
            : $"""
               <div style='margin-top:16px;padding-top:16px;border-top:1px solid #f0f0f0;'>
                 <p style='margin:0 0 8px;font-size:14px;color:#6b7280;'>{copy.Location}</p>
                 <p style='margin:0 0 12px;font-size:15px;color:#111827;'>{WebUtility.HtmlEncode(restaurant.Address)}</p>
                 <a href='https://www.google.com/maps/search/?api=1&query={Uri.EscapeDataString(restaurant.Address)}'
                    style='color:{primaryColor};text-decoration:none;font-size:14px;font-weight:600;'>{copy.Directions}</a>
               </div>
               """;

        string sectionHtml = booking.Section != null
            ? $"""
               <tr>
                 <td style='padding:12px 0;color:#6b7280;font-size:14px;'>{copy.Section}</td>
                 <td style='padding:12px 0;font-size:14px;color:#111827;'>{WebUtility.HtmlEncode(booking.Section.Name)}</td>
               </tr>
               """
            : "";

        string? tableLabel = booking.Table?.Name
            ?? (booking.TableId.HasValue ? string.Format(copy.TableByIdFormat, booking.TableId) : null);
        // Combinable-table group booking: Table is null, so fall back to a readable group label so
        // the confirmation email still tells the diner what they reserved.
        tableLabel ??= booking.TableGroup is not null ? BookingMapper.GroupLabel(booking.TableGroup) : null;
        string tableHtml = tableLabel != null
            ? $"""
               <tr>
                 <td style='padding:12px 0;color:#6b7280;font-size:14px;'>{copy.Table}</td>
                 <td style='padding:12px 0;font-size:14px;color:#111827;'>{WebUtility.HtmlEncode(tableLabel)}</td>
               </tr>
               """
            : "";

        string specialReqsHtml = string.IsNullOrWhiteSpace(booking.SpecialRequests)
            ? ""
            : $"""
               <tr>
                 <td style='padding:12px 0;color:#6b7280;font-size:14px;vertical-align:top;white-space:nowrap;'>{copy.SpecialRequests}</td>
                 <td style='padding:12px 0 12px 16px;font-size:14px;color:#111827;'>{WebUtility.HtmlEncode(booking.SpecialRequests)}</td>
               </tr>
               """;

        string greetingName = string.IsNullOrWhiteSpace(booking.CustomerName)
            ? copy.GreetingAnonymous
            : string.Format(copy.GreetingNamedFormat, WebUtility.HtmlEncode(booking.CustomerName));

        string contentHtml = $"""
            <!-- Confirmation Hero -->
            <tr><td style="padding:0 40px;">
              <div style="background-color:{primaryColor}10;border-radius:12px;padding:24px;text-align:center;border:1px solid {primaryColor}20;">
                <p style="margin:0;font-size:18px;font-weight:600;color:{primaryColor};">{greetingName}</p>
                <p style="margin:4px 0 0;font-size:14px;color:{primaryColor};opacity:0.8;">{copy.LookingForward}</p>
              </div>
            </td></tr>

            <!-- Details -->
            <tr><td style="padding:32px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:12px 0;color:#6b7280;font-size:14px;width:140px;">{copy.Reference}</td>
                  <td style="padding:12px 0;font-size:14px;font-weight:700;color:#111827;letter-spacing:0.05em;">{WebUtility.HtmlEncode(booking.BookingRef ?? "")}</td>
                </tr>
                <tr>
                  <td style="padding:12px 0;color:#6b7280;font-size:14px;">{copy.Date}</td>
                  <td style="padding:12px 0;font-size:14px;color:#111827;">{dateStr}</td>
                </tr>
                <tr>
                  <td style="padding:12px 0;color:#6b7280;font-size:14px;">{copy.Time}</td>
                  <td style="padding:12px 0;font-size:14px;color:#111827;">{timeRangeStr}</td>
                </tr>
                <tr>
                  <td style="padding:12px 0;color:#6b7280;font-size:14px;">{copy.Guests}</td>
                  <td style="padding:12px 0;font-size:14px;color:#111827;">{booking.Seats} {(booking.Seats == 1 ? copy.GuestOne : copy.GuestMany)}</td>
                </tr>
                {sectionHtml}
                {tableHtml}
                {specialReqsHtml}
              </table>
              {directionsHtml}
            </td></tr>

            <!-- CTA -->
            <tr><td style="padding:0 40px 32px;text-align:center;">
              <a href="{lookupUrl}" style="display:inline-block;background-color:{primaryColor};color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">{copy.Manage}</a>
            </td></tr>

            <!-- Cancellation note -->
            <tr><td style="padding:0 40px 32px;text-align:center;">
              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5;">{copy.ChangeOrCancel}</p>
            </td></tr>
            """;

        return EmailTemplateBuilder.Wrap(primaryColor, appName, cleanWebsiteUrl, headerHtml, contentHtml);
    }
}
