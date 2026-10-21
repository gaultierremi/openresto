namespace OpenRestoApi.Core.Domain;

/// <summary>Column bounds for the platform's own records, shared by the model and the validators.</summary>
public static class PlatformFields
{
    public const int MaxVatLength = 16;
    public const int MaxSuspensionReasonLength = 300;
    public const int MaxEmailLength = 254;
    public const int MaxLocaleLength = 8;
    public const int TokenHashLength = 64;
    public const int Sha256HexLength = 64;
    public const int MaxPrimaryColorLength = 9;

    /// <summary>The reason a platform operator gives before reading a restaurant's guest data.</summary>
    public const int MinAccessReasonLength = 10;
    public const int MaxAccessReasonLength = 300;
}
