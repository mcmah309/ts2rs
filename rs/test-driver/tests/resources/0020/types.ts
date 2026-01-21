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
id: string | null, };

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
text: string, };

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
offset: number, };