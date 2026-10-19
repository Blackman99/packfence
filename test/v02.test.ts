import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanPackages } from "../src/scan.js";
import { discoverWorkspaces } from "../src/workspaces.js";
import { mergeConfig } from "../src/config.js";
import { formatSarif } from "../src/sarif.js";
import { formatGithubAnnotations } from "../src/format.js";
import { evaluate } from "../src/rules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "fixtures");
const mono = path.join(fixtures, "monorepo");

describe("workspaces", () => {
  it("expands globs, honors negation, keeps private flags", () => {
    const ws = discoverWorkspaces(mono);
    assert.deepEqual(
      ws.map((w) => w.relDir),
      ["packages/cli", "packages/core", "packages/internal"],
    );
    assert.equal(ws.find((w) => w.relDir === "packages/internal")?.private, true);
  });

  it("scans each publishable package and skips private ones", () => {
    const r = scanPackages(mono, { workspaces: true, reportRoot: mono });
    assert.deepEqual(r.packages.map((p) => p.name), ["@fixture/cli", "@fixture/core"]);
    assert.deepEqual(
      r.skipped.map((s) => s.name).sort(),
      ["@fixture/internal", "monorepo-root"],
    );
    assert.equal(r.failed, true);
    const cli = r.packages[0]!;
    assert.equal(cli.relDir, "packages/cli");
    assert.ok(cli.result.findings.some((f) => f.rule === "sources-content"));
    assert.equal(r.packages[1]!.result.failed, false);
  });

  it("layers root deny with package allow", () => {
    const r = scanPackages(mono, { workspaces: true, reportRoot: mono });
    const cli = r.packages[0]!.result.findings;
    assert.ok(cli.some((f) => f.rule === "deny-glob" && f.path === "dist/scratch.tmp"));
    assert.ok(!cli.some((f) => f.path === "dist/keep.tmp"));
  });

  it("auto-expands a private workspace root without --workspaces", () => {
    const r = scanPackages(mono, { reportRoot: mono });
    assert.equal(r.autoWorkspaces, true);
    assert.equal(r.packages.length, 2);
  });

  it("errors clearly when --workspaces is used without workspaces", () => {
    assert.throws(
      () => scanPackages(path.join(fixtures, "clean"), { workspaces: true }),
      /declares no "workspaces"/,
    );
  });

  it("mergeConfig concatenates lists and overrides scalars", () => {
    const m = mergeConfig(
      { allow: ["a"], deny: ["x"], severity: { "file-large": "warn" }, maxFileBytes: 1 },
      { allow: ["b"], severity: { "file-large": "fail" }, maxFileBytes: 2 },
    );
    assert.deepEqual(m.allow, ["a", "b"]);
    assert.deepEqual(m.deny, ["x"]);
    assert.equal(m.severity?.["file-large"], "fail");
    assert.equal(m.maxFileBytes, 2);
  });
});

describe("SARIF", () => {
  const r = scanPackages(mono, { workspaces: true, reportRoot: mono });
  const sarif = JSON.parse(formatSarif(r, "9.9.9"));

  it("is SARIF 2.1.0 with a packfence driver and rule metadata", () => {
    assert.equal(sarif.version, "2.1.0");
    const driver = sarif.runs[0].tool.driver;
    assert.equal(driver.name, "packfence");
    assert.equal(driver.version, "9.9.9");
    const sm = driver.rules.find((x: { id: string }) => x.id === "sources-content");
    assert.ok(sm);
    assert.match(sm.properties["security-severity"], /^\d+\.\d$/);
    assert.equal(sm.defaultConfiguration.level, "error");
  });

  it("emits repo-relative locations with valid ruleIndex", () => {
    const driver = sarif.runs[0].tool.driver;
    const results = sarif.runs[0].results as Array<any>;
    assert.ok(results.length >= 3);
    for (const res of results) {
      assert.equal(driver.rules[res.ruleIndex].id, res.ruleId);
      const loc = res.locations[0].physicalLocation;
      assert.equal(loc.artifactLocation.uriBaseId, "%SRCROOT%");
      assert.ok(loc.region.startLine >= 1);
      assert.ok(res.partialFingerprints["packfence/v1"]);
    }
    assert.ok(
      results.some((x) => x.locations[0].physicalLocation.artifactLocation.uri === "packages/cli/dist/cli.js.map"),
    );
  });

  it("maps content hits to their line", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-sarif-"));
    const key = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
    fs.writeFileSync(path.join(dir, "a.js"), `// x\n// y\nconst k = "${key}";\n`);
    const result = evaluate(dir, [{ path: "a.js", size: 40 }], {});
    const out = JSON.parse(
      formatSarif(
        { packages: [{ name: "t", dir, relDir: "pkg", result }], skipped: [], failed: true, warned: false },
        "0",
      ),
    );
    const res = out.runs[0].results[0];
    assert.equal(res.locations[0].physicalLocation.artifactLocation.uri, "pkg/a.js");
    assert.equal(res.locations[0].physicalLocation.region.startLine, 3);
    assert.ok(!JSON.stringify(out).includes(key));
  });
});

describe("annotations", () => {
  it("prefix file= with the package dir so subpath scans annotate the right file", () => {
    const r = scanPackages(mono, { workspaces: true, reportRoot: fixtures });
    const out = formatGithubAnnotations(r);
    assert.match(out, /::error file=monorepo\/packages\/cli\/dist\/cli\.js\.map,/);
  });
});

describe("CLI", () => {
  const cli = path.join(__dirname, "..", "src", "cli.ts");
  const run = (args: string[], cwd = mono) =>
    spawnSync(process.execPath, ["--import", "tsx", cli, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GITHUB_STEP_SUMMARY: "" },
    });

  it("writes SARIF alongside the human report and exits 1 on HOLD", () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pf-cli-")), "pf.sarif");
    const res = run([".", "--workspaces", "--sarif", out]);
    assert.equal(res.status, 1, res.stderr);
    assert.match(res.stdout, /BAG 1\/2 · @fixture\/cli@2\.1\.0/);
    assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).version, "2.1.0");
  });

  it("rejects unknown formats with exit 2", () => {
    const res = run([".", "--format", "xml"]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /unknown --format/);
  });
});
