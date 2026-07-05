# Session Handoff — updated 2026-07-05 (late night)

**Authoritative state lives in Claude's memory** (`project_soap_import.md` in the
memory dir — loaded automatically each session). This file is a repo-side mirror
of where things stand. The 2026-07-05-morning version of this doc is obsolete:
every task it listed shipped.

## What shipped tonight (all deployed to prod, alias discipleship-tracker-ten.vercel.app)

- **SOAP import is done and validated.** Verify-don't-guess orientation + Sonnet 5
  vision (97.5–98.5% dated, word-perfect OCR, zero hallucination). Year-mismatch
  warning + one-tap batch re-year. Fully self-driving processing (server
  self-chains via after(); atomic per-photo claims in `processing_started_at`;
  ~200s time budget per call) with a live reading meter. Single-photo OCR also
  on Sonnet 5.
- **ALL YEARS IMPORTED: 2016–2026, 1,748 entries with text.**
- **Answered Prayers pilot** (`/answered`, 🙏 button on My SOAPs): petition/evidence
  extraction (`prayer_scan_items`) + match phase (`answered_prayers`). First run:
  16 pairs, user confirmed 15, left 1 open ("still in the works"). Gotcha learned:
  Supabase caps every select at 1,000 rows — paginate with .range() loops.
- **Lahaina book pilot:** Opus 4.8 generated the ghostwriter interview →
  `docs/lahaina-interview.md` (script: `scripts/lahaina-interview.mjs`).
  ⚠️ Open factual question: entries dated July 2023 reference displaced Lahaina
  residents (fire was Aug 8) — sloppy 9→7 date misread suspected; user to check
  the physical notebook.

## Pricing/product decisions (locked with user — full detail in memory)

Free = today-only uploads (no date picker), search, 3 query-chips/week, Sunday
Reflection, live answer detection. Funnel: 1 free year of past (no card) →
30-day trial (card) → **Premium $79/yr** (unlimited imports, unlimited Threads,
Jan year-in-review). Works à la carte ($19–39 digital via web Studio, $49–99
print). Never hold journals hostage. Vocabulary: Moments(Haiku)/Threads(Sonnet)/
Works(Opus) — internal only.

## Next session build list (user-approved, in order)

1. Interview screen (question cards, record/dictate, "Not ready yet", progress
   ring, `interview_answers` table; factual questions can write date fixes back)
2. "Still waiting 🕰" state on answered_prayers + rescan completes pending pairs
3. Free-tier magic pilot: Sunday Reflection + live answer detection + ~6 query chips
4. Chapter-one Opus draft (journals + interview answers, Batch API)

## User's own to-dos

- Check physical 2023 notebook: are the "July" Lahaina pages actually September?
- Finish "Fix & date" review of remaining undated entries (refresh app first)
- Answer the 14 Lahaina interview questions (chat or voice memo, no deadline)
