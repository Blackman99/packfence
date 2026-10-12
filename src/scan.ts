import { loadConfig } from "./config.js";
import { listPackedFiles } from "./pack.js";
import { evaluate } from "./rules.js";
import type { PackfenceConfig, ScanResult } from "./types.js";

export function scan(
  pkgDir: string,
  options: { configPath?: string; config?: PackfenceConfig } = {},
): ScanResult {
  const cfg =
    options.config ?? loadConfig(pkgDir, options.configPath);
  const files = listPackedFiles(pkgDir);
  return evaluate(pkgDir, files, cfg);
}
