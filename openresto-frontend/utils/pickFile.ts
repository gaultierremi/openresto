/**
 * Opens the browser's file chooser and resolves with the chosen file, or null when the choice
 * is dismissed. Web only: the admin is a web surface, and a native build redirects away from it.
 *
 * @see [pickFile.test.ts](../tests/utils/pickFile.test.ts) — pins the accept filter, the chosen
 * file, and that a dismissed chooser resolves null instead of hanging.
 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
