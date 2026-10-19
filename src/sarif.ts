import { createHash } from "node:crypto";
import { RULES, ruleInfo } from "./catalog.js";
import { findingUri } from "./format.js";
import type { MultiScanResult, Severity } from "./types.js";

const HOMEPAGE = "https://blackman99.github.io/packfence/";
const DOCS = "https://blackman99.github.io/packfence/docs/#rules";

function level(sev: Severity): "error" | "warning" | "note" | "none" {
  if (sev === "fail") return "error";
  if (sev === "warn") return "warning";
  if (sev === "info") return "note";
  return "none";
}

function pascal(id: string): string {
  return id
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");
}

/**
 * SARIF 2.1.0 for GitHub code scanning (`github/codeql-action/upload-sarif`).
 * URIs are relative to the report root (the repo checkout in Actions).
 */
export function formatSarif(multi: MultiScanResult, version: string): string {
  const used = new Set<string>();
  for (const p of multi.packages) for (const f of p.result.findings) used.add(f.rule);
  const ids = [...RULES.map((r) => r.id), ...[...used].filter((id) => !RULES.some((r) => r.id === id))];
  const rules = ids.map((id) => {
    const r = ruleInfo(id);
    return {
      id: r.id,
      name: pascal(r.id),
      shortDescription: { text: r.title },
      fullDescription: { text: r.description.replace(/`/g, "") },
      help: {
        text: `${r.description.replace(/`/g, "")}\n\nFix: ${r.fix.replace(/`/g, "")}`,
        markdown: `${r.description}\n\n**Fix:** ${r.fix}\n\n[packfence rules](${DOCS})`,
      },
      helpUri: DOCS,
      defaultConfiguration: { level: level(r.defaultSeverity) },
      properties: {
        tags: ["security", "npm", "supply-chain"],
        "security-severity": r.securitySeverity.toFixed(1),
        precision: r.defaultSeverity === "fail" ? "high" : "medium",
      },
    };
  });
  const index = new Map(ids.map((id, i) => [id, i]));

  const results = [];
  for (const pkg of multi.packages) {
    for (const f of pkg.result.findings) {
      if (f.severity === "allow") continue;
      const uri = findingUri(pkg, f);
      const extra: string[] = [];
      if (f.redacted) extra.push(`match ${f.redacted}`);
      if (f.matches && f.matches > 1) extra.push(`${f.matches} matches`);
      const where = multi.packages.length > 1 ? ` (package ${pkg.name})` : "";
      results.push({
        ruleId: f.rule,
        ruleIndex: index.get(f.rule) ?? 0,
        level: level(f.severity),
        message: {
          text: `${f.message}${where}${extra.length ? ` — ${extra.join(", ")}` : ""}. This file would ship in the npm tarball.`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri, uriBaseId: "%SRCROOT%" },
              region: { startLine: f.line ?? 1, startColumn: f.column ?? 1 },
            },
          },
        ],
        partialFingerprints: {
          "packfence/v1": createHash("sha256")
            .update(`${f.rule}\0${uri}`)
            .digest("hex")
            .slice(0, 32),
        },
      });
    }
  }

  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "packfence",
              semanticVersion: version,
              version,
              informationUri: HOMEPAGE,
              rules,
            },
          },
          automationDetails: { id: "packfence/" },
          results,
        },
      ],
    },
    null,
    2,
  );
}
