using ImageMagick;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Core.Application.Site;

public enum SiteImageKind
{
    Cover,
    Gallery,
    Logo,
}

/// <param name="Extension">Without the dot: <c>jpg</c> or <c>png</c>.</param>
public sealed record ProcessedImage(byte[] Data, string Extension, int Width, int Height);

/// <summary>
/// Re-encodes an uploaded photo for the web. A restaurateur's phone photo is 4 000 pixels and 4 MB;
/// served as it came it is the whole of the page's weight on a mobile connection. Re-encoding also
/// drops everything the camera wrote into the file — GPS position, device, timestamps — which a
/// public page has no business publishing.
/// </summary>
/// <seealso>SiteImageProcessorTests.Process_ShrinksALargePhotoToTheKindsLimit</seealso>
/// <seealso>SiteImageProcessorTests.Process_NeverEnlargesASmallPhoto</seealso>
/// <seealso>SiteImageProcessorTests.Process_RefusesAPictureBeyondThePixelBudget_EvenWhenNoSideIsTooLong</seealso>
public static class SiteImageProcessor
{
    /// <summary>Longest side accepted before decoding: enough for any camera, far below what exhausts memory.</summary>
    public const int MaxSourceSide = 8000;

    public const long MaxSourcePixels = 40_000_000;

    private const int JpegQuality = 82;

    public static ProcessedImage Process(Stream source, string contentType, SiteImageKind kind)
    {
        MagickFormat format = contentType switch
        {
            "image/jpeg" => MagickFormat.Jpeg,
            "image/png" => MagickFormat.Png,
            "image/webp" => MagickFormat.WebP,
            _ => throw Unreadable(),
        };

        try
        {
            var info = new MagickImageInfo(source, new MagickReadSettings { Format = format });
            if (info.Width > MaxSourceSide || info.Height > MaxSourceSide
                || (long)info.Width * info.Height > MaxSourcePixels)
            {
                throw new ValidationException("The picture is too large in pixels.")
                {
                    Code = ErrorCodes.SiteImageDimensionsTooLarge,
                    Args = new Dictionary<string, object> { ["maxSide"] = MaxSourceSide },
                };
            }

            source.Position = 0;
            using var image = new MagickImage(source, new MagickReadSettings { Format = format });
            image.AutoOrient();
            image.Strip();

            (int width, int height) = LimitFor(kind);
            image.Resize(new MagickGeometry((uint)width, (uint)height) { Greater = true });

            bool keepsTransparency = kind == SiteImageKind.Logo;
            if (keepsTransparency)
            {
                image.Format = MagickFormat.Png;
            }
            else
            {
                image.ColorAlpha(MagickColors.White);
                image.Format = MagickFormat.Jpeg;
                image.Quality = JpegQuality;
                image.Settings.Interlace = Interlace.Plane;
            }

            return new ProcessedImage(image.ToByteArray(), keepsTransparency ? "png" : "jpg", (int)image.Width, (int)image.Height);
        }
        catch (MagickException)
        {
            throw Unreadable();
        }
    }

    /// <summary>The box a kind of image is shrunk into, wide enough for a retina phone and no more.</summary>
    private static (int Width, int Height) LimitFor(SiteImageKind kind) => kind switch
    {
        SiteImageKind.Cover => (1600, 1200),
        SiteImageKind.Gallery => (1200, 1200),
        _ => (480, 480),
    };

    private static ValidationException Unreadable()
        => new("The file is not a readable picture.") { Code = ErrorCodes.SiteImageUnreadable };
}
