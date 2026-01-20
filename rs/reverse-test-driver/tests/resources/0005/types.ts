// Test case 0005: Tuples and complex types
export interface Coordinate {
  position: [number, number, number];
  label: string;
}

export interface DataPoint {
  values: [string, number];
  metadata: Record<string, any>;
}

export interface Matrix {
  dimensions: [number, number];
  data: number[][];
}
