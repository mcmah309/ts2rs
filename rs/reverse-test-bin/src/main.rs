mod generated;
use generated::*;
use serde_json;
use std::fs;

fn create_test_instance() -> Person {
    Person {
        name: "Alice Smith".to_string(),
        age: 30.0,
        email: "alice@example.com".to_string(),
    }
}


fn main() {
    let instance = create_test_instance();
    let json = serde_json::to_string_pretty(&instance).expect("Failed to serialize");
    fs::write("/tmp/reverse-test-output/output.json", json).expect("Failed to write JSON");
    println!("✓ Serialized test data to JSON");
}
