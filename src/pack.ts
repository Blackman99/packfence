import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { PackedFile } from "./types.js";

interface NpmPackEntry {
  id?: string;
  name?: string;
  filename?: string;
  files?: Array<{ path: string; size: number; mode?: number }>;
  entryCount?: number;
  bundled?: unknown[];
}

/**
 * List every file npm would put in the tarball, with sizes.
 * Uses `npm pack --dry-run --json` so we match npm-packlist semantics exactly.
 */
export function listPackedFiles(pkgDir: string): PackedFile[] {
  const abs = path.resolve(pkgDir);
  if (!fs.existsSync(path.join(abs, "package.json"))) {
    throw new Error(`No package.json in ${abs}`);
  }

  const result = spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      cwd: abs,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, npm_config_loglevel: "error" },
    },
  );

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "npm pack failed").trim();
    throw new Error(`npm pack --dry-run failed: ${err}`);
  }

  const stdout = (result.stdout || "").trim();
  if (!stdout) {
    throw new Error("npm pack --dry-run returned empty output");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    // npm sometimes prints warnings before JSON; find the array
    const start = stdout.indexOf("[");
    const end = stdout.lastIndexOf("]");
    if (start === -1 || end === -1) {
      throw new Error(`Could not parse npm pack JSON: ${stdout.slice(0, 200)}`);
    }
    parsed = JSON.parse(stdout.slice(start, end + 1));
  }

  const entries = (Array.isArray(parsed) ? parsed : [parsed]) as NpmPackEntry[];
  const files: PackedFile[] = [];
  for (const entry of entries) {
    for (const f of entry.files ?? []) {
      files.push({ path: f.path.replace(/\\/g, "/"), size: f.size ?? 0 });
    }
  }

  // Deduplicate (workspaces can repeat)
  const seen = new Set<string>();
  return files.filter((f) => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });
}
