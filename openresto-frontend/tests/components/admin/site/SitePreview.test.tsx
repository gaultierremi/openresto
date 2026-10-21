import { render } from "@testing-library/react-native";
import SitePreviewDefault, { SitePreview } from "@/components/admin/site/SitePreview";

describe("SitePreview off web", () => {
  it("renders nothing: the admin is a web surface", () => {
    const view = render(<SitePreview restaurantId={1} theme="Cafe" version={null} />);
    expect(view.toJSON()).toBeNull();
  });

  it("is also the module's default export", () => {
    expect(SitePreviewDefault).toBe(SitePreview);
  });
});
