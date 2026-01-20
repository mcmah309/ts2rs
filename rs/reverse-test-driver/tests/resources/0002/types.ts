// Test case 0013: Discriminated unions (tagged unions)
export type Shape =
  | { type: "circle"; radius: number; center: [number, number] }
  | { type: "rectangle"; width: number; height: number }
  | { type: "triangle"; base: number; height: number };

export type ApiResponse =
  | { success: true; data: any; timestamp: string }
  | { success: false; error: string; code: number };

export interface DrawingCanvas {
  shapes: Shape[];
  backgroundColor: string;
}
