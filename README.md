# ts-rs

A TypeScript to Rust type converter for bidirectional JSON serialization. This tool generates Rust type definitions from TypeScript types, enabling seamless data interchange between TypeScript and Rust applications via JSON. Nested types are traversed, even types in different packages.

## Installation

todo Update

## Usage

### CLI

```bash
# Basic usage - convert all exported types
bun js/ts-rs/src/cli.ts -i input.ts -o output.rs

# Convert specific types
bun js/ts-rs/src/cli.ts -i input.ts -o output.rs -t User,Post,Comment

# Strict mode - fail on unresolvable types (default is to print warnings and use `serde_json::Value`)
bun js/ts-rs/src/cli.ts -i input.ts -o output.rs --strict

# Custom type mappings
bun js/ts-rs/src/cli.ts -i input.ts -o output.rs -m Date:chrono::DateTime,BigInt:i64
```

#### CLI Options

- `-i, --input <path>`: Path to the TypeScript entry file (required)
- `-o, --output <path>`: Output path for the generated Rust file
- `-t, --types <names>`: Comma-separated list of type names to convert
- `-m, --mapping <mappings>`: Custom type mappings (format: `TypeScriptName:RustName,...`)
- `-s, --strict`: Strict mode - fail on unresolvable types
- `--version`: Show version
- `-h, --help`: Show help

### Programmatic API

todo Update

```typescript
import { convert } from './js/ts-rs/src/index';

const result = await convert({
  entryFile: './src/types.ts',
  typeNames: ['User', 'Post'],
  outputPath: './generated/types.rs',
  strict: false,
  customTypeMappings: {
    Date: 'chrono::DateTime<Utc>',
  },
});

console.log(result.rustCode);
console.log(result.warnings);
```

## Examples

### Basic Interface

**TypeScript:**
```typescript
export interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  active: boolean;
}
```

**Generated Rust:**
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
    pub age: f64,
    pub active: bool,
}
```

### Enums

**TypeScript:**
```typescript
export enum OrderStatus {
  Pending = "pending",
  Processing = "processing",
  Shipped = "shipped",
  Delivered = "delivered",
}
```

**Generated Rust:**
```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum OrderStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "processing")]
    Processing,
    #[serde(rename = "shipped")]
    Shipped,
    #[serde(rename = "delivered")]
    Delivered,
}
```

### Discriminated Unions

**TypeScript:**
```typescript
export type Shape =
  | { type: "circle"; radius: number }
  | { type: "rectangle"; width: number; height: number }
  | { type: "triangle"; base: number; height: number };
```

**Generated Rust:**
```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Shape {
    #[serde(rename = "circle")]
    Circle { radius: f64 },
    #[serde(rename = "rectangle")]
    Rectangle { width: f64, height: f64 },
    #[serde(rename = "triangle")]
    Triangle { base: f64, height: f64 },
}
```

### Optional Fields

**TypeScript:**
```typescript
export interface Product {
  id: string;
  name: string;
  description?: string;
  tags: string[];
}
```

**Generated Rust:**
```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub tags: Vec<String>,
}
```

## Internals

### Type Resolution Process

```
TypeScript AST → ts-morph Parser → TypeResolver → Intermediate Types → RustGenerator → Rust Code
```

### Intermediate Representation

The intermediate representation types are resolved to a discriminated union (`ResolvedType`) that includes:

- Primitives (string, number, boolean, null, undefined)
- Arrays and tuples
- Structs (interfaces/object types)
- Enums (string/numeric)
- Unions (discriminated unions)
- Options (nullable types)
- Records and Maps
- Literals
- JsonValue (fallback for unresolvable types)

### Warning System

The resolver tracks cases where types fall back to `serde_json::Value` (Handling is not possible or unknown).

In **strict mode** (`--strict`), these cases throw errors instead of warnings, except for:
- Explicit `any` types (intentional fallback)
- Explicit `unknown` types (intentional fallback)

## Testing

### Forward Tests (TypeScript → Rust (Generated), Rust Validation With JSON Data)

```bash
cd rs
cargo test --package test-driver -- --test-threads=1
```

### Reverse Tests (TypeScript → Rust (Generated), Rust Data → JSON, JSON → TypeScript, Typescript Validation)

```bash
cd rs
cargo test --package reverse-test-driver -- --test-threads=1
```

## Type Mapping

| TypeScript Type | Rust Type |
|----------------|-----------|
| `string` | `String` |
| `number` | `f64` |
| `boolean` | `bool` |
| `null` | (skipped in unions) |
| `undefined` | (skipped in unions) |
| `T[]` | `Vec<T>` |
| `[T, U]` | `(T, U)` |
| `T \| null` | `Option<T>` |
| `T \| undefined` | `Option<T>` |
| `Record<string, T>` | `std::collections::HashMap<String, T>` |
| `any` | `serde_json::Value` |
| `unknown` | `serde_json::Value` |
| `Date` | `String` (custom mapping recommended) |

## Limitations

- Generic types are not supported on types not listed (will fall back to `serde_json::Value`)
- Circular references may cause issues
- Some complex TypeScript utility types (e.g., `Pick`, `Omit`) are not supported