// Reverse test driver - generates Rust code from TypeScript, creates test instances,
// serializes to JSON, and verifies with TypeScript
#![cfg_attr(docsrs, feature(doc_cfg))]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const OUTPUT_DIR: &str = "/tmp/reverse-test-output";
const RUST_TEST_BIN_DIR: &str = "../reverse-test-bin";

pub fn run_reverse_test(test_name: &str) {
    // Clean up
    let _ = fs::remove_dir_all(OUTPUT_DIR);
    let _ = fs::remove_dir_all(format!("{}/src", RUST_TEST_BIN_DIR));
    fs::create_dir_all(OUTPUT_DIR).unwrap();
    fs::create_dir_all(format!("{}/src", RUST_TEST_BIN_DIR)).unwrap();

    let test_dir = format!("./tests/resources/{}", test_name);
    let test_path = Path::new(&test_dir);
    
    if !test_path.exists() {
        panic!("Test directory {} does not exist", test_dir);
    }

    // Read the expected values JSON file
    let expected_json_path = test_path.join("expected.json");
    if !expected_json_path.exists() {
        panic!("expected.json not found in {}", test_dir);
    }

    let expected_json = fs::read_to_string(&expected_json_path)
        .expect("Failed to read expected.json");

    println!("Running reverse test for: {}", test_name);

    // Step 1: Generate Rust types from TypeScript
    let types_ts_path = test_path.join("types.ts");
    let generated_rs_path = format!("{}/src/generated.rs", RUST_TEST_BIN_DIR);
    
    let type_name = extract_type_name_from_json(&expected_json);
    
    let output = Command::new("bun")
        .args([
            "run",
            "../../js/ts-rs/src/cli.ts",
            "-i",
            types_ts_path.to_str().unwrap(),
            "-t",
            &type_name,
            "-o",
            &generated_rs_path,
        ])
        .current_dir(".")
        .output()
        .expect("Failed to run ts-rs CLI");

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        panic!("ts-rs CLI failed for type {}: {}\n{}", type_name, stderr, stdout);
    }

    println!("✓ Generated Rust types for {}", type_name);

    // Step 2: Read the Rust test code template
    let rust_test_template_path = test_path.join("rust_test.rs");
    let rust_test_code = if rust_test_template_path.exists() {
        fs::read_to_string(&rust_test_template_path)
            .expect("Failed to read rust_test.rs")
    } else {
        // Generate default test code
        generate_default_rust_test(&type_name, &expected_json)
    };

    // Step 3: Create the Rust test binary
    let main_rs_content = format!(
        r#"mod generated;
use generated::*;
use serde_json;
use std::fs;

{}

fn main() {{
    let instance = create_test_instance();
    let json = serde_json::to_string_pretty(&instance).expect("Failed to serialize");
    fs::write("/tmp/reverse-test-output/output.json", json).expect("Failed to write JSON");
    println!("✓ Serialized test data to JSON");
}}
"#,
        rust_test_code
    );

    fs::write(format!("{}/src/main.rs", RUST_TEST_BIN_DIR), main_rs_content)
        .expect("Failed to write main.rs");

    println!("✓ Created Rust test binary");

    // Step 4: Compile the Rust binary
    let compile_output = Command::new("cargo")
        .args(["build"])
        .current_dir(RUST_TEST_BIN_DIR)
        .output()
        .expect("Failed to compile Rust test binary");

    if !compile_output.status.success() {
        let stderr = String::from_utf8_lossy(&compile_output.stderr);
        panic!("Rust compilation failed:\n{}", stderr);
    }

    println!("✓ Compiled Rust test binary");

    // Step 5: Run the Rust binary to generate JSON
    // The binary is in the workspace target directory
    let workspace_root = Path::new(".").join("../..");
    let binary_path = workspace_root.join("target/debug/reverse-test-bin");
    let binary_path_abs = std::env::current_dir()
        .unwrap()
        .join(&binary_path)
        .canonicalize()
        .expect("Failed to resolve binary path");
    
    let run_output = Command::new(&binary_path_abs)
        .output()
        .expect("Failed to run Rust test binary");

    if !run_output.status.success() {
        let stderr = String::from_utf8_lossy(&run_output.stderr);
        let stdout = String::from_utf8_lossy(&run_output.stdout);
        panic!("Rust test binary failed:\n{}\n{}", stderr, stdout);
    }

    println!("✓ Executed Rust test binary");

    // Step 6: Verify the output with TypeScript
    let verify_script = format!(
        r#"
import {{ readFileSync }} from 'fs';

let expected = JSON.parse(readFileSync('{}', 'utf-8'));
const actual = JSON.parse(readFileSync('{}/output.json', 'utf-8'));

// Remove the __type field from expected (it's only for test metadata)
delete expected.__type;

function deepEqual(a: any, b: any, path = ''): boolean {{
    if (typeof a !== typeof b) {{
        console.error(`Type mismatch at ${{path}}: expected ${{typeof a}}, got ${{typeof b}}`);
        return false;
    }}
    
    if (a === null || b === null) {{
        if (a !== b) {{
            console.error(`Null mismatch at ${{path}}`);
            return false;
        }}
        return true;
    }}
    
    if (typeof a === 'object') {{
        if (Array.isArray(a) !== Array.isArray(b)) {{
            console.error(`Array mismatch at ${{path}}`);
            return false;
        }}
        
        if (Array.isArray(a)) {{
            if (a.length !== b.length) {{
                console.error(`Array length mismatch at ${{path}}: expected ${{a.length}}, got ${{b.length}}`);
                return false;
            }}
            for (let i = 0; i < a.length; i++) {{
                if (!deepEqual(a[i], b[i], `${{path}}[${{i}}]`)) {{
                    return false;
                }}
            }}
            return true;
        }}
        
        const keysA = Object.keys(a).sort();
        const keysB = Object.keys(b).sort();
        if (JSON.stringify(keysA) !== JSON.stringify(keysB)) {{
            console.error(`Keys mismatch at ${{path}}: expected ${{keysA.join(',')}}, got ${{keysB.join(',')}}`);
            return false;
        }}
        
        for (const key of keysA) {{
            if (!deepEqual(a[key], b[key], path ? `${{path}}.${{key}}` : key)) {{
                return false;
            }}
        }}
        return true;
    }}
    
    // Handle numeric comparison with tolerance
    if (typeof a === 'number' && typeof b === 'number') {{
        const diff = Math.abs(a - b);
        if (diff > 0.0001) {{
            console.error(`Number mismatch at ${{path}}: expected ${{a}}, got ${{b}}, diff=${{diff}}`);
            return false;
        }}
        return true;
    }}
    
    if (a !== b) {{
        console.error(`Value mismatch at ${{path}}: expected ${{JSON.stringify(a)}}, got ${{JSON.stringify(b)}}`);
        return false;
    }}
    
    return true;
}}

if (deepEqual(expected, actual)) {{
    console.log('✓ Verification passed: Rust output matches expected JSON');
    process.exit(0);
}} else {{
    console.error('✗ Verification failed');
    process.exit(1);
}}
"#,
        expected_json_path.display(),
        OUTPUT_DIR
    );

    let verify_script_path = format!("{}/verify.ts", OUTPUT_DIR);
    fs::write(&verify_script_path, verify_script).expect("Failed to write verify script");

    let verify_output = Command::new("bun")
        .args(["run", &verify_script_path])
        .output()
        .expect("Failed to run verification script");

    if !verify_output.status.success() {
        let stderr = String::from_utf8_lossy(&verify_output.stderr);
        let stdout = String::from_utf8_lossy(&verify_output.stdout);
        panic!("Verification failed:\n{}\n{}", stdout, stderr);
    }

    let stdout = String::from_utf8_lossy(&verify_output.stdout);
    println!("{}", stdout);
}

fn extract_type_name_from_json(json: &str) -> String {
    // Parse JSON to find the __type field or infer from structure
    let value: serde_json::Value = serde_json::from_str(json)
        .expect("Failed to parse expected.json");
    
    if let Some(type_name) = value.get("__type").and_then(|v| v.as_str()) {
        return type_name.to_string();
    }
    
    panic!("expected.json must have a __type field specifying the TypeScript type name");
}

fn generate_default_rust_test(type_name: &str, expected_json: &str) -> String {
    // Escape the JSON string for embedding in Rust code
    let escaped_json = expected_json.replace("\\", "\\\\").replace("\"", "\\\"");
    
    format!(
        r#"
fn create_test_instance() -> {type_name} {{
    // Parse the expected JSON and create an instance
    let json = "{json}";
    serde_json::from_str(json).expect("Failed to parse test data")
}}
"#,
        type_name = type_name,
        json = escaped_json
    )
}
