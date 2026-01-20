/// <reference types="bun" />
/**
 * ts-to-rs - TypeScript to Rust type converter
 *
 * A programmatic API and CLI tool for converting TypeScript types to Rust types
 * for bidirectional JSON serialization.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { TypeResolver } from "./resolver";
import { RustGenerator } from "./generator";
import type { ConversionOptions, ConversionResult, CollectedType } from "./types";
export { TypeConversionError } from "./types";
export type {
  ConversionOptions,
  ConversionResult,
  ResolvedType,
  CollectedType,
  StructType,
  EnumType,
  UnionType,
  StructField,
  EnumVariant,
  UnionVariant,
} from "./types";

/**
 * Convert TypeScript types to Rust types
 *
 * @param options Conversion options
 * @returns Conversion result with generated Rust code
 *
 * @example
 * ```typescript
 * import { convert } from 'ts-to-rs';
 *
 * const result = await convert({
 *   entryFile: './src/types.ts',
 *   typeNames: ['User', 'Post'],
 *   outputPath: './generated/types.rs',
 * });
 *
 * console.log(result.rustCode);
 * ```
 */
export async function convert(options: ConversionOptions): Promise<ConversionResult> {
  const entryFile = path.resolve(options.entryFile);

  if (!fs.existsSync(entryFile)) {
    throw new Error(`Entry file not found: ${entryFile}`);
  }

  const resolverOptions: ConversionOptions = {
    ...options,
    entryFile,
  };

  const resolver = new TypeResolver(resolverOptions);
  const collectedTypes = resolver.resolve();

  if (collectedTypes.length === 0) {
    return {
      rustCode: "// No types found to convert\n",
      convertedTypes: [],
      warnings: ["No exportable types found in the entry file"],
    };
  }

  const generator = new RustGenerator(resolverOptions);
  const result = generator.generate(collectedTypes);

  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, result.rustCode);
  }

  return result;
}

/**
 * Resolve TypeScript types without generating Rust code
 *
 * Useful for inspection or custom code generation
 *
 * @param options Conversion options
 * @returns Array of collected types
 */
export function resolveTypes(options: ConversionOptions): CollectedType[] {
  const entryFile = path.resolve(options.entryFile);

  if (!fs.existsSync(entryFile)) {
    throw new Error(`Entry file not found: ${entryFile}`);
  }

  const resolverOptions: ConversionOptions = {
    ...options,
    entryFile,
  };

  const resolver = new TypeResolver(resolverOptions);
  return resolver.resolve();
}

/**
 * Generate Rust code from pre-resolved types
 *
 * @param collectedTypes Array of resolved types
 * @param options Generation options
 * @returns Conversion result with generated Rust code
 */
export function generateRust(
  collectedTypes: CollectedType[],
  options: Partial<ConversionOptions> = {},
): ConversionResult {
  const generatorOptions: ConversionOptions = {
    entryFile: options.entryFile || "unknown",
    ...options,
  };

  const generator = new RustGenerator(generatorOptions);
  return generator.generate(collectedTypes);
}
