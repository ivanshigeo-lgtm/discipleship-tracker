// ─────────────────────────────────────────────────────────────────────────────
// Grace Bible Church (Maui) ministry roster — the match targets for the AI
// ministry-fit capstone (/api/ministry-fit). This is a config the church can edit:
// add/remove ministries or reword descriptions here and the match adapts.
//
// Curation notes (from Jonavan, Jul 26 2026):
//  • Small Groups: the ~17 individual weekly groups are COLLAPSED into types
//    ("Discipleship Small Groups", "Young Adults Group"). The match points to a
//    type; the coach places the person in a specific weekly group. The worship
//    and seniors small groups are folded into Worship / GBC Seniors respectively.
//  • Administration: only genuine SERVING areas are eligible (Facilities, Church
//    Work Days, Special Events, Preschool, Accounting). Internal / governance /
//    membership lists are intentionally EXCLUDED — nobody is "matched" onto the
//    Board of Directors, Staff, Church Members, donor lists, Small Group Leaders,
//    Approval Group, WEX, Our Church, Other Church Leaders.
//  • Also excluded: Youth Group Parents (a group FOR parents, not a serving role),
//    Health Seminar 2024 / 2023 Fire Response fund lists (dated / finance lists).
//  • Removed at Jonavan's request (Jul 26): Na Keiki O Emalia, Na Hale Kupuna,
//    Campus Connect, Fire Response Volunteer Team, Archery, Trunk N Treat, ICBF.
//
// Descriptions embed the KIND of person/gift/passion each ministry suits so the
// model can reason about fit against a disciple's spiritual gifts, personality,
// and passion. Keep them factual and concise.
// ─────────────────────────────────────────────────────────────────────────────

export type Ministry = {
  id: string            // stable slug — used in suggestion output and any future joins
  name: string          // display name (what the AI returns as `ministry`)
  department: string    // grouping shown to the coach/person
  leader?: string       // ministry leader / first point of contact
  description: string   // 1–2 lines; informs the model's fit reasoning
}

export const MINISTRIES: Ministry[] = [
  // ── Care ────────────────────────────────────────────────────────────────────
  {
    id: 'care-ministry',
    name: 'Care Ministry',
    department: 'Care',
    leader: 'Leilani Hearne',
    description:
      'Comes alongside people in crisis, illness, grief, or hardship with meals, visits, practical help, and emotional support. Suits gifts of mercy, helps, and hospitality.',
  },
  {
    id: 'cleansing-stream',
    name: 'Cleansing Stream',
    department: 'Care',
    leader: 'Lance Sokugawa',
    description:
      'A discipleship course guiding believers into freedom, inner healing, and spiritual growth. Suits those who love praying with people toward wholeness and walking alongside them.',
  },
  {
    id: 'emergency-response-team',
    name: 'Emergency Response Team',
    department: 'Care',
    leader: 'Leilani Hearne',
    description:
      'Mobilizes to serve the congregation and community during emergencies and disasters. Suits calm, dependable, action-oriented servants who stay steady under pressure.',
  },
  {
    id: 'foster-families',
    name: 'Foster Families',
    department: 'Care',
    leader: 'Leilani Hearne',
    description:
      'Supports and encourages foster and adoptive families in the church and community. Suits those with a heart for vulnerable children and for coming around families.',
  },
  {
    id: 'gbc-seniors',
    name: 'GBC Seniors',
    department: 'Care',
    leader: 'Eddie Asato',
    description:
      'Fellowship, care, and gatherings (including a weekly seniors small group) for the church’s older members. Suits those who honor, enjoy, and want to serve kupuna and seniors.',
  },
  {
    id: 'health-seminar',
    name: 'Health Seminar',
    department: 'Care',
    leader: 'Eddie Asato',
    description:
      'Health and wellness education outreach for the church and community. Suits those passionate about whole-person health who enjoy teaching and hosting.',
  },
  {
    id: 'mens-ministry',
    name: "Men's Ministry",
    department: 'Care',
    leader: 'Kaleo Pahukula',
    description:
      'Discipleship, fellowship, and accountability among the men of the church. Suits men who love building brotherhood and helping others grow.',
  },
  {
    id: 'womens-ministry',
    name: "Women's Ministry",
    department: 'Care',
    leader: 'Andrea Pahukula',
    description:
      'Discipleship, fellowship, and encouragement among the women of the church. Suits women who love nurturing community and helping others grow.',
  },

  // ── Prayer & Intercession ─────────────────────────────────────────────────────
  {
    id: 'prayer-intercession',
    name: 'Prayer & Intercession',
    department: 'Prayer',
    leader: 'Robin Ventura',
    description:
      'Undergirds the church in prayer and prays with people for healing and needs — including the Intercessors groups and the Prayer Pocket (Zoom). Suits those with a strong prayer life and a heart to intercede.',
  },

  // ── Children ──────────────────────────────────────────────────────────────────
  {
    id: 'childrens-ministry',
    name: "Children's Ministry",
    department: 'Children',
    leader: 'Dana Ventura',
    description:
      'Teaches, cares for, and leads kids from nursery and toddlers through 5th grade (Little K, Kindergarten, Elementary) — including Sunday kids church roles: registration, teachers, classroom helpers, and the Ohana Day team. Suits those who love children and creating a fun, safe place to meet Jesus.',
  },

  // ── Youth ─────────────────────────────────────────────────────────────────────
  {
    id: 'youth-ministry',
    name: 'Youth Ministry',
    department: 'Youth',
    leader: 'Zachary Fetalvero',
    description:
      'Disciples and mentors middle school and high school students (leaders Justin Barlahan and Zachary Fetalvero). Suits those energized by teenagers who want to shape the next generation.',
  },

  // ── Worship ───────────────────────────────────────────────────────────────────
  {
    id: 'worship-ministry',
    name: 'Worship Ministry',
    department: 'Worship',
    description:
      'Leads the congregation in worship through music, vocals, and instruments (plus the worship small group). Suits musically gifted, creative servants who love ushering people into God’s presence.',
  },

  // ── Outreach ──────────────────────────────────────────────────────────────────
  {
    id: 'missions',
    name: 'Missions',
    department: 'Outreach',
    leader: 'Leilani Hearne',
    description:
      'Supports and participates in local and global missions. Suits those with a heart for the nations, evangelism, and cross-cultural service.',
  },
  {
    id: 'myanmar-partners',
    name: 'Myanmar Partners',
    department: 'Outreach',
    leader: 'Andrea Pahukula',
    description:
      'Partnership supporting ministry and workers in Myanmar. Suits those drawn to global missions and long-term cross-cultural partnership.',
  },
  {
    id: 'feed-my-sheep',
    name: 'Feed My Sheep',
    department: 'Outreach',
    leader: 'Andrea Pahukula',
    description:
      'Food distribution to families and individuals in need across Maui. Suits practical, compassionate servants who love meeting tangible needs.',
  },
  {
    id: 'operation-christmas-child',
    name: 'Operation Christmas Child (OCC)',
    department: 'Outreach',
    leader: 'Debbie Rodrigues',
    description:
      'Packing and sending shoebox gifts to children around the world (Samaritan’s Purse). Suits generous, organized servants with a heart for kids and global outreach.',
  },
  {
    id: 'wed-night-help',
    name: 'Wednesday Night Help',
    department: 'Outreach',
    leader: 'Andrea Pahukula',
    description:
      'Midweek serving and community assistance. Suits dependable, hands-on volunteers who like showing up and pitching in.',
  },
  {
    id: 'hula',
    name: 'Hula',
    department: 'Outreach',
    leader: 'Patti Keau',
    description:
      'A hula connect group using culture and dance to build relationships and worship. Suits those who love Hawaiian culture, movement, and relational ministry.',
  },
  {
    id: 'pickleball',
    name: 'Pickleball',
    department: 'Outreach',
    leader: 'Saburo Matsushita',
    description:
      'A recreation connect group building relationships through pickleball. Suits active, social people who make newcomers feel welcome through play.',
  },
  {
    id: 'tennis',
    name: 'Tennis',
    department: 'Outreach',
    leader: 'Eddie Asato',
    description:
      'A recreation connect group building relationships through tennis. Suits active, social people who connect with others through sport.',
  },

  // ── Small Groups (collapsed to types) ─────────────────────────────────────────
  {
    id: 'discipleship-small-groups',
    name: 'Discipleship Small Groups',
    department: 'Small Groups',
    description:
      'Weekly small groups across the week (in-person and Zoom) for Bible study, discipleship, and community. The coach places the person in a specific group by schedule and fit. Suits those who love close community and growing with others.',
  },
  {
    id: 'young-adults-group',
    name: 'Young Adults Group',
    department: 'Small Groups',
    leader: 'Jaxson Pahukula',
    description:
      'A weekly small group community for young adults. Suits young adults looking for discipleship, friendship, and belonging with their peers.',
  },

  // ── Administration (serving areas only) ───────────────────────────────────────
  {
    id: 'facilities',
    name: 'Facilities',
    department: 'Administration',
    leader: 'Mike Hearne',
    description:
      'Maintains, repairs, and sets up the church buildings and grounds. Suits hands-on servants with gifts of helps and craftsmanship.',
  },
  {
    id: 'church-work-days',
    name: 'Church Work Days',
    department: 'Administration',
    leader: 'Andrea Pahukula',
    description:
      'Periodic all-hands work days to maintain and improve the campus. Suits practical, willing volunteers who enjoy serving shoulder-to-shoulder.',
  },
  {
    id: 'special-events',
    name: 'Special Events',
    department: 'Administration',
    leader: 'Shahlise Wainui',
    description:
      'Plans and runs church events end-to-end. Suits organized, hospitable, detail-oriented people with gifts of administration and helps.',
  },
  {
    id: 'preschool',
    name: 'Preschool',
    department: 'Administration',
    leader: 'Sharina Husted',
    description:
      'The church’s preschool. Suits those who love young children and early education and want to invest in the youngest keiki.',
  },
  {
    id: 'accounting',
    name: 'Accounting',
    department: 'Administration',
    leader: 'Sue Whitney',
    description:
      'Financial stewardship and bookkeeping for the church. Suits detail-oriented, trustworthy people with gifts of administration and a head for numbers.',
  },

  // ── Sunday Serving (weekly volunteer teams) ───────────────────────────────────
  {
    id: 'connect-table',
    name: 'Connect Table — Welcome & Hospitality',
    department: 'Sunday Serving',
    description:
      'The Sunday welcome team: greeters, ushers and lead ushers, parking, and hospitality. Suits warm, outgoing, servant-hearted people who make guests feel seen and at home the moment they arrive.',
  },
  {
    id: 'operations-production',
    name: 'Operations — Production & Media',
    department: 'Sunday Serving',
    description:
      'Runs Sunday services behind the scenes: slides (PPT and online), video and livestream, sound, and social media. Suits detail-oriented, tech-minded, calm-under-pressure servants — and creative communicators for the media/social side.',
  },
]

// Ordered list of departments (for grouping in the prompt and the UI).
export const MINISTRY_DEPARTMENTS = [
  'Care',
  'Prayer',
  'Children',
  'Youth',
  'Worship',
  'Outreach',
  'Small Groups',
  'Administration',
  'Sunday Serving',
] as const

// Renders the roster as a compact, grouped text block for the AI prompt.
export function formatMinistriesForPrompt(): string {
  const byDept = new Map<string, Ministry[]>()
  for (const m of MINISTRIES) {
    const list = byDept.get(m.department) ?? []
    list.push(m)
    byDept.set(m.department, list)
  }
  const depts = [
    ...MINISTRY_DEPARTMENTS.filter((d) => byDept.has(d)),
    ...[...byDept.keys()].filter((d) => !MINISTRY_DEPARTMENTS.includes(d as never)),
  ]
  const blocks = depts.map((dept) => {
    const lines = (byDept.get(dept) ?? [])
      .map((m) => {
        const contact = m.leader ? ` (contact: ${m.leader})` : ''
        return `- ${m.name}${contact}: ${m.description}`
      })
      .join('\n')
    return `${dept}:\n${lines}`
  })
  return blocks.join('\n\n')
}

// The exact set of ministry names the model is allowed to return, for validation.
export const MINISTRY_NAMES = MINISTRIES.map((m) => m.name)
