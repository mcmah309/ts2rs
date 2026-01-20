import { Priority, type TestInterface, type UserRole } from "test-package1";

export interface Task {
    title: string;
    assignedTo: UserRole;
    priority: Priority;
    completed: boolean;
    test: TestInterface
}