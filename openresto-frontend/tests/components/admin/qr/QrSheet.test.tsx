/**
 * @jest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import NativeQrSheet, { QrSheet as NativeSheet } from "@/components/admin/qr/QrSheet";
import QrSheetDefault, {
  A4_CELLS_PER_PAGE,
  QrSheet,
  chunk,
  sheetCss,
} from "@/components/admin/qr/QrSheet.web";
import type { QrSheetCell, QrSheetFormat, QrSheetLabels } from "@/components/admin/qr/QrSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>';

const labels: QrSheetLabels = {
  scan: "Scan to see our menu",
  noApp: "No app needed",
  print: "Print",
  back: "Back",
  hint: "Set the paper size to A4",
};

const cells = (count: number, withCaption = true): QrSheetCell[] =>
  Array.from({ length: count }, (_, i) => ({
    key: `c${i}`,
    svg: SVG,
    label: `Table ${i + 1}`,
    caption: withCaption ? `Terrace ${i + 1}` : undefined,
  }));

describe("QrSheet (web)", () => {
  let container: HTMLDivElement;
  let root: Root;
  const print = jest.fn();
  const originalPrint = window.print;

  beforeEach(() => {
    jest.clearAllMocks();
    window.print = print;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.print = originalPrint;
  });

  const mount = (
    format: QrSheetFormat,
    list: QrSheetCell[],
    onBack: () => void = jest.fn(),
    restaurantName = "Chez Paul"
  ) =>
    act(() => {
      root.render(
        <QrSheet
          restaurantName={restaurantName}
          format={format}
          cells={list}
          labels={labels}
          onBack={onBack}
        />
      );
    });

  const pages = () => Array.from(container.querySelectorAll('[data-testid="qr-page"]'));
  const cellsOn = (page: Element) => page.querySelectorAll('[data-testid="qr-cell"]');
  const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement;

  describe("chunk", () => {
    it("splits a list into pages of at most the given size, the last one short", () => {
      expect(chunk([1, 2, 3, 4, 5, 6, 7], 6)).toEqual([[1, 2, 3, 4, 5, 6], [7]]);
    });

    it("keeps a list that fills a page exactly on one page", () => {
      expect(chunk([1, 2, 3, 4, 5, 6], 6)).toEqual([[1, 2, 3, 4, 5, 6]]);
    });

    it("makes one page per item at size 1", () => {
      expect(chunk(["a", "b", "c"], 1)).toEqual([["a"], ["b"], ["c"]]);
    });

    it("makes no page of an empty list", () => {
      expect(chunk([], 6)).toEqual([]);
    });

    it("does not change the list it was given", () => {
      const list = [1, 2, 3];
      chunk(list, 2);
      expect(list).toEqual([1, 2, 3]);
    });
  });

  describe("sheetCss", () => {
    it("sets the page size to A4 for the A4 format", () => {
      expect(sheetCss("a4")).toContain("@page { size: A4; margin: 0; }");
      expect(sheetCss("a4")).not.toContain("size: A6");
    });

    it("sets the page size to A6 for the A6 format", () => {
      expect(sheetCss("a6")).toContain("@page { size: A6; margin: 0; }");
      expect(sheetCss("a6")).not.toContain("size: A4");
    });

    it("lays an A4 page out as two columns by three rows, the six cells per page", () => {
      const css = sheetCss("a4");
      expect(A4_CELLS_PER_PAGE).toBe(6);
      expect(css).toContain("grid-template-columns: 1fr 1fr;");
      expect(css).toContain("grid-template-rows: repeat(3, minmax(0, 1fr));");
    });

    it("sizes each sheet to the paper, so the preview is the print", () => {
      const css = sheetCss("a4");
      expect(css).toContain(".qr-page.a4 { width: 210mm; height: 297mm;");
      expect(css).toContain(".qr-page.a6 { width: 105mm; height: 148mm;");
    });

    it("breaks the page after each sheet and hides the toolbar when printing", () => {
      const css = sheetCss("a4");
      const print = css.slice(css.indexOf("@media print"));
      expect(print).toContain(".qr-toolbar { display: none; }");
      expect(print).toContain("break-after: page;");
      expect(print).toContain(".qr-page:last-child { break-after: auto;");
    });

    it("is written into the rendered sheet for the chosen format", () => {
      mount("a6", cells(1));
      expect(container.querySelector("style")?.textContent).toContain("size: A6");
    });
  });

  describe("A4", () => {
    it("puts six codes on a page", () => {
      mount("a4", cells(6));
      expect(pages()).toHaveLength(1);
      expect(cellsOn(pages()[0])).toHaveLength(6);
    });

    it("starts a second page for a seventh code", () => {
      mount("a4", cells(7));
      expect(pages()).toHaveLength(2);
      expect(cellsOn(pages()[0])).toHaveLength(6);
      expect(cellsOn(pages()[1])).toHaveLength(1);
    });

    it("needs three pages from thirteen codes", () => {
      mount("a4", cells(13));
      expect(pages().map((p) => cellsOn(p).length)).toEqual([6, 6, 1]);
    });

    it("tags each page as an A4 sheet", () => {
      mount("a4", cells(7));
      pages().forEach((page) => {
        expect(page.classList.contains("a4")).toBe(true);
        expect(page.classList.contains("a6")).toBe(false);
      });
    });

    it("puts the restaurant's name and the scan prompt at the head of every page", () => {
      mount("a4", cells(7));
      pages().forEach((page) => {
        expect(page.querySelector("h1")?.textContent).toBe("Chez Paul");
        expect(page.querySelector("header p")?.textContent).toBe(labels.scan);
      });
    });

    it("draws each code as an image of the SVG, with the label and the caption", () => {
      mount("a4", cells(1));
      const cell = cellsOn(pages()[0])[0];
      const img = cell.querySelector("img") as HTMLImageElement;
      expect(img.getAttribute("src")).toBe(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`
      );
      expect(img.getAttribute("alt")).toBe("");
      expect(cell.querySelector("strong")?.textContent).toBe("Table 1");
      expect(cell.querySelector("span")?.textContent).toBe("Terrace 1");
    });

    it("leaves out the caption of a cell that has none", () => {
      mount("a4", cells(1, false));
      const cell = cellsOn(pages()[0])[0];
      expect(cell.querySelector("strong")?.textContent).toBe("Table 1");
      expect(cell.querySelector("span")).toBeNull();
    });
  });

  describe("A6", () => {
    it("makes one card per page", () => {
      mount("a6", cells(3));
      expect(pages()).toHaveLength(3);
      pages().forEach((page) => expect(cellsOn(page)).toHaveLength(1));
    });

    it("makes a single page of a single code", () => {
      mount("a6", cells(1));
      expect(pages()).toHaveLength(1);
    });

    it("tags each page as an A6 sheet", () => {
      mount("a6", cells(2));
      pages().forEach((page) => {
        expect(page.classList.contains("a6")).toBe(true);
        expect(page.classList.contains("a4")).toBe(false);
      });
    });

    it("carries the name, the prompt, the code, the label and the no-app note on the card", () => {
      mount("a6", cells(1));
      const card = cellsOn(pages()[0])[0];
      expect(card.classList.contains("qr-card")).toBe(true);
      expect(card.querySelector("h1")?.textContent).toBe("Chez Paul");
      expect(card.querySelector("p")?.textContent).toBe(labels.scan);
      expect(card.querySelector("img")?.getAttribute("src")).toContain("data:image/svg+xml");
      expect(card.querySelector("strong")?.textContent).toBe("Table 1");
      expect(card.querySelector("small")?.textContent).toBe(labels.noApp);
    });

    it("does not print a grid, which is for A4", () => {
      mount("a6", cells(1));
      expect(container.querySelector(".qr-grid")).toBeNull();
      expect(container.querySelector("header")).toBeNull();
    });
  });

  describe("toolbar", () => {
    it("shows the hint, a Back button and a Print button", () => {
      mount("a4", cells(1));
      expect(container.querySelector(".qr-toolbar p")?.textContent).toBe(labels.hint);
      expect(byTestId("qr-sheet-back").textContent).toBe("Back");
      expect(byTestId("qr-sheet-print").textContent).toBe("Print");
    });

    it("goes back on Back, without printing", () => {
      const onBack = jest.fn();
      mount("a4", cells(1), onBack);
      act(() => byTestId("qr-sheet-back").click());
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(print).not.toHaveBeenCalled();
    });

    it("opens the browser's print dialog on Print, without going back", () => {
      const onBack = jest.fn();
      mount("a4", cells(1), onBack);
      act(() => byTestId("qr-sheet-print").click());
      expect(print).toHaveBeenCalledTimes(1);
      expect(onBack).not.toHaveBeenCalled();
    });

    it("keeps both buttons off the form submit path", () => {
      mount("a4", cells(1));
      expect(byTestId("qr-sheet-back").getAttribute("type")).toBe("button");
      expect(byTestId("qr-sheet-print").getAttribute("type")).toBe("button");
    });
  });

  it("is also the module's default export", () => {
    expect(QrSheetDefault).toBe(QrSheet);
  });
});

describe("QrSheet (native)", () => {
  it("draws nothing: the sheets are a web-only surface", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <NativeSheet
          restaurantName="Chez Paul"
          format="a4"
          cells={cells(3)}
          labels={labels}
          onBack={jest.fn()}
        />
      );
    });
    expect(container.innerHTML).toBe("");
    act(() => root.unmount());
  });

  it("keeps the named export and the default in step", () => {
    expect(NativeQrSheet).toBe(NativeSheet);
  });
});
