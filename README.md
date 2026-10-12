# packfence

**Tell you, before you publish, whether the exact npm package tarball would ship source maps, secrets, or other files you did not mean to include — and fail CI if it would.**

[![CI](https://github.com/Blackman99/packfence/actions/workflows/ci.yml/badge.svg)](https://github.com/Blackman99/packfence/actions/workflows/ci.yml)
[![Pages](https://blackman99.github.io/packfence/)](https://blackman99.github.io/packfence/)

![demo](./demo.svg)

## Why

In March 2026, Anthropic accidentally published Claude Code source maps in `@anthropic-ai/claude-code` v2.1.88 — exposing ~512k lines of TypeScript via `sourcesContent` ([HN](https://news.ycombinator.com/item?id=47584540), [issue](https://github.com/anthropics/claude-code/issues/41329)). Existing pack checkers are weak or unused. packfence uses real `npm pack --dry-run` semantics and Anthropic-class defaults.

## Install

```bash
# from GitHub (v0.1.0)
npx github:Blackman99/packfence

# or clone / release tarball
npm install github:Blackman99/packfence
```

## Usage

```bash
packfence .                  # human report; exit 1 on HOLD
packfence . --format json
packfence . --test           # report without failing
```

Example HOLD:

```
PACKFENCE — PRE-PUBLISH SCAN
files: 3  unpacked: 380B

HOLD (2)
[HOLD] dist/index.js.map (227B)
       source-map: Source map file would be published
[HOLD] dist/index.js.map (227B)
       sources-content: Source map embeds non-empty sourcesContent …

RESULT: HOLD — refuse publish (exit 1)
```

## GitHub Action

```yaml
- uses: Blackman99/packfence@v0.1.0
  with:
    path: .
    fail: true
```

Action name (Marketplace): **packfence — npm pack pre-publish fence**

## Default rules (HOLD)

- `*.map` / `*.js.map` / `*.css.map` / `*.ts.map`
- Source maps whose JSON contains non-empty `sourcesContent`
- `.env` / `.env.*` / `*.pem` / `*.key` / `id_rsa*` / `.git/` / `node_modules/`
- `.npmrc` with `_auth` / `_authToken`
- Secret content heuristics (AWS keys, PEM headers, GitHub/npm/Slack tokens)
- File > 20MB (fail) · > 5MB (warn) · total unpacked > 50MB (warn)

Config via `package.json#packfence` or `.packfencerc.json` (`allow` / `deny` / `severity`).

## Docs

- Landing: https://blackman99.github.io/packfence/
- Docs: https://blackman99.github.io/packfence/docs/
- [GOAL.md](./GOAL.md) · [ROADMAP.md](./ROADMAP.md)

## License

MIT
