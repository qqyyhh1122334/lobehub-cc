'use strict';

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs');
const { createRequire, isBuiltin } = require('node:module');
const { tmpdir } = require('node:os');
const { dirname, join, relative, resolve, sep } = require('node:path');

const ROOT_PACKAGES = ['pg', 'drizzle-orm', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'];
const VALIDATION_MODULES = [
  'pg',
  'drizzle-orm/migrator',
  'drizzle-orm/node-postgres',
  'drizzle-orm/node-postgres/migrator',
  '@aws-sdk/client-s3',
  '@aws-sdk/s3-request-presigner',
];

function entryExists(file) {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function assertPackageName(name) {
  if (!/^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+$/.test(name) || name === '.' || name === '..')
    throw new Error(`Invalid package name: ${name}`);
}

function resolvePackageDirectory(name, fromDirectory, optional = false) {
  assertPackageName(name);
  if (isBuiltin(name)) return null;
  const loader = createRequire(join(fromDirectory, 'package.json'));
  // Node's exact ancestor search order preserves pnpm's package/peer context.
  // Directory lookup also handles hidden package.json exports and type-only peers.
  for (const searchPath of loader.resolve.paths(name) || []) {
    const candidate = join(searchPath, name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
  }
  if (optional) return null;
  throw new Error(`Missing installed runtime dependency ${name} required by ${fromDirectory}`);
}

function copyDependencyGraph(root, store, packageNames = ROOT_PACKAGES) {
  const nodes = new Map();
  const copy = (source) => {
    if (nodes.has(source)) return nodes.get(source);
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    assertPackageName(manifest.name);
    // Equal versions with different pnpm peer contexts remain separate nodes.
    const locator = relative(root, source);
    const id = createHash('sha256').update(locator).digest('hex').slice(0, 24);
    const target = join(store, id, 'node_modules', manifest.name);
    const node = {
      id,
      name: manifest.name,
      version: manifest.version,
      locator,
      target,
      dependencies: {},
    };
    nodes.set(source, node); // Register before recursion to support cycles.
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, {
      recursive: true,
      dereference: true,
      filter: (file) => !relative(source, file).split(sep).includes('node_modules'),
    });
    const dependencyNames = new Set([
      ...Object.keys(manifest.dependencies || {}),
      ...Object.keys(manifest.optionalDependencies || {}),
      ...Object.keys(manifest.peerDependencies || {}),
    ]);
    for (const dependency of [...dependencyNames].sort()) {
      const ordinary = Object.hasOwn(manifest.dependencies || {}, dependency);
      const optionalDependency = Object.hasOwn(manifest.optionalDependencies || {}, dependency);
      const optionalPeer =
        !ordinary && manifest.peerDependenciesMeta?.[dependency]?.optional === true;
      const resolved = resolvePackageDirectory(
        dependency,
        source,
        optionalDependency || optionalPeer,
      );
      if (!resolved) continue;
      const child = copy(resolved);
      const link = join(target, 'node_modules', dependency);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(relative(dirname(link), child.target), link, 'dir');
      node.dependencies[dependency] = child.id;
    }
    return node;
  };
  const entries = packageNames.map((name) => ({
    name,
    node: copy(resolvePackageDirectory(name, root)),
  }));
  return { entries, nodes: [...nodes.values()] };
}

function verifyStandalone(destination, modules = VALIDATION_MODULES, { stdio = 'inherit' } = {}) {
  // Remove access to builder node_modules; also reject escaped absolute links.
  const isolated = mkdtempSync(join(tmpdir(), 'lobehub-standalone-'));
  renameSync(destination, isolated);
  try {
    execFileSync(
      process.execPath,
      [
        '-e',
        `
      const Module=require('node:module'),path=require('node:path'),{fileURLToPath}=require('node:url');
      const root=process.argv[1],modules=JSON.parse(process.argv[2]);
      Module.registerHooks({resolve(specifier,context,nextResolve){
        const result=nextResolve(specifier,context);
        if(result.url.startsWith('file:')){
          const file=fileURLToPath(result.url);
          if(!file.startsWith(root+path.sep))throw new Error('Runtime dependency escaped standalone: '+file);
        }
        return result;
      }});
      const load=Module.createRequire(path.join(root,'package.json'));
      for(const name of modules)load(name);
    `,
        isolated,
        JSON.stringify(modules),
      ],
      { cwd: isolated, stdio },
    );
  } finally {
    renameSync(isolated, destination);
  }
}

function prepareRuntime({
  root = resolve(__dirname, '../..'),
  destination = join(root, '.next/standalone'),
  packageNames = ROOT_PACKAGES,
  validationModules = VALIDATION_MODULES,
  verificationStdio = 'inherit',
} = {}) {
  root = realpathSync(root);
  destination = resolve(destination);
  if (!existsSync(join(destination, 'server.js')))
    throw new Error('Standalone server.js is missing');
  const nodeModules = join(destination, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  const stage = mkdtempSync(join(nodeModules, '.intranet-runtime-stage-'));
  const store = join(nodeModules, '.intranet-runtime');
  const backup = mkdtempSync(join(destination, '.intranet-runtime-backup-'));
  const previousStore = join(backup, 'store');
  const originals = [];
  let installed = false;
  let storeMoved = false;
  let committed = false;
  try {
    const graph = copyDependencyGraph(root, stage, packageNames);
    if (entryExists(store)) {
      renameSync(store, previousStore);
      storeMoved = true;
    }
    renameSync(stage, store);
    installed = true;
    for (const entry of graph.entries) {
      const target = join(nodeModules, entry.name);
      const original = join(backup, 'entries', entry.name);
      const hadOriginal = entryExists(target);
      if (hadOriginal) {
        mkdirSync(dirname(original), { recursive: true });
        renameSync(target, original);
      }
      originals.push({ target, original, hadOriginal });
      mkdirSync(dirname(target), { recursive: true });
      const packaged = join(store, relative(stage, entry.node.target));
      symlinkSync(relative(dirname(target), packaged), target, 'dir');
    }
    verifyStandalone(destination, validationModules, { stdio: verificationStdio });
    writeFileSync(
      join(destination, 'intranet-runtime-dependencies.json'),
      JSON.stringify(
        {
          schema: 1,
          entries: Object.fromEntries(graph.entries.map((entry) => [entry.name, entry.node.id])),
          packages: graph.nodes.map(({ target, ...node }) => node),
        },
        null,
        2,
      ) + '\n',
    );
    committed = true;
    console.log(
      `Verified standalone migration and S3 dependencies (${graph.nodes.length} exact package contexts)`,
    );
    return graph.nodes.length;
  } finally {
    if (!committed) {
      if (installed) {
        for (const original of originals.reverse()) {
          rmSync(original.target, { recursive: true, force: true });
          if (original.hadOriginal) renameSync(original.original, original.target);
        }
        rmSync(store, { recursive: true, force: true });
      }
      if (storeMoved) renameSync(previousStore, store);
    }
    rmSync(stage, { recursive: true, force: true });
    rmSync(backup, { recursive: true, force: true });
  }
}

module.exports = { copyDependencyGraph, prepareRuntime, resolvePackageDirectory, verifyStandalone };
if (require.main === module) prepareRuntime();
