/**
 * `@types/react-dom` is not a dependency: only the specs that mount raw DOM (the web-only
 * `*.web.tsx` modules) import `react-dom/client`, and they need just these two members.
 */
declare module "react-dom/client" {
  import type { ReactNode } from "react";

  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }

  export function createRoot(container: Element | DocumentFragment): Root;
}
