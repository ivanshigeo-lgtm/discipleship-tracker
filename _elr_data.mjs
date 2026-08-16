// Comprehensive live-data extract for the Empower Leader Review refresh.
// Model matches the hand-built Aug-7 artifact: per-leader constellation = DIRECT
// disciples (one level of discipleship_connections). Excludes the Kai Nakamura
// test account. Emits one JSON to stdout.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = readFileSync('/Users/ivanshigeo/discipleship-tracker/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim()
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
// Paginated read. The ORDER KEY is not optional: .range() without a stable sort lets
// Postgres return pages in any order, so rows can repeat or vanish across page bounds.
// Every table here is under 1000 rows today, so this is insurance, not a live fix.
// Tables with no `id` column pass their primary key instead.
const all = async (t, c='*', key=['id']) => {
  const r=[]
  for(let f=0;;f+=1000){
    let q=sb.from(t).select(c)
    for(const k of key) q=q.order(k)
    const {data,error}=await q.range(f,f+999)
    if(error)throw new Error(t+': '+error.message)
    r.push(...data)
    if(data.length<1000)break
  }
  return r
}

const pad = (n)=>String(n).padStart(2,'0')
const toLocal = (d)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYFULL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const fmtMD=(iso)=>{const d=new Date(iso);return `${MON[d.getMonth()]} ${d.getDate()}`}
const norm=(s)=>s.toLowerCase().replace(/[^a-z ]/g,'').replace(/\s+/g,' ').trim()
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;const row=Array.from({length:n+1},(_,i)=>i);for(let i=1;i<=m;i++){let prev=row[0];row[0]=i;for(let j=1;j<=n;j++){const t=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=t}}return row[n]}
const fmtDur=(days)=>{ if(days==null)return null; if(days<31)return `${days}d`; const mo=Math.round(days/30.44); if(mo<12)return `${mo}mo`; const y=(days/365.25); return `${y.toFixed(y<10?1:0)}yr` }

const [people, groups, pvg, conns, engagements, pipe, attnAll, soapVis, soapLinks, groupStatuses] = await Promise.all([
  all('people','id,name,current_stage,status,is_test'),
  all('victory_groups','id,name,owner_person_id,meeting_day,meeting_days'),
  all('person_victory_groups','person_id,victory_group_id,status'),
  all('discipleship_connections','discipler_person_id,disciple_person_id'),
  all('engagements','id,person_id,created_by_person_id,meeting_type,status,follow_up_date,follow_up_time,location,description'),
  all('pipeline_events','person_id,to_stage,from_stage,created_at'),
  all('group_attendance','person_id,victory_group_id,meeting_date,attended'),
  all('isoap_entry_visibility','isoap_entry_id,wc_person_id,journal_date',['isoap_entry_id','wc_person_id']),
  all('isoap_links','wc_person_id,isoap_email',['wc_person_id']),
  all('group_meeting_status','id,victory_group_id,meeting_date,status,rescheduled_to,rescheduled_time'),
])
const byId=new Map(people.map(p=>[p.id,p]))
const active=(p)=>!!p&&p.status!=='Inactive'&&p.is_test!==true

const now=new Date()
const today=new Date(now); today.setHours(0,0,0,0)
const sunday=new Date(today); sunday.setDate(sunday.getDate()-sunday.getDay())
// both ends of the window are inclusive, so today+6 is seven days counting today
const in7=new Date(today); in7.setDate(in7.getDate()+6); const in7Str=toLocal(in7)
// "met" is a ROLLING seven days (today-6 .. today), mirroring the upcoming
// window. Since-Sunday made the number nearly double across the week purely
// from the day it was read. The Sun→Sat strip below stays Sunday-anchored —
// that one is a calendar, not a measure.
const last7=new Date(today); last7.setDate(last7.getDate()-6); const last7Str=toLocal(last7)
const timelineFrom=new Date(today); timelineFrom.setDate(timelineFrom.getDate()-42) // last 6 weeks

// ── week strip: Sun→Sat of the current week, as calendar dates ──
const DOWSHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const weekDates=Array.from({length:7},(_,i)=>{ const dt=new Date(sunday); dt.setDate(sunday.getDate()+i); return toLocal(dt) })
const todayStr0=toLocal(today)
// cancel/reschedule overrides on group occurrences, keyed "groupId|date"
const groupStatusByKey=new Map(groupStatuses.map(s=>[`${s.victory_group_id}|${s.meeting_date}`,s]))
// occurrences rescheduled INTO a date this week, keyed by that date
const reschedIntoByDate=new Map()
for(const s of groupStatuses){ if(s.status==='rescheduled'&&s.rescheduled_to){ const l=reschedIntoByDate.get(s.rescheduled_to)||[]; l.push(s); reschedIntoByDate.set(s.rescheduled_to,l) } }
const STAGE_TAG=(p)=> (p&&STAGE_ORDER.includes(p.current_stage)) ? p.current_stage : 'Engage'

// The 10 real leaders, in artifact summary order (by weekly reach). Kai Nakamura EXCLUDED (test acct).
const LEADERS=[
  '2aa35958-9057-44bd-aaf2-bd12a4cf9ecd', // Jonavan Asato
  '60b9cae1-3ca0-478f-b646-5cbb543f377c', // Shahlise Wainui
  'd72bb385-3c56-4881-a7eb-5458c6d5fb0e', // Eddie Asato
  '8796044d-8429-441a-a7f8-26f2c6cc028b', // Andrea Pahukula
  'd4292128-86f7-4bc8-983c-d774af366f0e', // Leilani Hearne
  '2398f294-ba15-4eeb-9e39-884d364b5564', // Faith Lagazo
  'b1672188-c395-4f59-8b49-1bc73904a250', // Lance Sokugawa
  '3dfb67e8-848c-4da7-948f-7b843144ed3b', // Justin Barlahan
  '1c9060b1-8786-444b-9bf2-86621648f6be', // Zachary Fetalvero
  '9afc85c0-2ef5-49ab-b817-53f900943b75', // Mitchell Hondo
]
const STAGE_ORDER=['Empower','Equip','Establish','Engage']
const meetingDayOf=(g)=>{ if(g.meeting_day) return g.meeting_day; if(Array.isArray(g.meeting_days)&&g.meeting_days.length) return g.meeting_days.join(' / '); return null }

// membership index (active memberships only)
const activeMem = pvg.filter(m=>m.status!=='Inactive' && m.status!=='removed')
const membersOfGroup=(gid)=> activeMem.filter(m=>m.victory_group_id===gid && m.person_id).map(m=>m.person_id)

// ── SOAP index (shared-into-WikiChurch entries via isoap_entry_visibility; keyed by wc_person_id) ──
// This measures SOAPs a person has made visible in WikiChurch — what a leader can actually see —
// NOT private iSOAP journaling (that lives in the separate iSOAP DB, not reachable here).
const soapEntries=new Map()  // person_id -> Set(isoap_entry_id)
const soapLastDate=new Map() // person_id -> latest journal_date
for(const v of soapVis){ if(!v.wc_person_id)continue
  if(!soapEntries.has(v.wc_person_id))soapEntries.set(v.wc_person_id,new Set())
  soapEntries.get(v.wc_person_id).add(v.isoap_entry_id)
  const cur=soapLastDate.get(v.wc_person_id); if(!cur||(v.journal_date&&v.journal_date>cur))soapLastDate.set(v.wc_person_id,v.journal_date||cur)
}
const soapLinked=new Set(soapLinks.map(l=>l.wc_person_id))            // has connected an iSOAP account
const soapCount=(pid)=> (soapEntries.get(pid)?.size)||0
// emerging-leader multiplication signal: is this person themselves discipling / running their own 1:1s / leading a group?
const ownsGroupSet=new Set(groups.map(g=>g.owner_person_id))
const runs1on1=new Map()      // person_id -> # 1:1 meetings they CREATED (any type)
for(const e of engagements){ if(e.created_by_person_id){ runs1on1.set(e.created_by_person_id,(runs1on1.get(e.created_by_person_id)||0)+1) } }
const disciplesCount=new Map()// person_id -> # people they disciple (direct)
for(const c of conns){ if(c.discipler_person_id&&c.disciple_person_id){ if(!disciplesCount.has(c.discipler_person_id))disciplesCount.set(c.discipler_person_id,new Set()); disciplesCount.get(c.discipler_person_id).add(c.disciple_person_id) } }
const multiplyingOf=(pid)=>{ const ones=runs1on1.get(pid)||0, disc=(disciplesCount.get(pid)?.size)||0, grp=ownsGroupSet.has(pid)
  return { runsOwn1on1:ones>0, ones, ownsGroup:grp, disciplesOthers:disc>0, disc, multiplying:(ones>0||grp||disc>0) } }

// stageSince from pipeline_events (<=45d, mirrors card)
const stageSince=(id,stage)=>{
  const ev=pipe.filter(e=>e.person_id===id&&e.to_stage===stage).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]
  if(!ev) return null
  if(now.getTime()-new Date(ev.created_at).getTime()>45*864e5) return null
  return fmtMD(ev.created_at)
}
// entered-current-stage date → days in current stage (factual; null if never logged)
const enteredStage=(id,stage)=>{
  const ev=pipe.filter(e=>e.person_id===id&&e.to_stage===stage).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]
  return ev?ev.created_at:null
}
const daysInStage=(id,stage)=>{ const iso=enteredStage(id,stage); if(!iso)return null; return Math.floor((now.getTime()-new Date(iso).getTime())/864e5) }
// historical median days spent in a stage before advancing (across all real people) — for context on pacing
function medianStageDurations(){
  const bucket={Engage:[],Establish:[],Equip:[]}
  const byPerson=new Map()
  for(const e of pipe){ if(!byPerson.has(e.person_id))byPerson.set(e.person_id,[]); byPerson.get(e.person_id).push(e) }
  for(const [pid,evs] of byPerson){ if(!active(byId.get(pid)))continue
    evs.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))
    for(let i=0;i<evs.length-1;i++){ const s=evs[i].to_stage; if(bucket[s]){ const d=Math.floor((new Date(evs[i+1].created_at)-new Date(evs[i].created_at))/864e5); if(d>=0&&d<3650)bucket[s].push(d) } }
  }
  const med=(a)=>{ if(!a.length)return null; const s=a.slice().sort((x,y)=>x-y); const m=Math.floor(s.length/2); return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2) }
  return { Engage:med(bucket.Engage), Establish:med(bucket.Establish), Equip:med(bucket.Equip) }
}
const stageMedians=medianStageDurations()

const leaderPages=[]
const allInRhythm=new Set()   // union of all group members across all leaders (unique people in weekly rhythm)
let totalGroups=0, totalSeats=0
const metLast7=new Set()

for(const lid of LEADERS){
  const L=byId.get(lid); if(!L) continue
  const first=L.name.trim().split(/\s+/)[0]
  const isSelf=(L.name==='Jonavan Asato')

  // direct disciples (one level), active
  const directIds=[...new Set(conns.filter(c=>c.discipler_person_id===lid&&c.disciple_person_id).map(c=>c.disciple_person_id))]
  const direct=directIds.map(id=>byId.get(id)).filter(active)

  // owned groups + rosters
  let owned=groups.filter(g=>g.owner_person_id===lid).map(g=>{
    const memIds=membersOfGroup(g.id).filter(pid=>pid!==lid)
    return { id:g.id, name:g.name, day:meetingDayOf(g), members:[...new Set(memIds)] }
  }).sort((a,b)=>b.members.length-a.members.length)
  // A small group is 3 or more people: the leader plus at least two others. A
  // "group" holding exactly one other person is really a 1:1, and one with
  // nobody on the roster is not a meeting at all. `members` already excludes
  // the leader, so the split is on 2.
  const ownedAll=owned
  const pairGroups=ownedAll.filter(g=>g.members.length===1)
  owned=ownedAll.filter(g=>g.members.length>=2)
  totalGroups+=owned.length
  // Unique PEOPLE, not seats: a name in two of this leader's groups counts once
  // here and once church-wide. Inactive and test profiles are dropped so the
  // headcount matches who is actually in rhythm; totalSeats keeps the raw tally.
  const inGroupIds=new Set()
  for(const g of owned){ for(const pid of g.members){ if(!active(byId.get(pid))) continue; inGroupIds.add(pid); allInRhythm.add(pid); totalSeats++ } }

  // met in the last 7 days: attendance in owned groups + completed 1-on-1s.
  // ⚠️ Bounded at BOTH ends — attendance can be marked ahead of a meeting, and
  // an open-ended test counted those future rows as already met.
  // Both the per-leader set and the church-wide roll-up get every path, so the
  // headline number means the same thing as the per-leader column of that name.
  const ownedGidSet=new Set(ownedAll.map(g=>g.id))
  const met=new Set()
  for(const a of attnAll) if(a.attended&&ownedGidSet.has(a.victory_group_id)&&a.meeting_date>=last7Str&&a.meeting_date<=todayStr0&&a.person_id!==lid&&active(byId.get(a.person_id))){met.add(a.person_id);metLast7.add(a.person_id)}
  // A 1:1 is any meeting with exactly one other person — One2One, Making
  // Disciples, Coffee, Church Community, Empowering Leaders, SOAP or untyped.
  // Every engagement row IS such a meeting, so the label never filters anything:
  // it is shown to the leader but never used to decide what counts.
  const myMeetings=engagements.filter(e=>e.created_by_person_id===lid)
  const my1on1=myMeetings
  // Compare date STRINGS, as the attendance loop above does. `new Date('2026-08-16')`
  // parses as UTC midnight, which in HST (UTC-10) is 14:00 the day BEFORE — the
  // old getTime() test dropped meetings sitting on the boundary. (lib/leaderReview.ts
  // fixed this long ago; this script still carried the bug.)
  for(const e of myMeetings) if(e.status==='Completed'&&e.follow_up_date&&e.follow_up_date>=last7Str&&e.follow_up_date<=todayStr0&&e.person_id!==lid&&active(byId.get(e.person_id))){met.add(e.person_id);metLast7.add(e.person_id)}

  // ── week strip: Sun→Sat, who they're meeting with each day + the person's 4E stage ──
  // Attendance, where it was taken, is the TRUTH — the roster is only a forecast.
  // Without this the strip lists every member of every group scheduled that
  // weekday, so people marked absent (and groups that never met) still appear.
  const attnByKey=new Map()
  for(const a of attnAll){
    if(!ownedGidSet.has(a.victory_group_id)) continue
    const k=`${a.victory_group_id}|${a.meeting_date}`
    let rec=attnByKey.get(k); if(!rec){ rec={present:new Set(),roster:0}; attnByKey.set(k,rec) }
    if(a.person_id===lid) continue
    rec.roster++; if(a.attended) rec.present.add(a.person_id)
  }
  const my1on1ByDate=new Map()
  for(const e of myMeetings){ if(!e.follow_up_date||e.status==='Cancelled') continue
    const l=my1on1ByDate.get(e.follow_up_date)||[]; l.push(e); my1on1ByDate.set(e.follow_up_date,l) }
  const weekStrip=weekDates.map((dateStr,i)=>{
    const dow=DAYFULL[i]
    const entries=[]
    const noMeetings=[]
    const pushGroup=(g,label)=>{
      const kind=g.members.length>=2?'group':'1on1'
      const att=attnByKey.get(`${g.id}|${dateStr}`)
      if(att){
        if(att.present.size===0){ noMeetings.push({group:label,roster:att.roster}); return }
        for(const pid of att.present){ const p=byId.get(pid); if(!active(p)) continue
          entries.push({ person:p.name, stage:STAGE_TAG(p), kind, with:label }) }
        return
      }
      // attendance not taken — the roster is the plan, which is all we know
      for(const pid of g.members){ const p=byId.get(pid); if(!active(p)) continue
        entries.push({ person:p.name, stage:STAGE_TAG(p), kind, with:label }) }
    }
    for(const g of [...owned,...pairGroups]){
      if(!g.day||!g.day.split(' / ').includes(dow)) continue
      const st=groupStatusByKey.get(`${g.id}|${dateStr}`)
      if(st?.status==='cancelled'||st?.status==='rescheduled') continue // moved off this date, or shown below via reschedIntoByDate
      pushGroup(g,g.name)
    }
    for(const s of (reschedIntoByDate.get(dateStr)||[])){ if(!ownedGidSet.has(s.victory_group_id)) continue
      const g=ownedAll.find(x=>x.id===s.victory_group_id); if(!g) continue
      pushGroup(g,`${g.name} · rescheduled`)
    }
    for(const e of (my1on1ByDate.get(dateStr)||[])){ const p=byId.get(e.person_id); if(!p||e.person_id===lid) continue
      entries.push({ person:p.name, stage:STAGE_TAG(p), kind:'1on1', with:e.meeting_type||null }) }
    entries.sort((a,b)=>a.person.localeCompare(b.person))
    // count = distinct PEOPLE (matches the tiles). Rows stay un-collapsed on
    // purpose so you can see someone was in both a group and a 1:1 that day.
    return { date:dateStr, dow:DOWSHORT[i], num:Number(dateStr.slice(8,10)), isToday:dateStr===todayStr0, count:new Set(entries.map(e=>e.person)).size, entries, noMeetings }
  })

  // 1:1s scheduled next 7 days — every meeting type counts
  const upcoming=my1on1.filter(e=>e.follow_up_date&&e.follow_up_date>=toLocal(today)&&e.follow_up_date<=in7Str&&e.status!=='Cancelled')
    .map(e=>({ personId:e.person_id, person:byId.get(e.person_id)?.name||'—', date:e.follow_up_date, time:e.follow_up_time||null, location:e.location||null, kind:e.meeting_type||null }))
    .sort((a,b)=>a.date.localeCompare(b.date))

  // weekly reach = distinct group members ∪ people with a 1-on-1 on the calendar
  const reach=new Set(inGroupIds); for(const e of myMeetings) if(e.person_id&&e.person_id!==lid) reach.add(e.person_id)

  // stage breakdown of DIRECT disciples, each with time-in-stage
  const byStage={Empower:[],Equip:[],Establish:[],Engage:[]}
  for(const p of direct) (byStage[p.current_stage]||byStage.Engage).push(p)
  const stages=STAGE_ORDER.map(s=>({ stage:s, people:byStage[s].slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>{
    const dis=daysInStage(p.id,s); return {name:p.name,since:stageSince(p.id,s),daysInStage:dis,inStage:fmtDur(dis),inRhythm:inGroupIds.has(p.id)} }) }))
  const nOf=(s)=>byStage[s].length

  // future leaders = who they're training up: Equip bench (emerging) + Empower already released
  const futureLeaders={
    equip:byStage.Equip.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>({name:p.name,inStage:fmtDur(daysInStage(p.id,'Equip'))})),
    released:byStage.Empower.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=>({name:p.name})),
  }

  // ── SOAP: leader's own + how many of the people they establish are journaling (visible in WC) ──
  const establishPool=[...new Set([...direct.map(p=>p.id), ...inGroupIds])].map(id=>byId.get(id)).filter(active)
  const soapDoers=establishPool.filter(p=>soapCount(p.id)>0).map(p=>({name:p.name,entries:soapCount(p.id),last:soapLastDate.get(p.id)||null})).sort((a,b)=>b.entries-a.entries)
  const soap={ ownEntries:soapCount(lid), ownLinked:soapLinked.has(lid), poolSize:establishPool.length,
    doersCount:soapDoers.length, linkedCount:establishPool.filter(p=>soapLinked.has(p.id)).length, doers:soapDoers.slice(0,8) }

  // ── Emerging leaders they're raising: for each Equip/Empower disciple, are THEY multiplying? ──
  const emerging=[...byStage.Equip, ...byStage.Empower].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>{
    const m=multiplyingOf(p.id); return { name:p.name, stage:p.current_stage, ...m } })
  const emergingRunning=emerging.filter(e=>e.multiplying)          // released & actually leading
  const emergingRuns1on1=emerging.filter(e=>e.runsOwn1on1)          // the rubric's "biggest win"

  // not in weekly rhythm = direct disciples not in any owned group
  const notInRhythm=direct.filter(p=>!inGroupIds.has(p.id)).map(p=>p.name).sort((a,b)=>a.localeCompare(b))
  const coverageGap=direct.filter(p=>!inGroupIds.has(p.id))

  // ── Worth talking about (deterministic, direct-disciple model; mirrors LeaderReviewCard) ──
  const first_=first, poss=isSelf?'your':`${first_}'s`, Poss=isSelf?'Your':`${first_}'s`, Who=isSelf?'You':first_, who=isSelf?'you':first_, whoHave=isSelf?'You have':`${first_} has`
  const C=direct.length
  const flags=[]
  if(owned.length===0&&myMeetings.length>0) flags.push(`${Who}${isSelf?"'re":' is'} meeting people one-on-one but ${isSelf?"don't":"doesn't"} lead a weekly group yet — is one forming?`)
  else if(owned.length===0&&C>0) flags.push(`${C} ${C===1?'person is':'people are'} on ${poss} constellation, but ${who} ${isSelf?"don't":"doesn't"} lead a weekly group yet — where could they gather?`)
  else if(coverageGap.length>0&&C>0) flags.push(`${coverageGap.length} of the ${C} people ${who} ${isSelf?'disciple':'disciples'} aren't in any of ${poss} weekly groups — who among them needs a next step?`)
  else if(C>0&&owned.length>0) flags.push(`Every one of ${poss} ${C} people is in a weekly group — full coverage. ✦`)
  const nm2=direct.map(p=>({p,n:norm(p.name)})).filter(x=>x.n.length>3)
  let dup=false
  for(let i=0;i<nm2.length&&!dup;i++)for(let j=i+1;j<nm2.length;j++){const a=nm2[i],b=nm2[j];if(a.n===b.n||(Math.abs(a.n.length-b.n.length)<=2&&lev(a.n,b.n)<=2)){flags.push(`${Poss} people list both "${a.p.name}" and "${b.p.name}" — likely the same person, worth a merge.`);dup=true;break}}
  for(const g of owned) if(g.members.length===0){flags.push(`${Poss} ${g.name} group has no members added yet — is it forming, or does the roster need to be added?`);break}
  for(const g of owned){ if(!g.day&&g.members.length>0){flags.push(`${Poss} ${g.name} group has no meeting day set — worth confirming when it meets and adding it.`);break} }
  if(owned.length>0&&myMeetings.length===0) flags.push(`${Poss} weekly rhythm runs entirely through groups — no one-on-ones logged. Who's next for a one-on-one?`)
  if(nOf('Establish')>=3&&nOf('Equip')===0) flags.push(`${whoHave} a deep Establish bench and no one yet in Equip — who's ready to be equipped as a leader next?`)
  else if(nOf('Establish')>=4&&nOf('Establish')>nOf('Equip')*3) flags.push(`${nOf('Establish')} people are rooted at Establish behind ${poss} emerging leaders — who's ready to be equipped next?`)
  // stalled: anyone parked in a stage far beyond the church median
  for(const s of ['Equip','Establish']){ const slow=byStage[s].map(p=>({p,d:daysInStage(p.id,s)})).filter(x=>x.d!=null&&stageMedians[s]&&x.d>stageMedians[s]*2.5).sort((a,b)=>b.d-a.d)[0]; if(slow){flags.push(`${slow.p.name} has been at ${s} ${fmtDur(slow.d)} — longer than most — a good one to give focused time.`);break} }
  const shownFlags=flags.slice(0,5)

  leaderPages.push({
    id:lid, name:L.name, first, stage:L.current_stage, isSelf,
    stats:{ groupsLed:owned.length, peopleInGroups:inGroupIds.size, metThisWeek:met.size, oneOnOnesNext7:new Set(upcoming.map(u=>u.personId)).size, weeklyReach:reach.size, constellation:direct.length },
    groups:owned.map(g=>({name:g.name,day:g.day,count:g.members.length})),
    stages, futureLeaders, notInRhythm, upcoming, flags:shownFlags,
    soap, emerging, emergingRunning:emergingRunning.map(e=>e.name), emergingRuns1on1:emergingRuns1on1.map(e=>e.name),
    weekStrip,
  })
}

// pipeline movement timeline: last 6 weeks, real people only, with discipler
const disciplerOf=new Map(); for(const c of conns) if(c.disciple_person_id&&!disciplerOf.has(c.disciple_person_id)) disciplerOf.set(c.disciple_person_id,c.discipler_person_id)
const timeline=pipe.filter(e=>new Date(e.created_at)>=timelineFrom && active(byId.get(e.person_id)))
  .map(e=>({ name:byId.get(e.person_id)?.name||'—', to:e.to_stage, from:e.from_stage, date:e.created_at, dateMD:fmtMD(e.created_at), by:byId.get(disciplerOf.get(e.person_id))?.name||null }))
  .sort((a,b)=>new Date(a.date)-new Date(b.date))

// attach per-leader movements they drove in the last 6 weeks (what they're doing to mature people)
for(const lp of leaderPages){
  lp.movements=timeline.filter(t=>t.by===lp.name).map(t=>({name:t.name,to:t.to,dateMD:t.dateMD})).reverse()
}

// ── GAPS (document-level, recomputed each run) ──
const gaps={
  coverage:leaderPages.filter(l=>l.notInRhythm.length>0).map(l=>({leader:l.first,count:l.notInRhythm.length,of:l.stats.constellation,names:l.notInRhythm})),
  emptyGroups:[], noDay:[], benchReady:[], dupes:[],
}
for(const lp of leaderPages){
  for(const g of lp.groups){ if(g.count===0) gaps.emptyGroups.push({leader:lp.first,group:g.name}); if(!g.day&&g.count>0) gaps.noDay.push({leader:lp.first,group:g.name,count:g.count}) }
  const est=lp.stages.find(s=>s.stage==='Establish')?.people.length||0
  const eq=lp.stages.find(s=>s.stage==='Equip')?.people.length||0
  if(est>=3&&eq===0) gaps.benchReady.push({leader:lp.first,establish:est})
}
// likely duplicates across ALL real people
{ const nm=people.filter(active).map(p=>({p,n:norm(p.name)})).filter(x=>x.n.length>3); const seen=new Set()
  for(let i=0;i<nm.length;i++)for(let j=i+1;j<nm.length;j++){const a=nm[i],b=nm[j];const k=[a.p.name,b.p.name].sort().join('|');if(seen.has(k))continue;if(a.n===b.n||(Math.abs(a.n.length-b.n.length)<=2&&lev(a.n,b.n)<=1)){gaps.dupes.push([a.p.name,b.p.name]);seen.add(k)}}
}

const out={
  generatedAt:now.toISOString(),
  weekOf:`${DAYFULL[now.getDay()]}, ${['January','February','March','April','May','June','July','August','September','October','November','December'][now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`,
  stageMedians,
  aggregates:{
    totalGroups,
    uniquePeopleInRhythm:allInRhythm.size,
    totalSeats,
    metLast7Days:metLast7.size,
    leaders:leaderPages.length,
  },
  gaps,
  leaders:leaderPages,
  timeline,
}
process.stdout.write(JSON.stringify(out,null,2))
