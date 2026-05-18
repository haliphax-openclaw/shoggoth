/** Must match <title> in index.html */
export const SPA_DOCUMENT_TITLE = "Shoggoth Canvas";

export interface ResolveCanvasDocumentTitleOptions {
  hasA2UISurface: boolean;
  /** Same-origin iframe `contentDocument`; unavailable when cross-origin */
  iframeContentDocument: Pick<Document, "title"> | null | undefined;
}

/**
 * Parent window tab title: use the iframe document title in static iframe mode;
 * use the fixed SPA title when A2UI is active or the iframe title is unavailable.
 */
export function resolveCanvasDocumentTitle(options: ResolveCanvasDocumentTitleOptions): string {
  if (options.hasA2UISurface) return SPA_DOCUMENT_TITLE;
  try {
    const t = options.iframeContentDocument?.title?.trim();
    return t || SPA_DOCUMENT_TITLE;
  } catch {
    return SPA_DOCUMENT_TITLE;
  }
}
