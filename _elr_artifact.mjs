// Emits the Empower Leader Review scorecard artifact BODY (no <html>/<head>; Artifact wraps it).
// Reads elr_data.json (produced by _elr_data.mjs) and scores each leader against Ivan's rubric.
// Fonts are grafted separately by the shell build step at the <!--FONTS--> marker.
import { readFileSync } from 'node:fs'
const DATA_PATH = process.env.ELR_DATA || '/private/tmp/claude-501/-Users-ivanshigeo/21899ea0-5b79-48f9-a4fe-e89c98bac867/scratchpad/elr_data.json'
const d = JSON.parse(readFileSync(DATA_PATH,'utf8'))
const leaderNames = new Set(d.leaders.map(l=>l.name))
const esc = (s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

// ── scoring (mirrors _elr_eval.mjs) ──
function score(l){
  const groups=l.groups||[]
  const sizes=groups.map(g=>g.count)
  const biggest=sizes.length?Math.max(...sizes):0
  const groups6=groups.filter(g=>g.count>=6)
  const equip=l.futureLeaders.equip||[], released=l.futureLeaders.released||[]
  const soap=l.soap||{ownEntries:0,doersCount:0,poolSize:0,doers:[]}
  const emergingRuns1on1=l.emergingRuns1on1||[], emergingRunning=l.emergingRunning||[]
  const discipleLeaders=[]
  for(const s of l.stages) for(const p of s.people) if(p.name!==l.name && leaderNames.has(p.name)) discipleLeaders.push(p.name)
  const v={
    engage:  l.stats.oneOnOnesNext7>0 ? 'y' : (l.movements&&l.movements.length? 'p':'n'),
    establish: l.stats.peopleInGroups>0 ? (groups6.length? (soap.doersCount>0?'y':'p') : 'p') : 'n',
    group:   biggest>15? 'y' : biggest>=6? 'y' : biggest>0? 'p':'n',
    equip:   (equip.length||released.length)? ((equip.length&&released.length)?'y':'p') : 'n',
    mentor:  l.stats.constellation>=3? 'y':'n',
    multiply: emergingRuns1on1.length? 'y' : (emergingRunning.length||discipleLeaders.length)? 'p':'n',
  }
  return { v, biggest, groups6, equip, released, soap, emergingRuns1on1, emergingRunning, discipleLeaders }
}
const CRIT=[
  {key:'engage',   label:'Engage',    sub:'1:1 booked'},
  {key:'establish',label:'Establish', sub:'group + SOAP'},
  {key:'group',    label:'Group',     sub:'6 → 15 → microsite'},
  {key:'equip',    label:'Equip',     sub:'raise next leaders'},
  {key:'mentor',   label:'Mentor ≥3', sub:'discipling 3+'},
  {key:'multiply', label:'Multiply',  sub:'emerging leader runs their own 1:1'},
]
const scored = d.leaders.map(l=>({l, ...score(l)}))
const nY = (s)=>Object.values(s.v).filter(x=>x==='y').length
const dot = (v)=>`<span class="dot ${v==='y'?'good':v==='p'?'warn':'bad'}" aria-label="${v==='y'?'strong':v==='p'?'forming':'not yet'}"></span>`

// Every number gets one of these: an "i" you hover (or tap) for the exact rule
// behind it. align is where the panel hangs — 'l' under the left edge, 'r'
// under the right edge for cells near the page edge, 'c' centred.
const info=(html,align='l')=>`<span class="info info-${align}" tabindex="0" role="note" aria-label="How this number is calculated"><span class="ii">i</span><span class="tip">${html}</span></span>`

// ── how each headline number is actually derived (kept next to the numbers so
//    the copy and the calculation can't drift apart) ──
const TIP={
  leaders:`The Empower team, fixed as a list of ten person IDs in the generator. <b>It does not update on its own</b> — someone reaching Empower in the app is not added here until that list is edited.`,
  rhythm:`<b>Unique individuals, deduped.</b> Every active member of the ${d.aggregates.totalGroups} groups these leaders own, counted <em>once</em> even if they're in several groups — there are ${d.aggregates.totalSeats} total group seats, so ${d.aggregates.totalSeats-d.aggregates.uniquePeopleInRhythm} are repeat seats. Excludes each group's own owner, and inactive or test profiles.`,
  groups:`Groups whose <b>owner</b> is one of the ten leaders. A group led by anyone outside the Empower team is not counted, and co-led groups count once, for the owner.`,
  released:`<b>Distinct people</b> whose discipler has them at stage <b>Empower</b>, across all ten leaders. Someone co-discipled by two leaders is counted once here, but still appears under each of them below.`,
  microsite:`Groups with <b>more than 15</b> members — the size where a group is big enough to plant a microsite. Counted per group, not per leader, so one leader can hold several.`,
  met:`<b>Confirmed / on the week.</b> The first number is contact the app can <em>prove</em>: someone was ticked present at a meeting of a group their leader owns, or a meeting the leader ran was marked <b>Completed</b>. The second is everyone the week's calendar says they were with.<br><br><b>The gap is unrecorded attendance, not people who stayed home.</b> When a group's sheet is never opened, nobody in it can be confirmed — so the first number falls while the ministry doesn't. Read the gap as "how much of my week is the app being told about."<br><br><b>A rolling 7 days</b> — today and the six days before it, so it never resets on Sunday and two readings can be compared directly. Meetings dated in the future never count, a person counts once however they were met, and leaders don't count meeting themselves.`,
  reach:`Everyone this leader touches in a normal week: their group members plus anyone they have a meeting with, deduped. The widest of the counts.`,
  inGroup:`Unique active people across the groups this leader owns, not counting the leader. Someone in two of their groups counts once.`,
  discipling:`People directly linked to this leader in the app's discipleship connections — one level down only. Their disciples' disciples are not counted here.`,
  groupsLed:`Groups where this leader is the recorded owner.`,
  next7:`<b>Distinct people</b> this leader has booked a 1:1 with from today through the next 7 days, not cancelled — someone booked three times counts once, though the list shows every meeting. <b>Every type counts</b> — One2One, Making Disciples, Coffee, Church Community, Empowering Leaders, SOAP or untyped. <b>Forward-looking</b> — a plan, not attendance.`,
  metLeader:`<b>Confirmed / on the week</b> for this leader — people met in the last rolling 7 days in their own groups or in a meeting they ran.<br><br>A low first number next to a high second one means <b>attendance isn't being recorded</b>, not that the week was empty. These do not sum to the headline figure — someone met by two leaders counts once church-wide.`,
  score:`One point per part of the rhythm below, out of 6. Each dot is <em>green</em> (scored), <em>amber</em> (partway, no point) or <em>rose</em> (not started). Hover any column heading for its rule.`,
}
const CRITTIP={
  engage:`<em>Green</em> when the leader has at least one 1:1 booked in the next 7 days — any meeting with one other person, whatever type it carries. <em>Amber</em> when they have none booked but have driven someone's stage forward in the last 6 weeks. <em>Rose</em> when neither.`,
  establish:`<em>Green</em> needs both: a group of 6+ people, and at least one person in it journaling SOAPs visible in WikiChurch. <em>Amber</em> means people are in a group but it's under 6, or nobody is journaling yet. <em>Rose</em> means nobody in a group.<br><br>⚠ SOAP here counts only entries <b>shared into WikiChurch</b> — private iSOAP journaling is invisible to this report, so it undercounts.`,
  group:`Measured on the leader's <b>biggest</b> group. <em>Green</em> at 6 or more, which is where a group is self-sustaining. <em>Amber</em> from 1 to 5. <em>Rose</em> with no group. Above 15 it also shows up as a microsite candidate.`,
  equip:`Counts the bench: disciples sitting at the <b>Equip</b> stage, and those already <b>released to Empower</b>. <em>Green</em> needs both at once. <em>Amber</em> if only one of the two. <em>Rose</em> if neither.`,
  mentor:`<em>Green</em> at 3 or more direct disciples — enough that discipling is a rhythm rather than a one-off. There is no amber: it's 3+ or it isn't.`,
  multiply:`The hardest point, and the one the whole scorecard builds toward. <em>Green</em> only when an emerging leader <b>runs their own 1:1</b>. <em>Amber</em> when one owns a group or disciples someone but hasn't run a 1:1. <em>Rose</em> when the leader has not yet reproduced.`,
}

// ── team rollups ──
const microsites=d.leaders.flatMap(l=>l.groups.filter(g=>g.count>15).map(g=>({leader:l.first,name:g.name,count:g.count})))
const noEquip=d.leaders.filter(l=>!(l.futureLeaders.equip.length)&&l.stats.peopleInGroups>0).map(l=>l.first)
const noMultiply=d.leaders.filter(l=>!(l.emergingRuns1on1&&l.emergingRuns1on1.length)).map(l=>l.first)
const soapAlive=d.leaders.filter(l=>l.soap&&l.soap.doersCount>0)
const under6=d.leaders.flatMap(l=>l.groups.filter(g=>g.count>0&&g.count<6).map(g=>({leader:l.first,name:g.name,count:g.count})))
const readyMD=d.leaders.flatMap(l=>l.groups.filter(g=>g.count>=6&&g.count<=15).map(g=>({leader:l.first,name:g.name,count:g.count})))
// PEOPLE, not links — a co-discipled person sits on two leaders' cards.
// Must match lib/leaderReview.ts; these two implementations have drifted before.
const totalReleased=new Set(d.leaders.flatMap(l=>(l.futureLeaders.released||[]).map(r=>r.id))).size

// ── week strip (calendar strip): who each leader is meeting with, per day, tagged by 4E stage ──
// Colors match the app-wide stage palette (E_COLORS in journeyModel.ts) so this reads
// consistently with My Journey / the native app, not a one-off scheme.
const STAGE_COLOR={Engage:'#F4B650',Establish:'#36D6C3',Equip:'#5B8DF7',Empower:'#F0729F'}
const WS_VISIBLE=8
function weekStripCard(l){
  const days=l.weekStrip||[]
  if(!days.length) return ''
  const entryHtml=(e)=>`<div class="wsentry" title="${esc(e.stage)}${e.with?` · ${e.with}`:' · 1:1'}">
      <span class="wsdot" style="background:${STAGE_COLOR[e.stage]||STAGE_COLOR.Engage}"></span>
      <div class="wsentrytext"><span class="wsname">${esc(e.person)}</span><span class="wskind">${esc(e.with||'1:1')}</span></div>
    </div>`
  return `<div class="weekstripwrap"><div class="weekstrip">
    ${days.map(d=>{
      const shown=d.entries.slice(0,WS_VISIBLE), rest=d.entries.slice(WS_VISIBLE)
      const noMeet=d.noMeetings||[]
      // attendance was taken and nobody came — say so rather than listing the roster
      const noMeetHtml=noMeet.map(n=>`<div class="wsnomeet"><span class="wsnomeetgroup">${esc(n.group)}</span><span class="wsnomeettag">no meeting · 0 of ${n.roster}</span></div>`).join('')
      return `<div class="wsday${d.isToday?' today':''}">
      <div class="wshead"><span class="wsdow">${d.dow}</span><span class="wsnum">${d.num}</span>${d.count>0?`<span class="wscount">${d.count}</span>`:''}</div>
      <div class="wslist">
        ${d.entries.length||noMeet.length?shown.map(entryHtml).join(''):'<div class="wsempty">—</div>'}
        ${rest.length?`<details class="wsmore"><summary>+${rest.length} more</summary>${rest.map(entryHtml).join('')}</details>`:''}
        ${noMeetHtml}
      </div>
    </div>`}).join('')}
  </div></div>
  <div class="wslegend">
    ${Object.entries(STAGE_COLOR).map(([k,c])=>`<span><span class="wsdot" style="background:${c}"></span>${k}</span>`).join('')}
  </div>`
}

// ── per-leader detail card ──
function leaderCard(s){
  const l=s.l
  const stats=[
    ['Weekly reach', l.stats.weeklyReach, TIP.reach, 'l'],
    ['In a group', l.stats.peopleInGroups, TIP.inGroup, 'c'],
    ['Discipling', l.stats.constellation, TIP.discipling, 'c'],
    ['Groups led', l.stats.groupsLed, TIP.groupsLed, 'c'],
    ['1:1 next 7d', l.stats.oneOnOnesNext7, TIP.next7, 'r'],
    // "confirmed / on the week" — a bare confirmed number read as the whole
    // week and made a well-run week look thin. The gap is unrecorded
    // attendance, not people who did not show up.
    ['Met last 7d', `${l.stats.metThisWeek}<span class="of"> / ${l.stats.metExpectedLast7Days ?? l.stats.metThisWeek}</span>`, TIP.metLeader, 'r'],
  ]
  const soap=s.soap
  const soapStr = soap.doersCount>0
    ? `${soap.doersCount} journaling — ${soap.doers.map(x=>`${esc(x.name)} (${x.entries})`).join(', ')}`
    : (soap.ownEntries>0 ? `only ${esc(l.first)} is journaling (${soap.ownEntries})` : 'no SOAP activity yet in WikiChurch')
  const rows=[
    {c:'engage', head:'Engage — meet people 1:1',
      body:`${l.stats.oneOnOnesNext7} ${l.stats.oneOnOnesNext7===1?'person':'people'} booked for a 1:1 next 7 days${(l.upcoming?.length||0)>l.stats.oneOnOnesNext7?` (${l.upcoming.length} meetings)`:''} · ${l.movements?.length||0} stage-move${(l.movements?.length||0)===1?'':'s'} driven in 6 weeks`},
    {c:'establish', head:'Establish — group + the SOAP habit',
      body:`${l.stats.peopleInGroups} people across ${l.groups.length} group${l.groups.length===1?'':'s'}${s.groups6.length?` · ${s.groups6.length} at 6+`:''}<br><span class="soap">SOAP: ${soapStr}</span>`},
    {c:'group', head:'Group health — grow 6 → 15 → microsite',
      body:`Largest group ${s.biggest}${s.biggest>15?' — <b class="hl">microsite candidate</b>':s.biggest>=6?' — ready for “Making Disciples” together':s.biggest>0?' — build toward 6':''}`},
    {c:'equip', head:'Equip &amp; Empower — raise the next generation',
      body:`${s.equip.length} being equipped${s.equip.length?`: ${s.equip.map(e=>esc(e.name)).join(', ')}`:''} · ${s.released.length} released to Empower`},
    {c:'mentor', head:'Mentor ≥3',
      body:`Discipling ${l.stats.constellation} ${l.stats.constellation===1?'person':'people'}`},
    {c:'multiply', head:'Multiply — an emerging leader runs their own 1:1',
      body: s.emergingRuns1on1.length
        ? `<b class="hl">Yes</b> — ${s.emergingRuns1on1.map(esc).join(', ')} ${s.emergingRuns1on1.length===1?'is':'are'} running their own 1:1`
        : (s.discipleLeaders.length ? `Shepherds ${s.discipleLeaders.map(esc).join(', ')} — not yet running a 1:1`
        : (s.emergingRunning.length ? `Released ${s.emergingRunning.map(esc).join(', ')} — leading, but no 1:1 logged yet`
        : `No emerging leader multiplying yet`))},
  ]
  // gaps
  const gaps=[]
  if(s.v.engage!=='y') gaps.push('Schedule 1:1 time with new people')
  if(s.biggest>0&&s.biggest<6) gaps.push(`Grow the group from ${s.biggest} toward 6`)
  if(l.groups.length===0&&l.stats.constellation>0) gaps.push('Gather the people they disciple into a weekly group')
  if(s.v.equip==='n') gaps.push('Identify someone to begin equipping as a leader')
  if(s.equip.length&&!s.released.length) gaps.push('Release an equipped person to disciple someone 1:1')
  if(s.v.multiply!=='y'&&(s.equip.length||s.released.length)) gaps.push('Help an emerging leader start their own 1:1 with someone')
  if(soap.poolSize>0&&soap.doersCount===0) gaps.push('Get people started on SOAPs')
  if(l.notInRhythm.length) gaps.push(`${l.notInRhythm.length} disciple${l.notInRhythm.length===1?'':'s'} not in any group: ${l.notInRhythm.slice(0,5).map(esc).join(', ')}${l.notInRhythm.length>5?'…':''}`)

  return `<article class="leader" id="L-${esc(l.first)}">
  <header class="lhead">
    <div class="lname"><span class="lidx">${scored.indexOf(s)+1}</span><h3>${esc(l.name)}</h3>${l.isSelf?'<span class="mine">you</span>':''}</div>
    <div class="lscore">${CRIT.map(c=>dot(s.v[c.key])).join('')}<span class="lscoren">${nY(s)}/6</span></div>
  </header>
  <div class="statstrip">${stats.map(([k,v,tip,al])=>`<div class="stat"><span class="statn">${v}</span><span class="statk">${k}${info(tip,al)}</span></div>`).join('')}</div>
  <div class="wshdr">This week</div>
  ${weekStripCard(l)}
  <ul class="crit">
    ${rows.map(r=>`<li class="critrow ${s.v[r.c]==='y'?'good':s.v[r.c]==='p'?'warn':'bad'}">
      ${dot(s.v[r.c])}
      <div class="crittext"><span class="crithead">${r.head}</span><span class="critbody">${r.body}</span></div>
    </li>`).join('')}
  </ul>
  ${gaps.length?`<div class="gaps"><span class="gapslabel">Next steps</span><ul>${gaps.map(g=>`<li>${g}</li>`).join('')}</ul></div>`:''}
  </article>`
}

const html = `<!--FONTS-->
<style>
:root{
  --bg:#0A0E24; --bg-grad-a:#0B1233; --bg-grad-b:#070A1C;
  --panel:rgba(255,255,255,.028); --panel-2:rgba(255,255,255,.045);
  --border:rgba(232,181,76,.16); --border-soft:rgba(255,255,255,.08);
  --ink:#ECF1FF; --muted:#A2ADD1; --faint:#6C77A0;
  --gold:#E8B54C; --gold-soft:rgba(232,181,76,.14);
  --good:#5FD08A; --good-soft:rgba(95,208,138,.13);
  --warn:#E6A94C; --warn-soft:rgba(230,169,76,.13);
  --bad:#CE6F86;  --bad-soft:rgba(206,111,134,.13);
  --serif:'Cormorant','Cormorant Garamond',Georgia,'Times New Roman',serif;
  --sans:'Montserrat',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
}
*{box-sizing:border-box}
.elr{
  font-family:var(--sans); color:var(--ink); line-height:1.5;
  background:
    radial-gradient(1200px 600px at 78% -8%, rgba(232,181,76,.10), transparent 60%),
    radial-gradient(900px 500px at 8% 4%, rgba(90,120,220,.12), transparent 55%),
    linear-gradient(168deg, var(--bg-grad-a), var(--bg-grad-b));
  padding:clamp(20px,5vw,64px) clamp(16px,4vw,56px) 80px;
  -webkit-font-smoothing:antialiased;
  position:relative; overflow:hidden;
}
.elr::before{ /* starfield */
  content:""; position:absolute; inset:0; pointer-events:none; opacity:.6;
  background-image:
    radial-gradient(1.4px 1.4px at 12% 22%, rgba(255,255,255,.7), transparent),
    radial-gradient(1.2px 1.2px at 34% 8%, rgba(255,255,255,.5), transparent),
    radial-gradient(1.6px 1.6px at 68% 30%, rgba(255,255,255,.6), transparent),
    radial-gradient(1.1px 1.1px at 82% 14%, rgba(255,255,255,.45), transparent),
    radial-gradient(1.3px 1.3px at 52% 44%, rgba(255,255,255,.35), transparent),
    radial-gradient(1.2px 1.2px at 92% 52%, rgba(255,255,255,.4), transparent),
    radial-gradient(1.1px 1.1px at 22% 62%, rgba(255,255,255,.3), transparent);
}
.elr > *{position:relative; z-index:1}
.wrap{max-width:1080px; margin:0 auto}

/* ── hero ── */
.eyebrow{font-size:12px; letter-spacing:.28em; text-transform:uppercase; color:var(--gold); font-weight:600; margin:0 0 14px}
.title{font-family:var(--serif); font-weight:600; font-size:clamp(34px,6vw,60px); line-height:1.02; letter-spacing:.005em; margin:0; text-wrap:balance;}
.title em{font-style:italic; color:var(--gold)}
.lede{color:var(--muted); font-size:clamp(15px,1.7vw,18px); max-width:60ch; margin:18px 0 0; line-height:1.6}
.datesub{color:var(--faint); font-size:13px; letter-spacing:.04em; margin-top:14px}
.rule{height:1px; background:linear-gradient(90deg,var(--gold),transparent); border:0; margin:26px 0 34px; opacity:.7}

/* ── "how is this calculated" markers ──
   Every number on the page carries one. Pure CSS so it works inside the
   artifact sandbox: hover on a mouse, tap or keyboard-focus on touch. */
.info{position:relative; display:inline-flex; vertical-align:middle; margin-left:6px; cursor:help; outline:none}
.ii{display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; border-radius:50%;
    border:1px solid var(--border); color:var(--faint); font-family:var(--sans); font-size:9.5px; font-weight:700;
    font-style:normal; line-height:1; letter-spacing:0; text-transform:none; transition:color .15s,border-color .15s}
.info:hover .ii,.info:focus .ii{color:var(--gold); border-color:var(--gold)}
.tip{position:absolute; z-index:60; top:calc(100% + 9px); width:min(280px,72vw);
     background:#0c1230; border:1px solid var(--border); border-radius:11px; padding:11px 13px;
     font-family:var(--sans); font-size:11.5px; line-height:1.55; font-weight:400; letter-spacing:0;
     text-transform:none; text-align:left; color:var(--muted); box-shadow:0 14px 36px rgba(0,0,0,.6);
     opacity:0; visibility:hidden; pointer-events:none; transform:translateY(-4px);
     transition:opacity .16s,transform .16s,visibility .16s}
.tip b{color:var(--ink); font-weight:600}
.tip em{color:var(--gold); font-style:normal}
.info-l .tip{left:-10px}
.info-r .tip{right:-10px}
.info-c .tip{left:50%; transform:translate(-50%,-4px)}
.info:hover .tip,.info:focus .tip{opacity:1; visibility:visible; transform:translateY(0)}
.info-c:hover .tip,.info-c:focus .tip{transform:translate(-50%,0)}
/* On a phone the band reflows to 2–3 columns, so a panel anchored to its own
   cell runs off the edge. Pin it to the bottom of the screen instead — always
   fully on-screen, wherever the marker happens to sit. */
@media(max-width:640px){
  .tip,.info-l .tip,.info-r .tip,.info-c .tip{position:fixed; left:12px; right:12px; width:auto;
    top:auto; bottom:16px; transform:translateY(6px)}
  .info:hover .tip,.info:focus .tip,.info-c:hover .tip,.info-c:focus .tip{transform:translateY(0)}
}

/* ── team stat band ── */
/* No overflow:hidden — it would clip the tooltips — so the end cells round themselves. */
.band{display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:1px; background:var(--border-soft); border:1px solid var(--border-soft); border-radius:14px; margin-bottom:40px}
.band .b{background:linear-gradient(180deg,var(--panel-2),var(--panel)); padding:18px 16px}
.band .b:first-child{border-radius:13px 0 0 13px}
.band .b:last-child{border-radius:0 13px 13px 0}
.band .bn{font-family:var(--serif); font-size:30px; font-weight:600; color:var(--gold); font-variant-numeric:tabular-nums}
.band .bk{display:block; font-size:11.5px; letter-spacing:.11em; text-transform:uppercase; color:var(--muted); margin-top:4px}

/* ── section heads ── */
.shead{font-family:var(--serif); font-size:clamp(22px,3vw,30px); font-weight:600; margin:0 0 6px}
.ssub{color:var(--faint); font-size:13.5px; margin:0 0 20px; max-width:70ch}

/* ── scorecard matrix ── */
.matrixwrap{overflow-x:auto; border:1px solid var(--border); border-radius:16px; background:var(--panel); margin-bottom:14px}
table.matrix{border-collapse:collapse; width:100%; min-width:720px}
.matrix th,.matrix td{padding:0; text-align:center}
.matrix thead th{padding:16px 8px 14px; vertical-align:bottom; border-bottom:1px solid var(--border)}
.matrix thead th .ch{font-size:12.5px; font-weight:700; letter-spacing:.02em; display:block; color:var(--ink)}
.matrix thead th .cs{font-size:10.5px; color:var(--faint); font-weight:500; display:block; margin-top:3px; letter-spacing:.02em}
.matrix thead th.lead-col{text-align:left; padding-left:20px; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); font-weight:600}
.matrix tbody td{border-bottom:1px solid var(--border-soft); height:52px}
.matrix tbody tr:last-child td{border-bottom:0}
.matrix tbody tr:hover td{background:rgba(255,255,255,.02)}
.matrix td.lead{text-align:left; padding-left:20px; white-space:nowrap}
.matrix td.lead a{color:var(--ink); text-decoration:none; font-weight:600; font-size:15px}
.matrix td.lead a:hover{color:var(--gold)}
.matrix td.lead .st{display:block; font-size:10.5px; color:var(--faint); letter-spacing:.06em; text-transform:uppercase; margin-top:1px}
.matrix td.scorecell{font-variant-numeric:tabular-nums; font-weight:700; color:var(--muted); font-size:13px; padding-right:18px; padding-left:6px}
.dot{display:inline-block; width:13px; height:13px; border-radius:50%; vertical-align:middle}
.dot.good{background:var(--good); box-shadow:0 0 0 4px var(--good-soft)}
.dot.warn{background:var(--warn); box-shadow:0 0 0 4px var(--warn-soft)}
.dot.bad{background:var(--bad);  box-shadow:0 0 0 4px var(--bad-soft)}
.legend{display:flex; flex-wrap:wrap; gap:20px; margin:0 0 46px; font-size:12.5px; color:var(--muted); padding-left:4px}
.legend span{display:inline-flex; align-items:center; gap:8px}

/* ── leader detail cards ── */
.leaders{display:grid; gap:18px}
.leader{border:1px solid var(--border-soft); border-radius:16px; background:linear-gradient(180deg,var(--panel-2),var(--panel)); padding:22px clamp(16px,2.4vw,26px); scroll-margin-top:20px}
.lhead{display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap}
.lname{display:flex; align-items:baseline; gap:12px}
.lidx{font-family:var(--serif); font-size:15px; color:var(--gold); font-weight:600; width:22px; text-align:right; opacity:.75}
.lname h3{font-family:var(--serif); font-size:clamp(22px,2.6vw,28px); font-weight:600; margin:0}
.mine{font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:var(--gold); border:1px solid var(--gold-soft); background:var(--gold-soft); padding:2px 8px; border-radius:20px}
.lscore{display:flex; align-items:center; gap:7px}
.lscore .lscoren{font-family:var(--sans); font-weight:700; font-size:13px; color:var(--muted); margin-left:6px; font-variant-numeric:tabular-nums}
.statstrip{display:grid; grid-template-columns:repeat(6,1fr); gap:1px; background:var(--border-soft); border-radius:10px; margin:18px 0 20px}
.statstrip .stat{background:var(--bg); padding:11px 8px; text-align:center}
.statstrip .stat:first-child{border-radius:9px 0 0 9px}
.statstrip .stat:last-child{border-radius:0 9px 9px 0}
.statstrip .statn{font-family:var(--serif); font-size:21px; font-weight:600; color:var(--ink); display:block; font-variant-numeric:tabular-nums; line-height:1}
/* the "/ 35" half of "20 / 35": the confirmed number leads, the expected one
   sits behind it so the tile still reads as one figure at a glance */
.of{font-size:.66em; font-weight:500; opacity:.55}
.statstrip .statk{font-size:10px; letter-spacing:.05em; text-transform:uppercase; color:var(--faint); margin-top:5px; display:block}
@media(max-width:560px){ .statstrip{grid-template-columns:repeat(3,1fr)} }

/* ── week strip (calendar strip) ── */
.wshdr{font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); font-weight:600; margin:0 0 10px}
.weekstripwrap{overflow-x:auto; padding-bottom:2px}
.weekstrip{display:grid; grid-template-columns:repeat(7,minmax(96px,1fr)); gap:8px; min-width:660px}
.wsday{background:var(--bg); border:1px solid var(--border-soft); border-radius:10px; padding:9px 7px 10px}
.wsday.today{border-color:var(--gold); box-shadow:0 0 0 1px var(--gold-soft)}
.wshead{display:flex; align-items:baseline; gap:6px; margin-bottom:8px; padding-bottom:7px; border-bottom:1px solid var(--border-soft)}
.wsdow{font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); font-weight:600}
.wsnum{font-family:var(--serif); font-size:15px; color:var(--ink); font-weight:600}
.wscount{margin-left:auto; font-size:10px; font-weight:700; color:var(--gold); background:var(--gold-soft); border-radius:20px; padding:1px 7px; font-variant-numeric:tabular-nums}
.wslist{display:flex; flex-direction:column; gap:6px}
.wsentry{display:flex; align-items:flex-start; gap:6px}
.wsdot{width:6px; height:6px; min-width:6px; border-radius:50%; margin-top:4px; flex:none}
.wsentrytext{display:flex; flex-direction:column; min-width:0; line-height:1.25}
.wsname{font-size:10.5px; color:var(--ink); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.wskind{font-size:9px; color:var(--faint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.wsempty{font-size:11px; color:var(--faint); opacity:.5; text-align:center; padding-top:2px}
.wsnomeet{margin-top:4px; padding-top:4px; border-top:1px solid var(--border-soft)}
.wsnomeetgroup{display:block; font-size:10px; color:var(--faint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.wsnomeettag{display:block; font-size:9px; font-style:italic; color:var(--faint); opacity:.65}
.wsmore{margin-top:1px}
.wsmore summary{font-size:9.5px; color:var(--gold); cursor:pointer; list-style:none; font-weight:600}
.wsmore summary::-webkit-details-marker{display:none}
.wsmore[open] summary{margin-bottom:6px}
.wslegend{display:flex; flex-wrap:wrap; gap:16px; margin:10px 0 4px; font-size:10.5px; color:var(--muted)}
.wslegend span{display:inline-flex; align-items:center; gap:6px}
.wslegend .wsdot{margin-top:0}
.crit{list-style:none; margin:0; padding:0; display:grid; gap:2px}
.critrow{display:flex; gap:13px; align-items:flex-start; padding:11px 12px; border-radius:10px; border-left:2px solid transparent}
.critrow.good{border-left-color:var(--good); background:linear-gradient(90deg,var(--good-soft),transparent 70%)}
.critrow.warn{border-left-color:var(--warn); background:linear-gradient(90deg,var(--warn-soft),transparent 70%)}
.critrow.bad{border-left-color:var(--bad);  background:linear-gradient(90deg,var(--bad-soft),transparent 70%)}
.critrow .dot{margin-top:3px; flex:none}
.crittext{display:flex; flex-direction:column; gap:2px}
.crithead{font-weight:600; font-size:14px; color:var(--ink)}
.critbody{font-size:13px; color:var(--muted); line-height:1.5}
.critbody .soap{color:var(--faint)}
.hl{color:var(--gold); font-weight:700}
.gaps{margin-top:18px; border-top:1px solid var(--border-soft); padding-top:16px}
.gapslabel{font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); font-weight:600}
.gaps ul{margin:9px 0 0; padding:0; list-style:none; display:grid; gap:7px}
.gaps li{font-size:13px; color:var(--muted); padding-left:20px; position:relative; line-height:1.45}
.gaps li::before{content:"↗"; position:absolute; left:0; color:var(--gold); opacity:.8}

/* ── team gaps ── */
.team{margin-top:52px}
.tgrid{display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:16px; margin-top:22px}
.tcard{border:1px solid var(--border-soft); border-radius:14px; background:var(--panel); padding:20px}
.tcard h4{margin:0 0 4px; font-size:13px; letter-spacing:.02em; color:var(--ink); font-weight:700; display:flex; align-items:center; gap:9px}
.tcard .tnote{font-size:12px; color:var(--faint); margin:0 0 12px}
.tcard ul{margin:0; padding:0; list-style:none; display:grid; gap:8px}
.tcard li{font-size:13px; color:var(--muted); display:flex; justify-content:space-between; gap:12px; align-items:baseline; border-bottom:1px dashed var(--border-soft); padding-bottom:7px}
.tcard li:last-child{border-bottom:0; padding-bottom:0}
.tcard li b{color:var(--ink); font-weight:600}
.tcard li .n{color:var(--gold); font-variant-numeric:tabular-nums; font-weight:700; white-space:nowrap}
.tcard.names li{flex-direction:column; align-items:flex-start; gap:3px}
.tcard.names li .sub{color:var(--good); font-size:12.5px; font-weight:500; line-height:1.4}
.pill{font-size:10px; padding:1px 7px; border-radius:20px; letter-spacing:.04em}
.pill.good{color:var(--good); background:var(--good-soft)}
.pill.warn{color:var(--warn); background:var(--warn-soft)}
.pill.bad{color:var(--bad); background:var(--bad-soft)}
.foot{margin-top:56px; padding-top:20px; border-top:1px solid var(--border-soft); color:var(--faint); font-size:12px; line-height:1.7; max-width:80ch}
.foot b{color:var(--muted); font-weight:600}
a{color:var(--gold)}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>

<div class="elr"><div class="wrap">
  <p class="eyebrow">Grace Bible Maui · Empower Team</p>
  <h1 class="title">Leader Review — <em>a discipleship scorecard</em></h1>
  <p class="lede">Every Empower leader, measured against the discipleship rhythm: <b>engage</b> people 1:1, <b>establish</b> them in a group and the SOAP habit, <b>equip</b> the next generation, and <b>multiply</b> — the day an emerging leader starts meeting someone 1:1 of their own.</p>
  <p class="datesub">Live from the app · ${esc(d.weekOf)} · ${d.aggregates.totalGroups} groups${info(TIP.groups)} · ${d.aggregates.uniquePeopleInRhythm} people in weekly rhythm${info(TIP.rhythm)}</p>
  <hr class="rule">

  <div class="band">
    <div class="b"><span class="bn">${d.leaders.length}</span><span class="bk">Leaders${info(TIP.leaders)}</span></div>
    <div class="b"><span class="bn">${d.aggregates.uniquePeopleInRhythm}</span><span class="bk">In weekly rhythm${info(TIP.rhythm)}</span></div>
    <div class="b"><span class="bn">${d.aggregates.totalGroups}</span><span class="bk">Groups${info(TIP.groups,'c')}</span></div>
    <div class="b"><span class="bn">${totalReleased}</span><span class="bk">Released to Empower${info(TIP.released,'c')}</span></div>
    <div class="b"><span class="bn">${microsites.length}</span><span class="bk">Microsite candidates${info(TIP.microsite,'r')}</span></div>
    <div class="b"><span class="bn">${d.aggregates.metLast7Days}<span class="of"> / ${d.aggregates.metExpectedLast7Days ?? d.aggregates.metLast7Days}</span></span><span class="bk">Met, last 7 days${info(TIP.met,'r')}</span></div>
  </div>

  <h2 class="shead">The scorecard</h2>
  <p class="ssub">One row per leader, one column per part of the rhythm. <b style="color:var(--good)">Green</b> = strong · <b style="color:var(--warn)">amber</b> = forming · <b style="color:var(--bad)">rose</b> = not started. Tap a name for the detail below.</p>
  <div class="matrixwrap"><table class="matrix">
    <thead><tr>
      <th class="lead-col">Leader</th>
      ${CRIT.map((c,i)=>`<th><span class="ch">${c.label}${info(CRITTIP[c.key],i>=CRIT.length-2?'r':'c')}</span><span class="cs">${esc(c.sub)}</span></th>`).join('')}
      <th><span class="ch">Score${info(TIP.score,'r')}</span><span class="cs">of 6</span></th>
    </tr></thead>
    <tbody>
      ${scored.map(s=>`<tr>
        <td class="lead"><a href="#L-${esc(s.l.first)}">${esc(s.l.name)}</a><span class="st">${esc(s.l.stage||'')}</span></td>
        ${CRIT.map(c=>`<td>${dot(s.v[c.key])}</td>`).join('')}
        <td class="scorecell">${nY(s)}/6</td>
      </tr>`).join('')}
    </tbody>
  </table></div>
  <div class="legend">
    <span>${dot('y')} Strong — happening now</span>
    <span>${dot('p')} Forming — partway there</span>
    <span>${dot('n')} Not started yet</span>
  </div>

  <h2 class="shead">Leader by leader</h2>
  <p class="ssub">Ordered by weekly reach. Each card shows the numbers, the six-part read, and the next steps that would move a light from amber to green.</p>
  <div class="leaders">
    ${scored.map(leaderCard).join('\n')}
  </div>

  <section class="team">
    <h2 class="shead">Where the team turns next</h2>
    <p class="ssub">The patterns that, across the whole team, would multiply the most disciples.</p>
    <div class="tgrid">
      <div class="tcard names">
        <h4>Ready to multiply <span class="pill good">biggest win</span></h4>
        <p class="tnote">An emerging leader is already running their own 1:1.</p>
        <ul>${scored.filter(s=>s.emergingRuns1on1.length).map(s=>`<li><b>${esc(s.l.first)}</b><span class="sub">${s.emergingRuns1on1.map(esc).join(', ')}</span></li>`).join('')||'<li>None yet</li>'}</ul>
      </div>
      <div class="tcard">
        <h4>No emerging leader yet <span class="pill bad">gap</span></h4>
        <p class="tnote">No one they disciple is running a 1:1 of their own.</p>
        <ul>${noMultiply.map(n=>`<li><b>${esc(n)}</b></li>`).join('')||'<li>—</li>'}</ul>
      </div>
      <div class="tcard">
        <h4>Microsite candidates <span class="pill good">15+</span></h4>
        <p class="tnote">Groups grown past 15 — time to plan a microsite.</p>
        <ul>${microsites.map(g=>`<li><b>${esc(g.leader)}</b> · ${esc(g.name)}<span class="n">${g.count}</span></li>`).join('')||'<li>None yet</li>'}</ul>
      </div>
      <div class="tcard">
        <h4>Ready for “Making Disciples” <span class="pill warn">6–15</span></h4>
        <p class="tnote">Groups at 6+ — take them through the 4E booklet together.</p>
        <ul>${readyMD.map(g=>`<li><b>${esc(g.leader)}</b> · ${esc(g.name)}<span class="n">${g.count}</span></li>`).join('')||'<li>None yet</li>'}</ul>
      </div>
      <div class="tcard">
        <h4>Groups to grow to 6 <span class="pill warn">under 6</span></h4>
        <p class="tnote">Almost a group — a few more people to fill them.</p>
        <ul>${under6.map(g=>`<li><b>${esc(g.leader)}</b> · ${esc(g.name)}<span class="n">${g.count}</span></li>`).join('')||'<li>None</li>'}</ul>
      </div>
      <div class="tcard">
        <h4>Empty Equip bench <span class="pill bad">gap</span></h4>
        <p class="tnote">Has a group, but no one being equipped as a leader.</p>
        <ul>${noEquip.map(n=>`<li><b>${esc(n)}</b></li>`).join('')||'<li>—</li>'}</ul>
      </div>
    </div>
    <div class="tcard" style="margin-top:16px">
      <h4>The SOAP habit <span class="pill warn">early</span></h4>
      <p class="tnote">SOAP = journal entries a person has made visible in WikiChurch (iSOAP↔WC pilot). Private iSOAP journaling isn’t counted here. Church-wide it is still just getting started.</p>
      <ul>${soapAlive.map(l=>`<li><b>${esc(l.first)}</b> · ${l.soap.doers.map(x=>esc(x.name.split(' ')[0])).join(', ')} journaling<span class="n">${l.soap.doers.reduce((a,x)=>a+x.entries,0)} entries</span></li>`).join('')||'<li>No one’s people are journaling in WikiChurch yet</li>'}</ul>
    </div>
  </section>

  <p class="foot">
    <b>How this is scored.</b> Each leader’s constellation = the people they directly disciple (one level), plus the groups they own. <b>Engage</b> counts 1:1s on the calendar (any meeting with one other person) and stage-moves they’ve driven in 6 weeks. <b>Establish</b> = people in a group of 6+ who are also forming the SOAP habit. <b>Group</b> reads the largest group against the 6 → 15 → microsite ladder. <b>Equip</b> counts who’s in the Equip stage and who’s been released to Empower. <b>Mentor</b> = discipling at least three. <b>Multiply</b> — the biggest win — is green only when an emerging leader is running their <i>own</i> 1:1.<br>
    Test accounts are excluded. Numbers refresh from the live app each time this is regenerated.
  </p>
</div></div>`
process.stdout.write(html)
