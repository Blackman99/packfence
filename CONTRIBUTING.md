# Contributing

Thanks for helping packfence stay focused.

1. Read [GOAL.md](./GOAL.md). Off-goal feature requests get a polite close with a pointer here.
2. Open an issue before large changes.
3. `npm test` and `npm run typecheck` must pass.
4. Keep the default rules Anthropic-class: source maps and secrets fail; do not silently weaken them.
5. Design language lives in `site/DESIGN.md` and `/workspace/oss-factory/design/registry.md` — do not introduce banned tropes.

## Dev

```bash
npm install
npm run build
npm test
node dist/cli.js .
```
