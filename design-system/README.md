# Constellation — Design System
### Grace Bible Maui · Discipleship App

> Saved from the claude.ai/design project **"Constellation Design System"**
> (project `677c2dae-dd72-4384-baf0-ac76188d702a`, owner Ivan Shigeo) on 2026-06-28.
> Source of truth lives on claude.ai/design; this is a local mirror of the core docs.

> A discipleship app that helps believers grow through the **four E's** — **Engage, Establish, Equip, Empower** — and multiply disciples. The journey is visualized as **stars maturing in a Jesus‑centered constellation**: Jesus is the central blazing sun, people are glowing stars that grow, brighten, and eventually *burst into new stars* (new solar systems) as they disciple others.

The system is a **cosmic extension of the existing Grace Bible Maui (GBM) brand** — built around GBM's royal‑blue flame mark, opened up into a warm, hopeful, reverent night sky.

---

## What this is

This project is a **design system / brand kit** for the Constellation app. It contains:

- **Brand assets** — the official GBM logo lockups + flame marks (`assets/logos/`), plus white/gold flame cutouts derived for dark backgrounds.
- **Foundations** — `colors_and_type.css`: the full color, type, spacing, radius, elevation, and glow token set.
- **Preview cards** — `preview/`: small HTML specimens that populate the Design System tab.
- **UI kit** — `ui_kits/constellation-app/`: high‑fidelity, click‑through React/JSX recreations of the core app screens and components (star cards, progress rings, gems & badges, constellation map, the Empower "burst").
- **SKILL.md** — makes this folder usable as a downloadable Agent Skill.

---

## CONTENT FUNDAMENTALS

How copy is written across the app.

**Voice:** Warm, encouraging, pastoral. Speaks to the believer as a companion and shepherd — never as a coach barking at a player, never as a game cheering a score. Reverent but personal.

**Person:** Second person ("you"), with frequent first‑person‑plural for community ("we grow together", "your people"). Avoid corporate "users."

**Tone rules**
- Encourage, don't pressure. "There's no rush — growth takes a season" over "Complete this to level up!"
- Name the spiritual reality plainly but gently. "You're rooted now" / "Your light is steadying."
- Subtle biblical resonance, never preachy in the UI. A verse may *anchor* a screen; the UI chrome stays plain.
- Celebrate milestones with awe, not confetti‑energy. "A new star has been lit." not "🎉 You did it!!!"

**Casing**
- Headings & body: **sentence case** ("Your constellation", "Establish a rhythm").
- The four E's are **proper nouns** — always capitalized: Engage, Establish, Equip, Empower.
- Tiny labels / eyebrows: **UPPERCASE, tracked** (`THIS WEEK`, `YOUR JOURNEY`).

**Emoji:** Not used in UI chrome or body copy. The brand language is light, stars, and flame — expressed through real glowing elements and iconography, never emoji. (A single ✦/✧ star glyph may appear as a *typographic ornament*, not as emoji.)

---

## VISUAL FOUNDATIONS

**Overall mood.** A reverent, warm night sky. Deep space without the cold sci‑fi — every dark surface carries a faint warm‑violet glow, and light always feels *alive* (it pulses, brightens, bursts). Elegant and timeless over trendy.

**Color**
- **Dark‑first.** The app lives on deep space: `--void #060814` → `--space #0B1027`, with raised `--indigo` surfaces. Canonical backdrop is a radial gradient (`--grad-space`) lightening toward top‑center, with an optional warm‑violet nebula wash (`--grad-nebula`).
- **Brand anchor:** GBM cobalt `#1539C9`, brightened to `--gbm-cobalt-bright #2E55E6` for glows on dark.
- **Warm whites for text** (`--fg-1 #F6F1E7`) — never pure `#FFF`.
- **Glow accents:** gold (`#F2C879`, for precious/earned things — gems & badges & legacy), teal (`#36D6C3`, life/light), warm white (`#FBF6EC`, the central sun / Christ).
- **The four E's** are a deliberate arc of light: **Engage** amber `#F4B650` → **Establish** teal `#36D6C3` → **Equip** azure `#5B8DF7` → **Empower** rose `#F0729F`. Used for the 4‑section progress rings, journey labels, and section theming.

**Type**
- **Display / reverent:** *Cormorant Garamond* — elegant timeless serif for hero moments, scripture, milestone copy (often italic). Self‑hosted from `fonts/`.
- **UI / body / brand:** *Montserrat* — the GBM brand sans (matches the wordmark). Carries all chrome, buttons, data, labels. Self‑hosted from `fonts/`.
- **Labels / eyebrows:** Montserrat, UPPERCASE, tracked `.14em`.

**Glow & light (signature).** The defining motif. Stars, rings, gems, and key buttons emit a soft radial glow (`--glow-cobalt`, `--glow-gold`, `--glow-soft`). Glow intensity encodes meaning: brighter = more mature / more active. Soft, warm, diffuse — never harsh neon.

**Animation.** Smooth and meaningful, never bouncy or playful. `--ease-soft` for most UI; `--ease-rise` for star growth / ring fills. Signature motions: rings filling, stars pulsing (~3–4s breath), brightening on milestone, and the **"burst into new stars"** at Empower. Reduced‑motion collapses to lit end‑state.

**Corner radii.** Soft and generous. Cards `--r-lg 20px`, large panels `--r-xl 28px`, inputs/buttons `--r-md 14px`, pills `--r-pill`. Star nodes and gems are circular.

**Cards.** Rounded (`--r-lg`), `--indigo-2` fill, hairline border (`--line-1`), `--elev-2` shadow + inner top highlight ("glass catching starlight").

---

## ICONOGRAPHY

**Approach.** Clean, modern **line icons**, ~1.75–2px stroke, rounded caps/joins — quiet under the glowing star/gem imagery. Monochrome (inherit `currentColor`, usually `--fg-2`), becoming `--fg-1` or a section accent when active.

**System used.** [Lucide](https://lucide.dev) — loaded from CDN in the UI kit. Documented default substitution (GBM has no proprietary icon set).

**Brand‑specific marks.** The **flame** (`assets/logos/gbm-flame-white.png` / `gbm-flame-gold.png`) is the one hand‑owned glyph — app/sun mark and "Christ‑centered" moments. Stars, the progress ring, and gems are **rendered live** (SVG/CSS) so they glow and animate.

**Emoji / unicode.** No emoji in the product. Occasional star glyphs (✦) as ornaments only.

---

## GEMS & BADGES (component spec)

Per `preview/comp-gems-badges.html`:

- **Gems** = hexagon (`clip-path` 6‑point), stage‑colored gradient + soft stage glow, with a Lucide emblem:
  - **Engage** — amber gradient `#FFD98A→#E0A94A`, emblem `coffee`
  - **Establish** — teal `#7DEFE0→#36D6C3`, emblem `book-open`
  - **Equip** — azure `#9DBBFF→#5B8DF7`, emblem `flame`
  - **Empower** — rose `#FBA6C5→#F0729F`, emblem `cross` (CSS cross)
- **Badges** = 64px gold **medallion** — `radial-gradient(circle at 38% 32%, #FCE8C0, #E0A94A 70%)`, `--glow-gold`, inner bottom shadow — containing the **white GBM flame** (`assets/logos/gbm-flame-white.png`). e.g. "First light".
- **Locked badge** = `--indigo-3` fill, dashed `--line-2` border, a faint `✦` glyph. e.g. "Multiplier".

> "Each gem carries its stage emblem — coffee (Engage), open Word (Establish), torch (Equip), cross (Empower). Badges are gold medallions with the flame."

---

## NOTE — app currently diverges from this spec

The live app ships **emoji** milestone badges (✝️💧🔥👑) — the design system explicitly forbids emoji. To align: replace emoji badges with **gold flame medallions** (earned) + **dashed locked** state, and use **hexagon stage gems** with the Lucide emblems above. Stage colors already match the app's `E_COLORS`.
