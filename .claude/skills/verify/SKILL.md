---
name: verify
description: How to E2E-verify web changes in this repo — dev server, Playwright login/drive recipe, prod DB check, test-data cleanup.
---

# Verifying discipleship-tracker changes

## Dev server
`npx next dev --port 3456` (often already running — `curl -s -o /dev/null -w "%{http_code}" http://localhost:3456` → 307 means up; it redirects / → /my-journey). Dev server uses the PROD Supabase from `.env.local` — anything you create is real data; always clean up.

## Drive with Playwright
Import from the repo's own node_modules by absolute path (no global install):
`import { chromium } from '/Users/ivanshigeo/discipleship-tracker/node_modules/playwright/index.mjs'`

- Login form renders inside /my-journey when unauthenticated: fill `input[type="email"]` (use `.last()` — two email inputs exist), `input[type="password"]`, click `button[type="submit"]`. Test login: eddie.asato@gmail.com / GraceMaui2026!.
- **Post-login intro carousel blocks everything.** Loop-click the `Skip` button until `page.locator('button:has-text("Skip")').count()` is 0 (one click is NOT enough — it re-renders).
- My Journey tabs are client state — click the tab button text ("Prayer", "SOAPs", …), don't navigate by URL.

## Prod DB checks (Supabase Management API)
```
REF=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | sed 's|.*https://||; s|\.supabase\.co.*||')
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select ... where name = $$Dollar Quoted String$$"}'
```
Use `$$dollar quotes$$` for SQL strings — single-quote escaping breaks in bash-to-JSON.

## Cleaning up a test person (wipes person + connections + prayers + storage)
Get Eddie's JWT via GoTrue password grant with the anon key from `.env.local`, then
`POST https://wikichurch.app/api/people/delete {"accessToken","personId"}` → `{"ok":true}`. Re-query counts to confirm 0.

## Deploy
Git push = PREVIEW only. Prod: `npx vercel --prod --yes`.
