// Test case 0014: Readonly arrays and nested interfaces
export interface User {
  id: string;
  username: string;
  email: string;
  roles: ReadonlyArray<string>;
}

export interface PageMetadata {
  total: number;
  pageSize: number;
  currentPage: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface UserPage {
  users: ReadonlyArray<User>;
  metadata: PageMetadata;
}
