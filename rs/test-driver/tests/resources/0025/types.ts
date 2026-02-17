export interface SetDocumentPayload {
  requestId?: number,

  primaryHtml: string | null;
  secondaryHtml?: string | null;
}