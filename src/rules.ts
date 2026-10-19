import fs from "node:fs";
import path from "node:path";
import type {
  Finding,
  PackedFile,
  PackfenceConfig,
  ScanResult,
  Severity,
} from "./types.js";
import { scanText } from "./secrets.js";

function globToRegExp(pat: string): RegExp {
  const rx =
    "^" +
    pat
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\0")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\0/g, ".*") +
    "$";
  return new RegExp(rx);
}

function matchGlob(filePath: string, pattern: string): boolean {
  // Minimal glob: **, *, ?; patterns without "/" also match the basename.
  const normalized = filePath.replace(/\\/g, "/");
  const pat = pattern.replace(/\\/g, "/");
  if (pat.startsWith("**/")) {
    const rest = pat.slice(3);
    if (matchGlob(normalized, rest)) return true;
    const parts = normalized.split("/");
    for (let i = 0; i < parts.length; i++) {
      if (matchGlob(parts.slice(i).join("/"), rest)) return true;
    }
    return false;
  }
  if (globToRegExp(pat).test(normalized)) return true;
  if (!pat.includes("/")) {
    const base = normalized.includes("/")
      ? normalized.slice(normalized.lastIndexOf("/") + 1)
      : normalized;
    return globToRegExp(pat).test(base);
  }
  return false;
}

function isAllowed(filePath: string, allow: string[]): boolean {
  return allow.some((g) => matchGlob(filePath, g));
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

const SECRET_NAME_PATTERNS: Array<{ rule: string; test: (p: string) => boolean; message: string }> = [
  {
    rule: "secret-env",
    test: (p) => {
      const b = basename(p);
      return b === ".env" || /^\.env\./.test(b) || b.endsWith(".env");
    },
    message: "Environment file must not be published",
  },
  {
    rule: "secret-keyfile",
    test: (p) => {
      const b = basename(p).toLowerCase();
      return (
        b.endsWith(".pem") ||
        b.endsWith(".key") ||
        b.startsWith("id_rsa") ||
        b === "id_ed25519" ||
        b === "id_ecdsa" ||
        b.endsWith(".p12") ||
        b.endsWith(".pfx")
      );
    },
    message: "Private key / certificate material must not be published",
  },
  {
    rule: "secret-npmrc",
    test: (p) => basename(p) === ".npmrc",
    message: ".npmrc often contains _auth tokens; refuse by default",
  },
  {
    rule: "git-dir",
    test: (p) => p === ".git" || p.startsWith(".git/"),
    message: ".git must not be published",
  },
  {
    rule: "node-modules",
    test: (p) => p === "node_modules" || p.startsWith("node_modules/"),
    message: "node_modules must not be published",
  },
];

const SOURCE_MAP_EXT = /\.(js|css|ts|mjs|cjs|jsx|tsx)\.map$/i;
const ANY_MAP = /\.map$/i;

function severityFor(
  rule: string,
  defaultSev: Severity,
  overrides: Record<string, Severity> | undefined,
): Severity {
  return overrides?.[rule] ?? defaultSev;
}

function checkSourceMap(
  pkgDir: string,
  file: PackedFile,
  cfg: PackfenceConfig,
  findings: Finding[],
): void {
  const p = file.path;
  if (!ANY_MAP.test(p)) return;

  const sev = severityFor("source-map", "fail", cfg.severity);
  if (sev === "allow") return;

  findings.push({
    path: p,
    rule: "source-map",
    severity: sev,
    message: "Source map file would be published",
    size: file.size,
  });

  // sourcesContent check for .js.map / .css.map / .ts.map etc.
  if (!SOURCE_MAP_EXT.test(p) && !p.endsWith(".map")) return;
  const abs = path.join(pkgDir, p);
  if (!fs.existsSync(abs) || file.size > (cfg.contentScanMaxBytes ?? 512 * 1024)) {
    return;
  }
  try {
    const raw = fs.readFileSync(abs, "utf8");
    const json = JSON.parse(raw) as { sourcesContent?: unknown };
    if (
      Array.isArray(json.sourcesContent) &&
      json.sourcesContent.some((s) => typeof s === "string" && s.length > 0)
    ) {
      const sev2 = severityFor("sources-content", "fail", cfg.severity);
      if (sev2 !== "allow") {
        findings.push({
          path: p,
          rule: "sources-content",
          severity: sev2,
          message:
            "Source map embeds non-empty sourcesContent (original source would ship)",
          size: file.size,
        });
      }
    }
  } catch {
    // not valid JSON map — filename rule already caught it
  }
}

function checkNpmrcAuth(
  pkgDir: string,
  file: PackedFile,
  cfg: PackfenceConfig,
  findings: Finding[],
): void {
  if (basename(file.path) !== ".npmrc") return;
  const abs = path.join(pkgDir, file.path);
  if (!fs.existsSync(abs)) return;
  try {
    const text = fs.readFileSync(abs, "utf8");
    if (/_auth(?:Token)?\s*=/i.test(text) || /\/\/.+:_authToken=/i.test(text)) {
      const sev = severityFor("npmrc-auth", "fail", cfg.severity);
      if (sev !== "allow") {
        findings.push({
          path: file.path,
          rule: "npmrc-auth",
          severity: sev,
          message: ".npmrc contains _auth / _authToken",
          size: file.size,
        });
      }
    }
  } catch {
    /* ignore */
  }
}

function checkContent(
  pkgDir: string,
  file: PackedFile,
  cfg: PackfenceConfig,
  findings: Finding[],
): void {
  const max = cfg.contentScanMaxBytes ?? 512 * 1024;
  if (file.size <= 0 || file.size > max) return;
  // Skip binary-ish extensions
  if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|zip|gz|tgz|br|wasm|mp4|mp3|pdf)$/i.test(file.path)) {
    return;
  }
  const abs = path.join(pkgDir, file.path);
  if (!fs.existsSync(abs)) return;
  let text: string;
  try {
    const buf = fs.readFileSync(abs);
    // skip if looks binary
    if (buf.includes(0)) return;
    text = buf.toString("utf8");
  } catch {
    return;
  }
  for (const h of scanText(text)) {
    const sev = severityFor(h.rule, h.severity, cfg.severity);
    if (sev === "allow") continue;
    findings.push({
      path: file.path,
      rule: h.rule,
      severity: sev,
      message: h.message,
      size: file.size,
      line: h.line,
      column: h.column,
      redacted: h.redacted,
      matches: h.matches,
    });
  }
}

export function evaluate(
  pkgDir: string,
  files: PackedFile[],
  cfg: PackfenceConfig,
): ScanResult {
  const findings: Finding[] = [];
  const allow = cfg.allow ?? [];
  const deny = cfg.deny ?? [];
  let totalBytes = 0;

  for (const file of files) {
    totalBytes += file.size;

    if (isAllowed(file.path, allow)) {
      continue;
    }

    // Custom deny globs
    for (const g of deny) {
      if (matchGlob(file.path, g)) {
        const sev = severityFor("deny-glob", "fail", cfg.severity);
        if (sev !== "allow") {
          findings.push({
            path: file.path,
            rule: "deny-glob",
            severity: sev,
            message: `Matches deny glob: ${g}`,
            size: file.size,
          });
        }
      }
    }

    // Secret / path rules
    for (const r of SECRET_NAME_PATTERNS) {
      if (r.test(file.path)) {
        const sev = severityFor(r.rule, "fail", cfg.severity);
        if (sev !== "allow") {
          findings.push({
            path: file.path,
            rule: r.rule,
            severity: sev,
            message: r.message,
            size: file.size,
          });
        }
      }
    }

    checkSourceMap(pkgDir, file, cfg, findings);
    checkNpmrcAuth(pkgDir, file, cfg, findings);
    checkContent(pkgDir, file, cfg, findings);

    // Size per file
    const failBytes = cfg.maxFileBytes ?? 20 * 1024 * 1024;
    const warnBytes = cfg.maxFileWarnBytes ?? 5 * 1024 * 1024;
    if (file.size > failBytes) {
      const sev = severityFor("file-too-large", "fail", cfg.severity);
      if (sev !== "allow") {
        findings.push({
          path: file.path,
          rule: "file-too-large",
          severity: sev,
          message: `File is ${(file.size / (1024 * 1024)).toFixed(1)}MB (limit ${(failBytes / (1024 * 1024)).toFixed(0)}MB)`,
          size: file.size,
        });
      }
    } else if (file.size > warnBytes) {
      const sev = severityFor("file-large", "warn", cfg.severity);
      if (sev !== "allow") {
        findings.push({
          path: file.path,
          rule: "file-large",
          severity: sev,
          message: `File is ${(file.size / (1024 * 1024)).toFixed(1)}MB (warn at ${(warnBytes / (1024 * 1024)).toFixed(0)}MB)`,
          size: file.size,
        });
      }
    }
  }

  const totalLimit = cfg.maxTotalBytes ?? 50 * 1024 * 1024;
  if (totalBytes > totalLimit) {
    const sev = severityFor("total-large", "warn", cfg.severity);
    if (sev !== "allow") {
      findings.push({
        path: "(total)",
        rule: "total-large",
        severity: sev,
        message: `Unpacked total is ${(totalBytes / (1024 * 1024)).toFixed(1)}MB (warn at ${(totalLimit / (1024 * 1024)).toFixed(0)}MB)`,
        size: totalBytes,
      });
    }
  }

  const failed = findings.some((f) => f.severity === "fail");
  const warned = findings.some((f) => f.severity === "warn");
  return { files, findings, totalBytes, failed, warned };
}

export { matchGlob };
