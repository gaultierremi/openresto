namespace OpenRestoApi.Core.Application.DTOs;

public class LegalDocumentSummaryDto
{
    public string Key { get; set; } = null!;
    public string Version { get; set; } = null!;
}

/// <summary>
/// One legal document. They are templates: <see cref="NeedsLegalReview"/> stays true until a
/// lawyer has validated the text, and every client must say so wherever it shows one.
/// </summary>
public class LegalDocumentDto
{
    public string Key { get; set; } = null!;
    public string Version { get; set; } = null!;
    public string Title { get; set; } = null!;
    public string Language { get; set; } = null!;
    public bool NeedsLegalReview { get; set; }
    public string UpdatedOn { get; set; } = null!;
    public List<LegalSectionDto> Sections { get; set; } = [];

    /// <summary>SHA-256 of the text, hex: what a consent record refers to.</summary>
    public string ContentSha256 { get; set; } = null!;
}

public class LegalSectionDto
{
    public string Heading { get; set; } = null!;
    public List<string> Paragraphs { get; set; } = [];
}
