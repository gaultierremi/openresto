using System.Globalization;
using System.Text.RegularExpressions;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;

namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>Proposals retain source names and euro prices; declarations and translations remain the author's.</summary>
/// <seealso>MenuImportTests.ProposesDishesWithExactCentsAndSourceLanguage_WithoutInventingDeclarations</seealso>
/// <seealso>MenuImportTests.EnforcesDishAndTextLimits</seealso>
public static partial class MenuImport
{
    public const int MaxTextLength = 20000;
    public const int MaxDishes = 80;

    public static SaveOnboardingMenuRequest Propose(string? text, string? language)
    {
        if (language is not ("fr" or "nl" or "en") || string.IsNullOrWhiteSpace(text)
            || text.Length > MaxTextLength || text.Any(c => char.IsControl(c) && c is not ('\n' or '\r' or '\t')))
            throw Invalid();

        var result = new SaveOnboardingMenuRequest { Name = language == "fr" ? "Carte" : "Menu" };
        OnboardingMenuCategoryDto? category = null;
        int count = 0;
        foreach (string raw in text.Split('\n'))
        {
            string line = raw.Trim().TrimStart('•', '*').Trim();
            if (line.Length == 0) continue;
            if (line.EndsWith(':'))
            {
                string heading = line[..^1].Trim();
                if (heading.Length is < 1 or > 80 || result.Categories.Count >= 20) throw Invalid();
                category = new OnboardingMenuCategoryDto { Name = heading };
                result.Categories.Add(category);
                continue;
            }

            Match match = PriceAtEnd().Match(line);
            long? price = null;
            string name = line;
            if (match.Success)
            {
                name = line[..match.Index].Trim().TrimEnd('.', '·', '-', '–', '|', ';').Trim();
                if (!decimal.TryParse(match.Groups[1].Value.Replace(',', '.'), NumberStyles.AllowDecimalPoint | NumberStyles.AllowLeadingSign,
                    CultureInfo.InvariantCulture, out decimal amount) || amount < 0 || amount * 100 > MenuFields.MaxPriceMinor)
                    throw Invalid();
                price = (long)(amount * 100);
            }
            if (name.Length is < 1 or > 80 || ++count > MaxDishes) throw Invalid();
            if (category is null)
            {
                category = new OnboardingMenuCategoryDto { Name = result.Name };
                result.Categories.Add(category);
            }
            category.Items.Add(new OnboardingMenuItemDto
            {
                Name = name, PriceMinor = price, PrimaryLanguage = language, Allergens = [], DietaryTags = [],
            });
        }
        result.Categories.RemoveAll(c => c.Items.Count == 0);
        if (count == 0) throw Invalid();
        return result;
    }

    [GeneratedRegex(@"\s+([+-]?\d+(?:[.,]\d{1,2})?)\s*(?:€|EUR)?\s*$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex PriceAtEnd();

    private static ValidationException Invalid()
        => new("Vérifiez le texte de la carte : 80 plats maximum, un plat par ligne, prix en euros en fin de ligne.")
        { Code = ErrorCodes.OnboardingMenuInvalid };
}
