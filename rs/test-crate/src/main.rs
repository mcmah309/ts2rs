mod generated;

use generated::*;
use std::fs;

fn main() {
let json_data = r#"{
  "id": "test456",
  "mixedData": 42,
  "name": "Another Container"
}
"#;

let value: DataContainer = serde_json::from_str(json_data)
.expect("Failed to deserialize JSON");

let output_json = serde_json::to_string(&value)
.expect("Failed to serialize to JSON");

let lossless_test: DataContainer = serde_json::from_str(&output_json).expect("Failed to re-dserialize JSON");

if lossless_test != value {
panic!("Serialization is not lossless
Original: {:?}
After: {:?}", value, lossless_test);
}

// Write to output file
let output_path = "/tmp/ts-rs-test-output/output.json";
fs::write(output_path, output_json)
.expect("Failed to write output JSON");
}
