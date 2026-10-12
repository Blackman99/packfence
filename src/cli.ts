#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { scan } from "./scan.js";
import {
  formatGithubAnnotations,
  formatHuman,
  formatJson,
  formatStepSummary,
} from "./format.js";

function printHelp(): void {
  console.log(`packfence — pre-publish tarball fence

Usage:
  packfence [path] [options]

Options:
  --config <file>   Config JSON (default: .packfencerc.json or package.json#packfence)
  --format <name>   human | json | github-annotations | summary  (default: human)
  --list            Also print every packed file (human format)
  --fail            Exit 1 on fail findings (default: true)
  --no-fail         Never exit 1 (alias of --test for CI dry runs)
  --test            Report what would fail but always exit 0
  --help, -h        Show help
  --version, -v     Show version

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

function parseArgs(argv: string[]) {
  const opts = {
    path: ".",
    config: undefined as string | undefined,
    format: "human" as string,
    list: false,
    fail: true,
    test: false,
    help: false,
    version: false,
  };
  const args = [...argv];
  while (args.length) {
    const a = args.shift()!;
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--version" || a === "-v") opts.version = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--fail") opts.fail = true;
    else if (a === "--no-fail" || a === "--test") {
      opts.fail = false;
      opts.test = true;
    }
    else if (a === "--config") opts.config = args.shift();
    else if (a.startsWith("--config=")) opts.config = a.slice("--config=".length);
    else if (a === "--format") opts.format = args.shift() || "human";
    else if (a.startsWith("--format=")) opts.format = a.slice("--format=".length);
    else if (a.startsWith("-")) {
      console.error(`Unknown option: ${a}`);
      process.exit(2);
    } else {
      opts.path = a;
    }
  }
  return opts;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }
  if (opts.version) {
    console.log(getVersion());
    process.exit(0);
  }

  const pkgDir = path.resolve(opts.path);
  let result;
  try {
    result = scan(pkgDir, { configPath: opts.config });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  if (opts.format === "json") {
    console.log(formatJson(result));
  } else if (opts.format === "github-annotations") {
    const ann = formatGithubAnnotations(result);
    if (ann) console.log(ann);
    console.log(formatHuman(result));
  } else if (opts.format === "summary") {
    console.log(formatStepSummary(result));
  } else {
    console.log(formatHuman(result));
    if (opts.list) {
      console.log("");
      console.log("PACKED FILES");
      for (const f of result.files) {
        console.log(`  ${f.path}\t${f.size}`);
      }
    }
  }

  // Write GitHub job summary when running in Actions
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        formatStepSummary(result) + "\n",
      );
    } catch {
      /* ignore */
    }
  }

  if (opts.fail && result.failed) {
    process.exit(1);
  }
  process.exit(0);
}

main();
