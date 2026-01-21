# Architecture Documentation

This document provides detailed technical information about the internal architecture of ts2rs.

## Overview

ts2rs is a bidirectional type converter that bridges TypeScript and Rust ecosystems through JSON serialization. The tool parses TypeScript types, resolves them to an intermediate representation, and generates corresponding Rust types with serde annotations.

## Directory Structure

```
ts2rs/
├── js/
│   └── ts2rs/
│       ├── src/
│       │   ├── cli.ts          # Command-line interface
│       │   ├── index.ts        # Main API exports
│       │   ├── resolver.ts     # TypeScript type resolution
│       │   ├── generator.ts    # Rust code generation
│       │   └── types.ts        # Type definitions
│       ├── tests/
│       │   └── index.test.ts   # Unit tests
│       └── package.json
├── rs/
│   ├── test-driver/            # Forward test suite
│   │   ├── tests/
│   │   │   ├── mod.rs
│   │   │   └── resources/      # Test cases (0001-0018)
│   │   └── src/lib.rs
│   ├── reverse-test-driver/    # Reverse test suite
│   │   ├── tests/
│   │   │   ├── mod.rs
│   │   │   └── resources/      # Test cases (0001-0005)
│   │   └── src/lib.rs
│   └── reverse-test-bin/       # Test binary for reverse tests
│       └── src/main.rs
└── README.md
```

## Core Components

### 1. TypeResolver (`resolver.ts`)

**Purpose**: Parse TypeScript source files and resolve types to intermediate representation.

**Key Classes**:
- `TypeResolver`: Main class that orchestrates type resolution

**Key Methods**:
- `resolve()`: Entry point that resolves all types from the entry file
- `resolveType(type, sourceFile)`: Resolves a single TypeScript type
- `resolveInterface()`: Handles interface declarations
- `resolveTypeAlias()`: Handles type alias declarations
- `resolveEnum()`: Handles enum declarations
- `resolveUnionType()`: Handles discriminated unions
- `resolveInlineUnionType()`: Handles inline union types and Option patterns
- `handleValueFallback()`: Handles fallback to serde_json::Value with warnings

**Type Resolution Flow**:

```
Entry File
    ↓
Find Type Declarations
    ↓
For each declaration:
    ├── Interface → resolveInterface()
    │       ↓
    │   Resolve each field's type
    │       ↓
    │   Return StructType
    │
    ├── Type Alias → resolveTypeAlias()
    │       ↓
    │   Check if union/enum/object
    │       ↓
    │   Return appropriate type
    │
    └── Enum → resolveEnum()
            ↓
        Return EnumType
```

**Cross-Package Resolution**:

The resolver handles types from external packages (node_modules) by:
1. Detecting if a type's declaration is from node_modules
2. Adding the source file to the ts-morph project
3. Distinguishing between top-level types and nested types
4. Resolving top-level types by name, extracting nested types inline

**Warning System**:

- Tracks all locations where types fall back to `serde_json::Value`
- Collects warnings in `this.warnings` array
- In strict mode, throws `TypeConversionError` instead of returning fallback

### 2. RustGenerator (`generator.ts`)

**Purpose**: Generate Rust code with serde annotations from resolved types.

**Key Classes**:
- `RustGenerator`: Converts intermediate types to Rust code strings

**Key Methods**:
- `generate(collectedTypes)`: Entry point that generates complete Rust file
- `generateStruct()`: Generates struct definitions
- `generateEnum()`: Generates enum definitions
- `generateUnion()`: Generates discriminated union enums
- `resolvedTypeToRust()`: Converts ResolvedType to Rust type string
- `generateImports()`: Generates necessary use statements

**Code Generation Flow**:

```
CollectedType[]
    ↓
Group by kind (struct/enum/union)
    ↓
For each type:
    ├── Struct → #[derive(...)] pub struct Name { fields }
    ├── Enum → #[derive(...)] pub enum Name { variants }
    └── Union → #[derive(...)] #[serde(tag = "...")] pub enum Name { variants }
    ↓
Add imports (use serde::...)
    ↓
Write header comment
    ↓
Return complete Rust file
```

**Serde Annotations**:

- `#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]`: All types
- `#[serde(rename_all = "camelCase")]`: Structs (matches TypeScript convention)
- `#[serde(rename = "...")]`: Enum variants, field names when needed
- `#[serde(skip_serializing_if = "Option::is_none")]`: Optional fields
- `#[serde(tag = "discriminator")]`: Discriminated unions

### 3. Intermediate Representation (`types.ts`)

**Purpose**: Define the intermediate type system that bridges TypeScript and Rust.

**Core Types**:

```typescript
type ResolvedType =
  | PrimitiveType       // string, number, boolean, null, undefined
  | ArrayType           // T[]
  | TupleType           // [T, U, ...]
  | RecordType          // Record<string, T>
  | MapType             // Map<K, V>
  | SetType             // Set<T>
  | OptionType          // T | null | undefined
  | StructType          // interface { ... }
  | EnumType            // enum { ... }
  | UnionType           // type T = A | B | C
  | LiteralType         // "literal" | 123 | true
  | JsonValueType       // serde_json::Value (fallback)
  | TypeAliasType;      // type T = ...
```

**Type Properties**:

Each type in the intermediate representation includes:
- `kind`: Discriminator for the type variant
- Type-specific properties (e.g., `fields` for structs, `variants` for enums)
- Optional `documentation`: JSDoc comments
- Optional `typeParameters`: Generic type parameters (limited support)

### 4. CLI (`cli.ts`)

**Purpose**: Provide command-line interface for the tool.

**Features**:
- Parses command-line arguments using `commander`
- Validates input file existence
- Calls `convert()` API
- Displays warnings to stderr
- Writes output to file or stdout
- Error handling with stack traces in debug mode

## Type Conversion Rules

### Primitive Types

| TypeScript | Intermediate | Rust |
|-----------|--------------|------|
| `string` | `PrimitiveType("string")` | `String` |
| `number` | `PrimitiveType("number")` | `f64` |
| `boolean` | `PrimitiveType("boolean")` | `bool` |
| `null` | `PrimitiveType("null")` | (skipped) |
| `undefined` | `PrimitiveType("undefined")` | (skipped) |

### Complex Types

#### Arrays
- TypeScript: `T[]` or `Array<T>`
- Intermediate: `ArrayType { elementType: T }`
- Rust: `Vec<T>`

#### Tuples
- TypeScript: `[T, U, V]`
- Intermediate: `TupleType { elements: [T, U, V] }`
- Rust: `(T, U, V)`

#### Records
- TypeScript: `Record<string, T>`
- Intermediate: `RecordType { keyType: string, valueType: T }`
- Rust: `std::collections::HashMap<String, T>`

#### Option Pattern
- TypeScript: `T | null` or `T | undefined`
- Intermediate: `OptionType { innerType: T }`
- Rust: `Option<T>`

### Discriminated Unions

TypeScript discriminated unions are detected when:
1. Union has 2+ object types
2. All object types share a common property
3. The common property has different literal values in each variant

**Example**:
```typescript
// TypeScript
type Result = 
  | { success: true; data: string }
  | { success: false; error: string };

// Rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "success")]
pub enum Result {
    #[serde(rename = "true")]
    Success { data: String },
    #[serde(rename = "false")]
    Failure { error: String },
}
```

## Test Architecture

### Forward Tests (test-driver)

**Purpose**: Verify TypeScript → Rust → JSON → TypeScript round-trip.

**Test Structure**:
```
tests/resources/NNNN/
├── types.ts                    # Input TypeScript types
├── TypeName_N.json            # Test data instances
└── generated/
    └── types.rs               # Generated Rust code (created during test)
```

**Test Flow**:
1. Generate Rust types from `types.ts`
2. For each `*.json` file:
   - Parse JSON in TypeScript
   - Serialize to JSON using generated Rust types
   - Deserialize back in TypeScript
   - Compare with original (semantic equality)

### Reverse Tests (reverse-test-driver)

**Purpose**: Verify Rust → JSON output matches expected format.

**Test Structure**:
```
tests/resources/NNNN/
├── types.ts                    # Input TypeScript types
├── rust_test.rs               # Rust code to create test instance
├── expected.json              # Expected JSON output
└── generated/
    └── types.rs               # Generated Rust code (created during test)
```

**Test Flow**:
1. Generate Rust types from `types.ts`
2. Create binary that combines generated types + `rust_test.rs`
3. Compile and run binary to get JSON output
4. Compare output with `expected.json` (semantic equality)

### Test Utilities

Both test drivers share common verification logic:
- JSON semantic comparison (ignores key order)
- Numeric tolerance for floating-point comparisons
- Detailed error messages on mismatch

## Error Handling

### TypeConversionError

Thrown when a TypeScript type cannot be converted to Rust.

**Properties**:
- `typeName`: Name of the problematic type
- `reason`: Explanation of why conversion failed
- `sourceFile`: Optional file path where the error occurred
- `line`: Optional line number

**Common Causes**:
- Type declaration not found
- Function types (not serializable)
- Unsupported TypeScript utility types
- Circular references
- Generic types without concrete type arguments

### Warning System

Non-fatal issues are collected as warnings:
- Type parameter fallback to `serde_json::Value`
- Internal TypeScript types
- Complex types that can't be fully represented
- TypeScript lib types

In strict mode, these warnings become errors.

## Extension Points

### Custom Type Mappings

Users can provide custom mappings for types that need special handling:

```typescript
convert({
  entryFile: './types.ts',
  customTypeMappings: {
    'Date': 'chrono::DateTime<Utc>',
    'BigInt': 'i64',
    'Buffer': 'Vec<u8>',
  },
});
```

### Future Extensions

Potential areas for enhancement:
1. **Generic Type Support**: Better handling of generic types with type arguments
2. **Rust-to-TypeScript**: Reverse code generation
3. **Validation**: Runtime validation code generation
4. **Documentation**: Preserve JSDoc comments in generated code
5. **Custom Derives**: Allow users to specify additional derives
6. **Workspace Support**: Better handling of monorepo structures

## Performance Considerations

### Memory Usage

- ts-morph project maintains AST in memory
- Large codebases may require significant memory
- Types are processed incrementally to avoid redundant work

### Build Time

- TypeScript parsing is the bottleneck
- Cross-package resolution adds overhead
- Caching could improve performance for repeated runs

### Optimization Strategies

1. **Lazy Loading**: Only load source files when needed
2. **Cycle Detection**: Avoid infinite loops on circular types
3. **Type Deduplication**: Reuse already-resolved types
4. **Parallel Processing**: Could parallelize independent type resolutions

## Security Considerations

- No arbitrary code execution (pure static analysis)
- File system access limited to TypeScript source files
- Generated Rust code should be reviewed before use in production
- Cross-package resolution reads from node_modules (trusted sources)

## Debugging

### Debug Mode

Set `DEBUG=1` environment variable for stack traces:

```bash
DEBUG=1 bun js/ts2rs/src/cli.ts -i input.ts
```

### Common Issues

1. **Type not found**: Check that the type is exported
2. **Circular reference**: May cause stack overflow - use type references
3. **Complex union**: May fall back to `serde_json::Value` - consider simplifying
4. **Generic type**: Limited support - provide concrete type or use custom mapping

### Logging

Add console.log statements in resolver/generator for debugging:
- Type resolution decisions
- File path resolution
- Symbol lookups
- Code generation steps
