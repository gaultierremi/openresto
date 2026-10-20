using ImageMagick;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;
using OpenRestoApi.Infrastructure.Persistence.Repositories;
using OpenRestoApi.Tests.Holds;
using OpenRestoApi.Tests.TestInfrastructure;

namespace OpenRestoApi.Tests.Services;

public class SiteServiceTests : IDisposable
{
    private const int Alpha = 1;
    private const int Beta = 2;
    private static readonly DateTime Now = new(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc);

    private readonly AppDbContext _db;
    private readonly Mock<IMediaStore> _store = new();
    private readonly Mock<IBrandSettingsRepository> _brandRepo = new();
    private readonly AuditScope _audit = new();
    private readonly BrandSettings _brand = new() { PrimaryColor = "#b45309", PhoneNumber = "+32 2 000 00 00", EmailAddress = "brand@example.be" };
    private readonly SiteService _svc;
    private readonly MenuService _menus;

    public SiteServiceTests()
    {
        _db = TestDbFactory.Create(Guid.NewGuid().ToString());
        _db.Restaurants.AddRange(
            new Restaurant
            {
                Id = Alpha, Name = "Brasserie de la Senne Dorée", Address = "Rue des Fabriques 25, 1000 Bruxelles",
                OpenDays = "2,3,4,5,6,7", OpenTime = "11:30", CloseTime = "22:30", Timezone = "Europe/Brussels",
                EmailAddress = "bonjour@senne.example", Tags = "brasserie, cuisine belge",
            },
            new Restaurant { Id = Beta, Name = "Beta" });
        _db.SaveChanges();

        _brandRepo.Setup(b => b.GetAsync()).ReturnsAsync(_brand);
        _store.Setup(s => s.ReplaceAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>()))
            .ReturnsAsync((string slot, string ext, Stream _) => $"{slot}.{ext}");

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Website:Url"] = "https://resto.example.be" }).Build();
        var brandService = new BrandService(_brandRepo.Object, configuration);
        var media = new MediaService(Mock.Of<IBrandSettingsRepository>(), Mock.Of<IRestaurantRepository>(), _store.Object);
        _menus = new MenuService(new MenuRepository(_db), media, new FakeClock(Now), _audit);
        _svc = new SiteService(new SiteRepository(_db), _brandRepo.Object, brandService, _menus, _store.Object, new FakeClock(Now), _audit);
    }

    public void Dispose()
    {
        _db.Dispose();
        GC.SuppressFinalize(this);
    }

    private static SaveSiteRequest Save(Action<SaveSiteRequest>? change = null)
    {
        var request = new SaveSiteRequest
        {
            Theme = "Brasserie",
            Tagline = "Cuisine belge de saison",
            Legal = new SiteLegalDto { Name = "Senne Dorée SRL", CompanyNumber = "0123.456.789" },
        };
        change?.Invoke(request);
        return request;
    }

    private static MemoryStream Jpeg(uint width = 800, uint height = 600)
    {
        using var image = new MagickImage(MagickColors.SteelBlue, width, height) { Format = MagickFormat.Jpeg };
        return new MemoryStream(image.ToByteArray());
    }

    private async Task PublishAsync(int restaurantId = Alpha)
    {
        await _svc.UpdateAsync(restaurantId, Save());
        await _svc.SetPublishedAsync(restaurantId, published: true);
    }

    private async Task<RestaurantSite> RowAsync(int restaurantId = Alpha)
        => await _db.RestaurantSites.AsNoTracking().SingleAsync(s => s.RestaurantId == restaurantId);

    // ── Reading ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Get_ReturnsTheDefaultsOfALocationWithoutASite_AndWritesNothing()
    {
        SiteDto site = await _svc.GetAsync(Alpha);

        Assert.False(site.Exists);
        Assert.Equal("brasserie-de-la-senne-doree", site.Slug);
        Assert.Equal("/r/brasserie-de-la-senne-doree", site.PublicPath);
        Assert.False(site.IsPublished);
        Assert.Equal("Brasserie", site.Theme);
        Assert.Equal("#b45309", site.BrandColor);
        Assert.Equal([SiteFields.MissingLegalName, SiteFields.MissingCompanyNumber], site.Missing);
        Assert.Null(site.UpdatedAt);
        Assert.Empty(_db.RestaurantSites);
    }

    [Fact]
    public async Task Get_NotFound_ForALocationThatDoesNotExist()
    {
        NotFoundException ex = await Assert.ThrowsAsync<NotFoundException>(() => _svc.GetAsync(999));

        Assert.Equal(ErrorCodes.SiteNotFound, ex.Code);
    }

    [Fact]
    public async Task Get_UsesTheBrandEmail_WhenTheLocationHasNone()
    {
        SiteDto site = await _svc.GetAsync(Beta);

        Assert.DoesNotContain(SiteFields.MissingContactEmail, site.Missing);
    }

    [Fact]
    public async Task Get_AsksForAContactEmail_WhenNeitherLevelHasOne()
    {
        _brand.EmailAddress = null;

        SiteDto site = await _svc.GetAsync(Beta);

        Assert.Contains(SiteFields.MissingContactEmail, site.Missing);
    }

    // ── Saving ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Update_CreatesTheSiteAsADraft_WithTheValuesNormalised()
    {
        SiteDto site = await _svc.UpdateAsync(Alpha, Save(r =>
        {
            r.Theme = "Gastronomique";
            r.Tagline = "  Cuisine belge  ";
            r.SocialLinks = [new SiteSocialLinkDto { Kind = "instagram", Url = "https://instagram.com/senne" }];
            r.Legal = new SiteLegalDto { Name = " Senne Dorée SRL ", CompanyNumber = "0123.456.789", VatNumber = "BE 0123.456.789", Address = "Rue des Fabriques 25" };
        }));

        Assert.True(site.Exists);
        Assert.False(site.IsPublished);
        Assert.Equal("Gastronomique", site.Theme);
        Assert.Equal("Cuisine belge", site.Tagline);
        Assert.Equal("Instagram", Assert.Single(site.SocialLinks).Kind);
        Assert.Equal("Senne Dorée SRL", site.Legal.Name);
        Assert.Empty(site.Missing);
        RestaurantSite row = await RowAsync();
        Assert.Equal("brasserie-de-la-senne-doree", row.Slug);
        Assert.Equal(Now, row.CreatedAt);
    }

    [Fact]
    public async Task Update_ReplacesEveryEditableField_SoABlankClearsIt()
    {
        await _svc.UpdateAsync(Alpha, Save(r => r.SocialLinks = [new SiteSocialLinkDto { Kind = "Facebook", Url = "https://facebook.com/x" }]));

        SiteDto site = await _svc.UpdateAsync(Alpha, new SaveSiteRequest { Theme = "Cafe", Tagline = "  ", SocialLinks = null, Legal = null });

        Assert.Equal("Cafe", site.Theme);
        Assert.Null(site.Tagline);
        Assert.Empty(site.SocialLinks);
        Assert.Null(site.Legal.Name);
    }

    [Fact]
    public async Task Update_KeepsTheAddress_WhenNoneIsSent()
    {
        await _svc.UpdateAsync(Alpha, Save(r => r.Slug = "ma-brasserie"));

        SiteDto site = await _svc.UpdateAsync(Alpha, Save(r => r.Slug = "  "));

        Assert.Equal("ma-brasserie", site.Slug);
    }

    [Fact]
    public async Task Update_ChangesTheAddress_ToAFreeValidOne()
    {
        SiteDto site = await _svc.UpdateAsync(Alpha, Save(r => r.Slug = "la-senne"));

        Assert.Equal("la-senne", site.Slug);
        Assert.Equal("/r/la-senne", site.PublicPath);
    }

    [Fact]
    public async Task Update_AcceptsTheAddressTheSiteAlreadyHas()
    {
        await _svc.UpdateAsync(Alpha, Save(r => r.Slug = "la-senne"));

        SiteDto site = await _svc.UpdateAsync(Alpha, Save(r => r.Slug = "la-senne"));

        Assert.Equal("la-senne", site.Slug);
    }

    [Fact]
    public async Task Update_RefusesAnAddressAnotherLocationUses_AndChangesNothing()
    {
        await _svc.UpdateAsync(Alpha, Save(r => r.Slug = "la-senne"));
        await _svc.UpdateAsync(Beta, Save());

        ConflictException ex = await Assert.ThrowsAsync<ConflictException>(() => _svc.UpdateAsync(Beta, Save(r => r.Slug = "la-senne")));

        Assert.Equal(ErrorCodes.SiteSlugTaken, ex.Code);
        Assert.Equal("beta", (await RowAsync(Beta)).Slug);
    }

    [Theory]
    [InlineData("La Senne")]
    [InlineData("ab")]
    [InlineData("a--b")]
    [InlineData("-ab")]
    [InlineData("é-ab")]
    public async Task Update_RefusesAnAddressThatIsNotAValidSlug_AndWritesNothing(string slug)
    {
        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => _svc.UpdateAsync(Alpha, Save(r => r.Slug = slug)));

        Assert.Equal(ErrorCodes.SiteSlugInvalid, ex.Code);
        Assert.Empty(_db.RestaurantSites);
    }

    [Fact]
    public async Task Update_GivesTwoLocationsWithTheSameNameDifferentAddresses()
    {
        _db.Restaurants.Add(new Restaurant { Id = 3, Name = "Brasserie de la Senne Dorée" });
        await _db.SaveChangesAsync();
        await _svc.UpdateAsync(Alpha, Save());

        SiteDto second = await _svc.UpdateAsync(3, Save());

        Assert.Equal("brasserie-de-la-senne-doree-2", second.Slug);
    }

    [Fact]
    public async Task Update_RefusesAnUnknownTheme_AndWritesNothing()
    {
        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => _svc.UpdateAsync(Alpha, Save(r => r.Theme = "Neon")));

        Assert.Equal(ErrorCodes.SiteThemeInvalid, ex.Code);
        Assert.Empty(_db.RestaurantSites);
    }

    [Fact]
    public async Task Update_RefusesALongTagline_AndKeepsTheOldOne()
    {
        await _svc.UpdateAsync(Alpha, Save());

        await Assert.ThrowsAsync<ValidationException>(() => _svc.UpdateAsync(Alpha, Save(r => r.Tagline = new string('x', SiteFields.MaxTaglineLength + 1))));

        Assert.Equal("Cuisine belge de saison", (await RowAsync()).Tagline);
    }

    [Fact]
    public async Task Update_NotFound_ForALocationThatDoesNotExist()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => _svc.UpdateAsync(999, Save()));
        Assert.Empty(_db.RestaurantSites);
    }

    [Fact]
    public async Task Update_RecordsWhoChangedWhatInTheAuditEntry()
    {
        await _svc.UpdateAsync(Alpha, Save());

        Assert.Equal(AuditActions.SiteUpdate, _audit.Action);
        Assert.Equal(Alpha, _audit.RestaurantId);
        Assert.Contains("tagline", _audit.ChangesJson()!, StringComparison.Ordinal);
    }

    // ── Publishing ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Publish_RefusesASiteWithoutItsLegalIdentity_AndNothingGoesLive()
    {
        await _svc.UpdateAsync(Alpha, new SaveSiteRequest { Theme = "Brasserie" });

        BusinessRuleException ex = await Assert.ThrowsAsync<BusinessRuleException>(() => _svc.SetPublishedAsync(Alpha, published: true));

        Assert.Equal(ErrorCodes.SiteNotPublishable, ex.Code);
        Assert.Equal($"{SiteFields.MissingLegalName}, {SiteFields.MissingCompanyNumber}", ex.Args!["missing"]);
        Assert.False((await RowAsync()).IsPublished);
    }

    [Fact]
    public async Task Publish_RefusesASiteWithoutAnyContactEmail()
    {
        _brand.EmailAddress = null;
        await _svc.UpdateAsync(Beta, Save());

        BusinessRuleException ex = await Assert.ThrowsAsync<BusinessRuleException>(() => _svc.SetPublishedAsync(Beta, published: true));

        Assert.Equal(SiteFields.MissingContactEmail, ex.Args!["missing"]);
    }

    [Fact]
    public async Task Publish_GoesLive_WhenTheLegalIdentityAndContactAreThere()
    {
        await _svc.UpdateAsync(Alpha, Save());

        SiteDto site = await _svc.SetPublishedAsync(Alpha, published: true);

        Assert.True(site.IsPublished);
        Assert.True((await RowAsync()).IsPublished);
        Assert.Equal(AuditActions.SitePublish, _audit.Action);
    }

    [Fact]
    public async Task Publish_RefusesAnInstanceWithNoPublicAddress_AndNothingGoesLive()
    {
        var bare = new ConfigurationBuilder().Build();
        var service = new SiteService(
            new SiteRepository(_db), _brandRepo.Object, new BrandService(_brandRepo.Object, bare), _menus, _store.Object, new FakeClock(Now), _audit);
        await service.UpdateAsync(Alpha, Save());

        BusinessRuleException ex = await Assert.ThrowsAsync<BusinessRuleException>(() => service.SetPublishedAsync(Alpha, published: true));

        Assert.Equal(SiteFields.MissingPublicUrl, ex.Args!["missing"]);
        Assert.False((await RowAsync()).IsPublished);
        Assert.Contains(SiteFields.MissingPublicUrl, (await service.GetAsync(Alpha)).Missing);
    }

    [Fact]
    public async Task Publish_AcceptsAnInstanceWhosePublicAddressIsSetInTheBrandSettings()
    {
        _brand.WebsiteUrl = "https://bookings.example.be";
        var bare = new ConfigurationBuilder().Build();
        var service = new SiteService(
            new SiteRepository(_db), _brandRepo.Object, new BrandService(_brandRepo.Object, bare), _menus, _store.Object, new FakeClock(Now), _audit);
        await service.UpdateAsync(Alpha, Save());

        SiteDto site = await service.SetPublishedAsync(Alpha, published: true);

        Assert.True(site.IsPublished);
        Assert.DoesNotContain(SiteFields.MissingPublicUrl, site.Missing);
    }

    [Fact]
    public async Task Update_OfALiveSite_IsNotBlockedByTheInstanceLosingItsPublicAddress()
    {
        await PublishAsync();
        _brand.WebsiteUrl = null;
        var bare = new ConfigurationBuilder().Build();
        var service = new SiteService(
            new SiteRepository(_db), _brandRepo.Object, new BrandService(_brandRepo.Object, bare), _menus, _store.Object, new FakeClock(Now), _audit);

        SiteDto site = await service.UpdateAsync(Alpha, Save(r => r.Tagline = "Une nouvelle accroche"));

        Assert.Equal("Une nouvelle accroche", site.Tagline);
        Assert.True(site.IsPublished);
    }

    [Fact]
    public async Task Publish_RefusesAnArchivedLocation()
    {
        await _svc.UpdateAsync(Alpha, Save());
        (await _db.Restaurants.SingleAsync(r => r.Id == Alpha)).IsArchived = true;
        await _db.SaveChangesAsync();

        BusinessRuleException ex = await Assert.ThrowsAsync<BusinessRuleException>(() => _svc.SetPublishedAsync(Alpha, published: true));

        Assert.Equal(ErrorCodes.SiteLocationArchived, ex.Code);
        Assert.False((await RowAsync()).IsPublished);
    }

    [Fact]
    public async Task Unpublish_TakesTheSiteOffline_EvenWhenItsDetailsHaveSinceGoneMissing()
    {
        await PublishAsync();
        _brand.EmailAddress = null;
        (await _db.Restaurants.SingleAsync(r => r.Id == Alpha)).EmailAddress = null;
        await _db.SaveChangesAsync();

        SiteDto site = await _svc.SetPublishedAsync(Alpha, published: false);

        Assert.False(site.IsPublished);
        Assert.Equal(AuditActions.SiteUnpublish, _audit.Action);
    }

    [Fact]
    public async Task Update_RefusesToEmptyTheLegalIdentityOfALiveSite_AndChangesNothing()
    {
        await PublishAsync();

        BusinessRuleException ex = await Assert.ThrowsAsync<BusinessRuleException>(
            () => _svc.UpdateAsync(Alpha, Save(r => { r.Legal = new SiteLegalDto(); r.Tagline = "Changed"; })));

        Assert.Equal(ErrorCodes.SiteNotPublishable, ex.Code);
        RestaurantSite row = await RowAsync();
        Assert.Equal("Senne Dorée SRL", row.LegalName);
        Assert.Equal("Cuisine belge de saison", row.Tagline);
    }

    [Fact]
    public async Task Update_LetsADraftHaveAnEmptyLegalIdentity()
    {
        await _svc.UpdateAsync(Alpha, Save());

        SiteDto site = await _svc.UpdateAsync(Alpha, Save(r => r.Legal = new SiteLegalDto()));

        Assert.Equal([SiteFields.MissingLegalName, SiteFields.MissingCompanyNumber], site.Missing);
    }

    // ── Pictures ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task SetImage_StoresTheProcessedPicture_UnderARandomName_NotTheLocationsId()
    {
        string? slot = null;
        _store.Setup(s => s.ReplaceAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>()))
            .Callback((string s, string _, Stream _) => slot = s)
            .ReturnsAsync((string s, string ext, Stream _) => $"{s}.{ext}");

        SiteDto site = await _svc.SetImageAsync(Alpha, SiteImageKind.Cover, Jpeg(3000, 2000), "image/jpeg");

        Assert.StartsWith("/media/site-cover-", site.CoverUrl, StringComparison.Ordinal);
        Assert.EndsWith(".jpg", site.CoverUrl, StringComparison.Ordinal);
        Assert.Matches("^site-cover-[A-Za-z0-9_-]{22}$", slot!);
        Assert.DoesNotContain($"-{Alpha}.", site.CoverUrl, StringComparison.Ordinal);
        Assert.Equal(site.CoverUrl, (await RowAsync()).CoverUrl);
    }

    [Fact]
    public async Task SetImage_ReplacingALogoDeletesTheOldFile()
    {
        SiteDto first = await _svc.SetImageAsync(Alpha, SiteImageKind.Logo, Jpeg(), "image/jpeg");

        SiteDto second = await _svc.SetImageAsync(Alpha, SiteImageKind.Logo, Jpeg(), "image/jpeg");

        Assert.NotEqual(first.LogoUrl, second.LogoUrl);
        _store.Verify(s => s.TryDelete(first.LogoUrl!), Times.Once);
        _store.Verify(s => s.TryDelete(second.LogoUrl!), Times.Never);
    }

    [Fact]
    public async Task SetImage_StoresNothing_ForABrokenPicture()
    {
        using var junk = new MemoryStream([1, 2, 3, 4]);

        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => _svc.SetImageAsync(Alpha, SiteImageKind.Cover, junk, "image/jpeg"));

        Assert.Equal(ErrorCodes.SiteImageUnreadable, ex.Code);
        _store.Verify(s => s.ReplaceAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>()), Times.Never);
    }

    [Fact]
    public async Task DeleteImage_ClearsTheColumn_AndDeletesTheFile()
    {
        SiteDto uploaded = await _svc.SetImageAsync(Alpha, SiteImageKind.Cover, Jpeg(), "image/jpeg");

        SiteDto site = await _svc.DeleteImageAsync(Alpha, SiteImageKind.Cover);

        Assert.Null(site.CoverUrl);
        Assert.Null((await RowAsync()).CoverUrl);
        _store.Verify(s => s.TryDelete(uploaded.CoverUrl!), Times.Once);
    }

    [Fact]
    public async Task DeleteImage_WhenThereIsNone_DeletesNothing()
    {
        await _svc.UpdateAsync(Alpha, Save());

        SiteDto site = await _svc.DeleteImageAsync(Alpha, SiteImageKind.Logo);

        Assert.Null(site.LogoUrl);
        _store.Verify(s => s.TryDelete(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task AddPhoto_RefusesAPhotoWithoutADescription_AndStoresNothing()
    {
        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => _svc.AddPhotoAsync(Alpha, "  ", Jpeg(), "image/jpeg"));

        Assert.Equal(ErrorCodes.SitePhotoAltRequired, ex.Code);
        _store.Verify(s => s.ReplaceAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>()), Times.Never);
        Assert.Empty(_db.RestaurantSites);
    }

    [Fact]
    public async Task AddPhoto_KeepsTheProcessedSizeAndTheDescription()
    {
        SiteDto site = await _svc.AddPhotoAsync(Alpha, " La salle ", Jpeg(3000, 2000), "image/jpeg");

        SitePhotoDto photo = Assert.Single(site.Photos);
        Assert.Equal("La salle", photo.Alt);
        Assert.Equal((1200, 800), (photo.Width, photo.Height));
        Assert.Matches("^[A-Za-z0-9_-]{22}$", photo.Id);
        Assert.StartsWith("/media/site-photo-", photo.Url, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AddPhoto_AcceptsTheSixthPhoto()
    {
        for (int i = 0; i < SiteContent.MaxPhotos; i++)
        {
            await _svc.AddPhotoAsync(Alpha, $"Photo {i}", Jpeg(), "image/jpeg");
        }

        Assert.Equal(SiteContent.MaxPhotos, (await _svc.GetAsync(Alpha)).Photos.Count);
    }

    [Fact]
    public async Task AddPhoto_RefusesTheSeventh_AndStoresNothing()
    {
        for (int i = 0; i < SiteContent.MaxPhotos; i++)
        {
            await _svc.AddPhotoAsync(Alpha, $"Photo {i}", Jpeg(), "image/jpeg");
        }
        _store.Invocations.Clear();

        ConflictException ex = await Assert.ThrowsAsync<ConflictException>(() => _svc.AddPhotoAsync(Alpha, "One too many", Jpeg(), "image/jpeg"));

        Assert.Equal(ErrorCodes.SitePhotosFull, ex.Code);
        _store.Verify(s => s.ReplaceAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>()), Times.Never);
        Assert.Equal(SiteContent.MaxPhotos, (await _svc.GetAsync(Alpha)).Photos.Count);
    }

    [Fact]
    public async Task UpdatePhotoAlt_ChangesOnlyTheDescription()
    {
        SiteDto site = await _svc.AddPhotoAsync(Alpha, "Old", Jpeg(), "image/jpeg");
        string id = site.Photos[0].Id;

        SiteDto updated = await _svc.UpdatePhotoAltAsync(Alpha, id, "New");

        Assert.Equal("New", updated.Photos[0].Alt);
        Assert.Equal(site.Photos[0].Url, updated.Photos[0].Url);
    }

    [Fact]
    public async Task UpdatePhotoAlt_RefusesABlankDescription_AndKeepsTheOldOne()
    {
        SiteDto site = await _svc.AddPhotoAsync(Alpha, "Old", Jpeg(), "image/jpeg");

        await Assert.ThrowsAsync<ValidationException>(() => _svc.UpdatePhotoAltAsync(Alpha, site.Photos[0].Id, ""));

        Assert.Equal("Old", (await _svc.GetAsync(Alpha)).Photos[0].Alt);
    }

    [Fact]
    public async Task APhotoOfAnotherLocation_IsNotFound_ForEveryEdit()
    {
        SiteDto mine = await _svc.AddPhotoAsync(Alpha, "Mine", Jpeg(), "image/jpeg");
        await _svc.UpdateAsync(Beta, Save());
        string id = mine.Photos[0].Id;

        await Assert.ThrowsAsync<NotFoundException>(() => _svc.UpdatePhotoAltAsync(Beta, id, "Stolen"));
        await Assert.ThrowsAsync<NotFoundException>(() => _svc.DeletePhotoAsync(Beta, id));
        Assert.Single((await _svc.GetAsync(Alpha)).Photos);
        Assert.Equal("Mine", (await _svc.GetAsync(Alpha)).Photos[0].Alt);
    }

    [Fact]
    public async Task EditingPhotos_NotFound_ForALocationWithoutASite()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => _svc.DeletePhotoAsync(Alpha, "x"));
        await Assert.ThrowsAsync<NotFoundException>(() => _svc.UpdatePhotoAltAsync(Alpha, "x", "y"));
        await Assert.ThrowsAsync<NotFoundException>(() => _svc.ReorderPhotosAsync(Alpha, []));
        Assert.Empty(_db.RestaurantSites);
    }

    [Fact]
    public async Task ReorderPhotos_AppliesTheGivenOrder()
    {
        await _svc.AddPhotoAsync(Alpha, "A", Jpeg(), "image/jpeg");
        await _svc.AddPhotoAsync(Alpha, "B", Jpeg(), "image/jpeg");
        SiteDto site = await _svc.AddPhotoAsync(Alpha, "C", Jpeg(), "image/jpeg");

        SiteDto reordered = await _svc.ReorderPhotosAsync(Alpha, [site.Photos[2].Id, site.Photos[0].Id, site.Photos[1].Id]);

        Assert.Equal(["C", "A", "B"], reordered.Photos.Select(p => p.Alt));
    }

    [Fact]
    public async Task ReorderPhotos_RejectsAListThatMissesOneDuplicatesOneOrAddsOne_AndMovesNothing()
    {
        await _svc.AddPhotoAsync(Alpha, "A", Jpeg(), "image/jpeg");
        SiteDto site = await _svc.AddPhotoAsync(Alpha, "B", Jpeg(), "image/jpeg");
        string a = site.Photos[0].Id;
        string b = site.Photos[1].Id;

        foreach (List<string>? ids in new List<string>?[] { [a], [a, a], [a, b, "extra"], [a, "other"], null })
        {
            ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => _svc.ReorderPhotosAsync(Alpha, ids));
            Assert.Equal(ErrorCodes.SiteReorderIdsMismatch, ex.Code);
        }
        Assert.Equal(["A", "B"], (await _svc.GetAsync(Alpha)).Photos.Select(p => p.Alt));
    }

    [Fact]
    public async Task DeletePhoto_RemovesItFromTheGallery_AndDeletesTheFile()
    {
        SiteDto site = await _svc.AddPhotoAsync(Alpha, "A", Jpeg(), "image/jpeg");

        SiteDto after = await _svc.DeletePhotoAsync(Alpha, site.Photos[0].Id);

        Assert.Empty(after.Photos);
        _store.Verify(s => s.TryDelete(site.Photos[0].Url), Times.Once);
    }

    [Fact]
    public async Task PictureUrls_ListEveryFileTheSiteHolds_AndAreEmptyWithoutASite()
    {
        Assert.Empty(await _svc.GetPictureUrlsAsync(Alpha));
        await _svc.SetImageAsync(Alpha, SiteImageKind.Logo, Jpeg(), "image/jpeg");
        await _svc.SetImageAsync(Alpha, SiteImageKind.Cover, Jpeg(), "image/jpeg");
        await _svc.AddPhotoAsync(Alpha, "A", Jpeg(), "image/jpeg");

        List<string> urls = await _svc.GetPictureUrlsAsync(Alpha);
        _svc.DeletePictures(urls);

        Assert.Equal(3, urls.Count);
        foreach (string url in urls)
        {
            _store.Verify(s => s.TryDelete(url), Times.Once);
        }
    }

    // ── Preview ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Preview_RendersAnUnpublishedSite_MarkedAsADraft()
    {
        await _svc.UpdateAsync(Alpha, Save());

        RenderedSitePage page = await _svc.PreviewAsync(Alpha, theme: null);

        Assert.Contains("class=\"draft\"", page.Html, StringComparison.Ordinal);
        Assert.Contains("noindex", page.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Preview_RendersALocationThatHasNoSiteYet()
    {
        RenderedSitePage page = await _svc.PreviewAsync(Alpha, theme: null);

        Assert.Contains("<h1>Brasserie de la Senne Dorée</h1>", page.Html, StringComparison.Ordinal);
        Assert.Empty(_db.RestaurantSites);
    }

    [Fact]
    public async Task Preview_OfALiveSite_HasNoDraftBanner()
    {
        await PublishAsync();

        RenderedSitePage page = await _svc.PreviewAsync(Alpha, theme: null);

        Assert.DoesNotContain("class=\"draft\"", page.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Preview_ShowsTheRequestedThemeWithoutSavingIt()
    {
        await _svc.UpdateAsync(Alpha, Save());

        RenderedSitePage cafe = await _svc.PreviewAsync(Alpha, "Cafe");
        RenderedSitePage saved = await _svc.PreviewAsync(Alpha, null);

        Assert.NotEqual(cafe.ContentSecurityPolicy, saved.ContentSecurityPolicy);
        Assert.Equal(SiteTheme.Brasserie, (await RowAsync()).Theme);
    }

    [Fact]
    public async Task Preview_RefusesAnUnknownTheme()
    {
        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => _svc.PreviewAsync(Alpha, "Neon"));

        Assert.Equal(ErrorCodes.SiteThemeInvalid, ex.Code);
    }

    [Fact]
    public async Task Preview_NotFound_ForALocationThatDoesNotExist()
        => await Assert.ThrowsAsync<NotFoundException>(() => _svc.PreviewAsync(999, null));

    // ── The public page ──────────────────────────────────────────────────────

    [Fact]
    public async Task Public_RendersALivePage_FromTheLocationsOwnData()
    {
        await PublishAsync();

        RenderedSitePage page = await _svc.RenderPublishedAsync("brasserie-de-la-senne-doree");

        Assert.Contains("<h1>Brasserie de la Senne Dorée</h1>", page.Html, StringComparison.Ordinal);
        Assert.Contains("Rue des Fabriques 25, 1000 Bruxelles", page.Html, StringComparison.Ordinal);
        Assert.Contains("bonjour@senne.example", page.Html, StringComparison.Ordinal);
        Assert.Contains("href=\"https://resto.example.be/r/brasserie-de-la-senne-doree\"", page.Html, StringComparison.Ordinal);
        Assert.DoesNotContain("class=\"draft\"", page.Html, StringComparison.Ordinal);
        Assert.DoesNotContain($"/locations/{Alpha}", page.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Public_ShowsTheClosedDay_AndEachDaysOwnHours()
    {
        (await _db.Restaurants.SingleAsync(r => r.Id == Alpha)).OpenHoursJson = "{\"6\":{\"open\":\"18:00\",\"close\":\"01:00\"}}";
        await _db.SaveChangesAsync();
        await PublishAsync();

        string html = (await _svc.RenderPublishedAsync("brasserie-de-la-senne-doree")).Html;

        Assert.Contains("<th scope=\"row\">Lundi</th><td><span class=\"closed\">Fermé</span></td>", html, StringComparison.Ordinal);
        Assert.Contains("<th scope=\"row\">Mardi</th><td>11:30 – 22:30</td>", html, StringComparison.Ordinal);
        Assert.Contains("<th scope=\"row\">Samedi</th><td>18:00 – 01:00</td>", html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Public_TakesThePhoneFromTheBrand_WhenTheLocationHasNone_AndTheLocationsOwnWhenItHasOne()
    {
        await PublishAsync();
        string brandPhone = (await _svc.RenderPublishedAsync("brasserie-de-la-senne-doree")).Html;
        (await _db.Restaurants.SingleAsync(r => r.Id == Alpha)).PhoneNumber = "+32 2 555 01 23";
        await _db.SaveChangesAsync();
        string ownPhone = (await _svc.RenderPublishedAsync("brasserie-de-la-senne-doree")).Html;

        Assert.Contains("+32 2 000 00 00", brandPhone, StringComparison.Ordinal);
        Assert.Contains("+32 2 555 01 23", ownPhone, StringComparison.Ordinal);
        Assert.DoesNotContain("+32 2 000 00 00", ownPhone, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Public_ShowsOnlyThePublishedMenu()
    {
        MenuDto live = await _menus.CreateMenuAsync(Alpha, new SaveMenuRequest { Name = "Carte" });
        MenuCategoryDto category = await _menus.CreateCategoryAsync(Alpha, live.Id, new SaveMenuCategoryRequest { Name = "Plats", IsVisible = true });
        await _menus.CreateItemAsync(Alpha, category.Id, new SaveMenuItemRequest { Name = "Carbonade flamande", PriceMinor = 2200 });
        await _menus.CreateItemAsync(Alpha, category.Id, new SaveMenuItemRequest { Name = "Plat secret", PriceMinor = 100, Availability = "Hidden" });
        await _menus.SetPublishedAsync(Alpha, live.Id, published: true);
        MenuDto draft = await _menus.CreateMenuAsync(Alpha, new SaveMenuRequest { Name = "Brouillon" });
        MenuCategoryDto draftCategory = await _menus.CreateCategoryAsync(Alpha, draft.Id, new SaveMenuCategoryRequest { Name = "Secrète", IsVisible = true });
        await _menus.CreateItemAsync(Alpha, draftCategory.Id, new SaveMenuItemRequest { Name = "Plat de brouillon", PriceMinor = 100 });
        await PublishAsync();

        string html = (await _svc.RenderPublishedAsync("brasserie-de-la-senne-doree")).Html;

        Assert.Contains("Carbonade flamande", html, StringComparison.Ordinal);
        Assert.Contains("22,00 €", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Plat secret", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Plat de brouillon", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Brouillon", html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Public_NotFound_ForAnUnpublishedSite()
    {
        await _svc.UpdateAsync(Alpha, Save());

        NotFoundException ex = await Assert.ThrowsAsync<NotFoundException>(() => _svc.RenderPublishedAsync("brasserie-de-la-senne-doree"));

        Assert.Equal(ErrorCodes.SiteNotFound, ex.Code);
    }

    [Fact]
    public async Task Public_NotFound_AfterTheSiteIsUnpublished()
    {
        await PublishAsync();
        await _svc.SetPublishedAsync(Alpha, published: false);

        await Assert.ThrowsAsync<NotFoundException>(() => _svc.RenderPublishedAsync("brasserie-de-la-senne-doree"));
    }

    [Fact]
    public async Task Public_NotFound_ForAnArchivedLocation_AndBackWhenItIsRestored()
    {
        await PublishAsync();
        Restaurant alpha = await _db.Restaurants.SingleAsync(r => r.Id == Alpha);
        alpha.IsArchived = true;
        await _db.SaveChangesAsync();

        await Assert.ThrowsAsync<NotFoundException>(() => _svc.RenderPublishedAsync("brasserie-de-la-senne-doree"));

        alpha.IsArchived = false;
        await _db.SaveChangesAsync();
        Assert.NotNull(await _svc.RenderPublishedAsync("brasserie-de-la-senne-doree"));
    }

    [Theory]
    [InlineData("nope-nope")]
    [InlineData("")]
    [InlineData("A")]
    [InlineData("../etc/passwd")]
    [InlineData("%00")]
    public async Task Public_NotFound_ForAnUnknownOrImpossibleSlug(string slug)
    {
        await PublishAsync();

        await Assert.ThrowsAsync<NotFoundException>(() => _svc.RenderPublishedAsync(slug));
    }

    // ── Booking button ───────────────────────────────────────────────────────

    [Fact]
    public async Task BookingPath_LeadsToTheLocationsBookingFlow()
    {
        await PublishAsync();

        Assert.Equal($"/locations/{Alpha}", await _svc.GetBookingPathAsync("brasserie-de-la-senne-doree"));
    }

    [Fact]
    public async Task BookingPath_ForAWalkInOnlyLocation_StaysOnThePage()
    {
        (await _db.Restaurants.SingleAsync(r => r.Id == Alpha)).WalkInOnly = true;
        await _db.SaveChangesAsync();
        await PublishAsync();

        Assert.Equal("/r/brasserie-de-la-senne-doree#contact", await _svc.GetBookingPathAsync("brasserie-de-la-senne-doree"));
    }

    [Fact]
    public async Task BookingPath_NotFound_ForASiteThatIsNotLive()
    {
        await _svc.UpdateAsync(Alpha, Save());

        await Assert.ThrowsAsync<NotFoundException>(() => _svc.GetBookingPathAsync("brasserie-de-la-senne-doree"));
    }

    // ── Sitemap ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Sitemap_ListsLiveSitesOnly()
    {
        await PublishAsync(Alpha);
        _db.Restaurants.Add(new Restaurant { Id = 3, Name = "Gamma", EmailAddress = "g@example.be" });
        _db.Restaurants.Add(new Restaurant { Id = 4, Name = "Delta", EmailAddress = "d@example.be", IsArchived = true });
        await _db.SaveChangesAsync();
        await _svc.UpdateAsync(Beta, Save());
        await PublishAsync(3);
        _db.RestaurantSites.Add(new RestaurantSite { RestaurantId = 4, Slug = "delta", IsPublished = true, CreatedAt = Now, UpdatedAt = Now });
        await _db.SaveChangesAsync();

        string sitemap = await _svc.BuildSitemapAsync();

        Assert.Contains("https://resto.example.be/r/brasserie-de-la-senne-doree", sitemap, StringComparison.Ordinal);
        Assert.Contains("https://resto.example.be/r/gamma", sitemap, StringComparison.Ordinal);
        Assert.DoesNotContain("/r/beta", sitemap, StringComparison.Ordinal);
        Assert.DoesNotContain("/r/delta", sitemap, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Robots_NamesTheSitemapOnTheInstancesAddress()
        => Assert.Contains("Sitemap: https://resto.example.be/sitemap.xml", await _svc.BuildRobotsAsync(), StringComparison.Ordinal);
}
