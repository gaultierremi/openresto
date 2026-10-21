namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>
/// The fixed words of the booking confirmation email, one table per language. Dutch is Belgian
/// Dutch and formal ("u"). English is the text the email carried before it was localised.
/// </summary>
/// <seealso>EmailTemplateServiceTests.BuildConfirmationEmail_WritesEachLanguageItsOwnWords</seealso>
/// <seealso>EmailTemplateServiceTests.BuildConfirmationEmail_IsEnglishWithoutALanguage</seealso>
public sealed record BookingEmailCopy(
    string SubjectFormat,
    string Heading,
    string Location,
    string Directions,
    string Section,
    string Table,
    string TableByIdFormat,
    string SpecialRequests,
    string GreetingNamedFormat,
    string GreetingAnonymous,
    string LookingForward,
    string Reference,
    string Date,
    string Time,
    string Guests,
    string GuestOne,
    string GuestMany,
    string Manage,
    string ChangeOrCancel)
{
    private static readonly BookingEmailCopy En = new(
        "Booking confirmed – {0}", "Booking Confirmed", "Location", "Get directions &rarr;", "Section", "Table", "Table #{0}",
        "Special requests", "You're all set, {0}!", "You're all set!", "We're looking forward to seeing you.",
        "Reference", "Date", "Time", "Guests", "guest", "guests", "Manage your booking",
        "Need to change or cancel your reservation?<br>Use the link above or visit our website.");

    private static readonly BookingEmailCopy Fr = new(
        "Réservation confirmée – {0}", "Réservation confirmée", "Adresse", "Itinéraire &rarr;", "Zone", "Table", "Table n° {0}",
        "Demandes particulières", "C'est confirmé, {0} !", "C'est confirmé !", "Nous avons hâte de vous accueillir.",
        "Référence", "Date", "Heure", "Convives", "convive", "convives", "Gérer votre réservation",
        "Besoin de modifier ou d'annuler votre réservation ?<br>Utilisez le lien ci-dessus ou rendez-vous sur notre site.");

    private static readonly BookingEmailCopy Nl = new(
        "Reservatie bevestigd – {0}", "Reservatie bevestigd", "Adres", "Routebeschrijving &rarr;", "Zone", "Tafel", "Tafel nr. {0}",
        "Bijzondere wensen", "Alles is in orde, {0}!", "Alles is in orde!", "Wij kijken ernaar uit u te mogen verwelkomen.",
        "Referentie", "Datum", "Uur", "Gasten", "gast", "gasten", "Uw reservatie beheren",
        "Wilt u uw reservatie wijzigen of annuleren?<br>Gebruik de link hierboven of bezoek onze website.");

    public static BookingEmailCopy For(string? language) => GuestLanguage.Normalise(language) switch
    {
        GuestLanguage.French => Fr,
        GuestLanguage.Dutch => Nl,
        _ => En,
    };
}
