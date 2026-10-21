import { render } from "@testing-library/react-native";
import OnboardingSitePreviewDefault, {
  OnboardingSitePreview,
} from "@/components/onboarding/OnboardingSitePreview";

describe("OnboardingSitePreview off web", () => {
  it("renders nothing: the assistant is a web surface", () => {
    const view = render(<OnboardingSitePreview restaurantId={1} version={null} />);
    expect(view.toJSON()).toBeNull();
  });

  it("is also the module's default export", () => {
    expect(OnboardingSitePreviewDefault).toBe(OnboardingSitePreview);
  });
});
