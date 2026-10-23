using System.Security.Cryptography;
using System.Text;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Legal;

/// <summary>One section of a legal document: a heading and its paragraphs.</summary>
public sealed record LegalSection(string Heading, IReadOnlyList<string> Paragraphs);

public sealed record LegalDocument(string Key, string Title, IReadOnlyList<LegalSection> Sections)
{
    public string Version => LegalCatalog.Version;

    /// <summary>
    /// SHA-256 of the title, headings and paragraphs, in order. A consent record keeps it, so which
    /// words a restaurateur agreed to stays provable after the wording moves on.
    /// </summary>
    public string ContentSha256 => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
        string.Join('\n', new[] { Title }.Concat(Sections.SelectMany(s => new[] { s.Heading }.Concat(s.Paragraphs))))))).ToLowerInvariant();
}

/// <summary>
/// The platform's legal documents, in French. They are templates written for review, not advice:
/// <see cref="NeedsLegalReview"/> is true until a lawyer has validated them, every screen that
/// shows one says so, and the square-bracketed fields are what the operator fills in before
/// opening the platform to a real restaurant. The sign-up journal records the version and the
/// hash of the text a restaurateur was shown (<see cref="LegalAcceptance"/>).
/// </summary>
/// <seealso>LegalCatalogTests.EveryDocumentIsMarkedForLegalReview</seealso>
/// <seealso>LegalCatalogTests.SignUpDocumentsAreAllPublished</seealso>
public static class LegalCatalog
{
    /// <summary>Moves when any wording changes; an acceptance made under an older one is refused at sign-up.</summary>
    public const string Version = "2026-10-22";

    public const string Language = "fr";

    /// <summary>Flip to false only once a lawyer has validated every document.</summary>
    public const bool NeedsLegalReview = true;

    public static IReadOnlyList<LegalDocument> All { get; } =
    [
        LegalTexts.Terms,
        LegalTexts.Privacy,
        LegalTexts.Dpa,
        LegalTexts.LegalNotice,
    ];

    public static LegalDocument? Find(string? key)
        => All.FirstOrDefault(d => string.Equals(d.Key, key, StringComparison.OrdinalIgnoreCase));

    public static LegalDocumentDto ToDto(LegalDocument document) => new()
    {
        Key = document.Key,
        Version = document.Version,
        Title = document.Title,
        Language = Language,
        NeedsLegalReview = NeedsLegalReview,
        UpdatedOn = Version,
        ContentSha256 = document.ContentSha256,
        Sections = [.. document.Sections.Select(s => new LegalSectionDto { Heading = s.Heading, Paragraphs = [.. s.Paragraphs] })],
    };

    /// <summary>The documents a restaurateur must accept to create the account.</summary>
    public static IReadOnlyList<LegalDocument> AcceptedAtSignUp
        => [.. LegalDocumentKeys.AcceptedAtSignUp.Select(k => Find(k)!)];
}
