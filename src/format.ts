import type { Finding, ScanResult } from "./types.js";

function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
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

  const holds = result.findings.filter((f) => f.severity === "fail");
  const warns = result.findings.filter((f) => f.severity === "warn");
  const infos = result.findings.filter(
    (f) => f.severity === "info" || f.severity === "allow",
  );

  const render = (tag: string, list: Finding[]) => {
    for (const f of list) {
      const sz = f.size != null ? ` (${fmtSize(f.size)})` : "";
      lines.push(`[${tag}] ${f.path}${sz}`);
      lines.push(`       ${f.rule}: ${f.message}`);
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

  lines.push(
    result.failed
      ? "RESULT: HOLD — refuse publish (exit 1)"
      : "RESULT: CLEAR with warnings",
  );
  return lines.join("\n");
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

export function formatGithubAnnotations(result: ScanResult): string {
  const lines: string[] = [];
  for (const f of result.findings) {
    if (f.severity === "allow") continue;
    const level =
      f.severity === "fail" ? "error" : f.severity === "warn" ? "warning" : "notice";
    const file = f.path === "(total)" ? "" : `file=${f.path}`;
    lines.push(
      `::${level} ${file}::[${f.rule}] ${f.message}`,
    );
  }
  return lines.join("\n");
}

export function formatStepSummary(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`## PACKFENCE — PRE-PUBLISH SCAN`);
  lines.push("");
  lines.push(
    `| Files | Unpacked | Result |`,
  );
  lines.push(`| ---: | ---: | --- |`);
  lines.push(
    `| ${result.files.length} | ${fmtSize(result.totalBytes)} | ${result.failed ? "**HOLD**" : "CLEAR"} |`,
  );
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("No findings.");
    return lines.join("\n");
  }
  lines.push(`| Severity | Path | Rule | Message |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const f of result.findings) {
    lines.push(
      `| ${f.severity} | \`${f.path}\` | \`${f.rule}\` | ${f.message.replace(/\|/g, "\\|")} |`,
    );
  }
  return lines.join("\n");
}
