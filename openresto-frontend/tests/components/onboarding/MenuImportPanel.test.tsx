import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { MenuImportPanel } from "@/components/onboarding/MenuImportPanel";
import { importMenuText, importMenuPhoto } from "@/api/onboarding";
import { pickSiteImage } from "@/utils/siteImage";
import { ok, refused } from "@/tests/helpers/onboardingFixtures";
import i18n from "@/i18n";

jest.mock("@/api/onboarding", () => ({ importMenuText: jest.fn(), importMenuPhoto: jest.fn() }));
jest.mock("@/utils/siteImage", () => ({
  pickSiteImage: jest.fn(),
  siteImageRefusalMessage: () => "Invalid photo",
}));
jest.mock("@/context/BrandContext", () => ({ useBrand: () => ({ primaryColor: "#215d49" }) }));
const proposal = {
  name: "Carte",
  categories: [{ name: "Plats", items: [{ name: "Soupe", priceMinor: 850, description: null }] }],
};
const props = () => ({
  restaurantId: 7,
  readOnly: false,
  onExpired: jest.fn(),
  onAccept: jest.fn(),
});
const press = async (id: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(id));
  });
};
beforeEach(() => jest.clearAllMocks());

it.each(["fr", "nl", "en"])(
  "proposes in %s and only hands the draft back after explicit acceptance",
  async (language) => {
    jest.mocked(importMenuText).mockResolvedValue(ok(proposal));
    const callbacks = props();
    render(<MenuImportPanel {...callbacks} />);
    expect(screen.getByTestId("import-propose")).toBeDisabled();
    fireEvent.press(screen.getByTestId(`import-language-${language}`));
    fireEvent.changeText(screen.getByTestId("import-text"), "Soupe 8,50");
    await press("import-propose");
    expect(importMenuText).toHaveBeenCalledWith(7, "Soupe 8,50", language);
    expect(screen.getByTestId("import-proposals")).toBeTruthy();
    expect(callbacks.onAccept).not.toHaveBeenCalled();
    await press("import-accept");
    expect(callbacks.onAccept).toHaveBeenCalledWith(proposal);
    expect(screen.queryByTestId("import-proposals")).toBeNull();
  }
);

it("discards proposals when the source changes or the reviewer cancels", async () => {
  jest.mocked(importMenuText).mockResolvedValue(ok(proposal));
  const callbacks = props();
  render(<MenuImportPanel {...callbacks} />);
  fireEvent.changeText(screen.getByTestId("import-text"), "Soupe 8");
  await press("import-propose");
  fireEvent.press(screen.getByText("Cancel"));
  expect(screen.queryByTestId("import-proposals")).toBeNull();
  await press("import-propose");
  fireEvent.changeText(screen.getByTestId("import-text"), "Other");
  expect(screen.queryByTestId("import-proposals")).toBeNull();
  expect(callbacks.onAccept).not.toHaveBeenCalled();
});

it("shows a refusal without accepting anything and expires a lost session", async () => {
  jest
    .mocked(importMenuText)
    .mockResolvedValueOnce(refused("Invalid menu", 400, "onboarding.menu_invalid"))
    .mockResolvedValueOnce(refused("Expired", 401));
  const callbacks = props();
  render(<MenuImportPanel {...callbacks} />);
  fireEvent.changeText(screen.getByTestId("import-text"), "Invalid");
  await press("import-propose");
  expect(screen.getByTestId("import-error")).toHaveTextContent("Invalid menu");
  await press("import-propose");
  expect(callbacks.onExpired).toHaveBeenCalled();
  expect(callbacks.onAccept).not.toHaveBeenCalled();
});

it("does not upload a cancelled or refused photo and proposes a valid one", async () => {
  const file = { name: "menu.png" } as File;
  jest
    .mocked(pickSiteImage)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ file: null, refusal: "size" })
    .mockResolvedValueOnce({ file, refusal: null });
  jest.mocked(importMenuPhoto).mockResolvedValue(ok(proposal));
  const callbacks = props();
  render(<MenuImportPanel {...callbacks} />);
  await press("import-photo");
  expect(importMenuPhoto).not.toHaveBeenCalled();
  await press("import-photo");
  expect(screen.getByTestId("import-error")).toHaveTextContent("Invalid photo");
  expect(importMenuPhoto).not.toHaveBeenCalled();
  await press("import-photo");
  expect(importMenuPhoto).toHaveBeenCalledWith(7, file, "en");
  expect(screen.getByTestId("import-proposals")).toBeTruthy();
  expect(callbacks.onAccept).not.toHaveBeenCalled();
});

it("disables importing for a read-only restaurant", async () => {
  render(<MenuImportPanel {...props()} readOnly />);
  expect(screen.getByTestId("import-photo")).toBeDisabled();
  expect(screen.getByTestId("import-propose")).toBeDisabled();
  expect(screen.getByTestId("import-text").props.editable).toBe(false);
  await press("import-photo");
  expect(pickSiteImage).not.toHaveBeenCalled();
});

it("falls back to French for an unsupported source language and preserves a price on request", async () => {
  await i18n.changeLanguage("de");
  jest.mocked(importMenuText).mockResolvedValue(
    ok({
      name: "Carte",
      categories: [
        { name: "Plats", items: [{ name: "Eau", priceMinor: null, description: null }] },
      ],
    })
  );
  render(<MenuImportPanel {...props()} />);
  fireEvent.changeText(screen.getByTestId("import-text"), "Eau");
  await press("import-propose");
  expect(importMenuText).toHaveBeenCalledWith(7, "Eau", "fr");
  expect(screen.getByTestId("import-proposals")).toHaveTextContent(/Eau/);
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

it("keeps a photo recognition refusal out of the editable draft", async () => {
  jest
    .mocked(pickSiteImage)
    .mockResolvedValue({ file: { name: "menu.png" } as File, refusal: null });
  jest.mocked(importMenuPhoto).mockResolvedValue(refused("Unreadable photo", 400));
  const callbacks = props();
  render(<MenuImportPanel {...callbacks} />);
  await press("import-photo");
  expect(screen.getByTestId("import-error")).toHaveTextContent("Unreadable photo");
  expect(screen.queryByTestId("import-proposals")).toBeNull();
  expect(callbacks.onAccept).not.toHaveBeenCalled();
});
