# Changelog

## v0.3.0 — 2026-10-26

### Added
- **`packfence init`**: proposes a `package.json` `files` allowlist from today's real pack. Keeps what `main` / `module` / `types` / `exports` / `bin` / `browser` / `man` / install scripts point at, drops tests, fixtures, coverage, docs, examples, CI / editor / tool config and `src/` when built output ships, and fences HOLD files out of kept directories (`!dist/**/*.map`). Existing negations are preserved. The proposal is verified with a real `npm pack --dry-run` in a scratch copy and reported as a before/after. `--write` saves it (indentation and key order kept, refuses if an entry point would stop shipping); `--format json` for scripts. Exit 1 if a HOLD survives.

## v0.2.0 — 2026-10-19

### Added
- **Workspaces**: `--workspaces` / `-w` (and Action input `workspaces`) scans every publishable npm / Yarn workspace package, skipping `private: true` ones. Private workspace roots are expanded automatically. Root config applies to every package; package `allow` / `deny` are appended.
- **SARIF 2.1.0**: `--format sarif`, `--sarif <file>`, `--output <file>`, Action input `sarif` + output `sarif-file`. Rule metadata with `security-severity`, repo-relative URIs, line/column, stable fingerprints.
- **Richer secrets**: new HOLD rules `content-slack-webhook`, `content-stripe-key`, `content-anthropic-key`, `content-openai-key`, `content-huggingface-token`, `content-gitlab-token`, `content-sendgrid-key`; AWS `ASIA` keys, fine-grained `github_pat_` tokens and encrypted / PGP private keys. New WARN rules `content-high-entropy`, `content-url-credentials`, `content-google-api-key`.
- Content findings carry `line`, `column`, a redacted preview and a match count. The full secret is never printed.

### Fixed
- GitHub annotations now use repo-relative paths, so scanning a subdirectory annotates the right file. The Action runs from the repo root.
- Unknown `--format` values and flags missing a value exit 2 with a clear message instead of silently falling back.

## v0.1.0 — 2026-10-12
- First release: `npm pack --dry-run` file list, Anthropic-class default rules, human / JSON / GitHub annotations / step summary output, GitHub Action.
