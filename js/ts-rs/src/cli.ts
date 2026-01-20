#!/usr/bin/env bun
/// <reference types="bun" />
/**
 * ts-rs CLI
 *
 * Command-line interface for converting TypeScript types to Rust types
 */

import { Command } from "commander";
import * as path from "node:path";
import { convert } from "./index";

const program = new Command();

program
  .name("ts-to-rs")
  .description(
    "Convert TypeScript types to Rust types for bidirectional JSON serialization",
  )
  .version("0.0.1")
  .requiredOption("-i, --input <path>", "Path to the TypeScript entry file")
  .option("-o, --output <path>", "Output path for the generated Rust file")
  .option(
    "-t, --types <names>",
    "Comma-separated list of type names to convert (defaults to all exported types)",
  )
  .option(
    "-m, --mapping <mappings>",
    "Custom type mappings in format TypeScriptName:RustName,... (comma-separated)",
  )
  .action(async (options) => {
    try {
      const inputPath = path.resolve(process.cwd(), options.input);
      const outputPath = options.output
        ? path.resolve(process.cwd(), options.output)
        : undefined;

      // Parse type names
      const typeNames = options.types
        ? options.types.split(",").map((t: string) => t.trim())
        : undefined;

      // Parse custom mappings
      let customTypeMappings: Record<string, string> | undefined;
      if (options.mapping) {
        customTypeMappings = {};
        const mappings = options.mapping.split(",");
        for (const mapping of mappings) {
          const [tsName, rsName] = mapping.split(":").map((s: string) => s.trim());
          if (tsName && rsName) {
            customTypeMappings[tsName] = rsName;
          }
        }
      }

      const result = await convert({
        entryFile: inputPath,
        outputPath,
        typeNames,
        customTypeMappings,
      });

      // Print warnings if any
      if (result.warnings.length > 0) {
        console.error("Warnings:");
        for (const warning of result.warnings) {
          console.error(`  - ${warning}`);
        }
        console.error("");
      }

      // Print to stdout if no output file specified
      if (!outputPath) {
        console.log(result.rustCode);
      } else {
        console.log(`✓ Generated Rust types for ${result.convertedTypes.length} type(s):`);
        for (const typeName of result.convertedTypes) {
          console.log(`  - ${typeName}`);
        }
        console.log(`\n✓ Output written to: ${outputPath}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
        if (process.env["DEBUG"]) {
          console.error(error.stack);
        }
      } else {
        console.error("Unknown error occurred");
      }
      process.exit(1);
    }
  });

program.parse();
