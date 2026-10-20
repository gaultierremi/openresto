import { pickSiteImage, refuseSiteImage, siteImageRefusalMessage } from "@/utils/siteImage";
import { SITE_IMAGE_MAX_BYTES } from "@/constants/site";
import { pickFile } from "@/utils/pickFile";
import i18n from "@/i18n";

jest.mock("@/utils/pickFile", () => ({ pickFile: jest.fn() }));

const pick = pickFile as jest.Mock;

describe("refuseSiteImage", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
    expect(refuseSiteImage({ type, size: 10 })).toBeNull();
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", ""])("refuses the type %p", (type) => {
    expect(refuseSiteImage({ type, size: 10 })).toBe("type");
  });

  it("accepts a file exactly at the cap and refuses one byte over", () => {
    expect(refuseSiteImage({ type: "image/png", size: SITE_IMAGE_MAX_BYTES })).toBeNull();
    expect(refuseSiteImage({ type: "image/png", size: SITE_IMAGE_MAX_BYTES + 1 })).toBe("size");
  });
});

describe("siteImageRefusalMessage", () => {
  it("says each refusal in the viewer's language", () => {
    const t = i18n.getFixedT("en");
    expect(siteImageRefusalMessage("type", t)).toBe(
      "Only JPEG, PNG, and WebP images are accepted."
    );
    expect(siteImageRefusalMessage("size", t)).toBe("The picture must be under 6 MB.");
  });
});

describe("pickSiteImage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("asks the chooser for the three image types", async () => {
    pick.mockResolvedValue(null);
    await pickSiteImage();
    expect(pick).toHaveBeenCalledWith("image/jpeg,image/png,image/webp");
  });

  it("answers null when the chooser is dismissed", async () => {
    pick.mockResolvedValue(null);
    expect(await pickSiteImage()).toBeNull();
  });

  it("hands over an acceptable file", async () => {
    const file = { type: "image/jpeg", size: 5 } as File;
    pick.mockResolvedValue(file);
    expect(await pickSiteImage()).toEqual({ file, refusal: null });
  });

  it("names the refusal instead of handing over a file the server would turn away", async () => {
    pick.mockResolvedValue({ type: "image/gif", size: 5 } as File);
    expect(await pickSiteImage()).toEqual({ file: null, refusal: "type" });
  });
});
