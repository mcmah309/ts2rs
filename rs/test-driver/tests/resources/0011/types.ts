// Test case 0011: Record and Map types
export interface Config {
  settings: Record<string, string>;
  metadata: Record<string, number>;
  flags: Record<string, boolean>;
}

export interface DatabaseSchema {
  tables: Record<string, TableDefinition>;
}

export interface TableDefinition {
  name: string;
  columns: string[];
  primaryKey: string;
}
