import { get } from "./client";
import { apiRequest, readJson } from "@/api/request";

// ── Shapes (mirror LegalDto.cs) ──────────────────────────────────────────────

export interface LegalDocumentSummary {
  key: string;
  version: string;
}

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  key: string;
  version: string;
  title: string;
  language: string;
  /** True until a lawyer has validated the text: every screen that shows a document says so. */
  needsLegalReview: boolean;
  updatedOn: string;
  sections: LegalSection[];
  contentSha256: string;
}

export const fetchLegalDocuments = () =>
  apiRequest(() => get("/legal"), readJson<LegalDocumentSummary[]>);

export const fetchLegalDocument = (key: string) =>
  apiRequest(() => get(`/legal/${encodeURIComponent(key)}`), readJson<LegalDocument>);
