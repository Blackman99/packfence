import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchGlob, evaluate } from "../src/rules.js";
import { scan } from "../src/scan.js";
import type { PackedFile, PackfenceConfig } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "fixtures");

describe("matchGlob", () => {
  it("matches simple suffixes", () => {
    assert.equal(matchGlob("dist/index.js.map", "*.map"), true);
    assert.equal(matchGlob("dist/index.js", "*.map"), false);
  });
  it("matches ** globs", () => {
    assert.equal(matchGlob("a/b/c.env", "**/.env"), false);
    assert.equal(matchGlob(".env", ".env"), true);
    assert.equal(matchGlob("src/.env.local", "**/.env.*"), true);
  });
});

describe("evaluate defaults", () => {
  const cfg: PackfenceConfig = {
    allow: [],
    deny: [],
    severity: {},
    maxFileBytes: 20 * 1024 * 1024,
    maxFileWarnBytes: 5 * 1024 * 1024,
    maxTotalBytes: 50 * 1024 * 1024,
    contentScanMaxBytes: 512 * 1024,
  };

  it("fails on .js.map", () => {
    const files: PackedFile[] = [{ path: "dist/x.js.map", size: 100 }];
    const r = evaluate(process.cwd(), files, cfg);
    assert.equal(r.failed, true);
    assert.ok(r.findings.some((f) => f.rule === "source-map"));
  });

  it("fails on .env", () => {
    const files: PackedFile[] = [{ path: ".env", size: 10 }];
    const r = evaluate(process.cwd(), files, cfg);
    assert.equal(r.failed, true);
    assert.ok(r.findings.some((f) => f.rule === "secret-env"));
  });

  it("honors allowlist", () => {
    const files: PackedFile[] = [{ path: "dist/x.js.map", size: 100 }];
    const r = evaluate(process.cwd(), files, { ...cfg, allow: ["**/*.map"] });
    assert.equal(r.failed, false);
  });

  it("warns on large file", () => {
    const files: PackedFile[] = [{ path: "big.bin", size: 6 * 1024 * 1024 }];
    const r = evaluate(process.cwd(), files, cfg);
    assert.equal(r.failed, false);
    assert.equal(r.warned, true);
    assert.ok(r.findings.some((f) => f.rule === "file-large"));
  });
});

describe("integration fixtures", () => {
  it("FAIL on planted .js.map with sourcesContent", () => {
    const r = scan(path.join(fixtures, "with-map"));
    assert.equal(r.failed, true);
    assert.ok(r.findings.some((f) => f.rule === "source-map"));
    assert.ok(r.findings.some((f) => f.rule === "sources-content"));
  });

  it("PASS on clean fixture", () => {
    const r = scan(path.join(fixtures, "clean"));
    assert.equal(r.failed, false);
    assert.ok(r.files.some((f) => f.path.includes("index.js")));
    assert.ok(!r.files.some((f) => f.path.endsWith(".map")));
  });

  it("FAIL on .env and AWS key content", () => {
    const r = scan(path.join(fixtures, "with-secret"));
    assert.equal(r.failed, true);
    assert.ok(r.findings.some((f) => f.rule === "secret-env"));
    assert.ok(
      r.findings.some(
        (f) => f.rule === "content-aws-key" || f.path.includes("notes"),
      ),
    );
  });
});
