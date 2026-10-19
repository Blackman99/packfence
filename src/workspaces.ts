import fs from "node:fs";
import path from "node:path";
import { matchGlob } from "./rules.js";

export interface WorkspacePackage {
  dir: string;
  relDir: string;
  name: string;
  version?: string;
  private: boolean;
}

interface Manifest {
  name?: string;
  version?: string;
  private?: boolean;
  workspaces?: string[] | { packages?: string[] };
}

export function readManifest(dir: string): Manifest | undefined {
  const file = path.join(dir, "package.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
  } catch {
    return undefined;
  }
}

/** Workspace patterns declared by npm / Yarn (`workspaces` array or `{ packages }`). */
export function workspacePatterns(rootDir: string): string[] {
  const m = readManifest(rootDir);
  if (!m?.workspaces) return [];
  const list = Array.isArray(m.workspaces) ? m.workspaces : m.workspaces.packages ?? [];
  return list.filter((p): p is string => typeof p === "string" && p.trim() !== "");
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next"]);

function walkDirs(root: string, maxDepth: number): string[] {
  const out: string[] = [];
  const visit = (rel: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      out.push(child);
      visit(child, depth + 1);
    }
  };
  visit("", 1);
  return out;
}

function normalizePattern(p: string): string {
  return p.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/**
 * Expand the root's workspace globs into package directories, in declaration
 * order, honoring `!negated` patterns. Only directories with a package.json count.
 */
export function discoverWorkspaces(rootDir: string): WorkspacePackage[] {
  const root = path.resolve(rootDir);
  const patterns = workspacePatterns(root).map(normalizePattern);
  const include = patterns.filter((p) => !p.startsWith("!"));
  const exclude = patterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1));
  if (include.length === 0) return [];

  const maxDepth = Math.max(
    ...include.map((p) => (p.includes("**") ? 8 : p.split("/").length)),
  );
  const dirs = walkDirs(root, maxDepth);
  // A pattern without "/" must match the whole relative path, not a basename.
  const full = (rel: string, pat: string) =>
    pat.includes("/") ? matchGlob(rel, pat) : matchGlob(rel, pat) && !rel.includes("/");

  const seen = new Set<string>();
  const found: WorkspacePackage[] = [];
  for (const pat of include) {
    const matches = dirs.filter((d) => full(d, pat)).sort();
    for (const rel of matches) {
      if (seen.has(rel)) continue;
      if (exclude.some((x) => full(rel, x))) continue;
      const dir = path.join(root, rel);
      const m = readManifest(dir);
      if (!m) continue;
      seen.add(rel);
      found.push({
        dir,
        relDir: rel,
        name: m.name ?? rel,
        version: m.version,
        private: m.private === true,
      });
    }
  }
  return found;
}
