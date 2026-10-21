using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Tests.Utilities;

public class BelgianBusinessNumberTests
{
    private const string Code = "test.invalid_number";

    // Control digits are 97 - (first eight mod 97):
    //   01234567 -> 49, 12345678 -> 94, 10023456 -> 39.
    [Theory]
    [InlineData("0123456749", "0123.456.749", "BE0123456749")]
    [InlineData("0123.456.749", "0123.456.749", "BE0123456749")]
    [InlineData("0123 456 749", "0123.456.749", "BE0123456749")]
    [InlineData("  0123.456.749  ", "0123.456.749", "BE0123456749")]
    [InlineData("0123-456-749", "0123.456.749", "BE0123456749")]
    [InlineData("BE 0123 456 749", "0123.456.749", "BE0123456749")]
    [InlineData("BE0123.456.749", "0123.456.749", "BE0123456749")]
    [InlineData("be0123456749", "0123.456.749", "BE0123456749")]
    [InlineData("1234567894", "1234.567.894", "BE1234567894")]
    [InlineData("BE 1002.345.639", "1002.345.639", "BE1002345639")]
    public void Normalize_AcceptsTheWaysPeopleWriteAValidNumber(string input, string company, string vat)
    {
        Assert.Equal(company, BelgianBusinessNumber.NormalizeCompanyNumber(input, Code));
        Assert.Equal(vat, BelgianBusinessNumber.NormalizeVat(input, Code));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Normalize_TreatsABlankAsNotProvided(string? input)
    {
        Assert.Null(BelgianBusinessNumber.NormalizeCompanyNumber(input, Code));
        Assert.Null(BelgianBusinessNumber.NormalizeVat(input, Code));
        Assert.Null(BelgianBusinessNumber.TryDigits(input));
    }

    [Theory]
    [InlineData("0123456748")]        // last digit one off
    [InlineData("0123456750")]        // control one above
    [InlineData("0123456649")]        // body digit changed, control kept
    [InlineData("012345674")]         // nine digits
    [InlineData("01234567490")]       // eleven digits
    [InlineData("2123456749")]        // first digit other than 0 or 1
    [InlineData("9999999999")]
    [InlineData("0123abc749")]        // letters
    [InlineData("0123.456.74x")]
    [InlineData("BE")]
    [InlineData("BEBE0123456749")]
    [InlineData("FR0123456749")]
    [InlineData("0123_456_749")]
    public void Normalize_RefusesAWrongCheckDigit(string input)
    {
        ValidationException company = Assert.Throws<ValidationException>(
            () => BelgianBusinessNumber.NormalizeCompanyNumber(input, Code));
        ValidationException vat = Assert.Throws<ValidationException>(
            () => BelgianBusinessNumber.NormalizeVat(input, Code));

        Assert.Equal(Code, company.Code);
        Assert.Equal(Code, vat.Code);
        Assert.Null(BelgianBusinessNumber.TryDigits(input));
    }

    [Fact]
    public void Normalize_RefusesAFirstDigitOtherThanZeroOrOne_EvenWithAMatchingControl()
    {
        // 22345678 mod 97 = 22345678 - 97 * 230367 = 79; control 18 would match, the first digit may not.
        Assert.Null(BelgianBusinessNumber.TryDigits("2234567818"));
    }

    [Fact]
    public void TryDigits_ReturnsTheBareTenDigits()
        => Assert.Equal("0123456749", BelgianBusinessNumber.TryDigits("BE 0123.456.749"));
}
