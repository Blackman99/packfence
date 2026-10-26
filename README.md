# packfence

**Tell you, before you publish, whether the exact npm package tarball would ship source maps, secrets, or other files you did not mean to include — and fail CI if it would.**

[![CI](https://github.com/Blackman99/packfence/actions/workflows/ci.yml/badge.svg)](https://github.com/Blackman99/packfence/actions/workflows/ci.yml)
[![Pages](https://blackman99.github.io/packfence/)](https://blackman99.github.io/packfence/)

![demo](./demo.svg)

## Why

In March 2026, Anthropic accidentally published Claude Code source maps in `@anthropic-ai/claude-code` v2.1.88 — exposing ~512k lines of TypeScript via `sourcesContent` ([HN](https://news.ycombinator.com/item?id=47584540), [issue](https://github.com/anthropics/claude-code/issues/41329)). Existing pack checkers are weak or unused. packfence uses real `npm pack --dry-run` semantics and Anthropic-class defaults.

## Install

```bash
# from GitHub (builds on install)
npm install -g github:Blackman99/packfence
packfence .

# one-shot without global install
npx --yes github:Blackman99/packfence

# or the release tarball
npm install https://github.com/Blackman99/packfence/releases/download/v0.3.0/packfence-0.3.0.tgz
```

Not on the npm registry yet (no auth on the publish machine). Use GitHub until then.

## Usage

```bash
packfence .                          # human report; exit 1 on HOLD
packfence . --format json
packfence . --test                   # report without failing
packfence . --workspaces             # monorepo: one bag per publishable package
packfence . --sarif packfence.sarif  # also write SARIF for code scanning
packfence . --format sarif -o packfence.sarif
packfence init                       # suggest a safe package.json "files" allowlist
packfence init --write               # …and save it
```

Example HOLD:

```
PACKFENCE — PRE-PUBLISH SCAN
files: 4  unpacked: 186B

HOLD (3)
[HOLD] .env (29B)
       secret-env: Environment file must not be published
[HOLD] .env:1:9 (29B)
       content-aws-key: Looks like an AWS access key id  [AKIA…MPLE]
[HOLD] notes.txt:1:7 (33B)
       content-aws-key: Looks like an AWS access key id  [AKIA…MPLE]

RESULT: HOLD — refuse publish (exit 1)
```

Secrets are reported as `file:line:col` with a redacted preview; the full value is never printed or written to SARIF.

### Fence it at the source: `packfence init`

![packfence init demo](./demo-init.svg)

No `files` field means npm ships everything that isn't ignored. `packfence init` reads today's real pack, keeps what `main` / `exports` / `bin` / `types` point at, drops tests, sources, docs and tool config, fences HOLD files out of kept directories with a negation, then **re-packs with the proposal** so the "after" line is a real `npm pack --dry-run`, not a guess. Existing `!negations` are kept. `--write` saves it to `package.json` (indentation and key order preserved); `--format json` for scripts. It refuses to write a list that would stop shipping an entry point.

```
PACKFENCE INIT — FILES ALLOWLIST PROPOSAL
package: packfence-fixture-sloppy@1.0.0
today:   13 files · 689B · HOLD  (no files field)

KEEP
  bin/            1 file    entry: bin.sloppy
  dist/           2 files   entry: main
  types/          1 file    entry: types
  CHANGELOG.md    1 file    ships today, not dev-only

DROP
  .github/        1 file    CI config, not needed by consumers
  docs/           1 file    documentation site, not needed by consumers
  src/            1 file    sources; the built output is what runs
  test/           1 file    test suite, not needed by consumers
  tsconfig.json   1 file    TypeScript build config, not needed by consumers

FENCE (excluded inside kept dirs)
  !dist/**/*.map  1 file    HOLD source-map

AUTO (npm adds these itself): LICENSE, package.json, README.md

PROPOSED package.json "files":
  ["bin","dist","types","CHANGELOG.md","!dist/**/*.map"]

after:   7 files · 473B · CLEAR  (−6 files, −216B)  verified with npm pack --dry-run

Run `packfence init --write` to save it to package.json.
```

### Monorepos

`--workspaces` expands npm / Yarn `workspaces` globs (with `!negation`), runs the real `npm pack --dry-run` in each package and skips `private: true` ones. A private workspace root is expanded automatically. Root `allow` / `deny` apply to every package; a package's own lists are appended.

```
PACKFENCE — PRE-PUBLISH SCAN · 2 bags on the belt

── BAG 1/2 · @fixture/cli@2.1.0 · packages/cli · HOLD
[HOLD] dist/cli.js.map (102B)
       sources-content: Source map embeds non-empty sourcesContent (original source would ship)
── BAG 2/2 · @fixture/core@1.0.0 · packages/core · CLEAR
── SKIP · @fixture/internal · packages/internal · private: true

RESULT: HOLD — 1 of 2 bags held, refuse publish (exit 1)
```

## GitHub Action

```yaml
- uses: Blackman99/packfence@v0.3.0
  with:
    path: .
    fail: true
```

Workspaces and SARIF upload to the Security tab (since v0.3.0):

```yaml
permissions:
  contents: read
  security-events: write
steps:
  - uses: actions/checkout@v4
  - uses: Blackman99/packfence@v0.3.0
    with:
      workspaces: true
      sarif: packfence.sarif
  - uses: github/codeql-action/upload-sarif@v3
    if: always()
    with:
      sarif_file: packfence.sarif
```

Action name (Marketplace): **packfence — npm pack pre-publish fence**

## Default rules

HOLD (fail):

- `*.map` / `*.js.map` / `*.css.map` / `*.ts.map`
- Source maps whose JSON contains non-empty `sourcesContent`
- `.env` / `.env.*` / `*.pem` / `*.key` / `id_rsa*` / `.git/` / `node_modules/`
- `.npmrc` with `_auth` / `_authToken`
- Exact token formats in packed text: AWS (`AKIA`/`ASIA`), GitHub (`ghp_`… and `github_pat_`), npm, Slack tokens and webhooks, Stripe live keys, Anthropic, OpenAI, Hugging Face, GitLab, SendGrid, private-key PEM blocks
- File > 20MB

WARN:

- High-entropy strings assigned to `secret` / `token` / `apiKey`-style names
- `scheme://user:password@host` URLs (placeholders like `user:password@localhost` are ignored)
- Google API keys (often intentionally public in Firebase config)
- File > 5MB · total unpacked > 50MB

Config via `package.json#packfence` or `.packfencerc.json` (`allow` / `deny` / `severity`). Every rule id is listed in the [docs](https://blackman99.github.io/packfence/docs/#rules).

## Docs

- Landing: https://blackman99.github.io/packfence/
- Docs: https://blackman99.github.io/packfence/docs/
- [GOAL.md](./GOAL.md) · [ROADMAP.md](./ROADMAP.md)

## License

MIT
