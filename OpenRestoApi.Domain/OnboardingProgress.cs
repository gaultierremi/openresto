namespace OpenRestoApi.Core.Domain;

/// <summary>The five steps of the setup assistant, in the order the owner meets them.</summary>
public enum OnboardingStep
{
    Info,
    Hours,
    Layout,
    Menu,
    Branding,
}

public enum OnboardingStepState
{
    Todo,
    Done,
    Skipped,
}

/// <summary>
/// Reads and writes <see cref="Restaurant.OnboardingSteps"/>, a comma-separated list such as
/// <c>info:done,hours:done,menu:skipped</c>. A step missing from the list is still to do, and an
/// unreadable entry is ignored rather than throwing, so a hand-edited row cannot lock the owner out.
/// </summary>
/// <seealso>OnboardingProgressTests.IsPublishable_RequiresTheThreeStepsABookingNeeds</seealso>
/// <seealso>OnboardingProgressTests.CanSkip_OnlyForTheOptionalSteps</seealso>
public static class OnboardingProgress
{
    public const int MaxLength = 120;

    public static readonly IReadOnlyList<OnboardingStep> All =
        [OnboardingStep.Info, OnboardingStep.Hours, OnboardingStep.Layout, OnboardingStep.Menu, OnboardingStep.Branding];

    /// <summary>What a guest cannot book without: who and where, when, and at which tables.</summary>
    public static readonly IReadOnlyList<OnboardingStep> Required =
        [OnboardingStep.Info, OnboardingStep.Hours, OnboardingStep.Layout];

    public static bool CanSkip(OnboardingStep step) => !Required.Contains(step);

    public static string KeyOf(OnboardingStep step) => step.ToString().ToLowerInvariant();

    public static bool TryParseKey(string? key, out OnboardingStep step)
    {
        foreach (OnboardingStep candidate in All)
        {
            if (string.Equals(KeyOf(candidate), key?.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                step = candidate;
                return true;
            }
        }

        step = default;
        return false;
    }

    public static OnboardingStepState StateOf(string? stored, OnboardingStep step)
        => Read(stored).GetValueOrDefault(step, OnboardingStepState.Todo);

    public static string Mark(string? stored, OnboardingStep step, OnboardingStepState state)
    {
        Dictionary<OnboardingStep, OnboardingStepState> steps = Read(stored);
        if (state == OnboardingStepState.Todo)
        {
            steps.Remove(step);
        }
        else
        {
            steps[step] = state;
        }

        return string.Join(',', All
            .Where(steps.ContainsKey)
            .Select(s => $"{KeyOf(s)}:{steps[s].ToString().ToLowerInvariant()}"));
    }

    /// <summary>The first step still to do, which is where "resume" lands; null once every step is settled.</summary>
    public static OnboardingStep? Next(string? stored)
    {
        Dictionary<OnboardingStep, OnboardingStepState> steps = Read(stored);
        foreach (OnboardingStep step in All)
        {
            if (!steps.ContainsKey(step))
            {
                return step;
            }
        }

        return null;
    }

    public static bool IsPublishable(string? stored)
        => Required.All(step => StateOf(stored, step) == OnboardingStepState.Done);

    private static Dictionary<OnboardingStep, OnboardingStepState> Read(string? stored)
    {
        var steps = new Dictionary<OnboardingStep, OnboardingStepState>();
        if (string.IsNullOrWhiteSpace(stored))
        {
            return steps;
        }

        foreach (string entry in stored.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            string[] parts = entry.Split(':', 2);
            if (parts.Length == 2
                && TryParseKey(parts[0], out OnboardingStep step)
                && Enum.TryParse(parts[1], ignoreCase: true, out OnboardingStepState state)
                && state != OnboardingStepState.Todo)
            {
                steps[step] = state;
            }
        }

        return steps;
    }
}
