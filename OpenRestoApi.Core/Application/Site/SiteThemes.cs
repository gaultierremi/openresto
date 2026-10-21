using OpenRestoApi.Core.Domain;
using static OpenRestoApi.Core.Application.Site.SiteColors;

namespace OpenRestoApi.Core.Application.Site;

/// <summary>
/// The three looks, as a palette resolved against the brand colour and the stylesheet that spends
/// it. System font stacks only: a web font is a request to someone else's server, which is exactly
/// what the site promises not to make.
/// </summary>
public static class SiteThemes
{
    /// <summary>
    /// Every colour a theme paints with. <see cref="Accent"/> is the brand colour corrected to read
    /// as text on both <see cref="Background"/> and <see cref="Surface"/>; <see cref="Button"/> is
    /// the brand colour as it was chosen, with <see cref="OnButton"/> the text that sits on it.
    /// </summary>
    public sealed record Palette(
        Rgb Background,
        Rgb Surface,
        Rgb Text,
        Rgb Muted,
        Rgb Accent,
        Rgb Button,
        Rgb OnButton,
        Rgb Line);

    /// <seealso>SiteThemesTests.Palette_EveryTextPairMeetsTheContrastFloor_ForEveryThemeAndBrandColour</seealso>
    public static Palette PaletteFor(SiteTheme theme, string? primary)
    {
        Rgb brand = TryParse(primary, out Rgb parsed) ? parsed : Parse(SitePageModel.DefaultPrimaryColor);

        (Rgb background, Rgb surface, Rgb text, Rgb muted, Rgb line) = theme switch
        {
            // Warm paper and ink: a pub or a family table.
            SiteTheme.Brasserie => (Parse("#faf5ec"), Parse("#fffdf8"), Parse("#2b2118"), Parse("#5e5043"), Parse("#e3d8c6")),
            // Near-black and candle light: a tasting menu.
            SiteTheme.Gastronomique => (Parse("#12100e"), Parse("#1c1916"), Parse("#f3ece1"), Parse("#bdb2a3"), Parse("#3a342d")),
            // White with a wash of the brand colour: a counter and a coffee.
            _ => (Parse("#ffffff"), Mix(brand, White, 0.92), Parse("#1f2933"), Parse("#52606d"), Mix(brand, White, 0.78)),
        };

        // The accent has to read on the darker-contrasting of the two surfaces it can sit on.
        Rgb accent = Readable(Readable(brand, background), surface);
        return new Palette(background, surface, text, muted, accent, brand, OnColor(brand), line);
    }

    public static string Css(SiteTheme theme, string? primary)
    {
        Palette p = PaletteFor(theme, primary);
        string vars =
            $":root{{--bg:{p.Background.Hex};--surface:{p.Surface.Hex};--text:{p.Text.Hex};--muted:{p.Muted.Hex};" +
            $"--accent:{p.Accent.Hex};--button:{p.Button.Hex};--on-button:{p.OnButton.Hex};--line:{p.Line.Hex};}}";
        return vars + Base + ThemeRules(theme);
    }

    private static Rgb Parse(string hex) => TryParse(hex, out Rgb c) ? c : Black;

    private static string ThemeRules(SiteTheme theme) => theme switch
    {
        SiteTheme.Gastronomique => Gastronomique,
        SiteTheme.Cafe => Cafe,
        _ => Brasserie,
    };

    private const string Base = """
        *,*::before,*::after{box-sizing:border-box}
        html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
        body{margin:0;background:var(--bg);color:var(--text);font:1.0625rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
        img{max-width:100%;height:auto;display:block}
        a{color:var(--accent);text-underline-offset:.2em}
        a:hover{text-decoration-thickness:2px}
        :focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:4px}
        .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
        .skip{position:absolute;left:.5rem;top:-4rem;background:var(--surface);color:var(--text);padding:.6rem 1rem;border:2px solid var(--accent);z-index:20}
        .skip:focus{top:.5rem}
        .draft{background:#7a1d1d;color:#fff;text-align:center;padding:.5rem 1rem;font-size:.95rem}
        .wrap{width:min(100% - 2rem,60rem);margin-inline:auto}
        .hero{position:relative;isolation:isolate;color:var(--text);padding:clamp(2.5rem,9vw,6rem) 0 clamp(2rem,6vw,4rem);text-align:center}
        .hero.has-cover{color:#fff;min-height:min(70vh,34rem);display:flex;align-items:flex-end;text-align:left}
        .hero.has-cover::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(to top,rgba(0,0,0,.78),rgba(0,0,0,.45) 60%,rgba(0,0,0,.35))}
        .cover{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover}
        .logo{height:4.5rem;width:auto;max-width:12rem;object-fit:contain;margin-bottom:1rem}
        .hero:not(.has-cover) .logo{margin-inline:auto}
        h1{margin:0 0 .4rem;font-size:clamp(2rem,7vw,3.4rem);line-height:1.1}
        .tagline{margin:0 0 1.5rem;font-size:clamp(1.05rem,3vw,1.35rem);max-width:38rem}
        .hero:not(.has-cover) .tagline{margin-inline:auto;color:var(--muted)}
        .actions{display:flex;flex-wrap:wrap;gap:.75rem}
        .hero:not(.has-cover) .actions{justify-content:center}
        .btn{display:inline-flex;align-items:center;justify-content:center;min-height:3rem;padding:.7rem 1.4rem;border-radius:.5rem;border:2px solid var(--button);background:var(--button);color:var(--on-button);font-weight:700;text-decoration:none}
        .btn:hover{filter:brightness(1.08)}
        .btn.alt{background:transparent;color:inherit;border-color:currentColor}
        .hero.has-cover .btn.alt{color:#fff}
        .hero:not(.has-cover) .btn.alt{color:var(--accent)}
        .note{margin:0;padding:.7rem 1rem;border:1px solid var(--line);border-radius:.5rem;background:var(--surface)}
        nav.sections{border-bottom:1px solid var(--line);background:var(--surface)}
        nav.sections ul{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;list-style:none;margin:0;padding:.35rem 0}
        nav.sections a{display:inline-block;padding:.55rem 0;color:var(--text);font-weight:600}
        nav.lang{border-bottom:1px solid var(--line);background:var(--surface);font-size:.9rem}
        nav.lang .wrap{display:flex;justify-content:flex-end;align-items:center;gap:.5rem}
        nav.lang a{display:inline-block;padding:.5rem .25rem;color:var(--text);font-weight:600;text-decoration:none}
        nav.lang a[aria-current]{text-decoration:underline;text-decoration-thickness:2px}
        section{padding:clamp(2rem,6vw,3.5rem) 0}
        section+section{border-top:1px solid var(--line)}
        h2{margin:0 0 1.25rem;font-size:clamp(1.5rem,4.5vw,2rem);line-height:1.2}
        h3{margin:2rem 0 .25rem;font-size:1.3rem}
        .cat{margin:1.75rem 0 .25rem;font-size:1.15rem;color:var(--accent)}
        .lede{margin:0 0 1rem;color:var(--muted)}
        ul.dishes{list-style:none;margin:0;padding:0}
        .dish{display:grid;grid-template-columns:1fr auto;gap:.1rem 1rem;padding:.8rem 0;border-bottom:1px dotted var(--line)}
        .dish.off .nm,.dish.off .pr{color:var(--muted)}
        .dish .nm{font-weight:700}
        .dish .pr{font-weight:700;white-space:nowrap}
        .dish .ds,.dish .meta{grid-column:1;margin:0;color:var(--muted);font-size:.95rem}
        .dish img{grid-column:1/-1;width:6rem;height:4.5rem;object-fit:cover;border-radius:.4rem;margin-top:.4rem}
        .badge{display:inline-block;margin-right:.35rem;padding:.05rem .5rem;border:1px solid var(--line);border-radius:999px;font-size:.8rem;color:var(--text);background:var(--surface)}
        table.hours{border-collapse:collapse;width:100%;max-width:26rem}
        table.hours th,table.hours td{padding:.45rem 0;text-align:left;border-bottom:1px solid var(--line);font-weight:400}
        table.hours th{font-weight:700;padding-right:1.5rem}
        table.hours .closed{color:var(--muted)}
        .gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem;margin:0;padding:0;list-style:none}
        .gallery li{margin:0;overflow:hidden;border-radius:.5rem}
        .gallery img{width:100%;height:100%;aspect-ratio:4/3;object-fit:cover}
        address{font-style:normal}
        .contact{display:grid;gap:1.5rem}
        .contact p{margin:.2rem 0}
        .social{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;list-style:none;margin:0;padding:0}
        footer{background:var(--surface);border-top:1px solid var(--line);padding:2rem 0 6rem;font-size:.95rem;color:var(--muted)}
        footer h2{font-size:1.1rem;margin-bottom:.75rem;color:var(--text)}
        footer dl{display:grid;grid-template-columns:max-content 1fr;gap:.2rem 1rem;margin:0 0 1rem}
        footer dt{font-weight:700;color:var(--text)}
        footer dd{margin:0}
        .book-bar{position:fixed;left:0;right:0;bottom:0;z-index:10;padding:.6rem 1rem calc(.6rem + env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--line)}
        .book-bar .btn{width:100%}
        @media (min-width:48rem){
        .gallery{grid-template-columns:repeat(3,1fr);gap:.9rem}
        .contact{grid-template-columns:1fr 1fr}
        .book-bar{display:none}
        footer{padding-bottom:2rem}
        }
        """;

    private const string Brasserie = """
        h1,h2,h3{font-family:Georgia,"Times New Roman",serif}
        h2{border-bottom:2px solid var(--accent);padding-bottom:.4rem;display:inline-block}
        .btn{border-radius:.35rem;text-transform:none}
        .dish{border-bottom-style:dotted}
        """;

    private const string Gastronomique = """
        body{font-weight:300;letter-spacing:.01em}
        h1,h2,h3,h4{font-family:"Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;font-weight:400}
        h1{letter-spacing:.08em;text-transform:uppercase}
        h2{text-transform:uppercase;letter-spacing:.18em;font-size:clamp(1.15rem,3.5vw,1.45rem);text-align:center;margin-bottom:2rem}
        h2::after{content:"";display:block;width:3rem;height:1px;background:var(--accent);margin:.9rem auto 0}
        .lede{text-align:center}
        .btn{border-radius:0;letter-spacing:.14em;text-transform:uppercase;font-size:.85rem;font-weight:600}
        .btn:not(.alt){background:transparent;color:var(--accent);border-color:var(--accent)}
        .hero.has-cover .btn:not(.alt){background:var(--button);color:var(--on-button);border-color:var(--button)}
        .dish .nm,.dish .pr{font-weight:400}
        .dish{border-bottom:1px solid var(--line)}
        .gallery li{border-radius:0}
        .badge{border-radius:0}
        """;

    private const string Cafe = """
        h1,h2,h3{font-weight:800;letter-spacing:-.01em}
        section:nth-of-type(even){background:var(--surface)}
        section+section{border-top:0}
        .btn{border-radius:999px}
        .dish{background:var(--bg);border:1px solid var(--line);border-radius:1rem;padding:1rem 1.1rem;margin-bottom:.7rem}
        section:nth-of-type(even) .dish{background:var(--bg)}
        .gallery li{border-radius:1.25rem}
        .note{border-radius:1rem}
        .hero:not(.has-cover){background:var(--surface)}
        """;
}
