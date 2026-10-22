using System.Text.Json;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Utilities;

public static class MenuTranslations
{
    public static bool IsSupported(string? language) => language is "fr" or "nl" or "en";

    public static Dictionary<string, MenuItemTranslationDto> Read(string? json)
        => json is null ? [] : JsonSerializer.Deserialize<Dictionary<string, MenuItemTranslationDto>>(json) ?? [];

    public static string? Validate(Dictionary<string, MenuItemTranslationDto>? translations)
    {
        if (translations is null) return null;
        var normalized = new Dictionary<string, MenuItemTranslationDto>();
        foreach (var (language, value) in translations)
        {
            RequireLanguage(language);
            if (value is null) throw new ValidationException("A translation must be an object.") { Code = ErrorCodes.MenuLanguageInvalid };
            string? name = Clean(value.Name);
            string? description = Clean(value.Description);
            if (name?.Length > MenuFields.MaxNameLength)
                throw new ValidationException("Translated name is too long.") { Code = ErrorCodes.MenuItemNameTooLong, Args = new Dictionary<string, object> { ["max"] = MenuFields.MaxNameLength } };
            if (description?.Length > MenuFields.MaxDescriptionLength)
                throw new ValidationException("Translated description is too long.") { Code = ErrorCodes.MenuDescriptionTooLong, Args = new Dictionary<string, object> { ["max"] = MenuFields.MaxDescriptionLength } };
            if (name is not null || description is not null)
                normalized[language] = new() { Name = name, Description = description };
        }
        return JsonSerializer.Serialize(normalized);
    }

    public static void RequireLanguage(string language)
    {
        if (!IsSupported(language))
            throw new ValidationException("Dish language must be fr, nl or en.") { Code = ErrorCodes.MenuLanguageInvalid };
    }

    public static MenuItemTranslationDto Resolve(string name, string? description, string primaryLanguage,
        Dictionary<string, MenuItemTranslationDto> translations, string language)
    {
        translations.TryGetValue(language, out var translated);
        return new()
        {
            Name = language == primaryLanguage ? name : Clean(translated?.Name) ?? name,
            Description = language == primaryLanguage ? description : Clean(translated?.Description) ?? description,
        };
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
