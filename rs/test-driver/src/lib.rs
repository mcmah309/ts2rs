// Enables feature flag documentation on things in docs.rs https://github.com/rust-lang/rust/issues/43781 http://doc.rust-lang.org/rustdoc/unstable-features.html#doccfg-and-docauto_cfg
#![cfg_attr(docsrs, feature(doc_cfg))]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::collections::{HashMap};

const OUTPUT_DIR: &str = "/tmp/ts-rs-test-output";

pub fn run(test_name: &str) {
    let _ = fs::remove_dir_all(OUTPUT_DIR);
    fs::create_dir_all(OUTPUT_DIR).unwrap();

    let test_dir = format!("./tests/resources/{}", test_name);
    let test_path = Path::new(&test_dir);
    
    if !test_path.exists() {
        panic!("Test directory {} does not exist", test_dir);
    }

    let mut type_tests: HashMap<String, Vec<PathBuf>> = HashMap::new();
    
    for entry in fs::read_dir(test_path).expect("Failed to read test directory") {
        let entry = entry.expect("Failed to read entry");
        let path = entry.path();
        
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let file_name = path.file_stem().unwrap().to_str().unwrap();
            // Extract type name by removing trailing _N suffix
            let type_name = if let Some(pos) = file_name.rfind('_') {
                let suffix = &file_name[pos+1..];
                if suffix.chars().all(|c| c.is_numeric()) {
                    file_name[..pos].to_string()
                } else {
                    file_name.to_string()
                }
            } else {
                file_name.to_string()
            };
            
            type_tests.entry(type_name).or_insert_with(Vec::new).push(path);
        }
    }
    
    if type_tests.is_empty() {
        panic!("No JSON test files found in {}", test_dir);
    }

    for (type_name, json_files) in type_tests {
        for json_path in json_files {
            run_single_test(test_name, &type_name, &json_path);
        }
    }
}

fn run_single_test(test_name: &str, type_name: &str, json_path: &Path) {
    let json_file_name = json_path.file_name().unwrap().to_str().unwrap();
    println!("Testing: {} with {}", type_name, json_file_name);

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

    let json_data = fs::read_to_string(json_path)
        .unwrap_or_else(|_| panic!("Failed to read JSON file: {:?}", json_path));

    create_main(type_name, &json_data);

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

    let output_json_path = format!("{}/output.json", OUTPUT_DIR);
    let output_json = fs::read_to_string(&output_json_path)
        .unwrap_or_else(|_| panic!("Failed to read output JSON: {}", output_json_path));

    let original: serde_json::Value = serde_json::from_str(&json_data)
        .expect("Failed to parse original JSON");
    let output: serde_json::Value = serde_json::from_str(&output_json)
        .expect("Failed to parse output JSON");

    if !values_equal(&original, &output) {
        panic!(
            "Round-trip JSON mismatch for type {} with test file {}\nOriginal: {}\nOutput: {}",
            type_name, json_file_name,
            serde_json::to_string_pretty(&original).unwrap(),
            serde_json::to_string_pretty(&output).unwrap()
        );
    }

    println!("✓ {} with {} passed round-trip test", type_name, json_file_name);
}

/// Compare two JSON values, treating integer and float numbers as equal if they represent the same value
fn values_equal(a: &serde_json::Value, b: &serde_json::Value) -> bool {
    use serde_json::Value;
    
    match (a, b) {
        (Value::Number(n1), Value::Number(n2)) => {
            n1.as_f64() == n2.as_f64()
        },
        (Value::String(s1), Value::String(s2)) => s1 == s2,
        (Value::Bool(b1), Value::Bool(b2)) => b1 == b2,
        (Value::Null, Value::Null) => true,
        (Value::Array(arr1), Value::Array(arr2)) => {
            arr1.len() == arr2.len() && 
            arr1.iter().zip(arr2.iter()).all(|(v1, v2)| values_equal(v1, v2))
        },
        (Value::Object(obj1), Value::Object(obj2)) => {
            obj1.len() == obj2.len() &&
            obj1.iter().all(|(k, v1)| {
                obj2.get(k).map_or(false, |v2| values_equal(v1, v2))
            })
        },
        _ => false,
    }
}


fn create_main(type_name: &str, json_data: &str) {
    let main_content = format!(
        "mod generated;\n\
\n\
use generated::*;\n\
use std::fs;\n\
\n\
fn main() {{\n\
    let json_data = r#\"{json_data}\"#;\n\
    \n\
    let value: {type_name} = serde_json::from_str(json_data)\n\
        .expect(\"Failed to deserialize JSON\");\n\
    \n\
    let output_json = serde_json::to_string(&value)\n\
        .expect(\"Failed to serialize to JSON\");\n\
    \n\
    let lossless_test: {type_name} = serde_json::from_str(&output_json).expect(\"Failed to re-dserialize JSON\");\n\
    \n\
    if lossless_test != value {{\n\
        panic!(\"Serialization is not lossless\nOriginal: {{:?}}\nAfter: {{:?}}\", value, lossless_test);\n\
    }}\n\
    \n\
    // Write to output file\n\
    let output_path = \"{OUTPUT_DIR}/output.json\";\n\
    fs::write(output_path, output_json)\n\
        .expect(\"Failed to write output JSON\");\n\
}}\n"
    );

    fs::write("../test-crate/src/main.rs", main_content)
        .expect("Failed to write main.rs");
}