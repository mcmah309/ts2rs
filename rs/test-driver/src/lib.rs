// Enables feature flag documentation on things in docs.rs https://github.com/rust-lang/rust/issues/43781 http://doc.rust-lang.org/rustdoc/unstable-features.html#doccfg-and-docauto_cfg
#![cfg_attr(docsrs, feature(doc_cfg))]

use std::fs;

pub fn run(test_name: &str) {
    let _ = fs::remove_file("../test-crate/src/main.rs");
    let _ = fs::remove_file("../test-crate/src/generated.rs");
    let types_to_generate = fs::read_to_string(format!("./tests/resources/{test_name}.txt")).unwrap();
    let types_to_generate = types_to_generate.split(",").map(|e| e.trim().to_owned()).collect::<Vec<String>>();
    for type_to_generate in types_to_generate {
        
    }
}

fn create_main(file_prefix: &Vec<String>) {

}

fn create_execution_line(type_name: &str) {

}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        let result = add(2, 2);
        assert_eq!(result, 4);
    }
}