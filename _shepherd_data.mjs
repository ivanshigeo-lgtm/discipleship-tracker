// Data for the Shepherd's Scorecard: the cont66 confirmed/expected split, the cont65
// account gap, and the measures that pick ONE conversation prompt per leader.
// ⭐ The number's job is to pick the QUESTION, not to be the answer.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env=readFileSync('/Users/ivanshigeo/discipleship-tracker/.env.local','utf8')
const get=k=>(env.match(new RegExp(`^${k}=(.*)$`,'m'))?.[1]||'').trim()
const sb=createClient(get('NEXT_PUBLIC_SUPABASE_URL'),get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}})
const all=async(t,c,key=['id'])=>{const r=[];for(let f=0;;f+=1000){let q=sb.from(t).select(c);for(const k of key)q=q.order(k);const{data,error}=await q.range(f,f+999);if(error)throw new Error(t+': '+error.message);r.push(...data);if(data.length<1000)break}return r}
const [people,groups,pvg,conns,eng,attnAll,gms]=await Promise.all([
  all('people','id,name,current_stage,status,is_test,auth_user_id'),
  all('victory_groups','id,name,owner_person_id,meeting_day,meeting_days'),
  all('person_victory_groups','person_id,victory_group_id,status'),
  all('discipleship_connections','discipler_person_id,disciple_person_id'),
  all('engagements','id,person_id,created_by_person_id,status,follow_up_date,meeting_type'),
  all('group_attendance','person_id,victory_group_id,meeting_date,attended'),
  all('group_meeting_status','id,victory_group_id,meeting_date,status,rescheduled_to'),
])
const byId=new Map(people.map(p=>[p.id,p]))
const nm=i=>byId.get(i)?.name||'—'
const active=p=>!!p&&p.status!=='Inactive'&&p.is_test!==true
const pad=n=>String(n).padStart(2,'0')
const toLocal=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const DAYFULL=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const now=new Date(); const today=new Date(now); today.setHours(0,0,0,0)
const todayStr=toLocal(today)
const last7=new Date(today); last7.setDate(last7.getDate()-6); const last7Str=toLocal(last7)
const d90=new Date(today); d90.setDate(d90.getDate()-90); const d90Str=toLocal(d90)
const activeMem=pvg.filter(m=>m.status!=='Inactive'&&m.status!=='removed')
const dayOf=g=>g.meeting_day||(Array.isArray(g.meeting_days)&&g.meeting_days.length?g.meeting_days.join(' / '):null)
const statusByKey=new Map(gms.map(s=>[`${s.victory_group_id}|${s.meeting_date}`,s]))
const reschedInto=new Map();for(const s of gms){if(s.status==='rescheduled'&&s.rescheduled_to){const l=reschedInto.get(s.rescheduled_to)||[];l.push(s);reschedInto.set(s.rescheduled_to,l)}}

// discipleship tree depth (generations below this leader)
const kids=new Map()
for(const c of conns){ if(!c.discipler_person_id||!c.disciple_person_id) continue
  if(!kids.has(c.discipler_person_id))kids.set(c.discipler_person_id,new Set())
  kids.get(c.discipler_person_id).add(c.disciple_person_id) }
const depthOf=(id,seen=new Set())=>{ if(seen.has(id))return 0; seen.add(id)
  const ch=[...(kids.get(id)||[])].filter(i=>active(byId.get(i)))
  if(!ch.length)return 0
  return 1+Math.max(...ch.map(c=>depthOf(c,new Set(seen)))) }

const LEADERS=people.filter(p=>p.current_stage==='Empower'&&active(p))
const out=[]
for(const L of LEADERS){
  const lid=L.id
  const ownedAll=groups.filter(g=>g.owner_person_id===lid).map(g=>({id:g.id,name:g.name,day:dayOf(g),
    members:[...new Set(activeMem.filter(m=>m.victory_group_id===g.id&&m.person_id&&m.person_id!==lid).map(m=>m.person_id))].filter(i=>active(byId.get(i)))}))
  const gidSet=new Set(ownedAll.map(g=>g.id))
  const owned=ownedAll.filter(g=>g.members.length>=2)
  const pairGroups=ownedAll.filter(g=>g.members.length===1)
  const myMeetings=eng.filter(e=>e.created_by_person_id===lid)
  const attnByKey=new Map()
  for(const a of attnAll){ if(!gidSet.has(a.victory_group_id))continue
    const k=`${a.victory_group_id}|${a.meeting_date}`; let r=attnByKey.get(k); if(!r){r={present:new Set(),roster:0};attnByKey.set(k,r)}
    if(a.person_id===lid)continue; r.roster++; if(a.attended)r.present.add(a.person_id) }
  // confirmed (cont66 rule)
  const confirmed=new Set()
  for(const a of attnAll) if(a.attended&&gidSet.has(a.victory_group_id)&&a.meeting_date>=last7Str&&a.meeting_date<=todayStr&&a.person_id!==lid&&active(byId.get(a.person_id)))confirmed.add(a.person_id)
  for(const e of myMeetings) if(e.status==='Completed'&&e.follow_up_date>=last7Str&&e.follow_up_date<=todayStr&&e.person_id!==lid&&active(byId.get(e.person_id)))confirmed.add(e.person_id)
  // expected (week-strip rule, rolling window)
  const expected=new Set(confirmed)
  const addExp=(g,ds)=>{ if(attnByKey.get(`${g.id}|${ds}`))return; for(const pid of g.members) expected.add(pid) }
  for(let d=new Date(last7); d<=today; d.setDate(d.getDate()+1)){
    const ds=toLocal(d), dow=DAYFULL[d.getDay()]
    for(const g of [...owned,...pairGroups]){ if(!g.day||!g.day.split(' / ').includes(dow))continue
      const st=statusByKey.get(`${g.id}|${ds}`); if(st?.status==='cancelled'||st?.status==='rescheduled')continue
      addExp(g,ds) }
    for(const s of (reschedInto.get(ds)||[])){ const g=ownedAll.find(x=>x.id===s.victory_group_id); if(g)addExp(g,ds) } }
  for(const e of myMeetings){ if(e.status==='Cancelled'||!e.follow_up_date)continue
    if(e.follow_up_date<last7Str||e.follow_up_date>todayStr)continue
    if(e.person_id===lid||!active(byId.get(e.person_id)))continue; expected.add(e.person_id) }
  // ── PURSUIT OF THE DRIFTING: attended before, absent the last 3 sheets taken ──
  const drifting=[]
  for(const g of ownedAll){
    const dates=[...new Set(attnAll.filter(a=>a.victory_group_id===g.id).map(a=>a.meeting_date))].sort()
    if(dates.length<3)continue
    const last3=dates.slice(-3)
    const everPresent=new Set(attnAll.filter(a=>a.victory_group_id===g.id&&a.attended&&a.person_id!==lid).map(a=>a.person_id))
    for(const pid of everPresent){ if(!active(byId.get(pid)))continue
      const absentAll=last3.every(d=>!attnAll.some(a=>a.victory_group_id===g.id&&a.meeting_date===d&&a.person_id===pid&&a.attended))
      if(!absentAll)continue
      const lastSeen=[...attnAll].filter(a=>a.victory_group_id===g.id&&a.person_id===pid&&a.attended).map(a=>a.meeting_date).sort().pop()
      // was there ANY logged contact about them since they stopped?
      const pursued=eng.some(e=>e.person_id===pid&&e.follow_up_date&&lastSeen&&e.follow_up_date>lastSeen&&e.status!=='Cancelled')
      drifting.push({id:pid,name:nm(pid),group:g.name,lastSeen,pursued}) }
  }
  const dr=drifting.filter((v,i,arr)=>arr.findIndex(x=>x.id===v.id)===i)
  // span of care: disciples vs those met 1:1 in 90 days
  const disciples=[...(kids.get(lid)||[])].filter(i=>active(byId.get(i)))
  const met90=new Set(myMeetings.filter(e=>e.status!=='Cancelled'&&e.follow_up_date>=d90Str&&e.person_id!==lid).map(e=>e.person_id))
  const disciplesMet90=disciples.filter(i=>met90.has(i))
  // stage bench
  const bench={Engage:0,Establish:0,Equip:0,Empower:0}
  for(const i of disciples){ const s=byId.get(i)?.current_stage; if(bench[s]!=null)bench[s]++ }
  // intern: does anyone under them run their own thing?
  const handoff=disciples.filter(i=>kids.get(i)?.size||groups.some(g=>g.owner_person_id===i)||eng.some(e=>e.created_by_person_id===i))
  out.push({ id:lid, name:L.name, first:L.name.trim().split(/\s+/)[0],
    hasAccount: !!L.auth_user_id,
    confirmed: confirmed.size, expected: expected.size,
    groupsLed: owned.length, peopleInGroups: new Set(owned.flatMap(g=>g.members)).size,
    disciples: disciples.length, met90: disciplesMet90.length,
    drifting: dr, driftUnpursued: dr.filter(d=>!d.pursued).length,
    bench, depth: depthOf(lid), handoff: handoff.length,
    ones90: met90.size,
  })
}
out.sort((a,b)=>b.expected-a.expected||b.disciples-a.disciples)
console.log(JSON.stringify({ generatedAt:new Date().toISOString(), today:todayStr, windowFrom:last7Str, leaders:out,
  totals:{ confirmed:new Set().size, } },null,1))
