/**
 * Test fixtures for ts-to-rs
 * These types exercise various TypeScript to Rust conversion scenarios
 */

// Basic primitive types
export interface BasicTypes {
  name: string;
  age: number;
  isActive: boolean;
  data: any;
  metadata: unknown;
}

// Optional fields
export interface OptionalFields {
  required: string;
  optional?: string;
  nullableRequired: string | null;
  nullableOptional?: string | null;
}

// Array types
export interface ArrayTypes {
  strings: string[];
  numbers: Array<number>;
  readonly readonlyStrings: ReadonlyArray<string>;
  nested: string[][];
}

// Tuple types
export interface TupleTypes {
  pair: [string, number];
  triple: [string, number, boolean];
}

// Record and Map types
export interface MapTypes {
  record: Record<string, number>;
  stringMap: Map<string, boolean>;
  nestedRecord: Record<string, Record<string, number>>;
}

// Set types
export interface SetTypes {
  stringSet: Set<string>;
  numberSet: Set<number>;
}

// Nested interfaces
export interface Address {
  street: string;
  city: string;
  zipCode: string;
  country?: string;
}

export interface Person {
  name: string;
  age: number;
  address: Address;
  alternateAddresses?: Address[];
}

// Type alias to object type
export type User = {
  id: string;
  email: string;
  createdAt: Date;
};

// String enum
export enum Status {
  Active = "active",
  Inactive = "inactive",
  Pending = "pending",
}

// Numeric enum
export enum Priority {
  Low = 0,
  Medium = 1,
  High = 2,
  Critical = 3,
}

// String literal union (becomes enum)
export type Direction = "north" | "south" | "east" | "west";

// Discriminated union
export type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number }
  | { kind: "point" };

// Interface with extends
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post extends BaseEntity {
  title: string;
  content: string;
  authorId: string;
  tags: string[];
}

// Complex nested type
export interface ApiResponse<T> {
  data: T;
  status: Status;
  error?: string;
  metadata: Record<string, any>;
}

// Documentation example
/**
 * Represents a book in the library system.
 * Contains all relevant information about a book.
 */
export interface Book {
  /** Unique identifier for the book */
  isbn: string;
  /** Title of the book */
  title: string;
  /** Author(s) of the book */
  authors: string[];
  /** Publication year */
  year: number;
  /** Optional description */
  description?: string;
}
