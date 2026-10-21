import {
  initialStage,
  isStepKey,
  neighbour,
  parseStage,
  stepOf,
  stepState,
} from "@/utils/onboardingStages";
import { state } from "@/tests/helpers/onboardingFixtures";

describe("parseStage", () => {
  it("accepts the five steps and the preview, and nothing else", () => {
    for (const key of ["info", "hours", "layout", "menu", "branding", "preview"]) {
      expect(parseStage(key)).toBe(key);
    }
    expect(parseStage("INFO")).toBeNull();
    expect(parseStage("publish")).toBeNull();
    expect(parseStage(undefined)).toBeNull();
    expect(parseStage(["info"])).toBeNull();
  });
});

describe("initialStage", () => {
  it("opens the stage the address names, whatever the steps say", () => {
    expect(initialStage(state({ nextStep: "hours" }), "branding")).toBe("branding");
  });

  it("opens the first step still to do when the address names none", () => {
    expect(initialStage(state({ nextStep: "layout" }), undefined)).toBe("layout");
    expect(initialStage(state({ nextStep: "layout" }), "nonsense")).toBe("layout");
  });

  it("opens the preview once every step is settled", () => {
    expect(initialStage(state({ nextStep: null }), undefined)).toBe("preview");
  });
});

describe("neighbour", () => {
  it("steps through the six stages and stops at both ends", () => {
    expect(neighbour("info", 1)).toBe("hours");
    expect(neighbour("branding", 1)).toBe("preview");
    expect(neighbour("preview", -1)).toBe("branding");
    expect(neighbour("info", -1)).toBeNull();
    expect(neighbour("preview", 1)).toBeNull();
  });
});

describe("step lookups", () => {
  it("reads a step's state and falls back to to-do for one the server omitted", () => {
    const s = state({
      steps: [{ key: "info", state: "Done", canSkip: false }],
    });
    expect(stepState(s, "info")).toBe("Done");
    expect(stepState(s, "menu")).toBe("Todo");
    expect(stepOf(s, "menu")).toBeUndefined();
  });

  it("tells a step from the preview", () => {
    expect(isStepKey("menu")).toBe(true);
    expect(isStepKey("preview")).toBe(false);
  });
});
