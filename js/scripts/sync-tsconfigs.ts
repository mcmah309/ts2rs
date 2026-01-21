import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
// @ts-ignore
import { parse, stringify } from "comment-json@^4.5.1"; // todo remove when https://github.com/oven-sh/bun/issues/26183 is resolved
import { dirname, relative, join } from "node:path";

/**
 * Background:
 * 
 * The ts server will not automatically know about file changes between packages
 * unless there is an explicit "references" in `tsconfig.json` between projects.
 * 
 * Additionally, everything may compile, but the ts server will not resolve type defintions of "go to"
 * in the ide unless `compilerOptions.paths` is set.
 *
 * Implementation:
 * 
 * Treat `package.json` as the single source of truth.
 *
 * Any workspace dependency declared in `package.json` will be dded to
 * TypeScript tsconfig.json "references" and "compilerOptions.paths".
 * 
 * If an output path argument is provided, the graph will be dumped to that loaction
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

    json.compilerOptions = json.compilerOptions || {};
    const paths: Record<string, string[]> = {};

    for (const dep of deps) {
      const relPathToDepSrc = join(
        relative(dirname(pkg.tsconfigPath), dirname(dep.tsconfigPath)),
        "src" 
      );
      
      // Map 'package-name' to ['../other-package/src']
      // and 'package-name/*' to ['../other-package/src/*']
      // paths[dep.name] = [relPathToDepSrc];
      // paths[`${dep.name}/*`] = [`${relPathToDepSrc}/*`];
    }

    if (Object.keys(paths).length > 0) {
      json.compilerOptions.paths = paths;
    } else {
      delete json.compilerOptions.paths;
    }

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