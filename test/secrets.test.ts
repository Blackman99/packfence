import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanText, shannonEntropy, looksRandom, redact } from "../src/secrets.js";

// Token-shaped strings are assembled at runtime so this file never contains a
// literal that secret scanners (including GitHub push protection) would flag.
const j = (...parts: string[]) => parts.join("");
const RAND = "Zq7Xw2Lp9Rt4Vb6Nc8Md1Kf3Hg5Js0Ay";

function rules(text: string) {
  return scanText(text).map((h) => h.rule);
}

describe("content heuristics", () => {
  const cases: Array<[string, string]> = [
    ["content-aws-key", j("ASIA", "ABCDEFGHIJKLMNOP")],
    ["content-github-token", j("github", "_pat_", RAND, "_", RAND)],
    ["content-github-token", j("gh", "p_", RAND, "abcd")],
    ["content-npm-token", j("npm", "_", RAND, "abcd")],
    ["content-stripe-key", j("sk", "_live_", RAND)],
    ["content-anthropic-key", j("sk-", "ant-", "api03-", RAND, RAND)],
    ["content-openai-key", j("sk-", "proj-", RAND, "T3Blbk", "FJ", RAND)],
    ["content-huggingface-token", j("hf", "_", RAND, "abc")],
    ["content-gitlab-token", j("gl", "pat-", "Ab3dEf6hIj9lMn2pQr5t")],
    ["content-sendgrid-key", j("SG", ".", "Ab3dEf6hIj9lMn2pQr5tUv", ".", RAND, "Ab3dEf6hIj9")],
    ["content-slack-webhook", j("https://hooks.", "slack.com/services/", "T0ABCDEFG/", "B0ABCDEFG/", RAND)],
    ["content-private-key", j("-----BEGIN ", "ENCRYPTED PRIVATE KEY-----")],
    ["content-google-api-key", j("AI", "za", "Sy", RAND, "Q")],
  ];
  for (const [rule, token] of cases) {
    it(`detects ${rule}`, () => {
      assert.ok(rules(`const x = "${token}";`).includes(rule), `${rule} missed`);
    });
  }

  it("fail for exact token formats, warn for fuzzy ones", () => {
    const hits = scanText(j("sk", "_live_", RAND, " ", "AI", "za", "Sy", RAND, "Q"));
    assert.equal(hits.find((h) => h.rule === "content-stripe-key")?.severity, "fail");
    assert.equal(hits.find((h) => h.rule === "content-google-api-key")?.severity, "warn");
  });

  it("reports 1-based line/column and counts matches", () => {
    const key = j("AKIA", "ABCDEFGHIJKLMNOP");
    const [hit] = scanText(`line one\n  key=${key}\nagain ${key}\n`);
    assert.equal(hit?.rule, "content-aws-key");
    assert.equal(hit?.line, 2);
    assert.equal(hit?.column, 7);
    assert.equal(hit?.matches, 2);
  });

  it("never echoes the secret, only a redacted preview", () => {
    const token = j("sk", "_live_", RAND);
    const [hit] = scanText(token);
    assert.ok(hit);
    assert.ok(!hit.redacted.includes(RAND.slice(4, -4)));
    assert.equal(hit.redacted, `${token.slice(0, 4)}…${token.slice(-4)}`);
    assert.equal(redact("-----BEGIN RSA PRIVATE KEY-----"), "-----BEGIN RSA P…");
  });
});

describe("high-entropy assignment heuristic", () => {
  it("flags a random value bound to a secret-looking name", () => {
    assert.ok(rules(`const apiKey = "${RAND}";`).includes("content-high-entropy"));
    assert.ok(rules(`client_secret: '${RAND}'`).includes("content-high-entropy"));
  });

  it("ignores placeholders, env references and identifiers", () => {
    assert.deepEqual(rules(`const apiKey = "your-api-key-goes-here-please";`), []);
    assert.deepEqual(rules(`const token = process.env.NPM_TOKEN;`), []);
    assert.deepEqual(rules(`const tokenType = "authorization_code_refresh";`), []);
    assert.deepEqual(rules(`password: "xxxxxxxxxxxxxxxxxxxxxxxx"`), []);
  });

  it("entropy helper behaves", () => {
    assert.equal(shannonEntropy("aaaa"), 0);
    assert.ok(shannonEntropy(RAND) > 4.5);
    assert.equal(looksRandom("short"), false);
    assert.equal(looksRandom(RAND), true);
  });
});

describe("URL credentials heuristic", () => {
  it("warns on a real-looking password in a URL", () => {
    const hits = scanText(j("postgres://", "admin:", "Zq7Xw2Lp9R", "@db.internal:5432/app"));
    const hit = hits.find((h) => h.rule === "content-url-credentials");
    assert.equal(hit?.severity, "warn");
    assert.ok(!hit?.redacted.includes("Xw2Lp"));
  });
  it("ignores documented placeholders", () => {
    assert.deepEqual(rules("postgres://user:password@localhost:5432/db"), []);
    assert.deepEqual(rules("redis://user:${REDIS_PASSWORD}@cache:6379"), []);
  });
});
