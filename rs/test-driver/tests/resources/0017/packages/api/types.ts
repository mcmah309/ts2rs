// API types that import from shared package
import { BaseEntity, Address, Status } from "@test/shared";

export interface Customer extends BaseEntity {
  name: string;
  email: string;
  address: Address;
  status: Status;
}

export interface Order extends BaseEntity {
  customerId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  shippingAddress: Address;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";
