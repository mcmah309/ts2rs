mod generated;

use generated::*;
use std::fs;

fn main() {
let json_data = r#"{
  "text": "dynamic content",
  "start": {
    "path": [
      { "index": 0, "tagName": "BODY", "id": null },
      { "index": 1, "tagName": "DIV", "id": "main-container" },
      { "index": 0, "tagName": "P", "id": null },
      { "index": 1, "tagName": "B", "id": null },
      { "index": 0, "tagName": null, "id": null }
    ],
    "offset": 2
  },
  "end": {
    "path": [
      { "index": 0, "tagName": "BODY", "id": null },
      { "index": 1, "tagName": "DIV", "id": "main-container" },
      { "index": 0, "tagName": "P", "id": null },
      { "index": 3, "tagName": "SPAN", "id": "highlight-end" },
      { "index": 0, "tagName": null, "id": null }
    ],
    "offset": 7
  }
}"#;

let value: SerializedRange = serde_json::from_str(json_data)
.expect("Failed to deserialize JSON");

let output_json = serde_json::to_string(&value)
.expect("Failed to serialize to JSON");

let lossless_test: SerializedRange = serde_json::from_str(&output_json).expect("Failed to re-dserialize JSON");

if lossless_test != value {
panic!("Serialization is not lossless
Original: {:?}
After: {:?}", value, lossless_test);
}

// Write to output file
let output_path = "/tmp/ts2rs-test-output/output.json";
fs::write(output_path, output_json)
.expect("Failed to write output JSON");
}
