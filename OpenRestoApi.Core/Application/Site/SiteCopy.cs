using System.Globalization;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Site;

/// <summary>
/// Every fixed word of a public site, once per language, with the number format that goes with
/// it. The renderer and the structured data read from here and hold no wording of their own, so a
/// language is complete when its table is. Fixed rather than looked up in culture data: the slim
/// images this ships in carry no ICU, so <c>fr-BE</c> or <c>nl-BE</c> would quietly format like
/// the invariant culture there.
/// </summary>
/// <seealso>SiteCopyTests.EveryLanguage_FillsEveryString</seealso>
/// <seealso>SiteCopyTests.For_FallsBackToFrench_ForAnythingButNl</seealso>
public sealed class SiteCopy
{
    private const string NoBreakSpace = " ";
    private const string NarrowNoBreakSpace = " ";

    public required string Language { get; init; }

    /// <summary>The Open Graph locale, region included.</summary>
    public required string OgLocale { get; init; }

    /// <summary>The language's own name, for the switch's accessible label.</summary>
    public required string LanguageName { get; init; }

    public required string SwitchLabel { get; init; }
    public required string SkipLink { get; init; }
    public required string DraftBanner { get; init; }

    public required string BookTable { get; init; }
    public required string SeeMenu { get; init; }
    public required string Call { get; init; }
    public required string NoOnlineBooking { get; init; }

    public required string NavLabel { get; init; }
    public required string NavMenu { get; init; }
    public required string NavHours { get; init; }
    public required string NavGallery { get; init; }
    public required string NavContact { get; init; }

    public required string MenuHeading { get; init; }
    public required string AllergenNote { get; init; }
    public required string PriceOnRequest { get; init; }
    public required string SoldOut { get; init; }
    public required string AllergensPrefix { get; init; }

    public required string HoursHeading { get; init; }
    public required string HoursCaption { get; init; }
    public required string Closed { get; init; }
    public required IReadOnlyList<string> Days { get; init; }

    public required string GalleryHeading { get; init; }

    public required string FindUsHeading { get; init; }
    public required string ViewOnMap { get; init; }
    public required string OpensInNewTab { get; init; }
    public required string PhonePrefix { get; init; }
    public required string EmailPrefix { get; init; }
    public required string SocialLabel { get; init; }

    public required string LegalHeading { get; init; }
    public required string LegalEstablishment { get; init; }
    public required string LegalCompanyName { get; init; }
    public required string LegalCompanyNumber { get; init; }
    public required string LegalVatNumber { get; init; }
    public required string LegalSeat { get; init; }
    public required string LegalContact { get; init; }
    public required string NoCookies { get; init; }
    public required string PrivacyPolicy { get; init; }

    public required string NotFoundTitle { get; init; }
    public required string NotFoundBody { get; init; }

    public required string TitleWithBooking { get; init; }
    public required string TitleWithoutBooking { get; init; }
    public required string DescriptionWithBooking { get; init; }
    public required string DescriptionWithoutBooking { get; init; }

    public required Func<string, string> LogoAlt { get; init; }
    public required Func<string, string> DefaultLead { get; init; }
    public required Func<string, string> MenuName { get; init; }

    public required IReadOnlyList<(Allergens Flag, string Label)> AllergenTable { get; init; }
    public required IReadOnlyList<(DietaryTags Flag, string Label)> DietTable { get; init; }

    public required string DecimalSeparator { get; init; }
    public required string GroupSeparator { get; init; }

    /// <summary>True when the currency is written before the amount (<c>€ 12,50</c>), false after (<c>12,50 €</c>).</summary>
    public required bool CurrencyFirst { get; init; }

    public static SiteCopy For(string? language) => language == SiteLanguage.Dutch ? Dutch : French;

    public IReadOnlyList<string> AllergenLabels(Allergens allergens)
        => AllergenTable.Where(a => allergens.HasFlag(a.Flag)).Select(a => a.Label).ToList();

    public IReadOnlyList<string> DietLabels(DietaryTags tags)
        => DietTable.Where(d => tags.HasFlag(d.Flag)).Select(d => d.Label).ToList();

    public string Day(int isoDay) => Days[isoDay - 1];

    public string TitleFor(string name, bool canBook) => $"{name} – {(canBook ? TitleWithBooking : TitleWithoutBooking)}";

    public string DescriptionTail(bool canBook) => $" {(canBook ? DescriptionWithBooking : DescriptionWithoutBooking)}";

    /// <summary>An amount already scaled to its currency's minor unit, written with this language's separators and sign placement.</summary>
    public string Money(decimal amount, int digits, string currency)
    {
        var format = new NumberFormatInfo
        {
            NumberDecimalSeparator = DecimalSeparator,
            NumberGroupSeparator = GroupSeparator,
            NumberGroupSizes = [3],
        };
        string text = amount.ToString("N" + digits, format);
        string sign = currency == "EUR" ? "€" : currency;
        return CurrencyFirst ? $"{sign}{NoBreakSpace}{text}" : $"{text}{NoBreakSpace}{sign}";
    }

    public static readonly SiteCopy French = new()
    {
        Language = SiteLanguage.French,
        OgLocale = "fr_BE",
        LanguageName = "Français",
        SwitchLabel = "Langue",
        SkipLink = "Aller au contenu",
        DraftBanner = "Aperçu – ce site n’est pas publié : personne d’autre que vous ne le voit.",
        BookTable = "Réserver une table",
        SeeMenu = "Voir la carte",
        Call = "Appeler",
        NoOnlineBooking = "Pas de réservation en ligne : venez directement, la table est à vous dès qu’elle est libre.",
        NavLabel = "Sections de la page",
        NavMenu = "Carte",
        NavHours = "Horaires",
        NavGallery = "Galerie",
        NavContact = "Contact",
        MenuHeading = "La carte",
        AllergenNote = "Les allergènes sont indiqués sous chaque plat ; en cas de doute, demandez à l’équipe.",
        PriceOnRequest = "Prix sur demande",
        SoldOut = "Épuisé",
        AllergensPrefix = "Allergènes : ",
        HoursHeading = "Horaires d’ouverture",
        HoursCaption = "Horaires d’ouverture, du lundi au dimanche",
        Closed = "Fermé",
        Days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
        GalleryHeading = "Galerie",
        FindUsHeading = "Nous trouver",
        ViewOnMap = "Voir sur la carte",
        OpensInNewTab = " (s’ouvre dans un nouvel onglet)",
        PhonePrefix = "Téléphone : ",
        EmailPrefix = "E-mail : ",
        SocialLabel = "Réseaux sociaux",
        LegalHeading = "Mentions légales",
        LegalEstablishment = "Établissement",
        LegalCompanyName = "Raison sociale",
        LegalCompanyNumber = "N° d’entreprise",
        LegalVatNumber = "N° de TVA",
        LegalSeat = "Siège",
        LegalContact = "Contact",
        NoCookies = "Ce site n’utilise aucun cookie et n’intègre aucun traceur ni service tiers : il ne collecte aucune donnée sur ses visiteurs.",
        PrivacyPolicy = "Politique de confidentialité",
        NotFoundTitle = "Page introuvable",
        NotFoundBody = "Cette adresse ne correspond à aucun site.",
        TitleWithBooking = "Carte, horaires et réservation",
        TitleWithoutBooking = "Carte, horaires et contact",
        DescriptionWithBooking = "Carte, horaires et réservation en ligne.",
        DescriptionWithoutBooking = "Carte, horaires et contact.",
        LogoAlt = name => $"Logo de {name}",
        DefaultLead = name => $"{name}, restaurant.",
        MenuName = name => $"Carte de {name}",
        AllergenTable =
        [
            (Allergens.Gluten, "gluten"), (Allergens.Crustaceans, "crustacés"), (Allergens.Eggs, "œufs"),
            (Allergens.Fish, "poisson"), (Allergens.Peanuts, "arachides"), (Allergens.Soybeans, "soja"),
            (Allergens.Milk, "lait"), (Allergens.Nuts, "fruits à coque"), (Allergens.Celery, "céleri"),
            (Allergens.Mustard, "moutarde"), (Allergens.Sesame, "sésame"), (Allergens.Sulphites, "sulfites"),
            (Allergens.Lupin, "lupin"), (Allergens.Molluscs, "mollusques"),
        ],
        DietTable = [(DietaryTags.Vegetarian, "Végétarien"), (DietaryTags.Vegan, "Végan"), (DietaryTags.GlutenFree, "Sans gluten")],
        DecimalSeparator = ",",
        GroupSeparator = NarrowNoBreakSpace,
        CurrencyFirst = false,
    };

    public static readonly SiteCopy Dutch = new()
    {
        Language = SiteLanguage.Dutch,
        OgLocale = "nl_BE",
        LanguageName = "Nederlands",
        SwitchLabel = "Taal",
        SkipLink = "Naar de inhoud",
        DraftBanner = "Voorbeeld – deze website is niet gepubliceerd en is alleen voor u zichtbaar.",
        BookTable = "Reserveer een tafel",
        SeeMenu = "Bekijk de menukaart",
        Call = "Bel ons",
        NoOnlineBooking = "Geen online reservatie: kom gewoon langs, u krijgt een tafel zodra er een vrij is.",
        NavLabel = "Secties van de pagina",
        NavMenu = "Menukaart",
        NavHours = "Openingsuren",
        NavGallery = "Galerij",
        NavContact = "Contact",
        MenuHeading = "De menukaart",
        AllergenNote = "De allergenen staan onder elk gerecht vermeld; vraag het gerust aan het team als u twijfelt.",
        PriceOnRequest = "Prijs op aanvraag",
        SoldOut = "Uitverkocht",
        AllergensPrefix = "Allergenen: ",
        HoursHeading = "Openingsuren",
        HoursCaption = "Openingsuren, van maandag tot zondag",
        Closed = "Gesloten",
        Days = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"],
        GalleryHeading = "Galerij",
        FindUsHeading = "Zo vindt u ons",
        ViewOnMap = "Bekijk op de kaart",
        OpensInNewTab = " (opent in een nieuw tabblad)",
        PhonePrefix = "Telefoon: ",
        EmailPrefix = "E-mail: ",
        SocialLabel = "Sociale media",
        LegalHeading = "Wettelijke vermeldingen",
        LegalEstablishment = "Vestiging",
        LegalCompanyName = "Maatschappelijke benaming",
        LegalCompanyNumber = "Ondernemingsnummer",
        LegalVatNumber = "btw-nummer",
        LegalSeat = "Maatschappelijke zetel",
        LegalContact = "Contact",
        NoCookies = "Deze website gebruikt geen cookies en bevat geen trackers of diensten van derden: er worden geen gegevens over bezoekers verzameld.",
        PrivacyPolicy = "Privacybeleid",
        NotFoundTitle = "Pagina niet gevonden",
        NotFoundBody = "Dit adres komt met geen enkele website overeen.",
        TitleWithBooking = "Menukaart, openingsuren en reservatie",
        TitleWithoutBooking = "Menukaart, openingsuren en contact",
        DescriptionWithBooking = "Menukaart, openingsuren en online reservatie.",
        DescriptionWithoutBooking = "Menukaart, openingsuren en contact.",
        LogoAlt = name => $"Logo van {name}",
        DefaultLead = name => $"{name}, restaurant.",
        MenuName = name => $"Menukaart van {name}",
        AllergenTable =
        [
            (Allergens.Gluten, "gluten"), (Allergens.Crustaceans, "schaaldieren"), (Allergens.Eggs, "eieren"),
            (Allergens.Fish, "vis"), (Allergens.Peanuts, "pinda’s"), (Allergens.Soybeans, "soja"),
            (Allergens.Milk, "melk"), (Allergens.Nuts, "noten"), (Allergens.Celery, "selderij"),
            (Allergens.Mustard, "mosterd"), (Allergens.Sesame, "sesam"), (Allergens.Sulphites, "sulfiet"),
            (Allergens.Lupin, "lupine"), (Allergens.Molluscs, "weekdieren"),
        ],
        DietTable = [(DietaryTags.Vegetarian, "Vegetarisch"), (DietaryTags.Vegan, "Veganistisch"), (DietaryTags.GlutenFree, "Glutenvrij")],
        DecimalSeparator = ",",
        GroupSeparator = ".",
        CurrencyFirst = true,
    };
}
