# Launch checklist

Steps only the owner can do. Nothing here is automated.

## 1. Clear the GitHub Actions billing lock

Public repositories get free Actions minutes, so a billing lock usually
comes from an old unpaid invoice or an expired card.

1. Open <https://github.com/settings/billing> and clear any unpaid invoice or
   update the payment method.
2. If nothing is outstanding, contact GitHub support.
3. Once Actions runs again: merge `launch-readiness` into `main`, let CI go
   green, then tag the first public release:
   `git tag v2026.11.1 && git push origin v2026.11.1` (the Release workflow
   creates the GitHub Release from `CHANGELOG.md`; the v2026.11.0 tag stays
   without a release page). No APK for now: the mobile job skips with a
   warning until the EAS setup in CONTRIBUTING.md, "Releases", is done.

## 2. pernce.com (done 2026-11-22, except the www redirect)

The store web app is live at <https://pernce.com> (Worker `pernce-app`).
What remains is step 6, the `www` redirect. To redeploy after changes, run
step 4 again. The original steps, for reference:

Follow the full checklist and caveats in
[web-deployment.md](web-deployment.md); in short:

1. Cloudflare: Add site (Free plan) for `pernce.com`.
2. At Porkbun, change the nameservers to the ones Cloudflare gives you, and
   remove the Porkbun parking page and any URL forward.
3. Log in and pick the personal account:

   ```bash
   cd web
   pnpm exec wrangler login
   pnpm exec wrangler whoami
   export CLOUDFLARE_ACCOUNT_ID=<the account id from whoami>
   cd ..
   ```

4. Build and deploy the store web app:

   ```bash
   pnpm run build:store-app && pnpm --filter @pernce/web deploy:store-app
   ```

5. Verify the landing page at `/`, the app at `/app/` with its cross-origin
   isolation headers, and a deep link (for example
   `https://pernce.com/app/settings`; `https://pernce.com/settings` redirects
   to it). Checklist: `docs/web-deployment.md`, "Landing page deploy".
6. Add the `www` redirect to the apex as described in
   [web-deployment.md](web-deployment.md).
7. Done: README, `CLAUDE.md` and the deployment docs point at pernce.com.

## 3. GitHub repository settings

```bash
gh repo edit kofiad/pernce \
  --homepage "https://pernce.com" \
  --description "Multi-currency, offline-first personal finance tracker. Free and open source." \
  --add-topic personal-finance,budgeting,multi-currency,expo,react-native,offline-first,e2e-encryption,hono,sqlite,typescript
```

(`--add-topic` takes a comma-separated list or can be repeated.)

- Social preview: Settings -> General -> Social preview -> upload
  `docs/screenshots/social-preview.png` (1280x640).
- Branch protection (Settings -> Branches -> add rule for `main`): only after
  CI is green. Require status checks to pass (`verify`, `mobile`); don't
  require pull requests.

## 4. README badges

Done: the CI, license and release badges are on.

## 5. Built with Claude Code

Done: `docs/built-with-claude-code.md` is filled in and linked from the README.
