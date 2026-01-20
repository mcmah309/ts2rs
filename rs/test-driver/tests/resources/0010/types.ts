// Test case 0010: TypeScript enums
export enum UserRole {
  Admin = "admin",
  Editor = "editor",
  Viewer = "viewer",
  Guest = "guest"
}

export enum Priority {
  Low = 1,
  Medium = 2,
  High = 3,
  Critical = 4
}

export interface Task {
  title: string;
  assignedTo: UserRole;
  priority: Priority;
  completed: boolean;
}
