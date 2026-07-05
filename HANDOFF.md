# Session Handoff — 2026-07-05

Snapshot for resuming after a Claude Code update. Two projects in play:
**discipleship-tracker** (Constellations, the live church app) and **soap-app**
(iSOAP, the new standalone app at `/Users/ivanshigeo/soap-app`).

Deploy: `vercel --prod --yes` (prod alias discipleship-tracker-ten.vercel.app).
DB: `supabase db query --linked`. Last deployed commit: **ae0034d**.

---

## 🔴 ACTIVE TASK — SOAP import over-rotation (the thing to fix next)

**Problem, proven by data:** the AI's orientation detector is *over-rotating*.
On the user's test import (109 entries):
- Pages left un-rotated: **14/14 dated (100%)** ✅
- Pages auto-rotated: 40 dated, **55 undated** ❌ — every undated entry came from a
  rotated page. Rotating an already-upright page garbles the read → no date found.

So the "dedicated orientation check" (ask model "which edge is the top?") swung from
detecting *nothing* to seeing rotation *everywhere*. The model can't reliably judge
orientation blindly.

**The fix (agreed, NOT yet implemented):**
1. **Verify-don't-guess orientation** in `app/api/soap/import/process/route.ts`:
   read the page at 0° FIRST; if it yields coherent text + a date, keep it (no
   rotate). Only if the upright read is genuinely bad, try 90/180/270 and keep
   whichever reads cleanest. Upright pages then never get wrongly flipped.
2. **Upgrade the vision model** from `claude-haiku-4-5-20251001` → **`claude-opus-4-8`**
   (Haiku is too weak for handwriting + orientation). NOTE: **Fable 5 is NOT
   available on this account** (`/model fable` fails; API key likely gated too) —
   use Opus, not Fable.

Current `analyze()` + `detectOrientation()` live in that route; `detectOrientation`
should be dropped in favor of the read-first-verify approach.

## ✅ SOAP import — what IS fixed and deployed (ae0034d and earlier)
- **No more hallucination**: robust JSON extraction (`text.match(/\{[\s\S]*\}/)`),
  so the model's reply stops being stored raw as ocr_text.
- **No more corrupt photos**: rotations upload as a **Blob**, not a Node Buffer
  (Buffer got mangled through UTF-8 on Vercel → `efbfbd`). Fixed in both
  `/api/soap/rotate` and the import auto-rotate.
- **Multi-entry per photo**: one 2-page photo splits into one entry per dated SOAP.
- **Left→right continuation** kept as one entry; **duplicate** pages skipped (Jaccard).
- **Parallel reading** (~5 concurrent), **resumable** server processing, capture-time
  ordering (EXIF via exifr), client-side compress+parallel upload (`lib/prepareImage`).
- **Calendar**: multiple entries per day supported ("●N" badge + 1·2·3 switcher);
  dropped the `(person_id, journal_date)` unique constraint.
- **"Fix & date" review** (`SoapDateReviewModal`): Rotate ↺/↻, Merge (into prev),
  Delete, Ignore (files as misc via `date_reviewed`), Skip, Save.

## 📊 Data state (as of handoff)
- **All imported SOAP entries were deleted** (user chose a clean slate) — 2024/2025/2026.
  Backups in `backups/`: `soap-all-imported-backup-*.json` (815 rows),
  `soap-2025-import-backup-*.json`, `soap-2026-backup-*.json`, others.
- **Other members' SOAPs preserved** (Ivan/Matt/Shahlise 2026 manual entries) — deletes
  were scoped to Jonavan's person id `2aa35958-9057-44bd-aaf2-bd12a4cf9ecd`.
- The **109 entries currently in the DB are the user's NEW test import** (deliberately
  includes wrong-orientation photos to test auto-flip). Do NOT delete without asking.
- Storage bucket `soap-photos` has orphaned old files (harmless; offered to clean, not done).

## Perf note (fixed): the star UI was loading all SOAP history (~485 KB) and blocking
first paint. Split so the star loads on light data; SOAP history loads separately
(`loadData` vs `loadSoaps` in `app/my-journey/page.tsx`). "much better" per user.

---

## soap-app / iSOAP — status
- Scaffolded Expo (RN, iOS+Android), own git repo. Strict-RLS schema, Apple/Google
  auth wired, market research + v1 scope + roadmap in `docs/`. See `docs/roadmap.md`
  (▸ NEXT UP: brand name, create Supabase project, credentials).
- **Wedge**: digitize handwritten journals → AI themes/feedback → generate
  devotionals/reading-plans/sermon-series. Freemium + premium (~$69–99/yr) + pastor tier.
- **Hardware decision (in progress):** Mac Studio for 24/7 local agents. M4 Max **caps
  at 64 GB** (not 128). Choice: **M4 Max 64 GB ($3,499)** to start vs **M3 Ultra 96 GB
  ($5,299)** for headroom (RAM is soldered, un-upgradeable). Leaning M4 Max 64 GB unless
  budget allows Ultra. Production inference → cloud; Studio runs dev agents + free tier.

---

## Suggested next steps (in order)
1. Implement the **verify-don't-guess orientation + Opus 4.8** fix (active task above),
   deploy, have user re-run the same test batch. Expect undated count to drop sharply.
2. Once import quality is confirmed, user re-imports 2024/2025/2026 for real.
3. Resume iSOAP (brand name → Supabase project → build journal/digitize screens).
