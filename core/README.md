# @pernce/core

Framework-free money logic shared by the Pernce web and mobile apps:
currencies and FX conversion, per-currency minor units, formatting, CSV,
default categories, transaction validation and balance deltas, report math,
and design tokens. No runtime dependencies.

Inside this repo the apps import the TypeScript source directly as
`@pernce/core`. Tagged releases also publish a built copy (ESM + CJS +
type declarations) to GitHub Packages as `@kofiad/pernce-core`:

```bash
# .npmrc
@kofiad:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}

pnpm add @pernce/core@npm:@kofiad/pernce-core@2026.10.0
```

Installing under the `@pernce/core` alias keeps imports identical to the
monorepo, including subpaths such as `@pernce/core/format`.
