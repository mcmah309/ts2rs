// Test case 0003: Arrays and collections
export interface ShoppingCart {
  items: Product[];
  totalPrice: number;
  discount?: number;
  tags: string[];
}

export interface Product {
  id: string;
  name: string;
  price: number;
  inStock: boolean;
  categories: string[];
}
