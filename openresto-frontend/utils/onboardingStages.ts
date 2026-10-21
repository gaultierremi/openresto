import {
  PREVIEW_STAGE,
  STAGES,
  STEP_KEYS,
  type Stage,
  type StepKey,
  type StepState,
} from "@/constants/onboarding";
import type { OnboardingState } from "@/api/onboarding";

/** A `?step=` value that names a stage of the assistant, or null for anything else. */
export function parseStage(value: unknown): Stage | null {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value)
    ? (value as Stage)
    : null;
}

/**
 * Where the assistant opens: the stage the address names, else the first step still to do, else
 * the preview once every step is settled. The owner can always jump elsewhere afterwards.
 */
export function initialStage(state: OnboardingState, requested: unknown): Stage {
  return parseStage(requested) ?? state.nextStep ?? PREVIEW_STAGE;
}

/** The stage a step away, or null at either end. */
export function neighbour(stage: Stage, direction: -1 | 1): Stage | null {
  return STAGES[STAGES.indexOf(stage) + direction] ?? null;
}

export const stepOf = (state: OnboardingState, key: StepKey) =>
  state.steps.find((step) => step.key === key);

export const stepState = (state: OnboardingState, key: StepKey): StepState =>
  stepOf(state, key)?.state ?? "Todo";

export const isStepKey = (stage: Stage): stage is StepKey =>
  (STEP_KEYS as readonly string[]).includes(stage);
