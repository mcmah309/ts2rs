/**
 * Basic tests, most tests are in the `rs/*test*` crates
 */

import { describe, test, expect } from "bun:test";
import * as path from "path";
import { convert, resolveTypes, TypeConversionError } from "../src/index";

const fixturesDir = path.join(__dirname, "fixtures");
const sampleTypesPath = path.join(fixturesDir, "sample-types.ts");

describe("resolveTypes", () => {
  test("should resolve all exported types from a file", () => {
    const types = resolveTypes({ entryFile: sampleTypesPath });

    expect(types.length).toBeGreaterThan(0);

    const typeNames = types.map((t) => t.name);
    expect(typeNames).toContain("BasicTypes");
    expect(typeNames).toContain("OptionalFields");
    expect(typeNames).toContain("Person");
    expect(typeNames).toContain("Status");
    expect(typeNames).toContain("Priority");
  });

  test("should resolve specific types when typeNames is provided", () => {
    const types = resolveTypes({
      entryFile: sampleTypesPath,
      typeNames: ["BasicTypes", "Person"],
    });

    const typeNames = types.map((t) => t.name);
    expect(typeNames).toContain("BasicTypes");
    expect(typeNames).toContain("Person");
    // Should also include Address since Person depends on it
    expect(typeNames).toContain("Address");
  });

  test("should throw when type is not found", () => {
    expect(() => {
      resolveTypes({
        entryFile: sampleTypesPath,
        typeNames: ["NonExistentType"],
      });
    }).toThrow(TypeConversionError);
  });
});

describe("convert - Basic Types", () => {
  test("should convert primitive types correctly", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["BasicTypes"],
    });

    expect(result.rustCode).toContain("pub struct BasicTypes");
    expect(result.rustCode).toContain("pub name: String");
    expect(result.rustCode).toContain("pub age: f64");
    expect(result.rustCode).toContain("pub is_active: bool");
    expect(result.rustCode).toContain("pub data: Value");
    expect(result.rustCode).toContain("pub metadata: Value");
    expect(result.rustCode).toContain("use serde_json::Value;");
  });

  test("should convert optional fields correctly", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["OptionalFields"],
    });

    expect(result.rustCode).toContain("pub struct OptionalFields");
    expect(result.rustCode).toContain("pub required: String");
    expect(result.rustCode).toContain("pub optional: Option<String>");
    expect(result.rustCode).toContain('#[serde(skip_serializing_if = "Option::is_none")]');
  });
});

describe("convert - Array Types", () => {
  test("should convert array types correctly", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["ArrayTypes"],
    });

    expect(result.rustCode).toContain("pub struct ArrayTypes");
    expect(result.rustCode).toContain("pub strings: Vec<String>");
    expect(result.rustCode).toContain("pub numbers: Vec<f64>");
    expect(result.rustCode).toContain("pub readonly_strings: Vec<String>");
    expect(result.rustCode).toContain("pub nested: Vec<Vec<String>>");
  });
});

describe("convert - Tuple Types", () => {
  test("should convert tuple types correctly", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["TupleTypes"],
    });

    expect(result.rustCode).toContain("pub struct TupleTypes");
    expect(result.rustCode).toContain("pub pair: (String, f64)");
    expect(result.rustCode).toContain("pub triple: (String, f64, bool)");
  });
});

describe("convert - Map Types", () => {
  test("should convert record and map types correctly", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["MapTypes"],
    });

    expect(result.rustCode).toContain("pub struct MapTypes");
    expect(result.rustCode).toContain("pub record: HashMap<String, f64>");
    expect(result.rustCode).toContain("pub string_map: HashMap<String, bool>");
    expect(result.rustCode).toContain("use std::collections::{HashMap");
  });
});

describe("convert - Set Types", () => {
  test("should convert set types correctly", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["SetTypes"],
    });

    expect(result.rustCode).toContain("pub struct SetTypes");
    expect(result.rustCode).toContain("pub string_set: HashSet<String>");
    expect(result.rustCode).toContain("pub number_set: HashSet<f64>");
    expect(result.rustCode).toContain("HashSet");
  });
});

describe("convert - Nested Types", () => {
  test("should convert nested interfaces correctly", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["Person"],
    });

    expect(result.rustCode).toContain("pub struct Person");
    expect(result.rustCode).toContain("pub struct Address");
    expect(result.rustCode).toContain("pub address: Address");
    expect(result.rustCode).toContain("pub alternate_addresses: Option<Vec<Address>>");
  });
});

describe("convert - Union Types", () => {
  test("should convert string literal union as enum", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["Direction"],
    });

    expect(result.rustCode).toContain("pub enum Direction");
    expect(result.rustCode).toContain("North");
    expect(result.rustCode).toContain("South");
    expect(result.rustCode).toContain("East");
    expect(result.rustCode).toContain("West");
  });

  test("should convert discriminated union correctly", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["Shape"],
    });

    expect(result.rustCode).toContain("pub enum Shape");
    expect(result.rustCode).toContain("Circle");
    expect(result.rustCode).toContain("Rectangle");
    expect(result.rustCode).toContain("Point");
  });
});

describe("convert - Interface Inheritance", () => {
  test("should include fields from extended interfaces", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["Post"],
    });

    expect(result.rustCode).toContain("pub struct Post");
    // Fields from BaseEntity
    expect(result.rustCode).toContain("pub id: String");
    expect(result.rustCode).toContain("pub created_at: String"); // Date becomes String
    expect(result.rustCode).toContain("pub updated_at: String");
    // Own fields
    expect(result.rustCode).toContain("pub title: String");
    expect(result.rustCode).toContain("pub content: String");
  });
});

describe("convert - Serde Attributes", () => {
  test("should include serde derive by default", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["BasicTypes"],
    });

    expect(result.rustCode).toContain("#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]");
    expect(result.rustCode).toContain('#[serde(rename_all = "camelCase")]');
  });
});

describe("convert - Custom Type Mappings", () => {
  test("should apply simple custom type mapping", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["CustomMappingTest"],
      customTypeMappings: {
        "CustomExternalType": "my_crate::MyExternalType",
      },
    });

    expect(result.rustCode).toContain("pub struct CustomMappingTest");
    expect(result.rustCode).toContain("pub external_data: my_crate::MyExternalType");
  });

  test("should apply custom type mapping with field annotations", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["CustomMappingTest"],
      customTypeMappings: {
        "CustomExternalType": {
          rustType: "DateTime<Utc>",
          fieldAnnotations: ['#[serde(with = "chrono_serde")]'],
        },
      },
    });

    expect(result.rustCode).toContain("pub struct CustomMappingTest");
    expect(result.rustCode).toContain('#[serde(with = "chrono_serde")]');
    expect(result.rustCode).toContain("pub external_data: DateTime<Utc>");
  });

  test("should apply multiple field annotations", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["CustomMappingTest"],
      customTypeMappings: {
        "CustomExternalType": {
          rustType: "CustomType",
          fieldAnnotations: [
            '#[serde(serialize_with = "custom_serialize")]',
            '#[serde(deserialize_with = "custom_deserialize")]',
          ],
        },
      },
    });

    expect(result.rustCode).toContain('#[serde(serialize_with = "custom_serialize")]');
    expect(result.rustCode).toContain('#[serde(deserialize_with = "custom_deserialize")]');
    expect(result.rustCode).toContain("pub external_data: CustomType");
  });
});

describe("convert - Custom Header and Footer", () => {
  test("should inject custom header at top of file", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["BasicTypes"],
      customHeader: "use chrono::{DateTime, Utc};\nuse my_crate::helpers;",
    });

    expect(result.rustCode).toContain("use chrono::{DateTime, Utc};");
    expect(result.rustCode).toContain("use my_crate::helpers;");
    // Header should be before the types
    const headerIndex = result.rustCode.indexOf("use chrono::{DateTime, Utc};");
    const structIndex = result.rustCode.indexOf("pub struct BasicTypes");
    expect(headerIndex).toBeLessThan(structIndex);
  });

  test("should inject custom footer at bottom of file", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["BasicTypes"],
      customFooter: "// Custom footer comment\nimpl BasicTypes {\n    pub fn new() -> Self { todo!() }\n}",
    });

    expect(result.rustCode).toContain("// Custom footer comment");
    expect(result.rustCode).toContain("impl BasicTypes {");
    // Footer should be after the struct
    const structIndex = result.rustCode.indexOf("pub struct BasicTypes");
    const footerIndex = result.rustCode.indexOf("// Custom footer comment");
    expect(footerIndex).toBeGreaterThan(structIndex);
  });

  test("should inject both custom header and footer", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["BasicTypes"],
      customHeader: "// CUSTOM HEADER",
      customFooter: "// CUSTOM FOOTER",
    });

    expect(result.rustCode).toContain("// CUSTOM HEADER");
    expect(result.rustCode).toContain("// CUSTOM FOOTER");
    const headerIndex = result.rustCode.indexOf("// CUSTOM HEADER");
    const footerIndex = result.rustCode.indexOf("// CUSTOM FOOTER");
    const structIndex = result.rustCode.indexOf("pub struct BasicTypes");
    expect(headerIndex).toBeLessThan(structIndex);
    expect(footerIndex).toBeGreaterThan(structIndex);
  });
});

describe("convert - Documentation", () => {
  test("should include documentation comments", async () => {
    const result = await convert({
      entryFile: sampleTypesPath,
      typeNames: ["Book"],
    });

    expect(result.rustCode).toContain("/// Represents a book in the library system");
    expect(result.rustCode).toContain("/// Unique identifier for the book");
    expect(result.rustCode).toContain("/// Title of the book");
  });
});

describe("convert - Output File", () => {
  test("should write output file when outputPath is specified", async () => {
    const outputPath = path.join(fixturesDir, "output.rs");
    const fs = await import("fs");

    // Clean up any existing file
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // Convert and write to file
    await convert({
      entryFile: sampleTypesPath,
      typeNames: ["BasicTypes"],
      outputPath,
    });

    expect(fs.existsSync(outputPath)).toBe(true);

    const content = fs.readFileSync(outputPath, "utf-8");
    expect(content).toContain("pub struct BasicTypes");

    // Clean up
    fs.unlinkSync(outputPath);
  });
});
