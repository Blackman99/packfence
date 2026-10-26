#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { scanPackages } from "./scan.js";
import {
  formatGithubAnnotations,
  formatHumanMulti,
  formatJsonMulti,
  formatStepSummary,
} from "./format.js";
import { formatSarif } from "./sarif.js";
import { formatInitHuman, formatInitJson } from "./format.js";
import { proposeFiles, writeFilesField } from "./init.js";
import type { MultiScanResult } from "./types.js";

const FORMATS = ["human", "json", "github-annotations", "summary", "sarif"] as const;

function printHelp(): void {
  console.log(`packfence — pre-publish tarball fence

Usage:
  packfence [path] [options]
  packfence init [path] [--write] [--format json]

Options:
  --format <name>   human | json | github-annotations | summary | sarif  (default: human)
  --sarif <file>    Also write a SARIF 2.1.0 report to <file> (for code scanning)
  --output, -o <f>  Write the --format report to <f> instead of stdout
  --workspaces, -w  Scan every publishable npm/Yarn workspace package under [path]
  --config <file>   Config JSON (default: .packfencerc.json or package.json#packfence)
  --list            Also print every packed file (human format)
  --fail            Exit 1 on fail findings (default: true)
  --no-fail         Never exit 1 (alias of --test for CI dry runs)
  --test            Report what would fail but always exit 0
  --help, -h        Show help
  --version, -v     Show version

Init:
  packfence init    Suggest a package.json "files" allowlist from today's pack:
                    keep what main/exports/bin/types point at, drop tests,
                    sources and tool config, fence HOLD files out of kept dirs,
                    then re-pack with the proposal to prove the result.
  --write           Save the proposal to package.json (keeps indentation)

Exit codes:
  0  CLEAR (or --test)
  1  HOLD (fail-severity finding)
  2  usage / runtime error
`);
}

function getVersion(): string {
  try {
    const here = path.dirname(new URL(import.meta.url).pathname);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(here, "..", "package.json"), "utf8"),
    ) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

function usage(msg: string): never {
  console.error(`packfence: ${msg}`);
  console.error("Run `packfence --help` for usage.");
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const opts = {
    path: ".",
    config: undefined as string | undefined,
    format: "human" as string,
    sarif: undefined as string | undefined,
    output: undefined as string | undefined,
    workspaces: false,
    list: false,
    fail: true,
    test: false,
    help: false,
    version: false,
  };
  const args = [...argv];
  const value = (flag: string): string => {
    const v = args.shift();
    if (v === undefined || v.startsWith("-")) usage(`${flag} needs a value`);
    return v;
  };
  while (args.length) {
    const a = args.shift()!;
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--version" || a === "-v") opts.version = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--workspaces" || a === "-w") opts.workspaces = true;
    else if (a === "--fail") opts.fail = true;
    else if (a === "--no-fail" || a === "--test") {
      opts.fail = false;
      opts.test = true;
    } else if (a === "--config") opts.config = value(a);
    else if (a.startsWith("--config=")) opts.config = a.slice("--config=".length);
    else if (a === "--format") opts.format = value(a);
    else if (a.startsWith("--format=")) opts.format = a.slice("--format=".length);
    else if (a === "--sarif") opts.sarif = value(a);
    else if (a.startsWith("--sarif=")) opts.sarif = a.slice("--sarif=".length);
    else if (a === "--output" || a === "-o") opts.output = value(a);
    else if (a.startsWith("--output=")) opts.output = a.slice("--output=".length);
    else if (a.startsWith("-")) usage(`unknown option ${a}`);
    else opts.path = a;
  }
  if (!(FORMATS as readonly string[]).includes(opts.format)) {
    usage(`unknown --format "${opts.format}" (expected ${FORMATS.join(" | ")})`);
  }
  return opts;
}

function writeFile(file: string, text: string): void {
  const abs = path.resolve(file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text.endsWith("\n") ? text : text + "\n");
}

function initMain(argv: string[]): void {
  let dir = ".";
  let write = false;
  let format = "human";
  let config: string | undefined;
  const args = [...argv];
  while (args.length) {
    const a = args.shift()!;
    if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (a === "--write") write = true;
    else if (a === "--json") format = "json";
    else if (a === "--format") format = args.shift() ?? usage("--format needs a value");
    else if (a.startsWith("--format=")) format = a.slice("--format=".length);
    else if (a === "--config") config = args.shift() ?? usage("--config needs a value");
    else if (a.startsWith("--config=")) config = a.slice("--config=".length);
    else if (a === "--workspaces" || a === "-w") {
      usage("init works on one package at a time; pass the workspace package path");
    } else if (a.startsWith("-")) usage(`unknown init option ${a}`);
    else dir = a;
  }
  if (format !== "human" && format !== "json") usage(`init --format must be human or json`);

  let proposal;
  try {
    proposal = proposeFiles(dir, { configPath: config });
  } catch (err) {
    console.error(`packfence: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
  let wrote = false;
  if (write && !proposal.unchanged) {
    if (proposal.lostEntries.length) {
      console.error(
        `packfence: not writing — entry points would stop shipping: ${proposal.lostEntries.join(", ")}`,
      );
      process.exit(2);
    }
    writeFilesField(dir, proposal.files);
    wrote = true;
  }
  console.log(format === "json" ? formatInitJson(proposal) : formatInitHuman(proposal, { wrote }));
  process.exit(proposal.after.failed ? 1 : 0);
}

function main(): void {
  if (process.argv[2] === "init") return initMain(process.argv.slice(3));
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }
  const version = getVersion();
  if (opts.version) {
    console.log(version);
    process.exit(0);
  }

  const pkgDir = path.resolve(opts.path);
  let multi: MultiScanResult;
  try {
    multi = scanPackages(pkgDir, {
      configPath: opts.config,
      workspaces: opts.workspaces,
      reportRoot: process.cwd(),
    });
  } catch (err) {
    console.error(`packfence: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  let report: string;
  if (opts.format === "json") {
    report = formatJsonMulti(multi, opts.workspaces || multi.autoWorkspaces === true);
  } else if (opts.format === "sarif") {
    report = formatSarif(multi, version);
  } else if (opts.format === "github-annotations") {
    const ann = formatGithubAnnotations(multi);
    report = (ann ? ann + "\n" : "") + formatHumanMulti(multi);
  } else if (opts.format === "summary") {
    report = formatStepSummary(multi);
  } else {
    report = formatHumanMulti(multi);
    if (opts.list) {
      const rows: string[] = ["", "PACKED FILES"];
      for (const pkg of multi.packages) {
        const prefix = multi.packages.length > 1 ? `${pkg.relDir || "."}/` : "";
        for (const f of pkg.result.files) rows.push(`  ${prefix}${f.path}\t${f.size}`);
      }
      report += "\n" + rows.join("\n");
    }
  }

  try {
    if (opts.output) {
      writeFile(opts.output, report);
      console.error(`packfence: wrote ${opts.format} report to ${opts.output}`);
    } else {
      console.log(report);
    }
    if (opts.sarif) {
      writeFile(opts.sarif, formatSarif(multi, version));
      console.error(`packfence: wrote SARIF to ${opts.sarif}`);
    }
  } catch (err) {
    console.error(`packfence: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  // Write GitHub job summary when running in Actions
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        formatStepSummary(multi) + "\n",
      );
    } catch {
      /* ignore */
    }
  }

  if (opts.fail && multi.failed) {
    process.exit(1);
  }
  process.exit(0);
}

main();
