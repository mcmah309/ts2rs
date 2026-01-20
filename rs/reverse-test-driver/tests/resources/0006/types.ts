// Test case 0006: Deeply nested structures
export interface Company {
  name: string;
  departments: Department[];
}

export interface Department {
  name: string;
  employees: Employee[];
  budget?: number;
}

export interface Employee {
  id: number;
  name: string;
  role: string;
  skills: string[];
  performance?: Performance;
}

export interface Performance {
  rating: number;
  reviews: Review[];
}

export interface Review {
  date: string;
  score: number;
  comments: string;
}
