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

export function loadConfig(
  pkgDir: string,
  configPath?: string,
): PackfenceConfig {
  const merged: PackfenceConfig = { ...DEFAULTS, allow: [], deny: [], severity: {} };

  if (configPath) {
    const abs = path.resolve(pkgDir, configPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`Config file not found: ${abs}`);
    }
    Object.assign(merged, JSON.parse(fs.readFileSync(abs, "utf8")));
    return merged;
  }

  const rc = path.join(pkgDir, ".packfencerc.json");
  if (fs.existsSync(rc)) {
    Object.assign(merged, JSON.parse(fs.readFileSync(rc, "utf8")));
  }

  const pkgJson = path.join(pkgDir, "package.json");
  if (fs.existsSync(pkgJson)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8")) as {
      packfence?: PackfenceConfig;
    };
    if (pkg.packfence) {
      Object.assign(merged, pkg.packfence);
    }
  }

  merged.maxFileBytes ??= DEFAULTS.maxFileBytes;
  merged.maxFileWarnBytes ??= DEFAULTS.maxFileWarnBytes;
  merged.maxTotalBytes ??= DEFAULTS.maxTotalBytes;
  merged.contentScanMaxBytes ??= DEFAULTS.contentScanMaxBytes;
  merged.allow ??= [];
  merged.deny ??= [];
  merged.severity ??= {};
  return merged;
}
