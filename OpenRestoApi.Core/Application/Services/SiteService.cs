using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Services;

/// <summary>
/// A location's one-page website: the settings an admin edits on the "Mon site" screen, the
/// pictures behind it, publishing, and the rendered page a guest gets at <c>/r/{slug}</c>.
/// Everything else the page shows is read from the location at render time, so there is nothing
/// to keep in sync.
/// </summary>
public class SiteService(
    ISiteRepository siteRepository,
    IBrandSettingsRepository brandRepository,
    BrandService brandService,
    MenuService menuService,
    IMediaStore media,
    ISystemClock clock,
    IAuditScope? audit = null)
{
    private readonly ISiteRepository _repo = siteRepository;
    private readonly IBrandSettingsRepository _brandRepository = brandRepository;
    private readonly BrandService _brand = brandService;
    private readonly MenuService _menus = menuService;
    private readonly IMediaStore _media = media;
    private readonly ISystemClock _clock = clock;
    private readonly IAuditScope _audit = audit ?? NullAuditScope.Instance;

    // ── Admin ────────────────────────────────────────────────────────────────

    public async Task<SiteDto> GetAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        RestaurantSite? site = await _repo.FindByRestaurantAsync(restaurantId);
        return ToDto(site ?? await DraftAsync(restaurant), exists: site is not null, restaurant, await _brandRepository.GetAsync());
    }

    public async Task<SiteDto> UpdateAsync(int restaurantId, SaveSiteRequest req)
    {
        (Restaurant restaurant, RestaurantSite site) = await LoadOrCreateAsync(restaurantId);
        BrandSettings? brand = await _brandRepository.GetAsync();

        SiteTheme theme = SiteFields.ParseTheme(req.Theme);
        string? tagline = SiteFields.NormalizeTagline(req.Tagline);
        (bool changeColor, string? color) = SiteFields.NormalizePrimaryColor(req.PrimaryColor);
        List<SiteSocialLink> links = SiteFields.NormalizeSocialLinks(req.SocialLinks);
        string? legalName = SiteFields.NormalizeLegalName(req.Legal?.Name);
        string? companyNumber = SiteFields.NormalizeIdentifier(req.Legal?.CompanyNumber, SiteFields.MaxCompanyNumberLength, "Company number");
        string? vatNumber = SiteFields.NormalizeIdentifier(req.Legal?.VatNumber, SiteFields.MaxVatNumberLength, "VAT number");
        string? legalAddress = SiteFields.NormalizeLegalAddress(req.Legal?.Address);
        string slug = await ResolveSlugAsync(restaurant, site, req.Slug);

        var next = new RestaurantSite
        {
            LegalName = legalName,
            CompanyNumber = companyNumber,
        };
        if (site.IsPublished)
        {
            RequirePublishable(SiteFields.MissingForPublication(next, EffectiveEmail(restaurant, brand)));
        }

        _audit.RecordChange("slug", site.Slug, slug);
        _audit.RecordChange("theme", site.Theme, theme);
        _audit.RecordChange("tagline", site.Tagline, tagline);
        _audit.RecordChange("socialLinks", string.Join(",", SiteContent.ReadSocialLinks(site.SocialLinksJson).Select(l => l.Kind)), string.Join(",", links.Select(l => l.Kind)));
        _audit.RecordChange("legalName", site.LegalName, legalName);
        _audit.RecordChange("companyNumber", site.CompanyNumber, companyNumber);
        _audit.RecordChange("vatNumber", site.VatNumber, vatNumber);
        _audit.RecordChange("legalAddress", site.LegalAddress, legalAddress);

        site.Slug = slug;
        site.Theme = theme;
        site.Tagline = tagline;
        if (changeColor)
        {
            _audit.RecordChange("primaryColor", site.PrimaryColor, color);
            site.PrimaryColor = color;
        }
        site.SocialLinksJson = SiteContent.Write(links);
        site.LegalName = legalName;
        site.CompanyNumber = companyNumber;
        site.VatNumber = vatNumber;
        site.LegalAddress = legalAddress;
        await TouchAndSaveAsync(site);

        Describe(AuditActions.SiteUpdate, restaurant, $"Edited the website of {restaurant.Name}");
        return ToDto(site, exists: true, restaurant, brand);
    }

    /// <summary>
    /// Takes the site live or offline. Going live is refused while the legal notice or the contact
    /// address is missing, and on an archived location; going offline always works.
    /// </summary>
    /// <seealso>SiteServiceTests.Publish_RefusesASiteWithoutItsLegalIdentity_AndNothingGoesLive</seealso>
    /// <seealso>SiteServiceTests.Publish_GoesLive_WhenTheLegalIdentityAndContactAreThere</seealso>
    /// <seealso>SiteServiceTests.Unpublish_TakesTheSiteOffline_EvenWhenItsDetailsHaveSinceGoneMissing</seealso>
    public async Task<SiteDto> SetPublishedAsync(int restaurantId, bool published)
    {
        (Restaurant restaurant, RestaurantSite site) = await LoadOrCreateAsync(restaurantId);
        BrandSettings? brand = await _brandRepository.GetAsync();

        if (published)
        {
            if (restaurant.IsArchived)
            {
                throw new BusinessRuleException("An archived location cannot have a live website.") { Code = ErrorCodes.SiteLocationArchived };
            }
            RequirePublishable(SiteFields.MissingForPublication(site, EffectiveEmail(restaurant, brand), IsPublicUrlConfigured(brand)));
        }

        _audit.RecordChange("isPublished", site.IsPublished, published);
        site.IsPublished = published;
        await TouchAndSaveAsync(site);

        Describe(
            published ? AuditActions.SitePublish : AuditActions.SiteUnpublish,
            restaurant,
            published ? $"Published the website of {restaurant.Name}" : $"Unpublished the website of {restaurant.Name}");
        return ToDto(site, exists: true, restaurant, brand);
    }

    public async Task<SiteDto> SetImageAsync(int restaurantId, SiteImageKind kind, Stream file, string contentType)
    {
        (Restaurant restaurant, RestaurantSite site) = await LoadOrCreateAsync(restaurantId);
        ProcessedImage image = SiteImageProcessor.Process(file, contentType, kind);
        string url = await StoreAsync(kind, image);

        string? previous = kind == SiteImageKind.Logo ? site.LogoUrl : site.CoverUrl;
        if (kind == SiteImageKind.Logo) site.LogoUrl = url; else site.CoverUrl = url;
        await TouchAndSaveAsync(site);
        DeleteFile(previous);

        Describe(AuditActions.SiteImageUpload, restaurant, $"Uploaded the {Name(kind)} of the website of {restaurant.Name}");
        return ToDto(site, exists: true, restaurant, await _brandRepository.GetAsync());
    }

    public async Task<SiteDto> DeleteImageAsync(int restaurantId, SiteImageKind kind)
    {
        (Restaurant restaurant, RestaurantSite site) = await LoadOrCreateAsync(restaurantId);
        string? previous = kind == SiteImageKind.Logo ? site.LogoUrl : site.CoverUrl;
        if (previous is not null)
        {
            if (kind == SiteImageKind.Logo) site.LogoUrl = null; else site.CoverUrl = null;
            await TouchAndSaveAsync(site);
            DeleteFile(previous);
            Describe(AuditActions.SiteImageDelete, restaurant, $"Removed the {Name(kind)} of the website of {restaurant.Name}");
        }
        return ToDto(site, exists: true, restaurant, await _brandRepository.GetAsync());
    }

    /// <summary>Adds a photo to the gallery. The description is required: it is what a screen reader says in its place.</summary>
    /// <seealso>SiteServiceTests.AddPhoto_RefusesAPhotoWithoutADescription_AndStoresNothing</seealso>
    /// <seealso>SiteServiceTests.AddPhoto_AcceptsTheSixthPhoto</seealso>
    /// <seealso>SiteServiceTests.AddPhoto_RefusesTheSeventh_AndStoresNothing</seealso>
    public async Task<SiteDto> AddPhotoAsync(int restaurantId, string? alt, Stream file, string contentType)
    {
        string description = SiteFields.NormalizeAlt(alt);
        (Restaurant restaurant, RestaurantSite site) = await LoadOrCreateAsync(restaurantId);
        List<SitePhoto> photos = SiteContent.ReadPhotos(site.PhotosJson);
        if (photos.Count >= SiteContent.MaxPhotos)
        {
            throw new ConflictException($"A gallery holds at most {SiteContent.MaxPhotos} photos.")
            { Code = ErrorCodes.SitePhotosFull, Args = new Dictionary<string, object> { ["max"] = SiteContent.MaxPhotos } };
        }

        ProcessedImage image = SiteImageProcessor.Process(file, contentType, SiteImageKind.Gallery);
        string url = await StoreAsync(SiteImageKind.Gallery, image);
        photos.Add(new SitePhoto(PublicTokenGenerator.New(), url, description, image.Width, image.Height));
        site.PhotosJson = SiteContent.Write(photos);
        await TouchAndSaveAsync(site);

        Describe(AuditActions.SiteImageUpload, restaurant, $"Added a photo to the website of {restaurant.Name}");
        return ToDto(site, exists: true, restaurant, await _brandRepository.GetAsync());
    }

    public async Task<SiteDto> UpdatePhotoAltAsync(int restaurantId, string photoId, string? alt)
    {
        string description = SiteFields.NormalizeAlt(alt);
        (Restaurant restaurant, RestaurantSite site) = await LoadExistingAsync(restaurantId);
        List<SitePhoto> photos = SiteContent.ReadPhotos(site.PhotosJson);
        int index = photos.FindIndex(p => p.Id == photoId);
        if (index < 0)
        {
            throw NotFound();
        }

        photos[index] = photos[index] with { Alt = description };
        site.PhotosJson = SiteContent.Write(photos);
        await TouchAndSaveAsync(site);

        Describe(AuditActions.SitePhotoUpdate, restaurant, $"Edited a photo description on the website of {restaurant.Name}");
        return ToDto(site, exists: true, restaurant, await _brandRepository.GetAsync());
    }

    public async Task<SiteDto> ReorderPhotosAsync(int restaurantId, List<string>? ids)
    {
        (Restaurant restaurant, RestaurantSite site) = await LoadExistingAsync(restaurantId);
        List<SitePhoto> photos = SiteContent.ReadPhotos(site.PhotosJson);
        ids ??= [];
        if (ids.Count != photos.Count || ids.Distinct().Count() != ids.Count || !ids.All(id => photos.Any(p => p.Id == id)))
        {
            throw new ValidationException("ids must list every photo exactly once, with no additions.")
            { Code = ErrorCodes.SiteReorderIdsMismatch };
        }

        site.PhotosJson = SiteContent.Write(ids.Select(id => photos.First(p => p.Id == id)).ToList());
        await TouchAndSaveAsync(site);

        Describe(AuditActions.SitePhotoReorder, restaurant, $"Reordered the photos of the website of {restaurant.Name}");
        return ToDto(site, exists: true, restaurant, await _brandRepository.GetAsync());
    }

    public async Task<SiteDto> DeletePhotoAsync(int restaurantId, string photoId)
    {
        (Restaurant restaurant, RestaurantSite site) = await LoadExistingAsync(restaurantId);
        List<SitePhoto> photos = SiteContent.ReadPhotos(site.PhotosJson);
        SitePhoto photo = photos.FirstOrDefault(p => p.Id == photoId) ?? throw NotFound();

        photos.Remove(photo);
        site.PhotosJson = SiteContent.Write(photos);
        await TouchAndSaveAsync(site);
        DeleteFile(photo.Url);

        Describe(AuditActions.SiteImageDelete, restaurant, $"Removed a photo from the website of {restaurant.Name}");
        return ToDto(site, exists: true, restaurant, await _brandRepository.GetAsync());
    }

    /// <summary>
    /// The page as it would render now, for the admin to look at before (or after) going live.
    /// <paramref name="theme"/> previews another look without saving it.
    /// </summary>
    /// <seealso>SiteServiceTests.Preview_RendersAnUnpublishedSite_MarkedAsADraft</seealso>
    /// <seealso>SiteServiceTests.Preview_ShowsTheRequestedThemeWithoutSavingIt</seealso>
    public async Task<RenderedSitePage> PreviewAsync(int restaurantId, string? theme)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        RestaurantSite site = await _repo.FindByRestaurantAsync(restaurantId) ?? await DraftAsync(restaurant);
        SiteTheme shown = string.IsNullOrWhiteSpace(theme) ? site.Theme : SiteFields.ParseTheme(theme);
        return SitePageRenderer.Render(await BuildModelAsync(site, restaurant, shown, isDraft: !site.IsPublished));
    }

    /// <summary>
    /// Every picture a location's site holds. Purging the location removes the site row through the
    /// database cascade, which never reaches this service's own file cleanup, so the purge collects
    /// these first and hands them to <see cref="DeletePictures"/> once the rows are gone.
    /// </summary>
    /// <seealso>SitesControllerTests.RestaurantPurge_RemovesTheSiteAndItsPictures</seealso>
    public async Task<List<string>> GetPictureUrlsAsync(int restaurantId)
    {
        RestaurantSite? site = await _repo.FindByRestaurantAsync(restaurantId);
        if (site is null)
        {
            return [];
        }

        return new[] { site.LogoUrl, site.CoverUrl }
            .Concat(SiteContent.ReadPhotos(site.PhotosJson).Select(p => p.Url))
            .OfType<string>()
            .ToList();
    }

    public void DeletePictures(IEnumerable<string> urls)
    {
        foreach (string url in urls)
        {
            DeleteFile(url);
        }
    }

    // ── Public ───────────────────────────────────────────────────────────────

    /// <summary>
    /// The page a guest gets. An unknown slug, a site that is not published and a location that
    /// is archived are one and the same 404, so the address says nothing about which it was.
    /// </summary>
    /// <seealso>SiteServiceTests.Public_NotFound_ForAnUnpublishedSite</seealso>
    /// <seealso>SiteServiceTests.Public_NotFound_ForAnArchivedLocation_AndBackWhenItIsRestored</seealso>
    /// <seealso>SiteServiceTests.Public_NotFound_ForAnUnknownOrImpossibleSlug</seealso>
    public async Task<RenderedSitePage> RenderPublishedAsync(string slug)
    {
        RestaurantSite site = await FindLiveAsync(slug);
        return SitePageRenderer.Render(await BuildModelAsync(site, site.Restaurant!, site.Theme, isDraft: false));
    }

    /// <summary>
    /// Where the "Réserver une table" button leads: the booking flow of this location. A walk-in-only
    /// location has none, so it leads back to the page's contact section.
    /// </summary>
    /// <seealso>SiteServiceTests.BookingPath_LeadsToTheLocationsBookingFlow</seealso>
    /// <seealso>SiteServiceTests.BookingPath_ForAWalkInOnlyLocation_StaysOnThePage</seealso>
    public async Task<string> GetBookingPathAsync(string slug)
    {
        RestaurantSite site = await FindLiveAsync(slug);
        return site.Restaurant!.WalkInOnly
            ? $"/r/{site.Slug}#contact"
            : $"/locations/{site.Restaurant.Id}";
    }

    public async Task<string> BuildSitemapAsync()
    {
        List<RestaurantSite> sites = await _repo.GetPublishedAsync();
        return SiteSitemap.Build(await BaseUrlAsync(), sites.Select(s => (s.Slug, s.UpdatedAt)));
    }

    public async Task<string> BuildRobotsAsync() => SiteSitemap.Robots(await BaseUrlAsync());

    // ── Building ─────────────────────────────────────────────────────────────

    private async Task<SitePageModel> BuildModelAsync(RestaurantSite site, Restaurant restaurant, SiteTheme theme, bool isDraft)
    {
        BrandSettings? brand = await _brandRepository.GetAsync();
        HashSet<int> openDays = restaurant.OpenDays
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(d => int.TryParse(d, out int day) ? day : 0)
            .ToHashSet();

        List<SiteDayHours> hours = Enumerable.Range(1, 7).Select(day =>
        {
            if (!openDays.Contains(day))
            {
                return new SiteDayHours(day, null, null);
            }
            (string open, string close) = OpeningHours.GetHoursForDay(restaurant, day);
            return new SiteDayHours(day, open, close);
        }).ToList();

        return new SitePageModel
        {
            Slug = site.Slug,
            Name = restaurant.Name,
            Tagline = site.Tagline,
            Theme = theme,
            PrimaryColor = site.PrimaryColor ?? brand?.PrimaryColor ?? SitePageModel.DefaultPrimaryColor,
            BaseUrl = _brand.GetWebsiteUrl(brand).TrimEnd('/'),
            LogoUrl = site.LogoUrl,
            CoverUrl = site.CoverUrl,
            Photos = SiteContent.ReadPhotos(site.PhotosJson),
            SocialLinks = SiteContent.ReadSocialLinks(site.SocialLinksJson),
            Address = Blank(restaurant.Address),
            Phone = Blank(restaurant.PhoneNumber) ?? Blank(brand?.PhoneNumber),
            Email = EffectiveEmail(restaurant, brand),
            Cuisines = (restaurant.Tags ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            Hours = hours,
            Menus = await _menus.GetPublishedMenuViewsAsync(restaurant.Id),
            WalkInOnly = restaurant.WalkInOnly,
            LegalName = site.LegalName,
            CompanyNumber = site.CompanyNumber,
            VatNumber = site.VatNumber,
            LegalAddress = site.LegalAddress,
            PrivacyPolicyUrl = Blank(brand?.PrivacyPolicyUrl),
            IsDraft = isDraft,
        };
    }

    private SiteDto ToDto(RestaurantSite site, bool exists, Restaurant restaurant, BrandSettings? brand) => new()
    {
        Exists = exists,
        Slug = site.Slug,
        PublicPath = $"/r/{site.Slug}",
        IsPublished = site.IsPublished,
        Theme = site.Theme.ToString(),
        Tagline = site.Tagline,
        PrimaryColor = site.PrimaryColor,
        LogoUrl = site.LogoUrl,
        CoverUrl = site.CoverUrl,
        Photos = SiteContent.ReadPhotos(site.PhotosJson)
            .Select(p => new SitePhotoDto { Id = p.Id, Url = p.Url, Alt = p.Alt, Width = p.Width, Height = p.Height }).ToList(),
        SocialLinks = SiteContent.ReadSocialLinks(site.SocialLinksJson)
            .Select(l => new SiteSocialLinkDto { Kind = l.Kind, Url = l.Url }).ToList(),
        Legal = new SiteLegalDto
        {
            Name = site.LegalName,
            CompanyNumber = site.CompanyNumber,
            VatNumber = site.VatNumber,
            Address = site.LegalAddress,
        },
        BrandColor = brand?.PrimaryColor ?? SitePageModel.DefaultPrimaryColor,
        Missing = SiteFields.MissingForPublication(site, EffectiveEmail(restaurant, brand), IsPublicUrlConfigured(brand)),
        UpdatedAt = exists ? site.UpdatedAt : null,
    };

    // ── Loading ──────────────────────────────────────────────────────────────

    private async Task<Restaurant> RequireRestaurantAsync(int restaurantId)
        => await _repo.FindRestaurantAsync(restaurantId) ?? throw NotFound();

    private async Task<(Restaurant, RestaurantSite)> LoadExistingAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        RestaurantSite site = await _repo.FindByRestaurantAsync(restaurantId) ?? throw NotFound();
        return (restaurant, site);
    }

    /// <summary>The location's site, created as an unpublished draft the first time something is saved to it.</summary>
    private async Task<(Restaurant, RestaurantSite)> LoadOrCreateAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        RestaurantSite? site = await _repo.FindByRestaurantAsync(restaurantId);
        if (site is null)
        {
            site = await DraftAsync(restaurant);
            _repo.Add(site);
        }
        return (restaurant, site);
    }

    private async Task<RestaurantSite> DraftAsync(Restaurant restaurant)
    {
        DateTime now = _clock.UtcNow;
        return new RestaurantSite
        {
            RestaurantId = restaurant.Id,
            Slug = await UniqueSlugAsync(SiteSlug.From(restaurant.Name), restaurant.Id),
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    private async Task<RestaurantSite> FindLiveAsync(string? slug)
        => (SiteSlug.IsValid(slug) ? await _repo.FindPublishedBySlugAsync(slug!) : null) ?? throw NotFound();

    private async Task<string> ResolveSlugAsync(Restaurant restaurant, RestaurantSite site, string? requested)
    {
        if (string.IsNullOrWhiteSpace(requested))
        {
            return site.Slug;
        }

        string slug = requested.Trim();
        if (!SiteSlug.IsValid(slug))
        {
            throw new ValidationException("The address may only contain lower-case letters, digits and single hyphens, 3 to 60 characters.")
            { Code = ErrorCodes.SiteSlugInvalid };
        }
        if (slug != site.Slug && await _repo.IsSlugTakenAsync(slug, restaurant.Id))
        {
            throw new ConflictException("Another website already uses this address.") { Code = ErrorCodes.SiteSlugTaken };
        }
        return slug;
    }

    private async Task<string> UniqueSlugAsync(string wanted, int restaurantId)
    {
        string slug = wanted;
        for (int attempt = 2; await _repo.IsSlugTakenAsync(slug, restaurantId); attempt++)
        {
            string suffix = $"-{attempt}";
            slug = wanted.Length + suffix.Length > SiteSlug.MaxLength
                ? wanted[..(SiteSlug.MaxLength - suffix.Length)].TrimEnd('-') + suffix
                : wanted + suffix;
        }
        return slug;
    }

    // ── Small helpers ────────────────────────────────────────────────────────

    private async Task<string> StoreAsync(SiteImageKind kind, ProcessedImage image)
    {
        string slot = $"site-{Name(kind)}-{PublicTokenGenerator.New()}";
        using var content = new MemoryStream(image.Data);
        string fileName = await _media.ReplaceAsync(slot, image.Extension, content);
        return $"/media/{fileName}";
    }

    private void DeleteFile(string? url)
    {
        if (!string.IsNullOrEmpty(url))
        {
            _media.TryDelete(url.Contains('?') ? url[..url.IndexOf('?')] : url);
        }
    }

    private async Task TouchAndSaveAsync(RestaurantSite site)
    {
        site.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();
    }

    private async Task<string> BaseUrlAsync()
        => _brand.GetWebsiteUrl(await _brandRepository.GetAsync()).TrimEnd('/');

    private void Describe(string action, Restaurant restaurant, string summary)
        => _audit.Describe(action, AuditTargets.Site, AuditTargets.IdOf(restaurant.Id), restaurant.Name, restaurant.Id, summary);

    private static void RequirePublishable(List<string> missing)
    {
        if (missing.Count > 0)
        {
            throw new BusinessRuleException("The website cannot go live until its legal notice, a contact e-mail and the instance's public address are filled in.")
            { Code = ErrorCodes.SiteNotPublishable, Args = new Dictionary<string, object> { ["missing"] = string.Join(", ", missing) } };
        }
    }

    /// <summary>False while the instance still falls back to the dev server's address, which a canonical link must never name.</summary>
    /// <seealso>SiteServiceTests.Publish_RefusesAnInstanceWithNoPublicAddress_AndNothingGoesLive</seealso>
    private bool IsPublicUrlConfigured(BrandSettings? brand)
        => !string.Equals(_brand.GetWebsiteUrl(brand).TrimEnd('/'), BrandService.DefaultWebsiteUrl, StringComparison.OrdinalIgnoreCase);

    private static string? EffectiveEmail(Restaurant restaurant, BrandSettings? brand)
        => Blank(restaurant.EmailAddress) ?? Blank(brand?.EmailAddress);

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string Name(SiteImageKind kind) => kind switch
    {
        SiteImageKind.Logo => "logo",
        SiteImageKind.Cover => "cover",
        _ => "photo",
    };

    private static NotFoundException NotFound()
        => new("Website not found.") { Code = ErrorCodes.SiteNotFound };
}
