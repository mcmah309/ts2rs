fn create_test_instance() -> Order {
    Order {
        order_id: "ORD123".to_string(),
        status: OrderStatus::Processing,
        priority: Priority::High,
        theme_color: Color::Blue,
    }
}
