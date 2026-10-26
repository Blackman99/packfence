# Goal

**Tell you, before you publish, whether the exact npm package tarball would ship source maps, secrets, or other files you did not mean to include — and fail CI if it would.**

In scope: listing every file `npm pack` would include (npm-packlist / `npm pack --dry-run` semantics), default Anthropic-class deny rules (source maps, `sourcesContent`, common secret filenames and content heuristics, oversized files), configurable allow/deny, human/JSON/GitHub annotations output, and a GitHub Action that fails the job on HOLD findings.

Also in scope: `packfence init`, which proposes (and with `--write` saves) a `files` allowlist that keeps entry points and fences out what would HOLD, verified by a real re-pack.

Out of scope: rewriting `publish` itself, scanning published registry history, signing, SBOM generation, or dependency vulnerability scanning.
