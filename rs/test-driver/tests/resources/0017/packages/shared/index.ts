// Shared types across packages
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  street: string;
  city: string;
  country: string;
  postalCode: string;
}

export type Status = "active" | "inactive" | "pending";
