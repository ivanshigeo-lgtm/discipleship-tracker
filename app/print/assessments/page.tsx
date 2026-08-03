'use client'

// Printable paper packet for the three assessments (photo-scan feature, step 1).
// Four US-Letter sheets: G1+G2 (Spiritual Gifts, 100 items), B1 (Big Five,
// 50 items), P1 (Passion). Machine-readability contract shared with the scan
// route: page code top-right, corner markers, items in QUESTIONS lib order,
// value digit printed inside every bubble.
import './print.css'
import { QUESTIONS as GIFT_QUESTIONS, SCALE as GIFT_SCALE } from '../../../lib/spiritualGifts'
import { QUESTIONS as BIG5_QUESTIONS, SCALE as BIG5_SCALE } from '../../../lib/bigFive'
import { REFLECTIONS, PEOPLE_GROUPS, ISSUES, RANK_COUNT } from '../../../lib/passion'

function Corners() {
  return (
    <>
      <div className="corner tl" />
      <div className="corner tr" />
      <div className="corner bl" />
      <div className="corner br" />
    </>
  )
}

function SheetHead({ title, sub, code }: { title: string; sub: string; code: string }) {
  return (
    <>
      <div className="sheet-head">
        <div>
          <div className="sheet-title">{title}</div>
          <div className="sheet-sub">{sub} · Constellation — Grace Bible Maui</div>
        </div>
        <div className="page-code">{code}</div>
      </div>
      <div className="identity-row">
        <div className="field name">Name <div className="line" /></div>
        <div className="field date">Date <div className="line" /></div>
      </div>
    </>
  )
}

function BubbleSheet({
  title, sub, code, footer, instructions, values,
  items,
}: {
  title: string
  sub: string
  code: string
  footer: string
  instructions: React.ReactNode
  values: readonly number[]
  items: { id: number; text: string }[]
}) {
  return (
    <section className="sheet">
      <Corners />
      <SheetHead title={title} sub={sub} code={code} />
      <div className="instructions">{instructions}</div>
      <table className="bubble-table">
        <colgroup>
          <col style={{ width: '0.28in' }} />
          <col />
          {values.map(v => <col key={v} style={{ width: '0.24in' }} />)}
        </colgroup>
        <thead>
          <tr>
            <th />
            <th className="q-head">Statement</th>
            {values.map(v => <th key={v}>{v}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((q, i) => (
            <tr key={q.id} className={i % 2 === 1 ? 'shade' : undefined}>
              <td className="num">{q.id}</td>
              <td className="stmt">{q.text}</td>
              {values.map(v => (
                <td key={v} className="bub"><span className="bubble">{v}</span></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sheet-foot">{footer}</div>
    </section>
  )
}

const giftLegend = GIFT_SCALE.map(s => `${s.value} = ${s.label}`).join('   ')
const big5Legend = BIG5_SCALE.map(s => `${s.value} = ${s.label}`).join('   ')
const GIFT_VALUES = GIFT_SCALE.map(s => s.value)
const BIG5_VALUES = BIG5_SCALE.map(s => s.value)

function RankSection({
  title, hint, options, other,
}: { title: string; hint: string; options: string[]; other?: boolean }) {
  return (
    <div className="rank-section">
      <div className="rank-title">{title} <span>— {hint}</span></div>
      <div className="rank-grid">
        {options.map(o => (
          <div key={o} className="rank-option"><div className="rank-box" />{o}</div>
        ))}
        {other && (
          <div className="rank-option"><div className="rank-box" />Other: <div className="rank-other-line" /></div>
        )}
      </div>
    </div>
  )
}

export default function PrintAssessmentsPage() {
  return (
    <div className="assessment-print-root">
      <div className="print-toolbar">
        <button onClick={() => window.print()}>Print packet</button>
        <span className="hint">4 pages, US Letter. Print single-sided, 100% scale (no “fit to page”).</span>
      </div>

      <BubbleSheet
        title="SPIRITUAL GIFTS ASSESSMENT"
        sub="Page 1 of 2 · Items 1–50"
        code="G1"
        footer="Spiritual Gifts (Wagner-Modified Houts) · Sheet G1 · continue on sheet G2"
        instructions={
          <>
            For each statement, fill in <b>one</b> bubble for how true it is of you: <b>{giftLegend}</b>.
            Fill bubbles completely with a dark pen. Answer for who you are, not who you wish to be.
          </>
        }
        values={GIFT_VALUES}
        items={GIFT_QUESTIONS.slice(0, 50)}
      />

      <BubbleSheet
        title="SPIRITUAL GIFTS ASSESSMENT"
        sub="Page 2 of 2 · Items 51–100"
        code="G2"
        footer="Spiritual Gifts (Wagner-Modified Houts) · Sheet G2 · end of assessment"
        instructions={
          <>
            Continued from sheet G1. Fill in <b>one</b> bubble per statement: <b>{giftLegend}</b>.
          </>
        }
        values={GIFT_VALUES}
        items={GIFT_QUESTIONS.slice(50)}
      />

      <BubbleSheet
        title="PERSONALITY PROFILE (BIG FIVE)"
        sub="50 items"
        code="B1"
        footer="Big Five (IPIP Goldberg) · Sheet B1"
        instructions={
          <>
            For each statement, fill in <b>one</b> bubble for how well it describes you: <b>{big5Legend}</b>.
            Fill bubbles completely with a dark pen. There are no right or wrong answers — answer honestly,
            as you are today.
          </>
        }
        values={BIG5_VALUES}
        items={BIG5_QUESTIONS}
      />

      <section className="sheet">
        <Corners />
        <SheetHead title="PASSION ASSESSMENT" sub="Reflections & rankings" code="P1" />
        <div className="instructions">
          Write freely — there are no wrong answers. These questions surface who and what stirs your
          heart to serve. Please write clearly inside the lines.
        </div>
        <div className="passion-body">
          {REFLECTIONS.map(r => (
            <div key={r.id} className="prompt-block">
              <div className="prompt-text">{r.id}. {r.text}</div>
              <div className="write-line" />
              <div className="write-line" />
              <div className="write-line" />
            </div>
          ))}
          <RankSection
            title="PEOPLE I'M MOST DRAWN TO SERVE"
            hint={`write 1, 2, 3 in the boxes next to your top ${RANK_COUNT}`}
            options={PEOPLE_GROUPS}
            other
          />
          <RankSection
            title="ISSUES THAT STIR MY HEART"
            hint={`write 1, 2, 3 in the boxes next to your top ${RANK_COUNT}`}
            options={ISSUES.filter(o => o !== 'Other')}
            other
          />
        </div>
        <div className="sheet-foot">Passion Assessment (GBC Maui) · Sheet P1</div>
      </section>
    </div>
  )
}
