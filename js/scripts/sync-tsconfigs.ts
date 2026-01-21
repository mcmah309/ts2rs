import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
// @ts-ignore
import { parse, stringify } from "comment-json@^4.5.1"; // todo remove when https://github.com/oven-sh/bun/issues/26183 is resolved
import { dirname, relative, join } from "node:path";

/**
 * Background:
 * 
 * The ts server will not automatically know about file changes between packages
 * unless there is an explicit "references" in `tsconfig.json` between projects.
 * (Even this may not be enough sometimes since it is wonky and you may need to rebuild those references
 * if it is looking at the `.d.ts` files rather than the source files themselves and/or restart the server)
 * 
 * Additionally, everything may compile, but the ts server will not resolve type defintions of "go to"
 * in the ide unless `compilerOptions.paths` is set. But setting this leads to issues with `tsc` complaining
 * about files not being under "include" or "files", so we don't set this.
 * 
 * **Truly the worst multi-project repo experience :)**
 *
 * Implementation:
 * 
 * Treat `package.json` as the single source of truth.
 *
 * Any workspace dependency declared in `package.json` will be added to the
 * TypeScript tsconfig.json "references".
 * 
 * If an output path argument is provided, the graph will be dumped to that loaction as well.
 */

type PackageInfo = {
  name: string;
  dir: string;
  tsconfigPath: string;
  pkgJsonPath: string;
  relDir: string;
};

async function syncConfigs() {
  const graphOutputPath = process.argv[2];
  const rootConfigPath = "./tsconfig.json";

  const glob = new Bun.Glob("js/*/tsconfig.json");
  const tsconfigPaths = Array.from(glob.scanSync("."));

  const packages: PackageInfo[] = tsconfigPaths.map(tsconfigPath => {
    const dir = dirname(tsconfigPath);
    const pkgJsonPath = join(dir, "package.json");
    const pkgJson = parse(readFileSync(pkgJsonPath, "utf-8"));

    if (!pkgJson.name) {
      throw new Error(`Missing "name" in ${pkgJsonPath}`);
    }

    return {
      name: pkgJson.name,
      dir,
      tsconfigPath,
      pkgJsonPath,
      relDir: `./${dir}`,
    };
  });

  console.log(`Found ${packages.length} packages. Analyzing dependencies...`);

  const packageByName = new Map(packages.map(p => [p.name, p]));

  function getWorkspaceDeps(pkg: PackageInfo): PackageInfo[] {
    const pkgJson = parse(readFileSync(pkg.pkgJsonPath, "utf-8"));
    const declaredDeps = {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
      ...pkgJson.peerDependencies,
    };

    const deps: PackageInfo[] = [];
    for (const depName of Object.keys(declaredDeps ?? {})) {
      const depPkg = packageByName.get(depName);
      if (depPkg) {
        deps.push(depPkg);
      }
    }
    return deps;
  }

  const dependencyGraph: Record<string, string[]> = {};

  for (const pkg of packages) {
    const content = readFileSync(pkg.tsconfigPath, "utf-8");
    const json = parse(content);
    const deps = getWorkspaceDeps(pkg);

    dependencyGraph[pkg.name] = deps.map(d => d.name);

    json.references = deps.map(dep => ({
      path: relative(dirname(pkg.tsconfigPath), dirname(dep.tsconfigPath)),
    }));

    writeFileSync(pkg.tsconfigPath, stringify(json, null, 2));
    console.log(`✅ ${pkg.name}: linked references and paths for [${deps.map(d => d.name).join(", ")}]`);
  }

  const rootFile = Bun.file(rootConfigPath);
  if (await rootFile.exists()) {
    const rootContent = await rootFile.text();
    const rootJson = parse(rootContent);
    rootJson.references = packages.map(p => ({ path: p.relDir }));
    await Bun.write(rootConfigPath, stringify(rootJson, null, 2));
    console.log("✅ Updated root tsconfig.json");
  }

  if (graphOutputPath) {
    const outDir = dirname(graphOutputPath);
    if (outDir !== ".") {
      mkdirSync(outDir, { recursive: true });
    }
    
    await Bun.write(graphOutputPath, stringify(dependencyGraph, null, 2));
    console.log(`📊 Dependency graph written to: ${graphOutputPath}`);
  } else {
    console.log("ℹ️ No output path provided; skipping dumping dependency graph.");
  }
}

syncConfigs().catch(err => {
  console.error("❌ Failed to sync tsconfigs");
  console.error(err);
  process.exit(1);
});