use std::os::unix::process::ExitStatusExt;
use std::path::PathBuf;
use std::process::Command;

fn spark() -> Command {
    Command::new(env!("CARGO_BIN_EXE_spark"))
}

#[test]
fn routes_web_arguments_with_the_companion_exit_code() {
    let companion = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/web-companion.sh");
    let output = spark()
        .env("SPARK_WEB_COMMAND", companion)
        .args(["web", "--port", "3999"])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(17));
    assert_eq!(output.stdout.as_slice(), b"--port\n3999\n");
}

#[test]
fn preserves_companion_signals_through_unix_exec() {
    let status = spark()
        .env("SPARK_WEB_COMMAND", "/bin/sh")
        .args(["web", "-c", "kill -TERM $$"])
        .status()
        .unwrap();
    assert_eq!(status.signal(), Some(15));
}

#[test]
fn emits_stable_json_build_info() {
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/spark-deployment/fixtures/build-info-v2.json");
    let output = spark()
        .env("SPARK_BUILD_INFO_PATH", fixture)
        .args(["version", "--json"])
        .output()
        .unwrap();
    assert!(output.status.success());
    let build: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(build["deploymentGeneration"], 2);
    assert_eq!(build["protocolVersion"], 3);
}

#[test]
fn unknown_commands_use_the_diagnostic_catalog_exit_code() {
    let output = spark().arg("does-not-exist").output().unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("[UNKNOWN_COMMAND]"));
}
