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
npm install https://github.com/Blackman99/packfence/releases/download/v0.1.0/packfence-0.1.0.tgz
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
- uses: Blackman99/packfence@v0.1.0
  with:
    path: .
    fail: true
```

Workspaces and SARIF upload to the Security tab (on `main` now, in the next release):

```yaml
permissions:
  contents: read
  security-events: write
steps:
  - uses: actions/checkout@v4
  - uses: Blackman99/packfence@main
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
