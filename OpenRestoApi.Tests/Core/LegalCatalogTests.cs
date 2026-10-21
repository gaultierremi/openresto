using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Legal;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Core;

public class LegalCatalogTests
{
    private const string ReviewNotice = "Modèle à faire valider";

    private static LegalDocument Document(string paragraph = "Texte.", string title = "Titre")
        => new("terms", title, [new LegalSection("1. Objet", [paragraph, "Deuxième paragraphe."])]);

    // ── Marked for legal review ──────────────────────────────────────────────

    [Fact]
    public void EveryDocumentIsMarkedForLegalReview()
    {
        Assert.True(LegalCatalog.NeedsLegalReview);
        Assert.Equal("fr", LegalCatalog.Language);
        Assert.NotEmpty(LegalCatalog.All);

        foreach (LegalDocument document in LegalCatalog.All)
        {
            LegalDocumentDto dto = LegalCatalog.ToDto(document);

            Assert.True(dto.NeedsLegalReview, document.Key);
            Assert.Equal("fr", dto.Language);
            Assert.Equal(LegalCatalog.Version, dto.Version);
            Assert.Equal(document.Key, dto.Key);
            Assert.Equal(ReviewNotice, document.Sections[0].Heading);
            Assert.Equal(ReviewNotice, dto.Sections[0].Heading);
            Assert.NotEmpty(document.Sections[0].Paragraphs);
            Assert.False(string.IsNullOrWhiteSpace(document.ContentSha256), document.Key);
            Assert.Equal(document.ContentSha256, dto.ContentSha256);
        }
    }

    [Fact]
    public void ContentSha256_IsLowerCaseHex_AndStableAcrossCalls()
    {
        foreach (LegalDocument document in LegalCatalog.All)
        {
            string hash = document.ContentSha256;

            Assert.Equal(64, hash.Length);
            Assert.Matches("^[0-9a-f]{64}$", hash);
            Assert.Equal(hash, document.ContentSha256);
            Assert.Equal(hash, LegalCatalog.Find(document.Key)!.ContentSha256);
        }
    }

    [Fact]
    public void ContentSha256_DiffersBetweenDocuments()
        => Assert.Equal(LegalCatalog.All.Count, LegalCatalog.All.Select(d => d.ContentSha256).Distinct().Count());

    [Fact]
    public void ContentSha256_ChangesWhenAParagraphChanges()
    {
        string original = Document().ContentSha256;

        Assert.Equal(original, Document().ContentSha256);
        Assert.NotEqual(original, Document(paragraph: "Texte modifié.").ContentSha256);
    }

    [Fact]
    public void ContentSha256_ChangesWhenTheTitleOrAHeadingChanges()
    {
        LegalDocument original = Document();
        LegalDocument renamedHeading = original with { Sections = [new LegalSection("2. Objet", original.Sections[0].Paragraphs)] };

        Assert.NotEqual(original.ContentSha256, Document(title: "Autre titre").ContentSha256);
        Assert.NotEqual(original.ContentSha256, renamedHeading.ContentSha256);
    }

    [Fact]
    public void ContentSha256_IgnoresTheKey()
        => Assert.Equal(Document().ContentSha256, (Document() with { Key = "privacy" }).ContentSha256);

    // ── The four documents ───────────────────────────────────────────────────

    [Fact]
    public void SignUpDocumentsAreAllPublished()
    {
        foreach (string key in LegalDocumentKeys.AcceptedAtSignUp)
        {
            LegalDocument? found = LegalCatalog.Find(key);

            Assert.NotNull(found);
            Assert.Equal(key, found.Key);
        }

        Assert.Equal(LegalDocumentKeys.AcceptedAtSignUp, LegalCatalog.AcceptedAtSignUp.Select(d => d.Key));
        Assert.All(LegalDocumentKeys.AcceptedAtSignUp, key => Assert.Contains(key, LegalDocumentKeys.All));
    }

    [Fact]
    public void All_HoldsExactlyTheFourKeys_EachOnce()
    {
        Assert.Equal(4, LegalCatalog.All.Count);
        Assert.Equal(
            LegalDocumentKeys.All.OrderBy(k => k, StringComparer.Ordinal),
            LegalCatalog.All.Select(d => d.Key).OrderBy(k => k, StringComparer.Ordinal));
    }

    [Fact]
    public void LegalNotice_IsPublishedButNotAcceptedAtSignUp()
    {
        Assert.NotNull(LegalCatalog.Find(LegalDocumentKeys.LegalNotice));
        Assert.DoesNotContain(LegalDocumentKeys.LegalNotice, LegalDocumentKeys.AcceptedAtSignUp);
    }

    [Theory]
    [InlineData("terms")]
    [InlineData("TERMS")]
    [InlineData("Legal-Notice")]
    [InlineData("DPA")]
    public void Find_IsCaseInsensitive(string key)
        => Assert.NotNull(LegalCatalog.Find(key));

    [Theory]
    [InlineData("cookies")]
    [InlineData("")]
    [InlineData(" terms")]
    [InlineData(null)]
    public void Find_ReturnsNull_ForAnUnknownKey(string? key)
        => Assert.Null(LegalCatalog.Find(key));

    [Fact]
    public void EveryDocumentFitsTheKeyAndVersionColumns()
    {
        Assert.True(LegalCatalog.Version.Length <= LegalDocumentKeys.MaxVersionLength);
        Assert.All(LegalCatalog.All, d => Assert.True(d.Key.Length <= LegalDocumentKeys.MaxLength, d.Key));
    }
}
