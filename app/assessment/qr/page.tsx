'use client'

// Printable QR flyer for the assessment onramp. On screen it shows a single preview
// card; when PRINTED it lays out four identical quarter-sheet flyers (2×2) on one
// 8.5×11 page, so a single print gives four hand-out cards to cut apart. Each card
// carries the app's cosmic branding (deep-space gradient, gold accents, cream serif)
// with the QR on a white chip so it stays scannable. Each QR points to
// wikichurch.app/assessment.
import { QRCodeSVG } from 'qrcode.react'

const ASSESSMENT_URL = 'https://wikichurch.app/assessment'

// One quarter-sheet (4.25×5.5in). Self-contained classes (see print CSS below) so
// the branded output is deterministic regardless of the app's runtime theme tokens.
function QuarterCard() {
  return (
    <div className="quarter">
      <p className="q-eyebrow">
        <span className="q-star">✦</span> GRACE BIBLE MAUI <span className="q-star">✦</span>
      </p>
      <div className="q-rule" />
      <h1 className="q-title">Discover how God wired you to serve</h1>
      <p className="q-desc">
        Three short assessments — spiritual gifts, personality, and passion — and a
        personalized summary of where you might thrive.
      </p>
      <div className="q-qr">
        <QRCodeSVG value={ASSESSMENT_URL} size={150} bgColor="#ffffff" fgColor="#0B1027" />
      </div>
      <p className="q-url">wikichurch.app/assessment</p>
      <p className="q-scan">Scan with your phone camera to begin</p>
    </div>
  )
}

export default function AssessmentQrFlyer() {
  return (
    <div className="flyer min-h-screen bg-[var(--void)] px-6 py-12 text-[var(--fg-1)]">
      {/* On-screen preview + controls (hidden when printing). */}
      <div className="screen-only mx-auto flex w-full max-w-lg flex-col items-center gap-6 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-10 text-center shadow-[var(--elev-2)]">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
          Grace Bible Maui
        </p>
        <h1 className="[font-family:var(--font-display)] text-4xl leading-tight">
          Discover how God wired you to serve
        </h1>
        <p className="max-w-sm text-[var(--fg-2)]">
          Take three short assessments — your spiritual gifts, personality, and passion — and get a
          personalized summary of where you might thrive in ministry.
        </p>

        <div className="rounded-[var(--r-lg)] bg-white p-5">
          <QRCodeSVG value={ASSESSMENT_URL} size={240} />
        </div>

        <p className="text-lg font-semibold text-[var(--fg-1)]">wikichurch.app/assessment</p>
        <p className="text-sm text-[var(--fg-3)]">Scan the code with your phone camera to begin.</p>

        <button onClick={() => window.print()} className="cn-btn cn-btn-primary mt-2">
          Print flyer
        </button>
        <p className="text-xs text-[var(--fg-3)]">
          Prints as four cut-apart quarter-sheet flyers on one 8.5×11 page.
        </p>
      </div>

      {/* Print-only 2×2 sheet: four identical quarter-sheet flyers. */}
      <div className="print-sheet" aria-hidden="true">
        <QuarterCard />
        <QuarterCard />
        <QuarterCard />
        <QuarterCard />
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
          .print-sheet { display: none; }

          @media print {
            @page { size: letter portrait; margin: 0; }
            :root { color-scheme: light; }
            html, body { background: #fff !important; }
            .flyer { background: #fff !important; padding: 0 !important; margin: 0 !important; min-height: 0 !important; }
            .screen-only { display: none !important; }
            /* Only the QR + small gold accents carry ink; the sheet stays white. */
            .q-qr, .q-star, .q-rule { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

            .print-sheet {
              display: grid !important;
              grid-template-columns: 1fr 1fr;
              grid-template-rows: 1fr 1fr;
              width: 8.5in;
              height: 11in;
              box-sizing: border-box;
              background: #fff;
            }
            .quarter {
              position: relative;
              box-sizing: border-box;
              width: 4.25in;
              height: 5.5in;
              padding: 0.42in 0.34in;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
              background: #fff;
              color: #141B3D;
              /* the shared interior grid lines double as cut guides */
              border: 1px dashed #c7ccd8;
            }
            .q-eyebrow { font-size: 8.5px; font-weight: 700; letter-spacing: 0.22em; color: #141B3D; margin: 0 0 9px; }
            .q-star { color: #C79A3B; }
            .q-rule { width: 44px; height: 2px; background: #E8B54C; border-radius: 2px; margin: 0 0 13px; }
            .q-title { font-family: var(--font-display), Georgia, serif; font-size: 20px; line-height: 1.14; margin: 0 0 9px; color: #141B3D; }
            .q-desc { font-size: 9.5px; line-height: 1.4; color: #55607a; margin: 0 0 14px; max-width: 3in; }
            .q-qr {
              background: #ffffff;
              padding: 8px;
              border-radius: 12px;
              border: 2px solid #E8B54C;
              line-height: 0;
            }
            .q-url { font-size: 12px; font-weight: 700; letter-spacing: 0.01em; color: #141B3D; margin: 13px 0 3px; }
            .q-scan { font-size: 8.5px; letter-spacing: 0.04em; color: #8890a4; margin: 0; }
          }`,
        }}
      />
    </div>
  )
}
