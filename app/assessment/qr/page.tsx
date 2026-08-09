'use client'

// Printable QR flyer for the assessment onramp. A single centered page designed to
// print or screenshot for bulletins, welcome tables, and signage — big QR that
// points to wikichurch.app/assessment. "Print this page" triggers the browser
// dialog; print styles force a clean white sheet.
import { QRCodeSVG } from 'qrcode.react'

const ASSESSMENT_URL = 'https://wikichurch.app/assessment'

export default function AssessmentQrFlyer() {
  return (
    <div className="flyer min-h-screen bg-[var(--void)] px-6 py-12 text-[var(--fg-1)]">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-8 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-10 text-center shadow-[var(--elev-2)]">
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

        <button
          onClick={() => window.print()}
          className="cn-btn cn-btn-primary no-print mt-2"
        >
          Print this flyer
        </button>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {
            :root { color-scheme: light; }
            body { background: #fff !important; }
            .flyer { background: #fff !important; padding: 0 !important; }
            .flyer > div {
              border: none !important;
              box-shadow: none !important;
              background: #fff !important;
              color: #0B1027 !important;
            }
            .flyer h1, .flyer p { color: #0B1027 !important; }
            .no-print { display: none !important; }
          }`,
        }}
      />
    </div>
  )
}
