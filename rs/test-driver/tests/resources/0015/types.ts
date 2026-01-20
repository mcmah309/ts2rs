// Test case 0015: Deeply nested structures
export interface TreeNode {
  value: string;
  children: TreeNode[];
  metadata?: Record<string, any>;
}

export interface FileSystem {
  name: string;
  isDirectory: boolean;
  size?: number;
  children?: FileSystem[];
  permissions: {
    read: boolean;
    write: boolean;
    execute: boolean;
  };
}
