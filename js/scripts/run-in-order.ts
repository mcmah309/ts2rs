import { spawn } from "bun";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Reads a dependency graph (JSON) where keys are dependencies 
 * and values are arrays of other dependencies. Only runs the command
 * on a dependency once all of its dependencies have finished running
 * the command successfully. e.g.
 * ```bash
 * bun run -i ./js/scripts/sync-tsconfigs.ts ./js/js-order.json && bun run ./js/scripts/run-in-order.js ./js/js-order.json bun run build
 * ```
 */

async function runGraph() {
  const graphPath = process.argv[2];
  const CMD = process.argv.slice(3);

  if (!graphPath || CMD.length === 0) {
    console.error("Usage: bun run-in-order.ts <graph.json> <command...>");
    process.exit(1);
  }

  const rawGraph: Record<string, string[]> = JSON.parse(readFileSync(graphPath, "utf-8"));

  const dependencies = new Map<string, Set<string>>();
  const allDependencies = Object.keys(rawGraph);
  const running = new Set<string>();
  const completed = new Set<string>();

  // Convert input arrays to Sets
  for (const [pkg, deps] of Object.entries(rawGraph)) {
    dependencies.set(pkg, new Set(deps));
  }

  console.log(`▶ Command: ${CMD.join(" ")}`);

  return new Promise<void>((resolvePromise, reject) => {

    function checkAndRun() {
      // Find ones that aren't running, aren't done, and have no remaining deps
      const readyToRun = allDependencies.filter(pkg =>
        !completed.has(pkg) &&
        !running.has(pkg) &&
        dependencies.get(pkg)?.size === 0
      );

      // Cycle detection: If nothing is running but we aren't done, and no one is ready...
      if (readyToRun.length === 0 && running.size === 0 && completed.size < allDependencies.length) {
        return reject(new Error("Dependency Cycle Detected: No further packages can start."));
      }

      // Success check
      if (completed.size === allDependencies.length) {
        return resolvePromise();
      }

      // Execute all ready tasks in parallel
      for (const pkg of readyToRun) {
        executeTask(pkg);
      }
    }

    function executeTask(pkg: string) {
      running.add(pkg);
      console.log(`▶ [START] ${pkg}`);

      // Assuming package folder name matches package name inside 'js/'
      const pkgDir = resolve(process.cwd(), "js", pkg);

      const proc = spawn({
        cmd: CMD,
        cwd: pkgDir,
        stdout: "inherit",
        stderr: "inherit",
      });

      proc.exited.then((code) => {
        running.delete(pkg);

        if (code !== 0) {
          console.error(`❌ [FAIL] ${pkg} (Exit Code: ${code})`);
          process.exit(code ?? 1);
        }

        console.log(`✅ [DONE] ${pkg}`);
        completed.add(pkg);

        // Remove this package from the dependency sets of all others
        // @ts-ignore
        for (const set of dependencies.values()) {
          set.delete(pkg);
        }

        // Re-evaluate the graph
        checkAndRun();
      });
    }

    // Start the engine
    checkAndRun();
  });
}

runGraph()
  .then(() => console.log("\n✨ Execution complete."))
  .catch(err => {
    console.error(`\n❌ Fatal Error: ${err.message}`);
    process.exit(1);
  });