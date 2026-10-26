import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { entryPoints, proposeFiles, writeFilesField } from "../src/init.js";
import { scan } from "../src/scan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "fixtures");
const cli = path.join(__dirname, "..", "src", "cli.ts");

function copyFixture(name: string): string {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), `pf-init-${name}-`));
  fs.cpSync(path.join(fixtures, name), dst, { recursive: true });
  return dst;
}

describe("init: entry points", () => {
  it("collects main, types, bin, exports (incl. wildcards) and install scripts", () => {
    const e = entryPoints({
      main: "./dist/index.cjs",
      types: "types/index.d.ts",
      bin: { a: "./bin/a.js" },
      exports: { ".": { import: "./esm/index.js" }, "./icons/*": "./icons/*.svg" },
      scripts: { postinstall: "node scripts/setup.js", test: "node test/run.js" },
    });
    const paths = e.map((x) => x.path);
    assert.deepEqual(paths, [
      "dist/index.cjs",
      "types/index.d.ts",
      "icons",
      "esm/index.js",
      "bin/a.js",
      "scripts/setup.js",
    ].sort((a, b) => paths.indexOf(a) - paths.indexOf(b)));
    assert.ok(!paths.includes("test/run.js"), "non-install scripts are not entry points");
  });

  it("defaults main to index.js like npm does", () => {
    assert.deepEqual(entryPoints({ name: "x" }), [{ path: "index.js", field: "main (default)" }]);
  });
});

describe("init: proposal", () => {
  it("keeps entry dirs, drops dev material, fences source maps — and proves it", () => {
    const p = proposeFiles(path.join(fixtures, "sloppy"));
    assert.deepEqual(p.files, ["bin", "dist", "types", "CHANGELOG.md", "!dist/**/*.map"]);
    const dropped = p.groups.filter((g) => g.decision === "drop").map((g) => g.entry);
    assert.deepEqual(dropped.sort(), [".github", "docs", "src", "test", "tsconfig.json"]);
    assert.equal(p.before.failed, true);
    assert.equal(p.after.failed, false, "proposal must clear the HOLD");
    assert.ok(p.removed.includes("dist/index.js.map"));
    assert.ok(p.removed.includes("test/index.test.js"));
    assert.ok(!p.removed.includes("dist/index.js"));
    assert.ok(!p.removed.includes("README.md"), "npm keeps README on its own");
    assert.deepEqual(p.lostEntries, []);
    assert.equal(p.unchanged, false);
  });

  it("drops root files that are HOLDs and keeps the default main", () => {
    const p = proposeFiles(path.join(fixtures, "with-secret"));
    assert.deepEqual(p.files, ["index.js"]);
    assert.equal(p.after.failed, false);
    assert.deepEqual(p.removed.sort(), [".env", "notes.txt"]);
  });

  it("narrows an existing files field with a negation", () => {
    const p = proposeFiles(path.join(fixtures, "with-map"));
    assert.deepEqual(p.current, ["dist"]);
    assert.deepEqual(p.files, ["dist", "!dist/**/*.map"]);
    assert.equal(p.after.failed, false);
  });

  it("reports unchanged when only npm's auto files or order differ", () => {
    const dir = copyFixture("sloppy");
    try {
      writeFilesField(dir, ["dist", "README.md", "!dist/**/*.map", "bin", "LICENSE", "types", "CHANGELOG.md"]);
      const p = proposeFiles(dir);
      assert.equal(p.unchanged, true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("init: writing", () => {
  it("inserts files after entry fields, keeping indentation", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-write-"));
    try {
      fs.writeFileSync(
        path.join(dir, "package.json"),
        '{\n    "name": "x",\n    "main": "dist/i.js",\n    "license": "MIT"\n}\n',
      );
      writeFilesField(dir, ["dist"]);
      const text = fs.readFileSync(path.join(dir, "package.json"), "utf8");
      assert.equal(
        text,
        '{\n    "name": "x",\n    "main": "dist/i.js",\n    "files": [\n        "dist"\n    ],\n    "license": "MIT"\n}\n',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("`packfence init --write` turns HOLD into CLEAR for a real pack", () => {
    const dir = copyFixture("sloppy");
    try {
      const r = spawnSync(process.execPath, ["--import", "tsx", cli, "init", dir, "--write"], {
        encoding: "utf8",
      });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Wrote files to package\.json/);
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      assert.deepEqual(Object.keys(pkg).indexOf("files"), Object.keys(pkg).indexOf("bin") + 1);
      const after = scan(dir);
      assert.equal(after.failed, false);
      assert.ok(after.files.some((f) => f.path === "dist/index.js"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits machine-readable JSON", () => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", cli, "init", path.join(fixtures, "with-map"), "--format", "json"],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.deepEqual(j.files, ["dist", "!dist/**/*.map"]);
    assert.equal(j.after.failed, false);
    assert.equal(j.before.holds[0].rule, "source-map");
  });
});
