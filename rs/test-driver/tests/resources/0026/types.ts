export type SyncEntry = {
  id: number,
  /**
   * Weighted span in the primary (first) element
   */
  one: WeightedSpan,
  /**
   * Weighted spans in the secondary (second) element (one-to-many)
   */
  many: WeightedSpan[],
  /**
   * Optional color override as [r, g, b]. If not provided, a color from the palette is used.
   */
  color?: [number, number, number],
  /**
   * Optional metadata associated with this entry (e.g. alignment explanation).
   */
  metadata?: Record<string, unknown>,
  /**
   * When true, arrows on connection lines point from many → one.
   * When false, arrows point from one → many.
   * When null, no arrows are drawn.
   */
  arrowToOne: boolean | null,
};

/**
 * A span within text content, represented as [start, end] character offsets
 */
export type TextSpan = [number, number];

/**
 * A weighted span within text content
 */
export type WeightedSpan = {
  span: TextSpan;
  opacity: number;
};