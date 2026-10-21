using System.Globalization;

namespace OpenRestoApi.Core.Application.Site;

/// <summary>
/// WCAG 2 contrast arithmetic for the colour a restaurant picked. The brand colour is chosen on a
/// screen of buttons, not against a page of body text, so a pale yellow or a deep navy that looks
/// right as a button background fails as a link on a cream page. The site keeps the hue and moves
/// the lightness until the text is readable.
/// </summary>
/// <seealso>SiteColorsTests.Readable_MeetsTheContrastFloor_ForAnyBrandColourOnEveryBackground</seealso>
/// <seealso>SiteColorsTests.OnColor_PicksTheTextColourThatContrastsMost</seealso>
public static class SiteColors
{
    /// <summary>WCAG AA for normal-size text.</summary>
    public const double MinimumContrast = 4.5;

    public readonly record struct Rgb(int R, int G, int B)
    {
        public string Hex => string.Create(CultureInfo.InvariantCulture, $"#{R:x2}{G:x2}{B:x2}");
    }

    public static readonly Rgb Black = new(0, 0, 0);
    public static readonly Rgb White = new(255, 255, 255);

    /// <summary>Reads <c>#rrggbb</c> (and <c>#rrggbbaa</c>, ignoring the alpha). Anything else is refused.</summary>
    public static bool TryParse(string? hex, out Rgb color)
    {
        color = default;
        if (hex is not { Length: 7 or 9 } || hex[0] != '#')
        {
            return false;
        }

        if (!int.TryParse(hex.AsSpan(1, 2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out int r)
            || !int.TryParse(hex.AsSpan(3, 2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out int g)
            || !int.TryParse(hex.AsSpan(5, 2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out int b))
        {
            return false;
        }

        if (hex.Length == 9 && !int.TryParse(hex.AsSpan(7, 2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out _))
        {
            return false;
        }

        color = new Rgb(r, g, b);
        return true;
    }

    public static double Luminance(Rgb c)
    {
        static double Channel(int v)
        {
            double s = v / 255.0;
            return s <= 0.03928 ? s / 12.92 : Math.Pow((s + 0.055) / 1.055, 2.4);
        }

        return 0.2126 * Channel(c.R) + 0.7152 * Channel(c.G) + 0.0722 * Channel(c.B);
    }

    public static double Contrast(Rgb a, Rgb b)
    {
        double la = Luminance(a);
        double lb = Luminance(b);
        return (Math.Max(la, lb) + 0.05) / (Math.Min(la, lb) + 0.05);
    }

    /// <summary>Linear blend: 0 is <paramref name="from"/>, 1 is <paramref name="to"/>.</summary>
    public static Rgb Mix(Rgb from, Rgb to, double amount)
        => new(Blend(from.R, to.R, amount), Blend(from.G, to.G, amount), Blend(from.B, to.B, amount));

    /// <summary>
    /// <paramref name="color"/> itself when it already reads on <paramref name="background"/>;
    /// otherwise the closest blend towards black (on a light page) or white (on a dark one) that
    /// does.
    /// </summary>
    public static Rgb Readable(Rgb color, Rgb background)
    {
        if (Contrast(color, background) >= MinimumContrast)
        {
            return color;
        }

        Rgb target = Contrast(Black, background) >= Contrast(White, background) ? Black : White;
        for (int step = 1; step <= 50; step++)
        {
            Rgb candidate = Mix(color, target, step / 50.0);
            if (Contrast(candidate, background) >= MinimumContrast)
            {
                return candidate;
            }
        }

        return target;
    }

    /// <summary>The text colour for a button filled with <paramref name="fill"/>: black or white, whichever contrasts more.</summary>
    public static Rgb OnColor(Rgb fill) => Contrast(Black, fill) >= Contrast(White, fill) ? Black : White;

    private static int Blend(int from, int to, double amount)
        => (int)Math.Round(from + (to - from) * amount);
}
