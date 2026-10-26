import type { Finding, MultiScanResult, PackageReport, ScanResult } from "./types.js";
import type { InitGroup, InitProposal } from "./init.js";

export function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
}

function posixJoin(dir: string, p: string): string {
  if (!dir) return p;
  return `${dir.replace(/\/+$/, "")}/${p}`;
}

/** Repo-relative path of a finding (for annotations / SARIF). "(total)" maps to package.json. */
export function findingUri(pkg: Pick<PackageReport, "relDir">, f: Finding): string {
  const p = f.path === "(total)" ? "package.json" : f.path;
  return posixJoin(pkg.relDir, p);
}

function location(f: Finding): string {
  if (f.line == null) return f.path;
  return `${f.path}:${f.line}:${f.column ?? 1}`;
}

function renderFindings(lines: string[], result: ScanResult): void {
  const holds = result.findings.filter((f) => f.severity === "fail");
  const warns = result.findings.filter((f) => f.severity === "warn");
  const infos = result.findings.filter(
    (f) => f.severity === "info" || f.severity === "allow",
  );

  const render = (tag: string, list: Finding[]) => {
    for (const f of list) {
      const sz = f.size != null && f.path !== "(total)" ? ` (${fmtSize(f.size)})` : "";
      lines.push(`[${tag}] ${location(f)}${sz}`);
      const extra: string[] = [];
      if (f.redacted) extra.push(f.redacted);
      if (f.matches && f.matches > 1) extra.push(`${f.matches} matches`);
      const tail = extra.length ? `  [${extra.join(" · ")}]` : "";
      lines.push(`       ${f.rule}: ${f.message}${tail}`);
    }
  };

  if (holds.length) {
    lines.push(`HOLD (${holds.length})`);
    render("HOLD", holds);
    lines.push("");
  }
  if (warns.length) {
    lines.push(`WARN (${warns.length})`);
    render("WARN", warns);
    lines.push("");
  }
  if (infos.length) {
    lines.push(`INFO (${infos.length})`);
    render("INFO", infos);
    lines.push("");
  }
}

function verdict(failed: boolean, warned: boolean): string {
  if (failed) return "RESULT: HOLD — refuse publish (exit 1)";
  if (warned) return "RESULT: CLEAR with warnings";
  return "RESULT: CLEAR";
}

export function formatHuman(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`PACKFENCE — PRE-PUBLISH SCAN`);
  lines.push(
    `files: ${result.files.length}  unpacked: ${fmtSize(result.totalBytes)}`,
  );
  lines.push("");

  if (result.findings.length === 0) {
    lines.push("CLEAR — nothing suspicious in the tarball.");
    return lines.join("\n");
  }
  renderFindings(lines, result);
  lines.push(verdict(result.failed, result.warned));
  return lines.join("\n");
}

const WS_HINT =
  "NOTE  this root declares workspaces — add --workspaces to screen every publishable package.";

/** Human report for one or many packages ("bags" on the belt). */
export function formatHumanMulti(multi: MultiScanResult): string {
  if (multi.packages.length === 1 && multi.skipped.length === 0) {
    const out = formatHuman(multi.packages[0]!.result);
    return multi.workspacesHint ? `${out}\n\n${WS_HINT}` : out;
  }
  const lines: string[] = [];
  const total = multi.packages.length;
  lines.push(`PACKFENCE — PRE-PUBLISH SCAN · ${total} bag${total === 1 ? "" : "s"} on the belt`);
  lines.push("");
  multi.packages.forEach((pkg, i) => {
    const r = pkg.result;
    const tag = r.failed ? "HOLD" : r.warned ? "WARN" : "CLEAR";
    const id = pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name;
    lines.push(`── BAG ${i + 1}/${total} · ${id} · ${pkg.relDir || "."} · ${tag}`);
    lines.push(`files: ${r.files.length}  unpacked: ${fmtSize(r.totalBytes)}`);
    if (r.findings.length === 0) {
      lines.push("CLEAR — nothing suspicious in the tarball.");
      lines.push("");
    } else {
      lines.push("");
      renderFindings(lines, r);
    }
  });
  for (const s of multi.skipped) {
    lines.push(`── SKIP · ${s.name} · ${s.relDir || "."} · ${s.reason}`);
  }
  if (multi.skipped.length) lines.push("");
  if (multi.autoWorkspaces) {
    lines.push("NOTE  private workspace root — screened its publishable workspaces instead.");
    lines.push("");
  }
  const held = multi.packages.filter((p) => p.result.failed).length;
  if (multi.failed) {
    lines.push(`RESULT: HOLD — ${held} of ${total} bags held, refuse publish (exit 1)`);
  } else {
    lines.push(verdict(false, multi.warned));
  }
  return lines.join("\n");
}

function jsonPackage(pkg: PackageReport) {
  const r = pkg.result;
  return {
    name: pkg.name,
    version: pkg.version,
    dir: pkg.relDir || ".",
    files: r.files.length,
    totalBytes: r.totalBytes,
    failed: r.failed,
    warned: r.warned,
    findings: r.findings,
    fileList: r.files,
  };
}

export function formatJson(result: ScanResult): string {
  return JSON.stringify(
    {
      files: result.files.length,
      totalBytes: result.totalBytes,
      failed: result.failed,
      warned: result.warned,
      findings: result.findings,
      fileList: result.files,
    },
    null,
    2,
  );
}

/**
 * Single package (no --workspaces): the v0.1 shape plus name/version/dir.
 * Workspaces: `{ failed, warned, packages: [...], skipped: [...] }`.
 */
export function formatJsonMulti(multi: MultiScanResult, workspaces: boolean): string {
  if (!workspaces && multi.packages.length === 1) {
    const pkg = multi.packages[0]!;
    const { name, version, dir, ...rest } = jsonPackage(pkg);
    return JSON.stringify({ name, version, dir, ...rest }, null, 2);
  }
  return JSON.stringify(
    {
      failed: multi.failed,
      warned: multi.warned,
      packages: multi.packages.map(jsonPackage),
      skipped: multi.skipped,
    },
    null,
    2,
  );
}

function escapeData(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProp(s: string): string {
  return escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export function formatGithubAnnotations(
  result: ScanResult | MultiScanResult,
): string {
  const multi: MultiScanResult =
    "packages" in result
      ? result
      : {
          packages: [{ name: "", dir: "", relDir: "", result }],
          skipped: [],
          failed: result.failed,
          warned: result.warned,
        };
  const lines: string[] = [];
  for (const pkg of multi.packages) {
    for (const f of pkg.result.findings) {
      if (f.severity === "allow") continue;
      const level =
        f.severity === "fail" ? "error" : f.severity === "warn" ? "warning" : "notice";
      const props = [`file=${escapeProp(findingUri(pkg, f))}`];
      if (f.line != null) props.push(`line=${f.line}`, `col=${f.column ?? 1}`);
      props.push(`title=${escapeProp(`packfence ${f.rule}`)}`);
      const prefix = multi.packages.length > 1 ? `${pkg.name}: ` : "";
      lines.push(`::${level} ${props.join(",")}::${escapeData(`${prefix}[${f.rule}] ${f.message}`)}`);
    }
  }
  return lines.join("\n");
}

function summaryTable(lines: string[], pkg: PackageReport): void {
  const r = pkg.result;
  if (r.findings.length === 0) {
    lines.push("No findings.");
    return;
  }
  lines.push(`| Severity | Path | Rule | Message |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const f of r.findings) {
    const loc = f.line != null ? `${f.path}:${f.line}` : f.path;
    lines.push(
      `| ${f.severity} | \`${loc}\` | \`${f.rule}\` | ${f.message.replace(/\|/g, "\\|")} |`,
    );
  }
}

export function formatStepSummary(result: ScanResult | MultiScanResult): string {
  const multi: MultiScanResult =
    "packages" in result
      ? result
      : {
          packages: [{ name: "", dir: "", relDir: "", result }],
          skipped: [],
          failed: result.failed,
          warned: result.warned,
        };
  const lines: string[] = [];
  lines.push(`## PACKFENCE — PRE-PUBLISH SCAN`);
  lines.push("");
  if (multi.packages.length === 1 && multi.skipped.length === 0) {
    const pkg = multi.packages[0]!;
    const r = pkg.result;
    lines.push(`| Files | Unpacked | Result |`);
    lines.push(`| ---: | ---: | --- |`);
    lines.push(
      `| ${r.files.length} | ${fmtSize(r.totalBytes)} | ${r.failed ? "**HOLD**" : "CLEAR"} |`,
    );
    lines.push("");
    summaryTable(lines, pkg);
    return lines.join("\n");
  }
  lines.push(`| Package | Dir | Files | Unpacked | Result |`);
  lines.push(`| --- | --- | ---: | ---: | --- |`);
  for (const pkg of multi.packages) {
    const r = pkg.result;
    lines.push(
      `| \`${pkg.name}\` | \`${pkg.relDir || "."}\` | ${r.files.length} | ${fmtSize(r.totalBytes)} | ${r.failed ? "**HOLD**" : r.warned ? "WARN" : "CLEAR"} |`,
    );
  }
  for (const s of multi.skipped) {
    lines.push(`| \`${s.name}\` | \`${s.relDir || "."}\` | – | – | skipped (${s.reason}) |`);
  }
  for (const pkg of multi.packages) {
    if (pkg.result.findings.length === 0) continue;
    lines.push("");
    lines.push(`### ${pkg.name}`);
    lines.push("");
    summaryTable(lines, pkg);
  }
  return lines.join("\n");
}

function pad(s: string, n: number): string {
  return s.length >= n ? s + " " : s + " ".repeat(n - s.length);
}

function sideLine(s: { files: number; bytes: number; failed: boolean; warned: boolean }): string {
  const v = s.failed ? "HOLD" : s.warned ? "CLEAR with warnings" : "CLEAR";
  return `${s.files} files · ${fmtSize(s.bytes)} · ${v}`;
}

/** Human report for `packfence init`. */
export function formatInitHuman(p: InitProposal, opts: { wrote?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push("PACKFENCE INIT — FILES ALLOWLIST PROPOSAL");
  lines.push(`package: ${p.name}${p.version ? `@${p.version}` : ""}`);
  lines.push(`today:   ${sideLine(p.before)}${p.current ? `  (files: ${JSON.stringify(p.current)})` : "  (no files field)"}`);
  lines.push("");
  if (p.unchanged) {
    lines.push("Your files field already matches what packfence would suggest.");
    lines.push(p.after.failed ? "RESULT: HOLD — the allowlist is fine, but a kept file still trips a rule." : "RESULT: CLEAR — nothing to change.");
    return lines.join("\n");
  }
  const width = Math.max(12, ...p.groups.map((g) => g.entry.length + 2), ...p.fences.map((f) => f.pattern.length + 2));
  const row = (label: string, files: number, reason: string) =>
    `  ${pad(label, width)}${pad(files === 0 ? "—" : `${files} file${files === 1 ? "" : "s"}`, 10)}${reason}`;
  const section = (title: string, list: InitGroup[]) => {
    if (!list.length) return;
    lines.push(title);
    for (const g of list) lines.push(row(g.entry + (g.isDir ? "/" : ""), g.files, g.reason));
    lines.push("");
  };
  section("KEEP", p.groups.filter((g) => g.decision === "keep"));
  section("DROP", p.groups.filter((g) => g.decision === "drop"));
  if (p.fences.length) {
    lines.push("FENCE (excluded inside kept dirs)");
    for (const f of p.fences) lines.push(row(f.pattern, f.files, f.reason));
    lines.push("");
  }
  const auto = p.groups.filter((g) => g.decision === "auto");
  if (auto.length) {
    lines.push(`AUTO (npm adds these itself): ${auto.map((g) => g.entry).join(", ")}`);
    lines.push("");
  }
  lines.push(`PROPOSED package.json "files":`);
  lines.push(`  ${JSON.stringify(p.files)}`);
  lines.push("");
  const n = p.removed.length;
  const db = p.before.bytes - p.after.bytes;
  const delta = n ? `−${n} file${n === 1 ? "" : "s"}, −${fmtSize(Math.max(0, db))}` : "same files";
  lines.push(`after:   ${sideLine(p.after)}  (${delta})  verified with npm pack --dry-run`);
  for (const e of p.lostEntries) lines.push(`[WARN] entry point ${e} would no longer ship — review before writing`);
  for (const h of p.after.holds) lines.push(`[HOLD] ${h.path}: ${h.rule} — still ships (npm always packs it); fix the file itself`);
  lines.push("");
  if (opts.wrote) lines.push("Wrote files to package.json. Run `packfence` to confirm CLEAR.");
  else lines.push("Run `packfence init --write` to save it to package.json.");
  return lines.join("\n");
}

/** JSON report for `packfence init --format json`. */
export function formatInitJson(p: InitProposal): string {
  const strip = (s: InitProposal["before"]) => ({
    ...s,
    holds: s.holds.map((h) => ({ path: h.path, rule: h.rule, line: h.line, redacted: h.redacted })),
  });
  return JSON.stringify(
    {
      name: p.name,
      version: p.version,
      current: p.current ?? null,
      files: p.files,
      unchanged: p.unchanged,
      groups: p.groups,
      fences: p.fences,
      before: strip(p.before),
      after: strip(p.after),
      removed: p.removed,
      lostEntries: p.lostEntries,
    },
    null,
    2,
  );
}
