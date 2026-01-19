use assert_cmd::Command;
use predicates::str::contains;
use tempfile::tempdir;

#[test]
fn cli_generates_file() {
    let dir = tempdir().unwrap();

    Command::cargo_bin("to-rs")
        .unwrap()
        .arg("--out")
        .arg(dir.path())
        .assert()
        .success()
        .stdout(contains("written"));

    assert!(dir.path().join("result.json").exists());
}