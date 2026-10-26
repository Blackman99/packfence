import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "./config.js";
import { listPackedFiles } from "./pack.js";
import { evaluate } from "./rules.js";
import type { Finding, PackfenceConfig, ScanResult } from "./types.js";

/** One top-level entry of today's tarball and what `init` decided for it. */
export interface InitGroup {
  /** Top-level path as it would appear in `files` (a dir or a root file). */
  entry: string;
  isDir: boolean;
  files: number;
  bytes: number;
  decision: "keep" | "drop" | "auto";
  reason: string;
}

/** A negation added inside a kept directory to fence out HOLD files. */
export interface InitFence {
  pattern: string;
  files: number;
  reason: string;
}

export interface InitSide {
  files: number;
  bytes: number;
  failed: boolean;
  warned: boolean;
  holds: Finding[];
}

export interface InitProposal {
  name: string;
  version?: string;
  dir: string;
  /** The current `files` field, if any. */
  current?: string[];
  /** The proposed `files` field. */
  files: string[];
  groups: InitGroup[];
  fences: InitFence[];
  before: InitSide;
  /** Result of a real `npm pack --dry-run` with the proposed `files`. */
  after: InitSide;
  /** Paths dropped from the tarball by the proposal. */
  removed: string[];
  /** Entry-point files that exist today but would no longer ship (should be empty). */
  lostEntries: string[];
  /** True when the proposal is identical to the current `files` field. */
  unchanged: boolean;
}

type Manifest = Record<string, unknown> & {
  name?: string;
  version?: string;
  files?: unknown;
  scripts?: Record<string, string>;
};

const MAP_RULES = new Set(["source-map", "sources-content"]);

/** Directories that hold development-only material. */
const DEV_DIRS: Record<string, string> = {
  test: "test suite",
  tests: "test suite",
  __tests__: "test suite",
  spec: "test suite",
  specs: "test suite",
  __mocks__: "test mocks",
  __fixtures__: "test fixtures",
  fixtures: "test fixtures",
  e2e: "end-to-end tests",
  cypress: "end-to-end tests",
  playwright: "end-to-end tests",
  coverage: "coverage report",
  ".nyc_output": "coverage data",
  bench: "benchmarks",
  benchmark: "benchmarks",
  benchmarks: "benchmarks",
  example: "examples",
  examples: "examples",
  docs: "documentation site",
  ".github": "CI config",
  ".gitlab": "CI config",
  ".circleci": "CI config",
  ".vscode": "editor config",
  ".idea": "editor config",
  ".husky": "git hooks",
  ".changeset": "changesets",
  ".storybook": "Storybook config",
  stories: "Storybook stories",
  tmp: "scratch files",
  temp: "scratch files",
};

/** Root files that are development-only. */
const DEV_FILES: Array<[RegExp, string]> = [
  [/^tsconfig(\..+)?\.json$/i, "TypeScript build config"],
  [/^(jest|vitest|vite|rollup|webpack|esbuild|tsup|babel|eslint|prettier|playwright|cypress|karma|commitlint|lint-staged|postcss|tailwind|svelte|astro|next|nuxt)\.config\.[cm]?[jt]s$/i, "tool config"],
  [/^\.(eslintrc|prettierrc|babelrc|swcrc|stylelintrc|mocharc|c8rc|nycrc|lintstagedrc)(\..+)?$/i, "tool config"],
  [/^\.(editorconfig|gitattributes|gitignore|npmignore|nvmrc|node-version|tool-versions|travis\.yml|prettierignore|eslintignore)$/i, "repo housekeeping"],
  [/^(biome|deno|turbo|nx|lerna|renovate)\.jsonc?$/i, "tool config"],
  [/^(CONTRIBUTING|CODE_OF_CONDUCT|SECURITY)(\.md)?$/i, "contributor docs"],
  [/^(Makefile|Dockerfile|docker-compose.*\.ya?ml|Procfile|Justfile)$/i, "build tooling"],
  [/\.(log|tgz)$/i, "local artefact"],
  [/^(pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i, "lockfile"],
];

/** Files npm always ships on its own; listing them is noise. */
const AUTO_FILE = /^(package\.json|readme(\..*)?|licen[cs]e(\..*)?|copying(\..*)?)$/i;

/** Directories that usually hold sources when a built output is published instead. */
const SOURCE_DIRS = new Set(["src", "source", "ts", "lib-src"]);

function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function topSegment(p: string): string {
  const i = p.indexOf("/");
  return i === -1 ? p : p.slice(0, i);
}

/** Collect every path the manifest points consumers at, labelled by field. */
export function entryPoints(manifest: Manifest): Array<{ path: string; field: string }> {
  const out: Array<{ path: string; field: string }> = [];
  const add = (v: unknown, field: string) => {
    if (typeof v !== "string") return;
    let p = norm(v);
    const star = p.indexOf("*");
    if (star !== -1) p = p.slice(0, star).replace(/\/[^/]*$/, "");
    if (!p || p === "." || p.startsWith("..") || path.isAbsolute(p)) return;
    out.push({ path: p, field });
  };
  const walk = (v: unknown, field: string) => {
    if (typeof v === "string") add(v, field);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, field));
    else if (v && typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) walk(x, field);
    }
  };
  if (manifest.main === undefined && manifest.exports === undefined) add("index.js", "main (default)");
  for (const field of ["main", "module", "types", "typings", "unpkg", "jsdelivr", "svelte", "style"]) {
    add(manifest[field], field);
  }
  walk(manifest.browser, "browser");
  walk(manifest.exports, "exports");
  walk(manifest.imports, "imports");
  walk(manifest.typesVersions, "typesVersions");
  walk(manifest.man, "man");
  const bin = manifest.bin;
  if (typeof bin === "string") add(bin, "bin");
  else if (bin && typeof bin === "object") {
    for (const [k, v] of Object.entries(bin as Record<string, unknown>)) add(v, `bin.${k}`);
  }
  const dirs = manifest.directories;
  if (dirs && typeof dirs === "object") walk(dirs, "directories");
  // install-time scripts run on the consumer's machine: what they reference must ship.
  for (const s of ["preinstall", "install", "postinstall"]) {
    const cmd = manifest.scripts?.[s];
    if (typeof cmd !== "string") continue;
    for (const tok of cmd.split(/\s+/)) {
      if (/^\.?\/?[\w@.-]+\/[\w@./-]+$/.test(tok) || /\.[cm]?js$/.test(tok)) add(tok, `scripts.${s}`);
    }
  }
  return out;
}

function side(result: ScanResult): InitSide {
  return {
    files: result.files.length,
    bytes: result.totalBytes,
    failed: result.failed,
    warned: result.warned,
    holds: result.findings.filter((f) => f.severity === "fail"),
  };
}

function readManifest(dir: string): Manifest {
  const file = path.join(dir, "package.json");
  if (!fs.existsSync(file)) throw new Error(`No package.json in ${dir}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
}

/**
 * Pack the proposal for real: copy today's packed files into a scratch dir,
 * swap in the proposed `files`, and run `npm pack --dry-run` there. The
 * proposal only ever narrows today's tarball, so today's files are enough.
 */
function verify(
  dir: string,
  manifest: Manifest,
  packed: string[],
  files: string[],
  cfg: PackfenceConfig,
): ScanResult {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "packfence-init-"));
  try {
    for (const rel of packed) {
      if (rel === "package.json") continue;
      const dst = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(dir, rel), dst);
    }
    const next = { ...manifest, files };
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify(next, null, 2) + "\n");
    return evaluate(tmp, listPackedFiles(tmp), cfg);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export interface InitOptions {
  configPath?: string;
  config?: PackfenceConfig;
}

/**
 * Propose a `files` allowlist for the package in `pkgDir` from what
 * `npm pack` would ship today: keep what the manifest points at, drop
 * dev-only material, and fence HOLD files out of kept directories.
 */
export function proposeFiles(pkgDir: string, options: InitOptions = {}): InitProposal {
  const dir = path.resolve(pkgDir);
  const manifest = readManifest(dir);
  const cfg = options.config ?? loadConfig(dir, options.configPath);
  const packedFiles = listPackedFiles(dir);
  const beforeResult = evaluate(dir, packedFiles, cfg);
  const entries = entryPoints(manifest);

  const holdsByPath = new Map<string, Finding[]>();
  for (const f of beforeResult.findings) {
    if (f.severity !== "fail" || f.path === "(total)") continue;
    const list = holdsByPath.get(f.path) ?? [];
    list.push(f);
    holdsByPath.set(f.path, list);
  }

  // Group today's tarball by top-level entry.
  const groupsMap = new Map<string, { isDir: boolean; paths: string[]; bytes: number }>();
  for (const f of packedFiles) {
    const top = topSegment(f.path);
    const g = groupsMap.get(top) ?? { isDir: f.path.includes("/"), paths: [], bytes: 0 };
    g.paths.push(f.path);
    g.bytes += f.size;
    groupsMap.set(top, g);
  }

  const entryTops = new Map<string, Set<string>>();
  for (const e of entries) {
    const top = topSegment(e.path);
    const set = entryTops.get(top) ?? new Set<string>();
    set.add(e.field);
    entryTops.set(top, set);
  }
  const builtDirShips = [...entryTops.keys()].some((t) => !SOURCE_DIRS.has(t) && groupsMap.get(t)?.isDir);

  const groups: InitGroup[] = [];
  const fences: InitFence[] = [];
  const keep: string[] = [];

  const sorted = [...groupsMap.entries()].sort(([a, ga], [b, gb]) =>
    ga.isDir === gb.isDir ? a.localeCompare(b) : ga.isDir ? -1 : 1,
  );
  for (const [top, g] of sorted) {
    const base = { entry: top, isDir: g.isDir, files: g.paths.length, bytes: g.bytes };
    const fields = entryTops.get(top);
    const holds = g.paths.flatMap((p) => holdsByPath.get(p) ?? []);

    if (!g.isDir && AUTO_FILE.test(top)) {
      groups.push({ ...base, decision: "auto", reason: "npm always ships it" });
      continue;
    }
    if (top === "node_modules") {
      groups.push({ ...base, decision: "auto", reason: "bundleDependencies, managed by npm" });
      continue;
    }
    if (!g.isDir && holds.length && !fields) {
      groups.push({ ...base, decision: "drop", reason: `HOLD ${holds[0]!.rule}` });
      continue;
    }
    if (fields) {
      groups.push({ ...base, decision: "keep", reason: `entry: ${[...fields].join(", ")}` });
    } else if (g.isDir && DEV_DIRS[top]) {
      groups.push({ ...base, decision: "drop", reason: `${DEV_DIRS[top]}, not needed by consumers` });
      continue;
    } else if (g.isDir && SOURCE_DIRS.has(top) && builtDirShips) {
      groups.push({ ...base, decision: "drop", reason: "sources; the built output is what runs" });
      continue;
    } else if (!g.isDir && DEV_FILES.some(([rx]) => rx.test(top))) {
      const why = DEV_FILES.find(([rx]) => rx.test(top))![1];
      groups.push({ ...base, decision: "drop", reason: `${why}, not needed by consumers` });
      continue;
    } else if (g.isDir && holds.length === g.paths.length) {
      groups.push({ ...base, decision: "drop", reason: `every file is a HOLD (${holds[0]!.rule})` });
      continue;
    } else {
      groups.push({ ...base, decision: "keep", reason: "ships today, not dev-only" });
    }
    keep.push(top);

    // Fence HOLD files out of a kept directory.
    if (!g.isDir || holds.length === 0) continue;
    const mapPaths = g.paths.filter((p) => /\.map$/i.test(p));
    const mapHolds = mapPaths.some((p) => (holdsByPath.get(p) ?? []).some((f) => MAP_RULES.has(f.rule)));
    if (mapHolds) {
      fences.push({ pattern: `!${top}/**/*.map`, files: mapPaths.length, reason: "HOLD source-map" });
    }
    for (const p of g.paths) {
      const hs = holdsByPath.get(p);
      if (!hs) continue;
      if (mapHolds && /\.map$/i.test(p)) continue;
      fences.push({ pattern: `!${p}`, files: 1, reason: `HOLD ${hs[0]!.rule}` });
    }
  }

  const current = Array.isArray(manifest.files)
    ? (manifest.files as unknown[]).filter((x): x is string => typeof x === "string")
    : undefined;
  // Keep the negations you already have: what they exclude is invisible in
  // today's pack, so dropping one could silently re-ship a source map.
  const keepSet = new Set(keep);
  for (const neg of current ?? []) {
    if (!neg.startsWith("!")) continue;
    const top = topSegment(norm(neg.slice(1)));
    if (top.includes("*") || keepSet.has(top)) {
      if (!fences.some((f) => f.pattern === neg)) {
        fences.push({ pattern: neg, files: 0, reason: "kept from your files field" });
      }
    }
  }
  const files = [...keep, ...fences.map((f) => f.pattern)];
  // Same allowlist modulo files npm adds itself and ordering: nothing to change.
  const meaningful = (list: string[]) =>
    [...new Set(list.map(norm).filter((x) => !AUTO_FILE.test(x)))].sort();
  const unchanged =
    current !== undefined &&
    JSON.stringify(meaningful(current)) === JSON.stringify(meaningful(files));

  const afterResult = unchanged
    ? beforeResult
    : verify(dir, manifest, packedFiles.map((f) => f.path), files, cfg);
  const afterPaths = new Set(afterResult.files.map((f) => f.path));
  const removed = packedFiles.map((f) => f.path).filter((p) => !afterPaths.has(p));
  const packedSet = new Set(packedFiles.map((f) => f.path));
  const lostEntries = [
    ...new Set(
      entries
        .map((e) => e.path)
        .filter((p) => packedSet.has(p) && !afterPaths.has(p) && !holdsByPath.has(p)),
    ),
  ];

  return {
    name: manifest.name ?? path.basename(dir),
    version: manifest.version,
    dir,
    current,
    files,
    groups,
    fences,
    before: side(beforeResult),
    after: side(afterResult),
    removed,
    lostEntries,
    unchanged,
  };
}

/**
 * Write `files` into package.json, keeping indentation and key order. A new
 * key goes right after the manifest's entry-point fields.
 */
export function writeFilesField(pkgDir: string, files: string[]): void {
  const file = path.join(path.resolve(pkgDir), "package.json");
  const text = fs.readFileSync(file, "utf8");
  const indentMatch = /^(\s+)"/m.exec(text);
  const indent = indentMatch ? indentMatch[1]!.replace(/\r?\n/g, "") : "  ";
  const pkg = JSON.parse(text) as Record<string, unknown>;
  let next: Record<string, unknown>;
  if ("files" in pkg) {
    next = { ...pkg, files };
  } else {
    next = {};
    const anchors = ["name", "version", "description", "type", "main", "module", "types", "typings", "bin", "exports"];
    const keys = Object.keys(pkg);
    let after = -1;
    keys.forEach((k, i) => {
      if (anchors.includes(k)) after = i;
    });
    keys.forEach((k, i) => {
      next[k] = pkg[k];
      if (i === after) next.files = files;
    });
    if (after === -1) next = { files, ...pkg };
  }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let out = JSON.stringify(next, null, indent);
  if (eol !== "\n") out = out.replace(/\n/g, eol);
  fs.writeFileSync(file, out + (text.endsWith("\n") ? eol : ""));
}
