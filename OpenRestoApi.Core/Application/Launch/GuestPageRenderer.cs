using System.Text;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using static OpenRestoApi.Core.Application.Launch.LaunchPageRenderer;

namespace OpenRestoApi.Core.Application.Launch;

public sealed record GuestSlot(string Value, string Label);

public static class GuestPageRenderer
{
    public static LaunchPage Locations(string baseUrl, IReadOnlyList<RestaurantDto> restaurants, IReadOnlyDictionary<int, string> sites)
    {
        var body = new StringBuilder("<p class=\"eyebrow\">Pour les clients</p><h1>Trouvez votre prochaine table.</h1><p class=\"lead\">Choisissez un restaurant, consultez ses disponibilités et réservez sans créer de compte.</p><div class=\"grid\">");
        foreach (RestaurantDto restaurant in restaurants)
        {
            body.Append("<article class=\"card\"><h2>").Append(E(restaurant.Name)).Append("</h2><p>")
                .Append(E(restaurant.Address ?? "Adresse à confirmer auprès du restaurant")).Append("</p><p><a class=\"cta\" href=\"/locations/")
                .Append(restaurant.Id).Append("\">Voir ").Append(E(restaurant.Name)).Append("</a></p>");
            if (sites.TryGetValue(restaurant.Id, out string? slug))
                body.Append("<a href=\"/r/").Append(E(slug)).Append("\">Le site et la carte</a>");
            body.Append("</article>");
        }
        body.Append("</div>");
        if (restaurants.Count == 0) body.Append("<p class=\"notice\">Les premiers restaurants arrivent bientôt. Revenez nous voir prochainement.</p>");
        return Page("Trouver un restaurant et réserver une table | OpenResto", "Consultez les restaurants et réservez une table en ligne, sans créer de compte.", baseUrl, "/locations", body.ToString(), "/");
    }

    public static LaunchPage Restaurant(string baseUrl, RestaurantDto restaurant, string date, int seats, string minimumDate, string maximumDate, IReadOnlyList<GuestSlot> slots, string? siteSlug)
    {
        var body = new StringBuilder("<div class=\"form-card\"><a href=\"/locations\">Tous les restaurants</a><h1>");
        body.Append(E(restaurant.Name)).Append("</h1><p>").Append(E(restaurant.Address ?? "")).Append("</p>");
        if (siteSlug is not null) body.Append("<p><a href=\"/r/").Append(E(siteSlug)).Append("\">Consulter le site et la carte</a></p>");
        body.Append("<p class=\"small\">Les horaires sont indiqués à l’heure du restaurant.</p><section aria-labelledby=\"availability-title\"><h2 id=\"availability-title\">Votre table</h2>")
            .Append("<form method=\"get\" data-testid=\"public-availability\"><label for=\"date\">Date</label><input type=\"date\" id=\"date\" name=\"date\" required min=\"")
            .Append(E(minimumDate)).Append("\" max=\"").Append(E(maximumDate)).Append("\" value=\"").Append(E(date))
            .Append("\"><label for=\"seats\">Nombre de couverts</label><input type=\"number\" id=\"seats\" name=\"seats\" min=\"1\" max=\"")
            .Append(BookingLimits.MaxSeats).Append("\" required value=\"").Append(seats)
            .Append("\"><div class=\"actions\"><button type=\"submit\">Voir les disponibilités</button></div></form></section>");
        if (slots.Count == 0)
        {
            body.Append("<p class=\"notice\" role=\"status\">Aucun créneau disponible pour cette date et ce nombre de couverts. Essayez une autre date ou contactez le restaurant.</p>");
            if (Site.SiteFormat.PhoneHref(restaurant.PhoneNumber) is { } phone)
                body.Append("<a href=\"").Append(E(phone)).Append("\">Appeler le restaurant</a>");
        }
        else
        {
            body.Append("<section aria-labelledby=\"book-title\"><h2 id=\"book-title\">Réserver une table</h2><form id=\"guest-booking\" method=\"post\" data-restaurant-id=\"")
                .Append(restaurant.Id).Append("\" data-seats=\"").Append(seats).Append("\" data-timezone=\"").Append(E(restaurant.Timezone))
                .Append("\" data-name=\"").Append(E(restaurant.Name)).Append("\"><label for=\"slot\">Heure</label><select id=\"slot\" name=\"slot\" required>");
            foreach (GuestSlot slot in slots)
                body.Append("<option value=\"").Append(E(slot.Value)).Append("\">").Append(E(slot.Label)).Append("</option>");
            body.Append("</select><label for=\"customerName\">Nom complet</label><input id=\"customerName\" name=\"customerName\" autocomplete=\"name\" maxlength=\"")
                .Append(BookingLimits.MaxCustomerNameLength).Append("\" required><label for=\"customerEmail\">Adresse e-mail</label><input id=\"customerEmail\" name=\"customerEmail\" type=\"email\" autocomplete=\"email\" maxlength=\"")
                .Append(ContactLimits.MaxEmailLength).Append("\" required><label for=\"specialRequests\">Demandes particulières (facultatif)</label><textarea id=\"specialRequests\" name=\"specialRequests\" rows=\"3\" maxlength=\"")
                .Append(BookingLimits.MaxSpecialRequestsLength).Append("\"></textarea><p class=\"small\">Votre nom et votre e-mail servent à gérer cette réservation. Évitez les informations sensibles dans les demandes particulières. <a href=\"/legal/privacy\">Confidentialité</a>.</p><div class=\"actions\"><button type=\"submit\" disabled>Confirmer la réservation</button></div></form><noscript><p class=\"notice\">Activez JavaScript pour confirmer votre réservation en ligne, ou contactez directement le restaurant.</p></noscript></section>");
        }
        body.Append(Result()).Append("</div>");
        return Page($"Réserver chez {restaurant.Name} | OpenResto", $"Consultez les disponibilités de {restaurant.Name} et réservez votre table en ligne.", baseUrl, $"/locations/{restaurant.Id}", body.ToString(), "/", script: GuestInteraction.Script);
    }

    public static LaunchPage Lookup(string baseUrl, string? reference = null)
    {
        string body = $$"""
            <div class="form-card"><h1>Retrouver ma réservation</h1><p>Utilisez la référence de votre confirmation et l’adresse e-mail utilisée pour réserver.</p><form id="guest-lookup" method="post"><label for="reference">Référence de réservation</label><input id="reference" name="reference" value="{{E(reference ?? "")}}" required maxlength="100" autocomplete="off"><label for="email">Adresse e-mail</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="{{ContactLimits.MaxEmailLength}}"><div class="actions"><button type="submit" disabled>Rechercher ma réservation</button></div></form><noscript><p class="notice">Activez JavaScript pour retrouver votre réservation en ligne, ou contactez le restaurant.</p></noscript>{{Result()}}</div>
            """;
        return Page("Retrouver ma réservation | OpenResto", "Retrouvez votre réservation avec sa référence et votre adresse e-mail.", baseUrl, "/lookup", body, "/", noIndex: true, script: GuestInteraction.Script);
    }

    private static string Result() => """
        <p id="guest-status" class="notice" role="status" aria-live="polite" hidden></p><section id="guest-result" data-testid="result-panel" hidden aria-labelledby="result-title"><h2 id="result-title" tabindex="-1"></h2><p id="result-details"></p><p>Votre référence : <strong id="result-reference"></strong></p><p class="small">Conservez cette référence et votre adresse e-mail pour retrouver votre réservation.</p><button id="guest-cancel" type="button" hidden>Annuler ma réservation</button></section>
        """;

    public static LaunchPage Menu(string baseUrl, PublicMenuResponse response, string path)
    {
        var body = new StringBuilder("<h1>");
        body.Append(E(response.Restaurant.Name)).Append("</h1><p class=\"lead\">La carte du restaurant</p><p class=\"notice\">Les informations sont déclarées par le restaurant. En cas d’allergie, contactez l’équipe. L’absence d’une indication ne garantit pas l’absence d’allergène.</p>");
        foreach (PublicMenuDto menu in response.Menus)
        {
            body.Append("<section><h2>").Append(E(menu.Name)).Append("</h2><p>").Append(E(menu.Description ?? "")).Append("</p>");
            foreach (PublicMenuCategoryDto category in menu.Categories)
            {
                body.Append("<h3>").Append(E(category.Name)).Append("</h3><p>").Append(E(category.Description ?? "")).Append("</p><div class=\"grid\">");
                foreach (PublicMenuItemDto item in category.Items)
                {
                    bool soldOut = item.Availability == "SoldOut";
                    body.Append("<article class=\"card").Append(soldOut ? " soldout" : "").Append("\"><h4>").Append(E(item.Name)).Append("</h4><p>")
                        .Append(E(item.Description ?? "")).Append("</p><p>").Append(E(item.PriceMinor is { } price ? Site.SiteFormat.Price(price, menu.Currency) : "Prix sur demande")).Append("</p>");
                    if (soldOut) body.Append("<p><strong>Indisponible</strong></p>");
                    MenuFields.TryParseFlags(item.Allergens, out Allergens allergens);
                    MenuFields.TryParseFlags(item.DietaryTags, out DietaryTags diets);
                    var allergenLabels = Site.SiteFormat.AllergenLabels(allergens);
                    var dietLabels = Site.SiteFormat.DietLabels(diets);
                    if (allergenLabels.Count > 0) body.Append("<p>Allergènes : ").Append(E(string.Join(", ", allergenLabels))).Append("</p>");
                    if (dietLabels.Count > 0) body.Append("<p>").Append(E(string.Join(", ", dietLabels))).Append("</p>");
                    if (item.ImageUrl is { } image && image.StartsWith("/media/", StringComparison.Ordinal))
                        body.Append("<img class=\"dish-photo\" width=\"640\" height=\"480\" loading=\"lazy\" src=\"").Append(E(image)).Append("\" alt=\"").Append(E(item.Name)).Append("\">");
                    body.Append("</article>");
                }
                body.Append("</div>");
            }
            body.Append("</section>");
        }
        body.Append("<div class=\"actions\"><a class=\"cta\" href=\"/locations/").Append(response.Restaurant.Id).Append("\">Réserver une table</a></div>");
        return Page($"La carte de {response.Restaurant.Name} | OpenResto", $"Consultez les plats, prix et allergènes déclarés par {response.Restaurant.Name}.", baseUrl, path, body.ToString(), "/", noIndex: true);
    }
}
