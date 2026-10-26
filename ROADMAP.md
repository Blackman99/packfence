# Roadmap

## v0.1 — shipped
- CLI `packfence` with real `npm pack --dry-run --json` file list
- Default Anthropic-class rules (source maps, secrets, size)
- Config via `packfence` in package.json or `.packfencerc.json`
- Formats: human, json, github-annotations / step summary
- GitHub Action + tests + landing site

## v0.2 — shipped (v0.2.0)
- [x] Richer secret heuristics: 10 more exact token formats (HOLD), entropy / URL-credential / Google-key heuristics (WARN), `file:line:col` + redacted preview
- [x] SARIF 2.1.0 output (`--format sarif`, `--sarif <file>`, Action `sarif` input) for code-scanning upload
- [x] Monorepo / npm + Yarn workspaces (`--workspaces`, Action `workspaces` input): scan each publishable package, skip private ones, layered config

## v0.3 — on main, release pending
- [x] `packfence init` — suggest a safe `files` allowlist from the current pack: keep entry points, drop dev material, fence HOLD files with `!negations`, verify with a real re-pack, `--write` / `--format json`

## v1.0
- Stable policy schema
- Config presets: `strict` / `library` / `cli`
