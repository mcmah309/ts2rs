// Test case 0002: Nested objects and optional fields
export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
}

export interface Person {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  address: Address;
  phoneNumbers: string[];
}
