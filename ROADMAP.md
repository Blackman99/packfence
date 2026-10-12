# Roadmap

## v0.1 — shipped
- CLI `packfence` with real `npm pack --dry-run --json` file list
- Default Anthropic-class rules (source maps, secrets, size)
- Config via `packfence` in package.json or `.packfencerc.json`
- Formats: human, json, github-annotations / step summary
- GitHub Action + tests + landing site

## v0.2
- Richer secret heuristics (entropy, more token patterns)
- SARIF output for code-scanning upload
- Monorepo / npm workspaces support (scan each publishable package)

## v0.3
- `packfence init` — suggest a safe `files` allowlist from the current pack

## v1.0
- Stable policy schema
- Config presets: `strict` / `library` / `cli`
