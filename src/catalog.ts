import { CONTENT_RULES } from "./secrets.js";
import type { Severity } from "./types.js";

export interface RuleInfo {
  id: string;
  title: string;
  description: string;
  defaultSeverity: Severity;
  /** GitHub code scanning security-severity (0–10). */
  securitySeverity: number;
  fix: string;
}

const SECRET_FIX =
  "Remove the file from the tarball (tighten `files` in package.json or add it to `.npmignore`) and rotate the credential: assume anything that reached a build artifact is compromised.";

export const RULES: RuleInfo[] = [
  {
    id: "source-map",
    title: "Source map in tarball",
    description: "A `*.map` file would be published with the package.",
    defaultSeverity: "fail",
    securitySeverity: 7.5,
    fix: "Exclude `**/*.map` via the `files` field or `.npmignore`, or stop emitting maps for the published build.",
  },
  {
    id: "sources-content",
    title: "Source map embeds original source",
    description:
      "A published source map carries non-empty `sourcesContent`, so the original source code would ship (the Claude Code v2.1.88 failure mode).",
    defaultSeverity: "fail",
    securitySeverity: 8.5,
    fix: "Do not publish the map; if you must, build with `sourcesContent` disabled.",
  },
  {
    id: "secret-env",
    title: "Environment file in tarball",
    description: "A `.env` / `.env.*` file would be published.",
    defaultSeverity: "fail",
    securitySeverity: 9.0,
    fix: SECRET_FIX,
  },
  {
    id: "secret-keyfile",
    title: "Key or certificate file in tarball",
    description: "A `*.pem`, `*.key`, `id_rsa*`, `*.p12` or `*.pfx` file would be published.",
    defaultSeverity: "fail",
    securitySeverity: 9.0,
    fix: SECRET_FIX,
  },
  {
    id: "secret-npmrc",
    title: ".npmrc in tarball",
    description: "An `.npmrc` would be published; these often hold registry auth tokens.",
    defaultSeverity: "fail",
    securitySeverity: 8.0,
    fix: "Exclude `.npmrc` from the package.",
  },
  {
    id: "npmrc-auth",
    title: ".npmrc contains auth",
    description: "The published `.npmrc` contains `_auth` / `_authToken`.",
    defaultSeverity: "fail",
    securitySeverity: 9.5,
    fix: SECRET_FIX,
  },
  {
    id: "git-dir",
    title: ".git in tarball",
    description: "Repository metadata under `.git/` would be published.",
    defaultSeverity: "fail",
    securitySeverity: 7.0,
    fix: "Exclude `.git` from the package.",
  },
  {
    id: "node-modules",
    title: "node_modules in tarball",
    description: "A `node_modules/` directory would be published (outside `bundleDependencies`).",
    defaultSeverity: "fail",
    securitySeverity: 5.0,
    fix: "Exclude `node_modules` or declare intended bundles via `bundleDependencies`.",
  },
  {
    id: "deny-glob",
    title: "Matches a configured deny glob",
    description: "A packed file matches one of your `deny` globs.",
    defaultSeverity: "fail",
    securitySeverity: 6.0,
    fix: "Remove the file from the tarball or change your packfence `deny` list.",
  },
  {
    id: "file-too-large",
    title: "File over the hard size limit",
    description: "A single packed file exceeds `maxFileBytes` (default 20 MB).",
    defaultSeverity: "fail",
    securitySeverity: 3.0,
    fix: "Check whether the file was meant to ship; raise `maxFileBytes` if it was.",
  },
  {
    id: "file-large",
    title: "Large file",
    description: "A single packed file exceeds `maxFileWarnBytes` (default 5 MB).",
    defaultSeverity: "warn",
    securitySeverity: 2.0,
    fix: "Check whether the file was meant to ship.",
  },
  {
    id: "total-large",
    title: "Large tarball",
    description: "Total unpacked size exceeds `maxTotalBytes` (default 50 MB).",
    defaultSeverity: "warn",
    securitySeverity: 2.0,
    fix: "Review the packed file list (`packfence --list`).",
  },
  ...CONTENT_RULES.map<RuleInfo>((r) => ({
    id: r.rule,
    title: r.message.replace(/ \(.*\)$/, ""),
    description: `${r.message}. Matched by content scan of a packed text file.`,
    defaultSeverity: r.severity,
    securitySeverity: r.severity === "fail" ? 9.0 : 6.0,
    fix: SECRET_FIX,
  })),
];

export function ruleInfo(id: string): RuleInfo {
  return (
    RULES.find((r) => r.id === id) ?? {
      id,
      title: id,
      description: id,
      defaultSeverity: "fail",
      securitySeverity: 5.0,
      fix: "See https://blackman99.github.io/packfence/docs/",
    }
  );
}
