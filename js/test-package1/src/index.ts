import { type Primitive } from 'utility-types';

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

export interface TestInterface {
    data1: string;
    data2: number;
    dataFromOtherPackage: Primitive;
}