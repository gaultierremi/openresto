using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Domain;

public class OnboardingProgressTests
{
    private static string Settle(params (OnboardingStep Step, OnboardingStepState State)[] marks)
    {
        string? stored = null;
        foreach ((OnboardingStep step, OnboardingStepState state) in marks)
        {
            stored = OnboardingProgress.Mark(stored, step, state);
        }

        return stored ?? string.Empty;
    }

    // ── IsPublishable ────────────────────────────────────────────────────────

    [Fact]
    public void IsPublishable_RequiresTheThreeStepsABookingNeeds()
    {
        string requiredDone = Settle(
            (OnboardingStep.Info, OnboardingStepState.Done),
            (OnboardingStep.Hours, OnboardingStepState.Done),
            (OnboardingStep.Layout, OnboardingStepState.Done));

        Assert.True(OnboardingProgress.IsPublishable(requiredDone));
    }

    [Theory]
    [InlineData(OnboardingStep.Info)]
    [InlineData(OnboardingStep.Hours)]
    [InlineData(OnboardingStep.Layout)]
    public void IsPublishable_RefusesWhenOneRequiredStepIsMissing(OnboardingStep missing)
    {
        string stored = "";
        foreach (OnboardingStep step in OnboardingProgress.Required.Where(s => s != missing))
        {
            stored = OnboardingProgress.Mark(stored, step, OnboardingStepState.Done);
        }

        Assert.False(OnboardingProgress.IsPublishable(stored));
    }

    [Theory]
    [InlineData(OnboardingStep.Info)]
    [InlineData(OnboardingStep.Hours)]
    [InlineData(OnboardingStep.Layout)]
    public void IsPublishable_RefusesWhenOneRequiredStepIsMerelySkipped(OnboardingStep skipped)
    {
        string stored = "";
        foreach (OnboardingStep step in OnboardingProgress.Required)
        {
            stored = OnboardingProgress.Mark(
                stored, step, step == skipped ? OnboardingStepState.Skipped : OnboardingStepState.Done);
        }

        Assert.False(OnboardingProgress.IsPublishable(stored));
    }

    [Theory]
    [InlineData(OnboardingStepState.Todo)]
    [InlineData(OnboardingStepState.Skipped)]
    [InlineData(OnboardingStepState.Done)]
    public void IsPublishable_IgnoresTheOptionalSteps(OnboardingStepState optional)
    {
        string stored = Settle(
            (OnboardingStep.Info, OnboardingStepState.Done),
            (OnboardingStep.Hours, OnboardingStepState.Done),
            (OnboardingStep.Layout, OnboardingStepState.Done),
            (OnboardingStep.Menu, optional),
            (OnboardingStep.Branding, optional));

        Assert.True(OnboardingProgress.IsPublishable(stored));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("menu:done,branding:done")]
    public void IsPublishable_RefusesWhenNothingRequiredIsDone(string? stored)
        => Assert.False(OnboardingProgress.IsPublishable(stored));

    // ── CanSkip ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(OnboardingStep.Menu)]
    [InlineData(OnboardingStep.Branding)]
    public void CanSkip_OnlyForTheOptionalSteps(OnboardingStep step)
        => Assert.True(OnboardingProgress.CanSkip(step));

    [Theory]
    [InlineData(OnboardingStep.Info)]
    [InlineData(OnboardingStep.Hours)]
    [InlineData(OnboardingStep.Layout)]
    public void CanSkip_RefusesTheRequiredSteps(OnboardingStep step)
        => Assert.False(OnboardingProgress.CanSkip(step));

    // ── Mark / StateOf ───────────────────────────────────────────────────────

    [Theory]
    [InlineData(OnboardingStepState.Done)]
    [InlineData(OnboardingStepState.Skipped)]
    public void Mark_ThenStateOf_RoundTrips(OnboardingStepState state)
    {
        string stored = OnboardingProgress.Mark(null, OnboardingStep.Hours, state);

        Assert.Equal(state, OnboardingProgress.StateOf(stored, OnboardingStep.Hours));
        Assert.Equal(OnboardingStepState.Todo, OnboardingProgress.StateOf(stored, OnboardingStep.Info));
    }

    [Fact]
    public void Mark_Todo_RemovesTheEntry()
    {
        string stored = Settle(
            (OnboardingStep.Info, OnboardingStepState.Done),
            (OnboardingStep.Menu, OnboardingStepState.Skipped));

        string reopened = OnboardingProgress.Mark(stored, OnboardingStep.Menu, OnboardingStepState.Todo);

        Assert.Equal("info:done", reopened);
        Assert.Equal(OnboardingStepState.Todo, OnboardingProgress.StateOf(reopened, OnboardingStep.Menu));
    }

    [Fact]
    public void Mark_Todo_OnAnUnmarkedStepChangesNothing()
        => Assert.Equal("info:done",
            OnboardingProgress.Mark("info:done", OnboardingStep.Branding, OnboardingStepState.Todo));

    [Fact]
    public void Mark_ReplacesTheStateOfAStepAlreadyMarked()
        => Assert.Equal("menu:done",
            OnboardingProgress.Mark("menu:skipped", OnboardingStep.Menu, OnboardingStepState.Done));

    [Fact]
    public void Mark_WritesTheStepsInTheOrderTheOwnerMeetsThem()
    {
        string stored = Settle(
            (OnboardingStep.Branding, OnboardingStepState.Skipped),
            (OnboardingStep.Layout, OnboardingStepState.Done),
            (OnboardingStep.Info, OnboardingStepState.Done));

        Assert.Equal("info:done,layout:done,branding:skipped", stored);
    }

    [Fact]
    public void StateOf_IgnoresUnreadableEntries()
    {
        const string stored = "bogus,info:,:done,hours:maybe,layout:todo,menu:done:extra,info:done, branding : SKIPPED ";

        Assert.Equal(OnboardingStepState.Done, OnboardingProgress.StateOf(stored, OnboardingStep.Info));
        Assert.Equal(OnboardingStepState.Todo, OnboardingProgress.StateOf(stored, OnboardingStep.Hours));
        Assert.Equal(OnboardingStepState.Todo, OnboardingProgress.StateOf(stored, OnboardingStep.Layout));
        Assert.Equal(OnboardingStepState.Todo, OnboardingProgress.StateOf(stored, OnboardingStep.Menu));
        Assert.Equal(OnboardingStepState.Skipped, OnboardingProgress.StateOf(stored, OnboardingStep.Branding));
    }

    [Fact]
    public void Mark_DropsUnreadableEntriesWhenItRewrites()
        => Assert.Equal("info:done,hours:done",
            OnboardingProgress.Mark("garbage,info:done", OnboardingStep.Hours, OnboardingStepState.Done));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void StateOf_ABlankListLeavesEveryStepToDo(string? stored)
    {
        foreach (OnboardingStep step in OnboardingProgress.All)
        {
            Assert.Equal(OnboardingStepState.Todo, OnboardingProgress.StateOf(stored, step));
        }
    }

    // ── Next ─────────────────────────────────────────────────────────────────

    [Fact]
    public void Next_IsTheFirstStepWhenNothingIsSettled()
        => Assert.Equal(OnboardingStep.Info, OnboardingProgress.Next(null));

    [Fact]
    public void Next_IsTheFirstStepNotPresent_SkippedCountsAsSettled()
        => Assert.Equal(OnboardingStep.Layout, OnboardingProgress.Next("info:done,hours:skipped"));

    [Fact]
    public void Next_IsNotTheFirstUnsettledOfALaterStep()
        => Assert.Equal(OnboardingStep.Info, OnboardingProgress.Next("hours:done,layout:done"));

    [Fact]
    public void Next_IsNullOnceEveryStepIsSettled()
    {
        string stored = "";
        foreach (OnboardingStep step in OnboardingProgress.All)
        {
            stored = OnboardingProgress.Mark(stored, step, OnboardingStepState.Skipped);
        }

        Assert.Null(OnboardingProgress.Next(stored));
    }

    // ── TryParseKey ──────────────────────────────────────────────────────────

    [Theory]
    [InlineData("info", OnboardingStep.Info)]
    [InlineData("INFO", OnboardingStep.Info)]
    [InlineData("Hours", OnboardingStep.Hours)]
    [InlineData(" layout ", OnboardingStep.Layout)]
    [InlineData("menu", OnboardingStep.Menu)]
    [InlineData("BRANDING", OnboardingStep.Branding)]
    public void TryParseKey_IsCaseInsensitive(string key, OnboardingStep expected)
    {
        Assert.True(OnboardingProgress.TryParseKey(key, out OnboardingStep step));
        Assert.Equal(expected, step);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("0")]
    [InlineData("payment")]
    [InlineData("info:done")]
    public void TryParseKey_RejectsAnUnknownKey(string? key)
        => Assert.False(OnboardingProgress.TryParseKey(key, out _));

    [Fact]
    public void KeyOf_IsTheLowerCaseStepNameThatTryParseKeyReads()
    {
        foreach (OnboardingStep step in OnboardingProgress.All)
        {
            Assert.True(OnboardingProgress.TryParseKey(OnboardingProgress.KeyOf(step), out OnboardingStep parsed));
            Assert.Equal(step, parsed);
        }
    }
}
