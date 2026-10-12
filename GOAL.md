# Goal

**Tell you, before you publish, whether the exact npm package tarball would ship source maps, secrets, or other files you did not mean to include — and fail CI if it would.**

In scope: listing every file `npm pack` would include (npm-packlist / `npm pack --dry-run` semantics), default Anthropic-class deny rules (source maps, `sourcesContent`, common secret filenames and content heuristics, oversized files), configurable allow/deny, human/JSON/GitHub annotations output, and a GitHub Action that fails the job on HOLD findings.

Out of scope: rewriting your `files` field for you (that is v0.3 `init`), scanning published registry history, signing, SBOM generation, or dependency vulnerability scanning.
