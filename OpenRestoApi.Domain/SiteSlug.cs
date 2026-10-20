using System.Globalization;
using System.Text;

namespace OpenRestoApi.Core.Domain;

/// <summary>
/// The address segment of a site: lower-case ASCII words joined by single hyphens. It is what a
/// guest types and what a search engine indexes, so it is derived from the restaurant's name
/// ("Brasserie de la Senne Dorée" → <c>brasserie-de-la-senne-doree</c>) and never from an id.
/// </summary>
/// <seealso>SiteSlugTests.From_StripsAccentsAndHyphenates</seealso>
/// <seealso>SiteSlugTests.IsValid_AcceptsTheShortestAndLongestSlug</seealso>
/// <seealso>SiteSlugTests.IsValid_RefusesOneCharacterTooShortOrTooLong</seealso>
public static class SiteSlug
{
    public const int MinLength = 3;
    public const int MaxLength = 60;

    /// <summary>What a name with no letter or digit in it becomes, so a site can always be created.</summary>
    public const string Fallback = "restaurant";

    private static readonly Dictionary<char, string> _expansions = new()
    {
        ['œ'] = "oe", ['æ'] = "ae", ['ß'] = "ss", ['ø'] = "o", ['đ'] = "d", ['ł'] = "l",
    };

    /// <summary>A slug for <paramref name="name"/>, at most <see cref="MaxLength"/> long and never empty.</summary>
    public static string From(string? name)
    {
        var builder = new StringBuilder();
        bool pendingHyphen = false;

        foreach (char c in (name ?? string.Empty).Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            char lower = char.ToLowerInvariant(c);
            string piece = _expansions.TryGetValue(lower, out string? expanded) ? expanded : lower.ToString();
            foreach (char p in piece)
            {
                if (p is (>= 'a' and <= 'z') or (>= '0' and <= '9'))
                {
                    if (pendingHyphen && builder.Length > 0)
                    {
                        builder.Append('-');
                    }
                    pendingHyphen = false;
                    builder.Append(p);
                }
                else
                {
                    pendingHyphen = true;
                }
            }
        }

        string slug = builder.ToString();
        if (slug.Length > MaxLength)
        {
            slug = slug[..MaxLength].TrimEnd('-');
        }

        if (slug.Length == 0)
        {
            return Fallback;
        }

        return slug.Length < MinLength ? slug.PadRight(MinLength, '0') : slug;
    }

    /// <summary>True for a slug as <see cref="From"/> writes it, within the length bounds.</summary>
    public static bool IsValid(string? slug)
    {
        if (slug is null || slug.Length < MinLength || slug.Length > MaxLength)
        {
            return false;
        }

        bool previousHyphen = true;
        foreach (char c in slug)
        {
            if (c == '-')
            {
                if (previousHyphen)
                {
                    return false;
                }
                previousHyphen = true;
            }
            else if (c is (>= 'a' and <= 'z') or (>= '0' and <= '9'))
            {
                previousHyphen = false;
            }
            else
            {
                return false;
            }
        }

        return !previousHyphen;
    }
}
