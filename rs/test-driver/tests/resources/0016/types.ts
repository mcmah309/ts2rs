// Test case 0016: Mixed complex types
export type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface Error {
  message: string;
  code: number;
}

export interface ApiResult {
  result: Result<string, Error>;
  timestamp: string;
}

export interface MultiTypeContainer {
  strings: Set<string>;
  numbers: Map<string, number>;
  flags: Record<string, boolean>;
  mixed: Array<string | number | boolean>;
}
