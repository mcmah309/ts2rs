// Test case 0008: Union types and discriminated unions
export type ApiResponse =
  | { success: true; data: string; timestamp: number }
  | { success: false; error: string; code: number };

export type Shape =
  | { type: "circle"; radius: number }
  | { type: "rectangle"; width: number; height: number }
  | { type: "triangle"; base: number; height: number };

export interface Container {
  id: string;
  response: ApiResponse;
  shape: Shape;
}
