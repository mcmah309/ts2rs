/**
 * Sets what features exist
 * 
 * Use with
 * ```js
 * /// <reference types="bun" /> // Needed if `tsconfig.json` does not have `"types": ["bun"]`
 * import { feature } from "bun:bundle";
 * ```
 * 
 * In combination of the "bun" "export" in `package.json`. This can be used across libs.
 */
declare module "bun:bundle" {
  interface Registry {
    features: "DEBUG";
  }
}
