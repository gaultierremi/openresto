using ImageMagick;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Tests.Core;

public class SiteImageProcessorTests
{
    private static MemoryStream Picture(uint width, uint height, MagickFormat format, Action<MagickImage>? adjust = null, IMagickColor<byte>? fill = null)
    {
        using var image = new MagickImage(fill ?? MagickColors.SteelBlue, width, height);
        adjust?.Invoke(image);
        image.Format = format;
        return new MemoryStream(image.ToByteArray());
    }

    private static MagickImage Read(ProcessedImage processed) => new(processed.Data);

    [Theory]
    [InlineData(SiteImageKind.Cover, 1600, 1067)]
    [InlineData(SiteImageKind.Gallery, 1200, 800)]
    [InlineData(SiteImageKind.Logo, 480, 320)]
    public void Process_ShrinksALargePhotoToTheKindsLimit(SiteImageKind kind, int width, int height)
    {
        using MemoryStream source = Picture(3000, 2000, MagickFormat.Jpeg);

        ProcessedImage result = SiteImageProcessor.Process(source, "image/jpeg", kind);

        Assert.Equal(width, result.Width);
        Assert.InRange(result.Height, height - 1, height + 1);
        using MagickImage written = Read(result);
        Assert.Equal((uint)result.Width, written.Width);
        Assert.Equal((uint)result.Height, written.Height);
    }

    [Fact]
    public void Process_ShrinksByTheLongerSide_ForAPortraitPhoto()
    {
        using MemoryStream source = Picture(2000, 4000, MagickFormat.Jpeg);

        ProcessedImage result = SiteImageProcessor.Process(source, "image/jpeg", SiteImageKind.Cover);

        Assert.Equal(1200, result.Height);
        Assert.Equal(600, result.Width);
    }

    [Fact]
    public void Process_NeverEnlargesASmallPhoto()
    {
        using MemoryStream source = Picture(400, 300, MagickFormat.Jpeg);

        ProcessedImage result = SiteImageProcessor.Process(source, "image/jpeg", SiteImageKind.Cover);

        Assert.Equal((400, 300), (result.Width, result.Height));
    }

    [Fact]
    public void Process_WritesAPhotoAsJpeg_WhateverItCameAs()
    {
        foreach ((MagickFormat format, string type) in new[] { (MagickFormat.Png, "image/png"), (MagickFormat.WebP, "image/webp"), (MagickFormat.Jpeg, "image/jpeg") })
        {
            using MemoryStream source = Picture(300, 200, format);

            ProcessedImage result = SiteImageProcessor.Process(source, type, SiteImageKind.Gallery);

            Assert.Equal("jpg", result.Extension);
            Assert.Equal(MagickFormat.Jpeg, new MagickImageInfo(result.Data).Format);
        }
    }

    [Fact]
    public void Process_KeepsALogosTransparency_AsPng()
    {
        using MemoryStream source = Picture(200, 200, MagickFormat.Png, fill: MagickColors.Transparent);

        ProcessedImage result = SiteImageProcessor.Process(source, "image/png", SiteImageKind.Logo);

        Assert.Equal("png", result.Extension);
        using MagickImage written = Read(result);
        Assert.True(written.HasAlpha);
        Assert.Equal(0, written.GetPixels().GetPixel(10, 10).ToColor()!.A);
    }

    [Fact]
    public void Process_FlattensTransparencyOntoWhite_ForAPhoto()
    {
        using MemoryStream source = Picture(200, 200, MagickFormat.Png, fill: MagickColors.Transparent);

        ProcessedImage result = SiteImageProcessor.Process(source, "image/png", SiteImageKind.Gallery);

        using MagickImage written = Read(result);
        IMagickColor<byte> pixel = written.GetPixels().GetPixel(10, 10).ToColor()!;
        Assert.True(pixel.R > 240 && pixel.G > 240 && pixel.B > 240, "transparent pixels become white, not black");
    }

    [Fact]
    public void Process_DropsWhatTheCameraWroteIntoTheFile()
    {
        using MemoryStream source = Picture(400, 300, MagickFormat.Jpeg, image =>
        {
            var exif = new ExifProfile();
            exif.SetValue(ExifTag.Make, "TestCam");
            exif.SetValue(ExifTag.GPSLatitudeRef, "N");
            image.SetProfile(exif);
        });
        using (var before = new MagickImage(source.ToArray()))
        {
            Assert.NotNull(before.GetExifProfile());
        }
        source.Position = 0;

        ProcessedImage result = SiteImageProcessor.Process(source, "image/jpeg", SiteImageKind.Gallery);

        using MagickImage after = Read(result);
        Assert.Null(after.GetExifProfile());
    }

    [Fact]
    public void Process_AppliesTheCamerasRotation_BeforeDroppingIt()
    {
        using MemoryStream source = Picture(400, 200, MagickFormat.Jpeg, image =>
        {
            var exif = new ExifProfile();
            exif.SetValue(ExifTag.Orientation, (ushort)6);
            image.SetProfile(exif);
            image.Orientation = OrientationType.RightTop; // Magick writes the tag only when both agree
        });

        ProcessedImage result = SiteImageProcessor.Process(source, "image/jpeg", SiteImageKind.Gallery);

        Assert.Equal((200, 400), (result.Width, result.Height));
    }

    [Fact]
    public void Process_AcceptsAPictureAtTheSideLimit()
    {
        using MemoryStream source = Picture((uint)SiteImageProcessor.MaxSourceSide, 4, MagickFormat.Png);

        ProcessedImage result = SiteImageProcessor.Process(source, "image/png", SiteImageKind.Cover);

        Assert.Equal(1600, result.Width);
    }

    [Fact]
    public void Process_RefusesAPictureOnePixelBeyondTheSideLimit_BeforeDecodingIt()
    {
        using MemoryStream source = Picture((uint)SiteImageProcessor.MaxSourceSide + 1, 4, MagickFormat.Png);

        ValidationException ex = Assert.Throws<ValidationException>(() => SiteImageProcessor.Process(source, "image/png", SiteImageKind.Cover));

        Assert.Equal(ErrorCodes.SiteImageDimensionsTooLarge, ex.Code);
    }

    [Fact]
    public void Process_RefusesAPictureBeyondThePixelBudget_EvenWhenNoSideIsTooLong()
    {
        // 7 000 × 6 000 = 42 MP: under the side limit, over the 40 MP budget. A flat colour
        // compresses to a few kilobytes, so the file size alone would never have stopped it.
        using MemoryStream source = Picture(7000, 6000, MagickFormat.Png);
        Assert.True(source.Length < SiteFields.MaxImageBytes);

        ValidationException ex = Assert.Throws<ValidationException>(() => SiteImageProcessor.Process(source, "image/png", SiteImageKind.Cover));

        Assert.Equal(ErrorCodes.SiteImageDimensionsTooLarge, ex.Code);
    }

    [Fact]
    public void Process_RefusesBytesThatAreNotAPicture()
    {
        using var source = new MemoryStream("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"u8.ToArray());

        ValidationException ex = Assert.Throws<ValidationException>(() => SiteImageProcessor.Process(source, "image/png", SiteImageKind.Gallery));

        Assert.Equal(ErrorCodes.SiteImageUnreadable, ex.Code);
    }

    [Fact]
    public void Process_ReadsTheFileAsTheTypeItDeclared_NotAsWhatItsBytesSuggest()
    {
        // A real PNG declared as a JPEG must not be decoded as one: the declared type picks the decoder.
        using MemoryStream source = Picture(100, 100, MagickFormat.Png);

        Assert.Throws<ValidationException>(() => SiteImageProcessor.Process(source, "image/jpeg", SiteImageKind.Gallery));
    }

    [Theory]
    [InlineData("image/svg+xml")]
    [InlineData("image/gif")]
    [InlineData("text/html")]
    [InlineData("")]
    public void Process_RefusesAnyOtherDeclaredType(string contentType)
    {
        using MemoryStream source = Picture(100, 100, MagickFormat.Png);

        Assert.Equal(ErrorCodes.SiteImageUnreadable,
            Assert.Throws<ValidationException>(() => SiteImageProcessor.Process(source, contentType, SiteImageKind.Gallery)).Code);
    }
}
