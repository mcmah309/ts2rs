mod generated;

use generated::*;
use std::fs;

fn main() {
let json_data = r#"{
  "title": "Implement authentication",
  "assignedTo": "admin",
  "priority": "3",
  "completed": false,
  "test1": {
    "data1": "test string",
    "data2": 42.5,
    "dataFromOtherPackage": "hello"
  },
  "test2": {
    "packages": ["package1", "package2"],
    "nohoist": ["**/@types/**"]
  }
}
"#;

// Deserialize from JSON to Rust type
let value: Task = serde_json::from_str(json_data)
.expect("Failed to deserialize JSON");

// Serialize back to JSON
let output_json = serde_json::to_string(&value)
.expect("Failed to serialize to JSON");

let lossless_test: Task = serde_json::from_str(&output_json).expect("Failed to re-dserialize JSON");

if (lossless_test != value) {
panic!("Serialization is not lossless
Original: {:?}
After: {:?}", value, lossless_test);
}

// Write to output file
let output_path = "/tmp/ts-rs-test-output/output.json";
fs::write(output_path, output_json)
.expect("Failed to write output JSON");
}
