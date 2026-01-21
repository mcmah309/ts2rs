/**
 * Payload for setting a new document/chapter
 */
export interface SetDocumentPayload {
  headHtml?: string,

  primaryHtml?: string;
  secondaryHtml?: string;

  primaryLangId?: LangId;
  secondaryLangId?: LangId;

  primaryAnnotations?: Annotation[];
  secondaryAnnotations?: Annotation[];

  syncEntries?: SyncEntry[];
}

export type LangId = "en" | "fr" | "es" | "unknown";

export type LayoutMode = "horizontal" | "vertical" | "primaryOnly" | "secondaryOnly";

export type SyncEntry = {
  dataId: string,
  /**
   * Span in the primary (first) element
   */
  primary: TextSpan,
  /**
   * Span in the secondary (second) element
   */
  secondary: TextSpan,
};

/**
 * A span within text content, represented as [start, end] character offsets
 */
export type TextSpan = [number, number];


/**
 * Represents a single annotation/highlight.
 */
export type Annotation = {
  id: string,
  /**
   * The serialized range(s) this annotation covers
   */
  ranges: Array<SerializedRange>,
  /**
   * Optional color for the highlight
   */
  color: string | null,
  /**
   * Timestamp when the annotation was created
   */
  createdAt: number,
  /**
   * Timestamp when the annotation was last modified
   */
  updatedAt: number,
  /**
   * Optional extra data attached to this annotation.
   * Use this to store comments, notes, tags, or any other metadata.
   * @example
   * ```typescript
   * annotation.extra = { 
   *   comment: 'My note here',
   *   tags: ['important', 'review'],
   *   author: 'user@example.com'
   * };
   * ```
   */
  extra: Record<string, any> | null,
};

/**
 * A segment in the path from root to a text node.
 */
export type PathSegment = {
  /**
   * Index of the child node at this level
   */
  index: number,
  /**
   * Optional tag name for validation
   */
  tagName: string | null,
  /**
   * Optional id for faster lookup
   */
  id: string | null,
};

/**
 * A serializable range that can be stored and reapplied later.
 */
export type SerializedRange = {
  /**
   * Start position of the range
   */
  start: TextPosition,
  /**
   * End position of the range
   */
  end: TextPosition,
  /**
   * The text content of the range (for validation)
   */
  text: string,
};

/**
 * A serializable representation of a text position within the DOM.
 * Uses a path from a root element to locate text nodes.
 */
export type TextPosition = {
  /**
   * Path segments from root to the text node (e.g., child indices or element identifiers)
   */
  path: Array<PathSegment>,
  /**
   * Character offset within the text node
   */
  offset: number,
};