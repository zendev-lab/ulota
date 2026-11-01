#![no_main]

use libfuzzer_sys::fuzz_target;
use spark_deployment::{BuildInfo, UpdateConfig, UpdateState, can_automatically_apply};

fuzz_target!(|data: &[u8]| {
    if let Ok(state) = serde_json::from_slice::<UpdateState>(data) {
        let encoded = serde_json::to_vec(&state).unwrap();
        assert_eq!(
            serde_json::from_slice::<UpdateState>(&encoded).unwrap(),
            state
        );
    }
    if let Ok(build) = serde_json::from_slice::<BuildInfo>(data) {
        let encoded = serde_json::to_vec(&build).unwrap();
        assert_eq!(
            serde_json::from_slice::<BuildInfo>(&encoded).unwrap(),
            build
        );
    }
    if let Ok(config) = serde_json::from_slice::<UpdateConfig>(data) {
        let encoded = serde_json::to_vec(&config).unwrap();
        assert_eq!(
            serde_json::from_slice::<UpdateConfig>(&encoded).unwrap(),
            config
        );
    }
    if let Ok(version) = std::str::from_utf8(data) {
        assert!(!can_automatically_apply(Some(version), version));
    }
});
