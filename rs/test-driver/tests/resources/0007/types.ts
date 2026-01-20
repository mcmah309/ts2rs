// Test case 0007: Edge cases with nulls and empty collections
export interface OptionalFields {
  requiredString: string;
  optionalString?: string;
  requiredNumber: number;
  optionalNumber?: number;
  emptyArray: any[];
  optionalArray?: string[];
  nullableField: string | null;
}

export interface EmptyCollections {
  emptyStringArray: string[];
  emptyNumberArray: number[];
  emptyRecord: Record<string, any>;
}
