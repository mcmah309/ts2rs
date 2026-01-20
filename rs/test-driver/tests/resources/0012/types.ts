// Test case 0012: Tuple types
export type Point2D = [number, number];
export type Point3D = [number, number, number];
export type NamedTuple = [string, number, boolean];

export interface GeometricShape {
  center: Point2D;
  vertices: Point2D[];
  metadata: NamedTuple;
}

export interface Dimensions3D {
  origin: Point3D;
  size: Point3D;
}
