fn create_test_instance() -> DataPoint {
    use std::collections::HashMap;
    let mut metadata = HashMap::new();
    metadata.insert("source".to_string(), serde_json::json!("sensor"));
    metadata.insert("accuracy".to_string(), serde_json::json!(0.95));
    
    DataPoint {
        values: ("temperature".to_string(), 23.5),
        metadata,
    }
}
