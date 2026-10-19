import fs from "node:fs";
import path from "node:path";
import type { PackfenceConfig } from "./types.js";

const DEFAULTS: Required<
  Pick<
    PackfenceConfig,
    | "maxFileBytes"
    | "maxFileWarnBytes"
    | "maxTotalBytes"
    | "contentScanMaxBytes"
  >
> = {
  maxFileBytes: 20 * 1024 * 1024,
  maxFileWarnBytes: 5 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  contentScanMaxBytes: 512 * 1024,
};

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(
      `Could not parse ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Read only the config a directory declares itself (`.packfencerc.json`, then
 * `package.json#packfence` on top). Returns undefined when it declares none.
 */
export function readOwnConfig(
  pkgDir: string,
  configPath?: string,
): PackfenceConfig | undefined {
  if (configPath) {
    const abs = path.resolve(pkgDir, configPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`Config file not found: ${abs}`);
    }
    return readJson(abs) as PackfenceConfig;
  }
  let own: PackfenceConfig | undefined;
  const rc = path.join(pkgDir, ".packfencerc.json");
  if (fs.existsSync(rc)) own = readJson(rc) as PackfenceConfig;
  const pkgJson = path.join(pkgDir, "package.json");
  if (fs.existsSync(pkgJson)) {
    const pkg = readJson(pkgJson) as { packfence?: PackfenceConfig };
    if (pkg.packfence) own = { ...(own ?? {}), ...pkg.packfence };
  }
  return own;
}

/**
 * Layer `over` on top of `base`: allow/deny lists are concatenated, severity
 * maps merged (over wins), scalar limits replaced.
 */
export function mergeConfig(
  base: PackfenceConfig,
  over: PackfenceConfig | undefined,
): PackfenceConfig {
  if (!over) return { ...base };
  return {
    ...base,
    ...over,
    allow: [...(base.allow ?? []), ...(over.allow ?? [])],
    deny: [...(base.deny ?? []), ...(over.deny ?? [])],
    severity: { ...(base.severity ?? {}), ...(over.severity ?? {}) },
  };
}

function withDefaults(cfg: PackfenceConfig): PackfenceConfig {
  const merged = { ...cfg };
  merged.maxFileBytes ??= DEFAULTS.maxFileBytes;
  merged.maxFileWarnBytes ??= DEFAULTS.maxFileWarnBytes;
  merged.maxTotalBytes ??= DEFAULTS.maxTotalBytes;
  merged.contentScanMaxBytes ??= DEFAULTS.contentScanMaxBytes;
  merged.allow ??= [];
  merged.deny ??= [];
  merged.severity ??= {};
  return merged;
}

export function loadConfig(
  pkgDir: string,
  configPath?: string,
  base?: PackfenceConfig,
): PackfenceConfig {
  const start: PackfenceConfig = base ?? { ...DEFAULTS, allow: [], deny: [], severity: {} };
  return withDefaults(mergeConfig(start, readOwnConfig(pkgDir, configPath)));
}
