// Test case 0019: Unresolvable union types should fallback to Value
// When a union has types that cannot be resolved (like bigint, symbol),
// the entire union should not be generated and uses should fallback to Value

// This union has unresolvable types
export type MixedType = string | number | bigint | symbol;

// This should use Value for the unresolvable field
export interface DataContainer {
  id: string;
  // This field uses an unresolvable union type, so it should be Value
  mixedData: MixedType;
  name: string;
}
