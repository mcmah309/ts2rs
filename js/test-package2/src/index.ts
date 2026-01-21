import { Priority, type TestInterface, type UserRole } from "test-package1";
import type { PackageJson } from 'type-fest';

export interface Task {
    title: string;
    assignedTo: UserRole;
    priority: Priority;
    completed: boolean;
    test1: TestInterface
    // This should resolve
    test2: PackageJson.WorkspaceConfig
}