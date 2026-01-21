#!/usr/bin/env bun
/// <reference types="bun" />
/**
 * ts2rs CLI
 *
 * Command-line interface for converting TypeScript types to Rust types
 */

import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import { convert } from "./index";
import type { CustomTypeMappingValue } from "./types";

const program = new Command();

program
  .name("ts2rs")
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
    "Custom type mappings in format TypeScriptName:RustName,... (comma-separated). Use TypeScriptName:RustName@annotation1@annotation2 for field annotations.",
  )
  .option(
    "--custom-header <text>",
    "Custom text to inject at the top of the generated file (after auto-generated comment)",
  )
  .option(
    "--custom-header-file <path>",
    "Path to a file containing custom header text",
  )
  .option(
    "--custom-footer <text>",
    "Custom text to inject at the bottom of the generated file",
  )
  .option(
    "--custom-footer-file <path>",
    "Path to a file containing custom footer text",
  )
  .option(
    "-s, --strict",
    "Strict mode: fail on unresolvable types instead of falling back to serde_json::Value",
  )
  .action(async (options) => {
    try {
      const inputPath = path.resolve(process.cwd(), options.input);
      const outputPath = options.output
        ? path.resolve(process.cwd(), options.output)
        : undefined;

      const typeNames = options.types
        ? options.types.split(",").map((t: string) => t.trim())
        : undefined;

      let customTypeMappings: Record<string, CustomTypeMappingValue> | undefined;
      if (options.mapping) {
        customTypeMappings = {};
        const mappings = options.mapping.split(",");
        for (const mapping of mappings) {
          // Format: TypeScriptName:RustName or TypeScriptName:RustName@annotation1@annotation2
          const colonIndex = mapping.indexOf(":");
          if (colonIndex === -1) continue;
          
          const tsName = mapping.slice(0, colonIndex).trim();
          const restPart = mapping.slice(colonIndex + 1);
          
          const parts = restPart.split("@").map((s: string) => s.trim());
          const rsName = parts[0];
          
          if (tsName && rsName) {
            if (parts.length > 1) {
              // Has field annotations
              customTypeMappings[tsName] = {
                rustType: rsName,
                fieldAnnotations: parts.slice(1),
              };
            } else {
              // Simple string mapping
              customTypeMappings[tsName] = rsName;
            }
          }
        }
      }

      // Handle custom header
      let customHeader = options.customHeader;
      if (options.customHeaderFile) {
        const headerPath = path.resolve(process.cwd(), options.customHeaderFile);
        customHeader = fs.readFileSync(headerPath, "utf-8").trim();
      }

      // Handle custom footer
      let customFooter = options.customFooter;
      if (options.customFooterFile) {
        const footerPath = path.resolve(process.cwd(), options.customFooterFile);
        customFooter = fs.readFileSync(footerPath, "utf-8").trim();
      }

      const result = await convert({
        entryFile: inputPath,
        outputPath,
        typeNames,
        customTypeMappings,
        customHeader,
        customFooter,
        strict: options.strict,
      });

      if (result.warnings.length > 0) {
        console.error("Warnings:");
        for (const warning of result.warnings) {
          console.error(`  - ${warning}`);
        }
        console.error("");
      }

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
