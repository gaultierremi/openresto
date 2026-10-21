import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QrTile } from "@/components/admin/qr/QrTile";
import { downloadQrPng, downloadQrSvg } from "@/utils/qrDownload";
import { qrToSvg, svgToDataUri } from "@/utils/qrCode";

jest.mock("@/utils/qrDownload", () => ({
  ...jest.requireActual("@/utils/qrDownload"),
  downloadQrPng: jest.fn(),
  downloadQrSvg: jest.fn(),
}));

const mockPng = downloadQrPng as jest.Mock;
const mockSvg = downloadQrSvg as jest.Mock;

const URL_T4 = "https://resto.test/menu/t/tok4";

function renderTile(
  over: Partial<React.ComponentProps<typeof QrTile>> = {},
  onRegenerate: () => Promise<string | null> = jest.fn().mockResolvedValue(null)
) {
  const props: React.ComponentProps<typeof QrTile> = {
    testID: "tile",
    title: "Table 4",
    subtitle: "Terrace",
    url: URL_T4,
    fileBase: ["Chez Paul", "Table 4"],
    canRegenerate: true,
    onRegenerate,
    ...over,
  };
  const view = render(<QrTile {...props} />);
  return { ...view, props, onRegenerate };
}

describe("QrTile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPng.mockResolvedValue(true);
  });

  describe("display", () => {
    it("shows the title, the section and the address the code opens", () => {
      renderTile();
      expect(screen.getByText("Table 4")).toBeTruthy();
      expect(screen.getByText("Terrace")).toBeTruthy();
      expect(screen.getByTestId("tile-url").props.children).toBe(URL_T4);
    });

    it("omits the subtitle line when there is none", () => {
      renderTile({ subtitle: undefined });
      expect(screen.queryByText("Terrace")).toBeNull();
    });

    it("draws the code for exactly that address, named for the title", () => {
      renderTile();
      const image = screen.getByLabelText("QR code for Table 4");
      expect(image.props.source).toEqual({ uri: svgToDataUri(qrToSvg(URL_T4)) });
    });

    it("redraws the code when the address changes", () => {
      const { rerender, props } = renderTile();
      const before = screen.getByLabelText("QR code for Table 4").props.source.uri;

      rerender(<QrTile {...props} url="https://resto.test/menu/t/other" />);

      const after = screen.getByLabelText("QR code for Table 4").props.source.uri;
      expect(after).toBe(svgToDataUri(qrToSvg("https://resto.test/menu/t/other")));
      expect(after).not.toBe(before);
    });
  });

  describe("downloads", () => {
    it("downloads the PNG under a slug of the restaurant and the table", async () => {
      renderTile();
      await act(async () => fireEvent.press(screen.getByTestId("tile-png")));
      expect(mockPng).toHaveBeenCalledWith("chez-paul-table-4.png", URL_T4);
      expect(mockSvg).not.toHaveBeenCalled();
    });

    it("downloads the SVG of the same code under the same slug", () => {
      renderTile();
      fireEvent.press(screen.getByTestId("tile-svg"));
      expect(mockSvg).toHaveBeenCalledWith("chez-paul-table-4.svg", qrToSvg(URL_T4));
      expect(mockPng).not.toHaveBeenCalled();
    });

    it("names the files after the restaurant alone for the restaurant's own code", async () => {
      renderTile({ fileBase: ["Café Zoë"] });
      await act(async () => fireEvent.press(screen.getByTestId("tile-png")));
      expect(mockPng).toHaveBeenCalledWith("cafe-zoe.png", URL_T4);
    });

    it("says the image could not be made when the PNG fails, and points to the SVG", async () => {
      mockPng.mockResolvedValue(false);
      renderTile();
      await act(async () => fireEvent.press(screen.getByTestId("tile-png")));

      const alert = screen.getByRole("alert");
      expect(alert.props.children).toBe("Couldn’t create the image. Try the SVG instead.");
    });

    it("clears that message on the next PNG that works", async () => {
      mockPng.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      renderTile();
      await act(async () => fireEvent.press(screen.getByTestId("tile-png")));
      expect(screen.getByRole("alert")).toBeTruthy();

      await act(async () => fireEvent.press(screen.getByTestId("tile-png")));
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows nothing after a PNG that works", async () => {
      renderTile();
      await act(async () => fireEvent.press(screen.getByTestId("tile-png")));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("who may regenerate", () => {
    it("offers Regenerate to a caller who may", () => {
      renderTile({ canRegenerate: true });
      expect(screen.getByTestId("tile-regenerate")).toBeTruthy();
    });

    it("does not offer it to one who may not, though downloads stay", () => {
      renderTile({ canRegenerate: false });
      expect(screen.queryByTestId("tile-regenerate")).toBeNull();
      expect(screen.queryByText("Regenerate")).toBeNull();
      expect(screen.getByTestId("tile-png")).toBeTruthy();
      expect(screen.getByTestId("tile-svg")).toBeTruthy();
    });
  });

  describe("regenerating", () => {
    it("asks first, and says the old code stops working at once", () => {
      const { onRegenerate } = renderTile();
      expect(screen.queryByText("Regenerate this QR code?")).toBeNull();

      fireEvent.press(screen.getByTestId("tile-regenerate"));

      expect(screen.getByText("Regenerate this QR code?")).toBeTruthy();
      expect(screen.getByText(/stops working immediately/)).toBeTruthy();
      expect(screen.getByText(/“Table 4”/)).toBeTruthy();
      expect(screen.getByText("Regenerate and stop the old code")).toBeTruthy();
      expect(onRegenerate).not.toHaveBeenCalled();
    });

    it("leaves the token alone on Cancel", () => {
      const { onRegenerate } = renderTile();
      fireEvent.press(screen.getByTestId("tile-regenerate"));
      fireEvent.press(screen.getByText("Cancel"));

      expect(onRegenerate).not.toHaveBeenCalled();
      expect(screen.queryByText("Regenerate this QR code?")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("regenerates on confirm, closes the question and says the new code is ready", async () => {
      const { onRegenerate } = renderTile();
      fireEvent.press(screen.getByTestId("tile-regenerate"));
      await act(async () => fireEvent.press(screen.getByText("Regenerate and stop the old code")));

      expect(onRegenerate).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Regenerate this QR code?")).toBeNull();
      const status = screen.getByRole("status");
      expect(status.props.children).toBe(
        "New code ready. The old one no longer works: print the new one."
      );
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows the failure as an alert, closes the question, and claims no success", async () => {
      const failing = jest.fn().mockResolvedValue("Only an Owner can do that.");
      renderTile({}, failing);
      fireEvent.press(screen.getByTestId("tile-regenerate"));
      await act(async () => fireEvent.press(screen.getByText("Regenerate and stop the old code")));

      expect(screen.getByRole("alert").props.children).toBe("Only an Owner can do that.");
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText("Regenerate this QR code?")).toBeNull();
    });

    it("takes no second confirmation while the first is in flight", async () => {
      let finish: (failure: string | null) => void = () => {};
      const pending = jest.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
      renderTile({}, pending);
      fireEvent.press(screen.getByTestId("tile-regenerate"));

      await act(async () => fireEvent.press(screen.getByText("Regenerate and stop the old code")));
      fireEvent.press(screen.getByText("Regenerate and stop the old code"));
      expect(pending).toHaveBeenCalledTimes(1);

      await act(async () => finish(null));
      expect(screen.getByRole("status")).toBeTruthy();
    });

    it("can be asked again after a failure", async () => {
      const onRegenerate = jest
        .fn()
        .mockResolvedValueOnce("Network error.")
        .mockResolvedValueOnce(null);
      renderTile({}, onRegenerate);

      fireEvent.press(screen.getByTestId("tile-regenerate"));
      await act(async () => fireEvent.press(screen.getByText("Regenerate and stop the old code")));
      expect(screen.getByRole("alert")).toBeTruthy();

      fireEvent.press(screen.getByTestId("tile-regenerate"));
      await act(async () => fireEvent.press(screen.getByText("Regenerate and stop the old code")));
      expect(onRegenerate).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("status")).toBeTruthy();
    });
  });
});
