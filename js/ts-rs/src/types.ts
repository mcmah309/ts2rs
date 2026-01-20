/**
 * Type definitions for TypeScript to Rust type conversion
 */

/**
 * Represents a resolved TypeScript type that can be converted to Rust
 */
export type ResolvedType =
  | PrimitiveType
  | ArrayType
  | TupleType
  | RecordType
  | MapType
  | SetType
  | OptionType
  | StructType
  | EnumType
  | UnionType
  | LiteralType
  | JsonValueType;

export interface PrimitiveType {
  kind: "primitive";
  type: "string" | "number" | "boolean" | "null" | "undefined";
}

export interface ArrayType {
  kind: "array";
  elementType: ResolvedType;
}

export interface TupleType {
  kind: "tuple";
  elements: ResolvedType[];
}

export interface RecordType {
  kind: "record";
  keyType: ResolvedType;
  valueType: ResolvedType;
}

export interface MapType {
  kind: "map";
  keyType: ResolvedType;
  valueType: ResolvedType;
}

export interface SetType {
  kind: "set";
  elementType: ResolvedType;
}

export interface OptionType {
  kind: "option";
  innerType: ResolvedType;
}

export interface StructField {
  name: string;
  type: ResolvedType;
  optional: boolean;
  documentation?: string;
}

export interface StructType {
  kind: "struct";
  name: string;
  fields: StructField[];
  documentation?: string;
  typeParameters?: string[];
}

export interface EnumVariant {
  name: string;
  value?: string | number;
  documentation?: string;
}

export interface EnumType {
  kind: "enum";
  name: string;
  variants: EnumVariant[];
  isStringEnum: boolean;
  documentation?: string;
}

export interface UnionType {
  kind: "union";
  name: string;
  variants: UnionVariant[];
  documentation?: string;
}

export interface UnionVariant {
  name: string;
  type: ResolvedType | null;
  documentation?: string;
}

export interface LiteralType {
  kind: "literal";
  value: string | number | boolean;
}

export interface JsonValueType {
  kind: "json_value";
}

/**
 * Represents a collected type definition that needs to be generated
 */
export interface CollectedType {
  name: string;
  type: StructType | EnumType | UnionType;
  sourceFile: string;
}

/**
 * Options for the TypeScript to Rust converter
 */
export interface ConversionOptions {
  /**
   * The entry file path to start type resolution from
   */
  entryFile: string;

  /**
   * Specific type names to export. If not provided, exports all public types from entry file.
   */
  typeNames?: string[];

  /**
   * Output file path for generated Rust code
   */
  outputPath?: string;

  /**
   * Whether to generate serde attributes
   * @default true
   */
  generateSerdeAttributes?: boolean;

  /**
   * Whether to use camelCase for field names in serde
   * @default true
   */
  useCamelCase?: boolean;

  /**
   * Whether to add skip_serializing_if for Option fields
   * @default true
   */
  skipSerializingNone?: boolean;

  /**
   * Custom type mappings from TypeScript type names to Rust type names
   */
  customTypeMappings?: Record<string, string>;
}

/**
 * Result of the conversion process
 */
export interface ConversionResult {
  /**
   * The generated Rust code
   */
  rustCode: string;

  /**
   * List of types that were converted
   */
  convertedTypes: string[];

  /**
   * Any warnings generated during conversion
   */
  warnings: string[];
}

/**
 * Error thrown when a TypeScript type cannot be converted to Rust
 */
export class TypeConversionError extends Error {
  constructor(
    public readonly typeName: string,
    public readonly reason: string,
    public readonly sourceFile?: string,
    public readonly line?: number,
  ) {
    super(
      `Cannot convert TypeScript type '${typeName}' to Rust: ${reason}${sourceFile ? ` (at ${sourceFile}${line ? `:${line}` : ""})` : ""}`,
    );
    this.name = "TypeConversionError";
  }
}
