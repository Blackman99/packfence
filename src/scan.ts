import path from "node:path";
import { loadConfig, readOwnConfig, mergeConfig } from "./config.js";
import { listPackedFiles } from "./pack.js";
import { evaluate } from "./rules.js";
import { discoverWorkspaces, readManifest, workspacePatterns } from "./workspaces.js";
import type {
  MultiScanResult,
  PackageReport,
  PackfenceConfig,
  ScanResult,
  SkippedPackage,
} from "./types.js";

export function scan(
  pkgDir: string,
  options: { configPath?: string; config?: PackfenceConfig } = {},
): ScanResult {
  const cfg =
    options.config ?? loadConfig(pkgDir, options.configPath);
  const files = listPackedFiles(pkgDir);
  return evaluate(pkgDir, files, cfg);
}

function toPosixRel(from: string, to: string): string {
  const rel = path.relative(from, to).split(path.sep).join("/");
  return rel === "" ? "" : rel;
}

export interface ScanPackagesOptions {
  configPath?: string;
  /** Expand npm/Yarn workspaces and scan each publishable package. */
  workspaces?: boolean;
  /** Directory report paths are made relative to (default: process.cwd()). */
  reportRoot?: string;
}

/**
 * Scan one package, or with `workspaces: true` every publishable workspace
 * package (private ones are skipped: npm refuses to publish them anyway).
 * Workspace packages inherit the root config; their own allow/deny lists are
 * appended and their severity/limits override.
 */
export function scanPackages(
  rootDir: string,
  options: ScanPackagesOptions = {},
): MultiScanResult {
  const root = path.resolve(rootDir);
  const reportRoot = path.resolve(options.reportRoot ?? process.cwd());
  const packages: PackageReport[] = [];
  const skipped: SkippedPackage[] = [];
  const rootManifest = readManifest(root);
  const hasWorkspaces = workspacePatterns(root).length > 0;

  // A private workspace root can never be published itself; screening it is
  // pointless, so screen what *would* be published: its workspaces.
  const autoWorkspaces =
    !options.workspaces &&
    hasWorkspaces &&
    (rootManifest?.private === true || !rootManifest?.name || !rootManifest?.version);

  if (!options.workspaces && !autoWorkspaces) {
    const result = scan(root, { configPath: options.configPath });
    packages.push({
      name: rootManifest?.name ?? path.basename(root),
      version: rootManifest?.version,
      dir: root,
      relDir: toPosixRel(reportRoot, root),
      result,
    });
    return {
      packages,
      skipped,
      failed: result.failed,
      warned: result.warned,
      workspacesHint: hasWorkspaces,
    };
  }

  if (!hasWorkspaces) {
    throw new Error(
      `--workspaces: ${path.join(root, "package.json")} declares no "workspaces"`,
    );
  }

  const rootCfg = loadConfig(root, options.configPath);
  const targets: Array<{ dir: string; name: string; version?: string; private: boolean; isRoot: boolean }> = [];
  targets.push({
    dir: root,
    name: rootManifest?.name ?? path.basename(root),
    version: rootManifest?.version,
    private: rootManifest?.private === true || !rootManifest?.name,
    isRoot: true,
  });
  for (const ws of discoverWorkspaces(root)) targets.push({ ...ws, isRoot: false });

  for (const t of targets) {
    const relDir = toPosixRel(reportRoot, t.dir);
    if (t.private) {
      skipped.push({
        name: t.name,
        relDir,
        reason: t.isRoot ? "workspace root is private" : "private: true",
      });
      continue;
    }
    const cfg = t.isRoot ? rootCfg : mergeConfig(rootCfg, readOwnConfig(t.dir));
    const result = evaluate(t.dir, listPackedFiles(t.dir), cfg);
    packages.push({ name: t.name, version: t.version, dir: t.dir, relDir, result });
  }

  if (packages.length === 0) {
    throw new Error(
      "--workspaces: every workspace package is private; nothing would be published",
    );
  }

  return {
    packages,
    skipped,
    failed: packages.some((p) => p.result.failed),
    warned: packages.some((p) => p.result.warned),
    autoWorkspaces,
  };
}
