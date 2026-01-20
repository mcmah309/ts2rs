// API types that import from shared types file
import { Priority, UserRole } from "./shared";

export interface Task {
  id: string;
  title: string;
  assigned_to: UserRole;
  priority: Priority;
}
