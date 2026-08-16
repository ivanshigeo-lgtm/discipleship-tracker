// Evaluates each Empower leader against Ivan's discipleship rubric, from live data.
// Rubric (Aug 11 2026):
//  ENGAGE  — meeting new people 1:1 (any meeting with one other person)
//  ESTABLISH — establishing people in a small group (+ SOAPs; SOAP not yet wired)
//  GROUP HEALTH — build a group to 6+ (then "Making Disciples" together), grow past 15 → microsite
//  EQUIP/EMPOWER — raising the next generation of disciplers (Equip bench, released to Empower)
//  MENTOR ≥3 — each leader mentoring at least 3 people
//  SHEPHERD A LEADER — discipling someone who is themselves a leader (biggest win)
import { readFileSync } from 'node:fs'
const DATA_PATH = process.env.ELR_DATA || '/private/tmp/claude-501/-Users-ivanshigeo/21899ea0-5b79-48f9-a4fe-e89c98bac867/scratchpad/elr_data.json'
const d = JSON.parse(readFileSync(DATA_PATH,'utf8'))
const leaderNames = new Set(d.leaders.map(l=>l.name))

const line = (s)=>process.stdout.write(s+'\n')
const badge = (ok)=> ok==='y'?'✅':ok==='p'?'🟡':'❌'

line(`# Empower Leader Team — Rubric Evaluation`)
line(`_Live data as of ${d.weekOf}. ${d.aggregates.totalGroups} groups · ${d.aggregates.uniquePeopleInRhythm} people in weekly rhythm._`)
line(`_Scored against: Engage (1:1, any type) · Establish (group + SOAP) · Group health (6+, 15→microsite) · Equip/Empower next leaders · Mentor ≥3 · Multiply a leader (emerging leader runs a One2One)._`)
line(`_SOAP = entries a person has made visible in WikiChurch (iSOAP↔WC pilot); private iSOAP journaling isn't counted. Adoption is still early church-wide._\n`)

for(const l of d.leaders){
  const groups=l.groups||[]
  const sizes=groups.map(g=>g.count)
  const biggest=sizes.length?Math.max(...sizes):0
  const groups6=groups.filter(g=>g.count>=6)
  const groups15=groups.filter(g=>g.count>15)
  const equip=l.futureLeaders.equip||[]
  const released=l.futureLeaders.released||[]
  // shepherding a leader = a direct disciple who is themselves one of the 10 leaders
  const discipleLeaders=[]
  for(const s of l.stages) for(const p of s.people) if(p.name!==l.name && leaderNames.has(p.name)) discipleLeaders.push(p.name)
  const oneOnOne = l.stats.oneOnOnesNext7>0 || (l.movements&&l.movements.length>0)
  const mentor3 = l.stats.constellation>=3
  const soap=l.soap||{ownEntries:0,doersCount:0,poolSize:0,doers:[]}
  const emergingRuns1on1=l.emergingRuns1on1||[]   // emerging leaders who run their own 1:1 (biggest win)
  const emergingRunning=l.emergingRunning||[]    // released people who lead a group / disciple someone

  // per-criterion verdict: y=yes, p=partial, n=no
  const cEngage = l.stats.oneOnOnesNext7>0 ? 'y' : (l.movements&&l.movements.length? 'p':'n')
  // Establish = a group AND people forming the SOAP habit; full only when both present
  const cEstablish = l.stats.peopleInGroups>0 ? (groups6.length? (soap.doersCount>0?'y':'p') : 'p') : 'n'
  const cGroup = biggest>15? 'y' : biggest>=6? 'y' : biggest>0? 'p':'n'
  const cEquipEmp = (equip.length||released.length)? ((equip.length&&released.length)?'y':'p') : 'n'
  const cMentor = mentor3? 'y':'n'
  // Biggest win: an emerging leader runs their OWN 1:1, or they shepherd a named leader.
  const cMultiply = emergingRuns1on1.length? 'y' : (emergingRunning.length||discipleLeaders.length)? 'p':'n'

  line(`\n## ${l.name}`)
  line(`_${l.stats.groupsLed} groups · ${l.stats.peopleInGroups} in groups · ${l.stats.constellation} discipled · reach ${l.stats.weeklyReach} · met last 7d ${l.stats.metThisWeek} · 1:1 next 7d ${l.stats.oneOnOnesNext7}_`)
  line(`- ${badge(cEngage)} **Engage / 1:1** — ${l.stats.oneOnOnesNext7} people booked next 7d${(l.upcoming?.length||0)>l.stats.oneOnOnesNext7?` (${l.upcoming.length} meetings)`:''}; ${l.movements?.length||0} stage-moves driven in 6wk`)
  const soapStr = soap.doersCount>0 ? `${soap.doersCount} doing SOAPs (${soap.doers.map(x=>`${x.name} ${x.entries}`).join(', ')})` : (soap.ownEntries>0?`only ${l.first} journaling (${soap.ownEntries})`:'no SOAP activity yet')
  line(`- ${badge(cEstablish)} **Establish (group + SOAP)** — ${l.stats.peopleInGroups} people across ${groups.length} group(s)${groups6.length?`; ${groups6.length} at 6+`:''} · SOAP: ${soapStr}`)
  line(`- ${badge(cGroup)} **Group health** — largest group ${biggest}${biggest>15?' → microsite candidate':biggest>=6?' → ready for “Making Disciples” together':biggest>0?' (build toward 6)':''}`)
  line(`- ${badge(cEquipEmp)} **Equip / Empower next leaders** — ${equip.length} being equipped${equip.length?` (${equip.map(e=>e.name).join(', ')})`:''}; ${released.length} released to Empower`)
  line(`- ${badge(cMentor)} **Mentoring ≥3** — disciples ${l.stats.constellation}`)
  line(`- ${badge(cMultiply)} **Multiply a leader** — ${emergingRuns1on1.length?`emerging leader(s) running their own 1:1: ${emergingRuns1on1.join(', ')}`:(discipleLeaders.length?`shepherds ${discipleLeaders.join(', ')} (not yet running a 1:1)`:(emergingRunning.length?`released ${emergingRunning.join(', ')}, not yet running a 1:1`:'no emerging leader multiplying yet'))}`)
  // gaps to fill
  const gaps=[]
  if(cEngage!=='y') gaps.push('schedule 1:1 time with new people')
  if(biggest>0&&biggest<6) gaps.push(`grow ${l.first==='Jonavan'?'a':'the'} group from ${biggest} toward 6`)
  if(groups.length===0&&l.stats.constellation>0) gaps.push('gather the people they disciple into a weekly group')
  if(cEquipEmp==='n') gaps.push('identify someone to begin equipping as a leader')
  if(equip.length&&!released.length) gaps.push('release an equipped person to actually disciple someone 1:1')
  if(cMultiply!=='y'&&(equip.length||released.length)) gaps.push('have an emerging leader start their own 1:1 with someone')
  if(soap.poolSize>0&&soap.doersCount===0) gaps.push('get people started on SOAPs (none journaling in WikiChurch yet)')
  if(l.notInRhythm.length) gaps.push(`${l.notInRhythm.length} disciple(s) not in any group: ${l.notInRhythm.slice(0,6).join(', ')}${l.notInRhythm.length>6?'…':''}`)
  if(gaps.length) line(`- **Gaps to fill:** ${gaps.join('; ')}.`)
}

// team-level rollup
line(`\n---\n## Team gaps (biggest wins)`)
const noEquip=d.leaders.filter(l=>!(l.futureLeaders.equip.length)&&l.stats.peopleInGroups>0).map(l=>l.first)
const under6=d.leaders.flatMap(l=>l.groups.filter(g=>g.count>0&&g.count<6).map(g=>`${l.first}: ${g.name} (${g.count})`))
const noMultiply=d.leaders.filter(l=>!(l.emergingRuns1on1&&l.emergingRuns1on1.length)).map(l=>l.first)
const soapLeaders=d.leaders.filter(l=>l.soap&&l.soap.doersCount>0).map(l=>`${l.first} (${l.soap.doers.map(x=>x.name.split(' ')[0]).join('/')})`)
line(`- **No one being equipped as a leader** (has a group but empty Equip bench): ${noEquip.join(', ')||'—'}`)
line(`- **Groups under 6 (need to grow):** ${under6.join('; ')||'—'}`)
line(`- **No emerging leader running their own 1:1 yet (the biggest win):** ${noMultiply.join(', ')}`)
line(`- **SOAP habit alive in only:** ${soapLeaders.join('; ')||'no leader’s people are journaling in WikiChurch yet'}`)
line(`- **Microsite candidates (group >15):** ${d.leaders.flatMap(l=>l.groups.filter(g=>g.count>15).map(g=>`${l.first}: ${g.name} (${g.count})`)).join('; ')||'none yet'}`)
