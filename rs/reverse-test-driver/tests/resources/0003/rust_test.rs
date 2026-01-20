fn create_test_instance() -> ShoppingCart {
    ShoppingCart {
        items: vec![
            Product {
                id: "prod1".to_string(),
                name: "Widget".to_string(),
                price: 19.99,
                in_stock: true,
                categories: vec!["electronics".to_string(), "gadgets".to_string()],
            },
        ],
        total_price: 19.99,
        discount: Some(5.0),
        tags: vec!["sale".to_string(), "featured".to_string()],
    }
}
