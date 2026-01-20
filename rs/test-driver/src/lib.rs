// Enables feature flag documentation on things in docs.rs https://github.com/rust-lang/rust/issues/43781 http://doc.rust-lang.org/rustdoc/unstable-features.html#doccfg-and-docauto_cfg
#![cfg_attr(docsrs, feature(doc_cfg))]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const OUTPUT_DIR: &str = "/tmp/ts-rs-test-output";

pub fn run(test_name: &str) {
    // Clean up previous runs
    let _ = fs::remove_file("../test-crate/src/main.rs");
    let _ = fs::remove_file("../test-crate/src/generated.rs");
    let _ = fs::remove_dir_all(OUTPUT_DIR);
    fs::create_dir_all(OUTPUT_DIR).unwrap();

    // Read the types to test from the .txt file
    let types_to_generate = fs::read_to_string(format!("./tests/resources/{test_name}.txt")).unwrap();
    let types_to_generate: Vec<String> = types_to_generate
        .split(',')
        .map(|e| e.trim().to_owned())
        .filter(|s| !s.is_empty())
        .collect();

    // For each type, run the test
    for type_to_generate in &types_to_generate {
        run_single_type(test_name, type_to_generate);
    }
}

fn run_single_type(test_name: &str, type_name: &str) {
    println!("Testing type: {}", type_name);
    
    // Step 1: Generate Rust code using ts-rs CLI
    let types_ts_path = format!("./tests/resources/{}/types.ts", test_name);
    let generated_rs_path = "../test-crate/src/generated.rs";
    
    let output = Command::new("bun")
        .args([
            "run",
            "../../js/ts-rs/src/cli.ts",
            "-i",
            &types_ts_path,
            "-t",
            type_name,
            "-o",
            generated_rs_path,
        ])
        .output()
        .expect("Failed to run ts-rs CLI");

    if !output.status.success() {
        panic!(
            "ts-rs CLI failed for type {}: {}",
            type_name,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    // Step 2: Read the JSON test data
    let json_path = format!("./tests/resources/{}/{}.json", test_name, type_name);
    let json_data = fs::read_to_string(&json_path)
        .unwrap_or_else(|_| panic!("Failed to read JSON file: {}", json_path));

    // Step 3: Generate main.rs
    create_main(type_name, &json_data);

    // Step 4: Compile and run the test crate
    let compile_output = Command::new("cargo")
        .args(["build", "--manifest-path", "../test-crate/Cargo.toml"])
        .output()
        .expect("Failed to compile test-crate");

    if !compile_output.status.success() {
        panic!(
            "Compilation failed for type {}: {}",
            type_name,
            String::from_utf8_lossy(&compile_output.stderr)
        );
    }

    let run_output = Command::new("cargo")
        .args(["run", "--manifest-path", "../test-crate/Cargo.toml"])
        .output()
        .expect("Failed to run test-crate");

    if !run_output.status.success() {
        panic!(
            "Execution failed for type {}: {}",
            type_name,
            String::from_utf8_lossy(&run_output.stderr)
        );
    }

    // Step 5: Compare the round-trip JSON
    let output_json_path = format!("{}/{}.json", OUTPUT_DIR, type_name);
    let output_json = fs::read_to_string(&output_json_path)
        .unwrap_or_else(|_| panic!("Failed to read output JSON: {}", output_json_path));

    let original: serde_json::Value = serde_json::from_str(&json_data)
        .expect("Failed to parse original JSON");
    let output: serde_json::Value = serde_json::from_str(&output_json)
        .expect("Failed to parse output JSON");

    assert_eq!(
        original, output,
        "Round-trip JSON mismatch for type {}",
        type_name
    );

    println!("✓ Type {} passed round-trip test", type_name);
}

fn create_main(type_name: &str, json_data: &str) {
    // Generate a main.rs that deserializes the JSON, then serializes it back
    let escaped_json = json_data.replace('\\', "\\\\").replace('"', "\\\"");
    let main_content = format!(
        "mod generated;\n\
\n\
use generated::*;\n\
use std::fs;\n\
\n\
fn main() {{\n\
    let json_data = r#\"{}\"#;\n\
    \n\
    // Deserialize from JSON to Rust type\n\
    let value: {} = serde_json::from_str(json_data)\n\
        .expect(\"Failed to deserialize JSON\");\n\
    \n\
    // Serialize back to JSON\n\
    let output_json = serde_json::to_string(&value)\n\
        .expect(\"Failed to serialize to JSON\");\n\
    \n\
    // Write to output file\n\
    let output_path = \"{}/{}.json\";\n\
    fs::write(output_path, output_json)\n\
        .expect(\"Failed to write output JSON\");\n\
}}\n",
        json_data,
        type_name,
        OUTPUT_DIR,
        type_name
    );

    fs::write("../test-crate/src/main.rs", main_content)
        .expect("Failed to write main.rs");
}