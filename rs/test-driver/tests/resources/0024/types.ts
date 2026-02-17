type Update<T> = {
  value: T | null;
  name: string;
  count: number;
  items: T[];
  metadata?: T;
}