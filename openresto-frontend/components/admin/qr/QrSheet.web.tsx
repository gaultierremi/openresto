import { svgToDataUri } from "@/utils/qrCode";
import type { QrSheetCell, QrSheetFormat, QrSheetProps } from "./QrSheet";

/** Table codes per A4 page: two columns by three rows, each code big enough to scan from a hand's reach. */
export const A4_CELLS_PER_PAGE = 6;

export function chunk<T>(list: readonly T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < list.length; i += size) pages.push(list.slice(i, i + size));
  return pages;
}

const PAGE_SIZE: Record<QrSheetFormat, string> = { a4: "A4", a6: "A6" };

/**
 * Screen preview and print rules in one block. Every page is a fixed paper-sized box, so the
 * preview is the print: what the admin sees as a white sheet is what the printer receives, with
 * `@page { margin: 0 }` so the browser's own margins cannot push a row onto a second page.
 * Black on white throughout, whatever the app's theme: a dark page would waste ink and a tinted
 * one would cost a scanner contrast.
 */
export function sheetCss(format: QrSheetFormat): string {
  return `
@page { size: ${PAGE_SIZE[format]}; margin: 0; }
.qr-root { box-sizing: border-box; min-height: 100vh; background: #e9ebee; color: #111; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.qr-root *, .qr-root *::before, .qr-root *::after { box-sizing: border-box; }
.qr-toolbar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; background: #fff; border-bottom: 1px solid #d5d8dd; }
.qr-toolbar p { margin: 0; flex: 1; min-width: 220px; font-size: 13px; color: #4b5563; }
.qr-toolbar button { min-height: 44px; padding: 0 20px; border-radius: 8px; border: 1px solid #0a7ea4; background: #fff; color: #0a7ea4; font-size: 15px; font-weight: 700; cursor: pointer; }
.qr-toolbar button.primary { background: #0a7ea4; color: #fff; }
.qr-pages { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px; }
.qr-page { background: #fff; overflow: hidden; box-shadow: 0 2px 14px rgba(0,0,0,.2); }
.qr-page.a4 { width: 210mm; height: 297mm; padding: 12mm; }
.qr-page.a6 { width: 105mm; height: 148mm; padding: 8mm; }
.qr-head { height: 26mm; text-align: center; }
.qr-head h1 { margin: 0; font-size: 8mm; line-height: 1.15; }
.qr-head p { margin: 2mm 0 0; font-size: 4mm; color: #374151; }
.qr-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, minmax(0, 1fr)); gap: 6mm; height: 245mm; }
.qr-cell { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; border: 0.3mm dashed #9ca3af; border-radius: 3mm; padding: 3mm; text-align: center; overflow: hidden; }
.qr-cell img { width: 54mm; height: 54mm; }
.qr-cell strong { font-size: 6.5mm; line-height: 1.1; }
.qr-cell span { font-size: 3.6mm; color: #4b5563; }
.qr-card { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; border: 0.3mm dashed #9ca3af; border-radius: 3mm; padding: 6mm 4mm; }
.qr-card h1 { margin: 0; font-size: 6.5mm; line-height: 1.15; }
.qr-card p { margin: 0; font-size: 4mm; color: #374151; }
.qr-card img { width: 66mm; height: 66mm; }
.qr-card strong { font-size: 9mm; line-height: 1.1; }
.qr-card small { font-size: 3.2mm; color: #6b7280; }
@media print {
  .qr-root { background: #fff; min-height: 0; }
  .qr-toolbar { display: none; }
  .qr-pages { display: block; padding: 0; }
  .qr-page { box-shadow: none; break-after: page; page-break-after: always; }
  .qr-page:last-child { break-after: auto; page-break-after: auto; }
}
`;
}

function Cell({ cell }: { cell: QrSheetCell }) {
  return (
    <figure className="qr-cell" data-testid="qr-cell">
      <img src={svgToDataUri(cell.svg)} alt="" />
      <figcaption style={{ display: "contents" }}>
        <strong>{cell.label}</strong>
        {cell.caption ? <span>{cell.caption}</span> : null}
      </figcaption>
    </figure>
  );
}

/**
 * The printable sheets. A4 is a grid of table codes under the restaurant's name, six to a page;
 * A6 is one code per page, an easel card to fold or slide into a holder. Pagination is done
 * here, in chunks, rather than left to the browser's page breaking, so a half-empty last page
 * still has the layout of the others and a code is never split across two sheets.
 *
 * @see [QrSheet.test.tsx](../../../tests/components/admin/qr/QrSheet.test.tsx) — pins the page
 * size per format, six cells to an A4 page, one card per A6 page, and the toolbar.
 */
export function QrSheet({ restaurantName, format, cells, labels, onBack }: QrSheetProps) {
  const pages = chunk(cells, format === "a4" ? A4_CELLS_PER_PAGE : 1);

  return (
    <div className="qr-root">
      <style>{sheetCss(format)}</style>
      <div className="qr-toolbar">
        <button type="button" onClick={onBack} data-testid="qr-sheet-back">
          {labels.back}
        </button>
        <p>{labels.hint}</p>
        <button
          type="button"
          className="primary"
          onClick={() => window.print()}
          data-testid="qr-sheet-print"
        >
          {labels.print}
        </button>
      </div>
      <div className="qr-pages">
        {pages.map((page, index) => (
          <section className={`qr-page ${format}`} key={index} data-testid="qr-page">
            {format === "a4" ? (
              <>
                <header className="qr-head">
                  <h1>{restaurantName}</h1>
                  <p>{labels.scan}</p>
                </header>
                <div className="qr-grid">
                  {page.map((cell) => (
                    <Cell key={cell.key} cell={cell} />
                  ))}
                </div>
              </>
            ) : (
              page.map((cell) => (
                <div className="qr-card" key={cell.key} data-testid="qr-cell">
                  <h1>{restaurantName}</h1>
                  <p>{labels.scan}</p>
                  <img src={svgToDataUri(cell.svg)} alt="" />
                  <strong>{cell.label}</strong>
                  <small>{labels.noApp}</small>
                </div>
              ))
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export default QrSheet;
