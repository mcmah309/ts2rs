// Test case 0004: Enums and unions
export enum OrderStatus {
  Pending = "pending",
  Processing = "processing",
  Shipped = "shipped",
  Delivered = "delivered",
  Cancelled = "cancelled"
}

export enum Priority {
  Low = 1,
  Medium = 2,
  High = 3,
  Critical = 4
}

export type Color = "red" | "green" | "blue" | "yellow";

export interface Order {
  orderId: string;
  status: OrderStatus;
  priority: Priority;
  themeColor: Color;
}
