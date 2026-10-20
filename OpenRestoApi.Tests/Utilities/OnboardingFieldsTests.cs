using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Utilities;

public class OnboardingFieldsTests
{
    [Theory]
    [InlineData("02 123 45 67", "02 123 45 67")]
    [InlineData("+32 2 123 45 67", "+32 2 123 45 67")]
    [InlineData("0470/12.34.56", "0470/12.34.56")]
    [InlineData("  0470 12 34 56  ", "0470 12 34 56")]
    [InlineData("12345678", "12345678")]                  // exactly 8 digits
    [InlineData("123456789012345", "123456789012345")]    // exactly 15 digits
    [InlineData("+(32) 2-123.45.67", "+(32) 2-123.45.67")]
    public void NormalizePhone_AcceptsTheWaysABelgianNumberIsWritten(string input, string expected)
        => Assert.Equal(expected, OnboardingFields.NormalizePhone(input));

    [Theory]
    [InlineData("1234567")]                // 7 digits
    [InlineData("1234 567")]
    [InlineData("1234567890123456")]       // 16 digits
    [InlineData("+32 4701 2345 6789 012")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("call me")]
    [InlineData("abcdefghij")]
    public void NormalizePhone_RefusesTooFewOrTooManyDigits(string? input)
    {
        ValidationException ex = Assert.Throws<ValidationException>(() => OnboardingFields.NormalizePhone(input));

        Assert.Equal(ErrorCodes.OnboardingPhoneRequired, ex.Code);
    }

    [Fact]
    public void NormalizePhone_LeavesTheContactCapToContactFields()
    {
        string tooLong = new('1', ContactLimits.MaxPhoneLength + 1);

        ValidationException ex = Assert.Throws<ValidationException>(() => OnboardingFields.NormalizePhone(tooLong));

        Assert.Equal(ErrorCodes.ContactPhoneTooLong, ex.Code);
    }
}
