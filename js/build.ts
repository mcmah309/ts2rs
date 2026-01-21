import { type BuildConfig, type BunPlugin, Glob } from 'bun';
import { watch } from 'fs';
import { readFile, writeFile } from "node:fs/promises";
//@ts-ignore
import * as inliner from 'web-resource-inliner';
import * as path from 'path';
import { minify } from 'html-minifier-next';
import { rm } from 'node:fs';

// Building a bundle does not mean that this is or is not a library.
// Bundling just means a bundled output will be created.
// Even for pure libraries a bundled build may be useful for things demos.
const isBundleOnly = process.argv.includes('--bundle-only');
const isLibOnly = process.argv.includes('--lib-only');
if (isBundleOnly && isLibOnly) {
    console.error("Cannot use `--bundle-only` and `--lib-only` together");
    process.exit(1);
}
const isProduction = process.env.NODE_ENV === 'production';
const isWatch = process.argv.includes('--watch');
const shouldInlineHtml = process.argv.includes('--inline-html');

//************************************************************************//

async function inlineAndMinifyHtmlFiles(outdir: string) {
    const files: string[] = Array.from(htmlGlob.scanSync(outdir));

    for (const file of files) {
        const filePath: string = path.join(outdir, file);
        let htmlContent: string = await readFile(filePath, 'utf8');

        if (shouldInlineHtml) {
            const inlined = await new Promise<string>((resolve, reject) => {
                // See https://www.npmjs.com/package/web-resource-inliner
                inliner.html({
                    fileContent: htmlContent,
                    relativeTo: path.dirname(filePath),
                    strict: true,
                    // todo when https://github.com/oven-sh/bun/issues/26216 is resolved switch all of these to false and use `data-inline`
                    images: true,
                    svgs: true,
                    scripts: true,
                    links: true,
                    css: true,
                }, (err: any, result: any) => {
                    if (err) return reject(err);
                    if (typeof result !== 'string') return reject(new Error('Inliner did not return a string'));
                    resolve(result);
                });
            });

            if (inlined === htmlContent) {
                console.log(`- No inlining needed: ${filePath}`);
            }
            else {
                console.log(`✓ Inlined: ${filePath}`);
                htmlContent = inlined;
            }
        }
        if (isProduction) {
            const minified = await minify(htmlContent, {
                collapseWhitespace: true,
                removeComments: true,
                minifyCSS: true,
            });
            if (minified === htmlContent) {
                console.log(`- No minification needed: ${filePath}`);
            }
            else {
                console.log(`✓ Minified: ${filePath}`);
                htmlContent = minified;
            }
        }
        await writeFile(filePath, htmlContent);
    }
}

const identMethods = (ident: string, methods: string[]) =>
    methods.map(m => `${ident}.${m}` as const);

//************************************************************************//

rm("./dist", { recursive: true, force: true }, (err) => {
    if (err) {
        console.error(`Failed to remove directory: ${err.message}`);
        process.exit(1);
    }
});

const libEntryPointGlob = new Glob("**/{index.ts,*.index.ts}");
const libEntrypoints = Array.from(libEntryPointGlob.scanSync("./src")).map(path => `./src/${path}`);

const htmlGlob = new Glob("**/*.html");
const htmlFiles = Array.from(htmlGlob.scanSync("./src")).map(path => `./src/${path}`);

const configs: ({ name: string } & BuildConfig)[] = [];

const libraryBuild: ({ name: string } & BuildConfig) = {
    name: "Library (External)",
    root: "./src",
    entrypoints: libEntrypoints,
    naming: "[dir]/[name].[ext]",
    outdir: './dist/lib',
    format: 'esm',
    packages: 'external',
    minify: false,
    sourcemap: 'inline',
    features: ["DEBUG"],
    env: 'disable',
    // plugins: [
    //     generateDtsFiles()
    // ]
};

const bundleEntryPointGlob = new Glob("**/{bundle.ts,*.bundle.ts}");
const bundleEntrypoints = Array.from(bundleEntryPointGlob.scanSync("./src")).map(path => `./src/${path}`);

let debugBundleBuild: ({ name: string } & BuildConfig) = {
    ...libraryBuild,
    entrypoints: [...libraryBuild.entrypoints, ...htmlFiles, ...bundleEntrypoints],
    name: "Bundle (Debug)",
    outdir: './dist/bundle',
    packages: 'bundle',
    env: 'inline',
};

let releaseBundleBuild: ({ name: string } & BuildConfig) = {
    ...debugBundleBuild,
    name: "Bundle (Release)",
    minify: true,
    sourcemap: "external",
    drop: [
        ...identMethods("console", [ // Note `error` and 'warn' is missing on purpose
            "info", "debug", "trace", "log", "assert", "table",
            "dir", "dirxml", "count", "countReset", "time",
            "timeEnd", "timeLog", "group", "groupCollapsed", "groupEnd"
        ]),
        "debugger",
    ],
    features: undefined,
}

if (!isBundleOnly) {
    configs.push(libraryBuild);
}

if (!isLibOnly) {
    if (isProduction) {
        configs.push(releaseBundleBuild)
    } else {
        configs.push(debugBundleBuild)
    }
}

async function build() {
    console.log('Building...');
    console.time('Build Duration');

    const processes: Promise<void>[] = [];

    for (const config of configs) {
        const buildPromise = Bun.build(config).then(async (result) => {
            if (!result.success) {
                console.error(`"${config.name}" build failed:`);
                for (const log of result.logs) console.error(log);
                return;
            }

            if (config.outdir) {
                await inlineAndMinifyHtmlFiles(config.outdir);
            }

            console.log(`"${config.name}" build finished`);
        });
        processes.push(buildPromise);
    }

    // todo remove when https://github.com/oven-sh/bun/issues/5141 is resolved
    const tscProcess = Bun.spawn(['bunx', 'tsc', '--project', './tsconfig.build.json'], {
        stdout: 'inherit',
        stderr: 'inherit',
    });

    const tscProcessExit = tscProcess.exited.then((exitCode) => {
        if (exitCode !== 0) {
            console.error(`tsc failed with exit code ${exitCode}`);
            process.exit(exitCode);
        }
        console.log('TypeScript declarations finished');
    });
    processes.push(tscProcessExit);

    await Promise.all(processes);

    console.log('Build complete!');
    console.timeEnd('Build Duration');
}

await build();

if (isWatch) {
    console.log('Watching for changes...');
    const watcher = watch('./src', { recursive: true }, async (event, filename) => {
        console.log(`File ${filename} changed, rebuilding...`);
        await build();
    });

    process.on('SIGINT', () => {
        watcher.close();
        process.exit(0);
    });
}