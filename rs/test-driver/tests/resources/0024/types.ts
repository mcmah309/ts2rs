type Update<T> = {
  value: T | null;
  name: string;
  count: number;
  items: T[];
  metadata?: T;
}

export interface SetDocumentPayload {
  requestId?: Update<number>,

  primaryHtml?: Update<string>;
  secondaryHtml?: Update<string>;
}