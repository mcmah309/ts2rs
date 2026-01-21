export interface Node {
  value: string;
  child: Node | null;
  metadata?: Record<string, any>;
}