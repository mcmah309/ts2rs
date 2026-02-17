
/**
 * Represents a resolved TypeScript type that can be converted to Rust
 */
export type ResolvedType =
  | PrimitiveType       // string, number, boolean, null, undefined
  | ArrayType           // T[]
  | TupleType           // [T, U, ...]
  | RecordType          // Record<string, T>
  | MapType             // Map<K, V>
  | SetType             // Set<T>
  | OptionType          // T | null | undefined
  | BoxType             // Box<T> for recursive types
  | StructType          // interface { ... }
  | EnumType            // enum { ... }
  | UnionType           // type T = A | B | C
  | LiteralType         // "literal" | 123 | true
  | JsonValueType       // serde_json::Value (fallback)
  | TypeAliasType       // type T = ...
  | TypeParameterType;  // Generic type parameter (e.g., T, U)

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

export interface TypeAliasType {
  kind: "type_alias";
  name: string;
  aliasedType: ResolvedType;
  documentation?: string;
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

export interface BoxType {
  kind: "box";
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
  typeArguments?: ResolvedType[];
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
  discriminator?: string; // Field name used for tagging (e.g., "type")
}

export interface UnionVariant {
  name: string;
  type: ResolvedType | null;
  documentation?: string;
  discriminatorValue?: string; // Value of the discriminator for this variant
}

export interface LiteralType {
  kind: "literal";
  value: string | number | boolean;
}

export interface JsonValueType {
  kind: "json_value";
}

export interface TypeParameterType {
  kind: "type_parameter";
  name: string;
}

/**
 * Represents a collected type definition that needs to be generated
 */
export interface CollectedType {
  name: string;
  type: StructType | EnumType | UnionType | TypeAliasType;
  sourceFile: string;
}

/**
 * Custom type mapping configuration with optional field annotations
 */
export interface CustomTypeMapping {
  /**
   * The Rust type name to use
   */
  rustType: string;

  /**
   * Optional field annotations to add when this type is used as a field
   * e.g., ['#[serde(with = "my_module")]', '#[serde(default)]']
   */
  fieldAnnotations?: string[];
}

/**
 * Custom type mappings can be either a simple string (Rust type name)
 * or a full CustomTypeMapping object with field annotations
 */
export type CustomTypeMappingValue = string | CustomTypeMapping;

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
   * Custom type mappings from TypeScript type names to Rust type names or full mapping config
   */
  customTypeMappings?: Record<string, CustomTypeMappingValue>;

  /**
   * Custom header to inject at the top of the generated file (after auto-generated comment)
   */
  customHeader?: string;

  /**
   * Custom footer to inject at the bottom of the generated file
   */
  customFooter?: string;

  /**
   * Custom annotations to add before the default #[derive(...)] on all generated types.
   * e.g., ['#[derive(MyTrait)]', '#[my_macro]']
   */
  customTypeAnnotations?: string[];

  /**
   * Strict mode: fail on unresolvable types instead of falling back to serde_json::Value
   */
  strict?: boolean;
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
