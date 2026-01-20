mod generated;

use generated::*;
use std::fs;

fn main() {
let json_data = r#"{
  "type": "rectangle",
  "width": 20,
  "height": 30
}
"#;

// Deserialize from JSON to Rust type
let value: Shape = serde_json::from_str(json_data)
.expect("Failed to deserialize JSON");

// Serialize back to JSON
let output_json = serde_json::to_string(&value)
.expect("Failed to serialize to JSON");

// Write to output file
let output_path = "/tmp/ts-rs-test-output/output.json";
fs::write(output_path, output_json)
.expect("Failed to write output JSON");
}
