// AUTO-GENERATED spiritual-gifts instrument (Wagner-Modified Houts, 25 gifts).
// Each gift is measured by 4 statements rated 0-3 (Never/Seldom/Sometimes/Always).
// Score per gift = sum of its 4 answers (0-12). Top gifts = highest scores.
// Keep this file in sync between the web app and the native app.

export type GiftKey =
    'administration'
  | 'apostleship'
  | 'celibacy'
  | 'discernment'
  | 'evangelism'
  | 'exhortation'
  | 'faith'
  | 'giving'
  | 'healing'
  | 'helps'
  | 'hospitality'
  | 'intercession'
  | 'interpretation'
  | 'knowledge'
  | 'leadership'
  | 'martyrdom'
  | 'mercy'
  | 'miracles'
  | 'missionary'
  | 'pastor'
  | 'prophecy'
  | 'service'
  | 'teaching'
  | 'tongues'
  | 'wisdom'

export const SCALE = [
  { value: 0, label: 'Never' },
  { value: 1, label: 'Seldom' },
  { value: 2, label: 'Sometimes' },
  { value: 3, label: 'Always' },
] as const

export type Gift = { key: GiftKey; name: string; description: string; ministries: string[]; questions: string[] }

export const GIFTS: Gift[] = [
  {
    key: 'administration',
    name: 'Administration',
    description: 'Organizing people, resources, and plans so a ministry reaches its goals effectively.',
    ministries: ['Ministry operations & logistics', 'Event coordination', 'Serve-team scheduling'],
    questions: [
      'I easily delegate important responsibilities to others.',
      'I enjoy overseeing work that needs to be done.',
      'I am able to organize ideas, people, things and time for more effective ministry.',
      'I am able to set goals and to make effective plans to reach them.',
    ],
  },
  {
    key: 'apostleship',
    name: 'Apostleship',
    description: 'Being sent to launch and oversee new ministries or churches across many congregations.',
    ministries: ['Church planting / new sites', 'Launching new ministries', 'Network & multi-group leadership'],
    questions: [
      'I feel that when I speak on church matters, people listen and gain something from what I say.',
      'I am comfortable and effective in projects that necessitate my being around many different congregations.',
      'I enjoy proclaiming the Gospel to other congregations for the purpose of building up the Body of Christ.',
      'I feel called to be sent out by my church to start new ministries.',
    ],
  },
  {
    key: 'celibacy',
    name: 'Celibacy',
    description: 'A contented single life freely given to serve God without the responsibilities of marriage.',
    ministries: ['Singles ministry', 'Missions requiring mobility', 'Focused seasonal serving'],
    questions: [
      'I am single and am enjoying it.',
      'I feel indifferent towards being married.',
      'I am glad to have more time to serve the Lord because I am single.',
      'I am drawn to a life without sexual fulfillment.',
    ],
  },
  {
    key: 'discernment',
    name: 'Discernment',
    description: 'Perceiving whether something is of the Holy Spirit, the human spirit, or the enemy.',
    ministries: ['Prayer & intercession teams', 'Counsel to leaders', 'Spiritual-care ministry'],
    questions: [
      'I clearly perceive the difference between truth and error.',
      'I clearly perceive the difference between good and evil.',
      'I perceive evil in time to combat it effectively.',
      'I am aware of the presence of evil spirits in certain persons, places, and things.',
    ],
  },
  {
    key: 'evangelism',
    name: 'Evangelism',
    description: 'Sharing the Gospel so that unbelievers respond and become followers of Jesus.',
    ministries: ['Outreach & guest follow-up', 'Missions trips', 'Share-your-faith training'],
    questions: [
      'I share joyfully with others about why I am a Christian.',
      'I long to pray with others that may receive Christ as Lord and Savior.',
      'I am happy to talk about my Christian faith at my work or in social and community gatherings.',
      'I continue to seek out friends and acquaintances who do not go to church, in order to bring them to my church.',
    ],
  },
  {
    key: 'exhortation',
    name: 'Exhortation',
    description: 'Coming alongside others with comfort, encouragement, and counsel that spurs them on.',
    ministries: ['Discipleship & coaching', 'Care / counseling teams', 'Grace Group leading'],
    questions: [
      'I am verbally encouraging to those who are wavering, troubled or discouraged.',
      'I verbally challenge those who seem spiritually apathetic.',
      'I apprise (to inform) others of spiritual dangers.',
      'I am able to counsel effectively the perplexed, guilty, or the addicted.',
    ],
  },
  {
    key: 'faith',
    name: 'Faith',
    description: 'Extraordinary confidence in God\'s promises that steps out boldly for His purposes.',
    ministries: ['Prayer & intercession', 'Vision / launch teams', 'Faith-step initiatives'],
    questions: [
      'I believe God will keep His promises in spite of circumstantial evidence.',
      'I trust God rather than circumstances.',
      'I trust in the presence and in the power of God to do the impossible.',
      'I "hang in there" because God said to.',
    ],
  },
  {
    key: 'giving',
    name: 'Giving',
    description: 'Joyfully and generously contributing resources to advance God\'s work.',
    ministries: ['Generosity & stewardship', 'Benevolence fund', 'Resourcing missions'],
    questions: [
      'I give away more than 10% of my income.',
      'I like to share what I have with others for the extension of God\'s kingdom.',
      'I liberally give things or money to the Lord\'s work.',
      'I live to do the work of the Lord with delight and love.',
    ],
  },
  {
    key: 'healing',
    name: 'Healing',
    description: 'Being God\'s means to restore health beyond what natural means would explain.',
    ministries: ['Prayer ministry', 'Healing / prayer teams', 'Hospital visitation'],
    questions: [
      'I am sought out by others for healing prayers.',
      'I find that the Lord works actively through me to bring wholeness to other people.',
      'When I pray, healing occurs.',
      'When praying for someone to be healed, I feel a deep awareness of the presence of God.',
    ],
  },
  {
    key: 'helps',
    name: 'Helps',
    description: 'Quietly supporting and assisting others so their ministry can flourish.',
    ministries: ['Serve teams (setup/teardown)', 'Behind-the-scenes support', 'Hospitality logistics'],
    questions: [
      'I feel useful when doing routine things if they will help someone else.',
      'I enjoy supporting people in their special ministries.',
      'I enjoy being called on to assist others in a variety of ways.',
      'I am willing to do time-consuming detail work to aid others.',
    ],
  },
  {
    key: 'hospitality',
    name: 'Hospitality',
    description: 'Warmly welcoming guests and strangers and making them feel at home.',
    ministries: ['Welcome / first-impressions team', 'Hosting a Grace Group', 'Meals & connections'],
    questions: [
      'I like meeting new people.',
      'I graciously provide food and lodging to those in need.',
      'I am able to make a stranger feel comfortable in my home, at meetings, or at church.',
      'I have a knack for making strangers feel at home.',
    ],
  },
  {
    key: 'intercession',
    name: 'Intercession',
    description: 'Praying for others at length and regularly, and seeing frequent answers.',
    ministries: ['Prayer teams & prayer chain', 'Covering leaders in prayer', 'Missions intercession'],
    questions: [
      'I take prayer requests seriously.',
      'Praying for others is as natural to me as trying to help them.',
      'I am persistent in prayer for others.',
      'God answers my prayers for others in a tangible way.',
    ],
  },
  {
    key: 'interpretation',
    name: 'Interpretation of Tongues',
    description: 'Making the message of someone speaking in tongues known to the church.',
    ministries: ['Prayer & worship ministry (where practiced)'],
    questions: [
      'I have interpreted tongues in a way that is not divisive.',
      'I am eager to interpret if someone begins to speak in tongues.',
      'When someone speaks out in tongues, God gives me the interpretations.',
      'I feel that God gives me the interpretation to a message in tongues, even though I\'m uneasy about speaking out.',
    ],
  },
  {
    key: 'knowledge',
    name: 'Word of Knowledge',
    description: 'Receiving and communicating truth God reveals for a specific situation.',
    ministries: ['Prayer ministry', 'Teaching & study prep', 'Counsel to leaders'],
    questions: [
      'I have insights of truth which bring enlightenment to other Christians.',
      'I have an inspired awareness of facts of God.',
      'I receive a word from God which enlightens my prayer or ministry.',
      'I am able to recognize key and important facts of the Scriptures.',
    ],
  },
  {
    key: 'leadership',
    name: 'Leadership',
    description: 'Casting vision and directing others toward accomplishing God\'s purposes together.',
    ministries: ['Grace Group leadership', 'Ministry team lead', 'Vision & elder pathways'],
    questions: [
      'I can inspire people to do things that need to be done.',
      'When I take charge of a project, my concern is divided between reaching the goal that has been set, and taking care of the welfare of those who work with me.',
      'I feel confident in directing others towards accomplishing a goal.',
      'I am able to lead a group in making decisions.',
    ],
  },
  {
    key: 'martyrdom',
    name: 'Martyrdom',
    description: 'Facing suffering or persecution for the faith with a Christ-honoring attitude.',
    ministries: ['Missions to hard places', 'Persecuted-church advocacy', 'Bold public witness'],
    questions: [
      'If feel that my actions are in accord with God\'s will, I do not consider the consequences of those actions.',
      'I have lost friends because of stands that I felt I had to take because of my Christian faith.',
      'Suffering physical persecution for my faith is not a major concern.',
      'I will joyfully stick my neck out if I feel that God wants me to.',
    ],
  },
  {
    key: 'mercy',
    name: 'Mercy',
    description: 'Feeling genuine compassion for those who suffer and acting to ease their distress.',
    ministries: ['Care ministry', 'Hospital / shut-in visitation', 'Recovery & support groups'],
    questions: [
      'By nature I am a "Good Samaritan".',
      'I can talk easily with prisoners or lonely shut-ins.',
      'I visit people who are in hospitals, jail or nursing homes, and feel blessed by it.',
      'I feel blessed by helping someone who is "down and out".',
    ],
  },
  {
    key: 'miracles',
    name: 'Miracle Working',
    description: 'Being God\'s instrument for acts that alter the ordinary course of nature.',
    ministries: ['Prayer ministry', 'Healing teams', 'Missions'],
    questions: [
      'In the name of the Lord, I have been used to miraculously change circumstances.',
      'I have been used as an instrument for God\'s supernatural change in lives and events.',
      'Because of my intercession, God has acted in a direct way to bring about a healing.',
      'At times God has intervened to do impossible things through me.',
    ],
  },
  {
    key: 'missionary',
    name: 'Missionary',
    description: 'Ministering the Gospel effectively within a culture other than your own.',
    ministries: ['Cross-cultural missions', 'Local outreach to other cultures', 'Missions support'],
    questions: [
      'I would like to visit a different culture in order to evangelize.',
      'I feel a yearning to learn another language in order to minister to a different people.',
      'I would enjoy being able to start new churches in a different culture.',
      'I fit in easily and feel at home with people whose lifestyles differ from my own.',
    ],
  },
  {
    key: 'pastor',
    name: 'Shepherding (Pastor)',
    description: 'Caring for the long-term spiritual welfare of a group of believers.',
    ministries: ['Grace Group shepherding', 'Discipleship & coaching', 'Care & follow-up'],
    questions: [
      'I enjoy taking responsibility for the spiritual growth of other Christians.',
      'I go out of my way to be available to someone needing support, particularly Christians who have questions about their faith.',
      'I know and am well-known by others for whom I am a spiritual and emotional support.',
      'Other Christians seek me out for encouragement and guidance.',
    ],
  },
  {
    key: 'prophecy',
    name: 'Words of Prophecy',
    description: 'Declaring God\'s message to build up, encourage, or call the church to obedience.',
    ministries: ['Prayer & worship ministry', 'Encouragement ministry', 'Preaching & exhortation'],
    questions: [
      'I say things which I feel to be God\'s truth and often find in doing so I irritate people.',
      'I can communicate timely and urgent messages which I feel come directly from God.',
      'I feel God gives me a message for the assembled church, though I may be afraid to speak out.',
      'I speak out boldly concerning what I feel is God\'s will in specific situations.',
    ],
  },
  {
    key: 'service',
    name: 'Service',
    description: 'Spotting practical needs and meeting them to keep the body running.',
    ministries: ['Serve teams & facilities', 'Practical-needs ministry', 'Hospitality setup'],
    questions: [
      'I feel fulfilled in my Christian vocation by accepting responsibilities that seldom get me in the limelight.',
      'I feel fulfilled by giving time for the benefit of others who are in need.',
      'I feel fulfilled when I assist those who feel defeated.',
      'I am willing to take orders rather than to give them.',
    ],
  },
  {
    key: 'teaching',
    name: 'Teaching',
    description: 'Explaining and applying God\'s Word so others understand and grow.',
    ministries: ['Bible teaching', 'Kids / youth teaching', 'Discipleship curriculum'],
    questions: [
      'I enjoy developing ways of presenting material so that others are able to more easily learn.',
      'I like being responsible for imparting knowledge to others.',
      'I can explain passages in the Bible so that others are able to discover what the passage means.',
      'I enjoy explaining what something means.',
    ],
  },
  {
    key: 'tongues',
    name: 'Gift of Tongues',
    description: 'Speaking to God in a language never learned, for personal or corporate edification.',
    ministries: ['Personal prayer rhythm', 'Prayer ministry (where practiced)'],
    questions: [
      'I have spoken in tongues which were interpreted by another in public.',
      'I have spoken out in tongues at a prayer meeting.',
      'When I give a message in tongues, it is a profoundly moving experience.',
      'I feel that God gives me a message in tongues for the assembled church even though I am too timid to speak.',
    ],
  },
  {
    key: 'wisdom',
    name: 'Word of Wisdom',
    description: 'Applying spiritual insight skillfully to real-life decisions.',
    ministries: ['Leadership counsel', 'Mentoring & coaching', 'Decision-making teams'],
    questions: [
      'I am intuitive in my understanding of people\'s needs.',
      'I don\'t have to think much to reach decisions; most of the time the alternatives seem very obvious.',
      'I minister to others by helping them clarify alternatives and by making them aware of the Spirit within them.',
      'I am able to recognize the spiritual gifts of others.',
    ],
  },
]

export const GIFT_BY_KEY: Record<GiftKey, Gift> = Object.fromEntries(GIFTS.map(g => [g.key, g])) as Record<GiftKey, Gift>

export type Question = { id: number; gift: GiftKey; text: string }

export const QUESTIONS: Question[] = [
  { id: 1, gift: 'administration', text: 'I easily delegate important responsibilities to others.' },
  { id: 2, gift: 'apostleship', text: 'I feel that when I speak on church matters, people listen and gain something from what I say.' },
  { id: 3, gift: 'celibacy', text: 'I am single and am enjoying it.' },
  { id: 4, gift: 'discernment', text: 'I clearly perceive the difference between truth and error.' },
  { id: 5, gift: 'evangelism', text: 'I share joyfully with others about why I am a Christian.' },
  { id: 6, gift: 'exhortation', text: 'I am verbally encouraging to those who are wavering, troubled or discouraged.' },
  { id: 7, gift: 'faith', text: 'I believe God will keep His promises in spite of circumstantial evidence.' },
  { id: 8, gift: 'giving', text: 'I give away more than 10% of my income.' },
  { id: 9, gift: 'healing', text: 'I am sought out by others for healing prayers.' },
  { id: 10, gift: 'helps', text: 'I feel useful when doing routine things if they will help someone else.' },
  { id: 11, gift: 'hospitality', text: 'I like meeting new people.' },
  { id: 12, gift: 'intercession', text: 'I take prayer requests seriously.' },
  { id: 13, gift: 'interpretation', text: 'I have interpreted tongues in a way that is not divisive.' },
  { id: 14, gift: 'knowledge', text: 'I have insights of truth which bring enlightenment to other Christians.' },
  { id: 15, gift: 'leadership', text: 'I can inspire people to do things that need to be done.' },
  { id: 16, gift: 'martyrdom', text: 'If feel that my actions are in accord with God\'s will, I do not consider the consequences of those actions.' },
  { id: 17, gift: 'mercy', text: 'By nature I am a "Good Samaritan".' },
  { id: 18, gift: 'miracles', text: 'In the name of the Lord, I have been used to miraculously change circumstances.' },
  { id: 19, gift: 'missionary', text: 'I would like to visit a different culture in order to evangelize.' },
  { id: 20, gift: 'pastor', text: 'I enjoy taking responsibility for the spiritual growth of other Christians.' },
  { id: 21, gift: 'prophecy', text: 'I say things which I feel to be God\'s truth and often find in doing so I irritate people.' },
  { id: 22, gift: 'service', text: 'I feel fulfilled in my Christian vocation by accepting responsibilities that seldom get me in the limelight.' },
  { id: 23, gift: 'teaching', text: 'I enjoy developing ways of presenting material so that others are able to more easily learn.' },
  { id: 24, gift: 'tongues', text: 'I have spoken in tongues which were interpreted by another in public.' },
  { id: 25, gift: 'wisdom', text: 'I am intuitive in my understanding of people\'s needs.' },
  { id: 26, gift: 'apostleship', text: 'I am comfortable and effective in projects that necessitate my being around many different congregations.' },
  { id: 27, gift: 'celibacy', text: 'I feel indifferent towards being married.' },
  { id: 28, gift: 'discernment', text: 'I clearly perceive the difference between good and evil.' },
  { id: 29, gift: 'evangelism', text: 'I long to pray with others that may receive Christ as Lord and Savior.' },
  { id: 30, gift: 'exhortation', text: 'I verbally challenge those who seem spiritually apathetic.' },
  { id: 31, gift: 'faith', text: 'I trust God rather than circumstances.' },
  { id: 32, gift: 'giving', text: 'I like to share what I have with others for the extension of God\'s kingdom.' },
  { id: 33, gift: 'healing', text: 'I find that the Lord works actively through me to bring wholeness to other people.' },
  { id: 34, gift: 'helps', text: 'I enjoy supporting people in their special ministries.' },
  { id: 35, gift: 'hospitality', text: 'I graciously provide food and lodging to those in need.' },
  { id: 36, gift: 'intercession', text: 'Praying for others is as natural to me as trying to help them.' },
  { id: 37, gift: 'interpretation', text: 'I am eager to interpret if someone begins to speak in tongues.' },
  { id: 38, gift: 'knowledge', text: 'I have an inspired awareness of facts of God.' },
  { id: 39, gift: 'leadership', text: 'When I take charge of a project, my concern is divided between reaching the goal that has been set, and taking care of the welfare of those who work with me.' },
  { id: 40, gift: 'martyrdom', text: 'I have lost friends because of stands that I felt I had to take because of my Christian faith.' },
  { id: 41, gift: 'mercy', text: 'I can talk easily with prisoners or lonely shut-ins.' },
  { id: 42, gift: 'miracles', text: 'I have been used as an instrument for God\'s supernatural change in lives and events.' },
  { id: 43, gift: 'missionary', text: 'I feel a yearning to learn another language in order to minister to a different people.' },
  { id: 44, gift: 'pastor', text: 'I go out of my way to be available to someone needing support, particularly Christians who have questions about their faith.' },
  { id: 45, gift: 'prophecy', text: 'I can communicate timely and urgent messages which I feel come directly from God.' },
  { id: 46, gift: 'service', text: 'I feel fulfilled by giving time for the benefit of others who are in need.' },
  { id: 47, gift: 'teaching', text: 'I like being responsible for imparting knowledge to others.' },
  { id: 48, gift: 'tongues', text: 'I have spoken out in tongues at a prayer meeting.' },
  { id: 49, gift: 'wisdom', text: 'I don\'t have to think much to reach decisions; most of the time the alternatives seem very obvious.' },
  { id: 50, gift: 'administration', text: 'I enjoy overseeing work that needs to be done.' },
  { id: 51, gift: 'celibacy', text: 'I am glad to have more time to serve the Lord because I am single.' },
  { id: 52, gift: 'discernment', text: 'I perceive evil in time to combat it effectively.' },
  { id: 53, gift: 'evangelism', text: 'I am happy to talk about my Christian faith at my work or in social and community gatherings.' },
  { id: 54, gift: 'exhortation', text: 'I apprise (to inform) others of spiritual dangers.' },
  { id: 55, gift: 'faith', text: 'I trust in the presence and in the power of God to do the impossible.' },
  { id: 56, gift: 'giving', text: 'I liberally give things or money to the Lord\'s work.' },
  { id: 57, gift: 'healing', text: 'When I pray, healing occurs.' },
  { id: 58, gift: 'helps', text: 'I enjoy being called on to assist others in a variety of ways.' },
  { id: 59, gift: 'hospitality', text: 'I am able to make a stranger feel comfortable in my home, at meetings, or at church.' },
  { id: 60, gift: 'intercession', text: 'I am persistent in prayer for others.' },
  { id: 61, gift: 'interpretation', text: 'When someone speaks out in tongues, God gives me the interpretations.' },
  { id: 62, gift: 'knowledge', text: 'I receive a word from God which enlightens my prayer or ministry.' },
  { id: 63, gift: 'leadership', text: 'I feel confident in directing others towards accomplishing a goal.' },
  { id: 64, gift: 'martyrdom', text: 'Suffering physical persecution for my faith is not a major concern.' },
  { id: 65, gift: 'mercy', text: 'I visit people who are in hospitals, jail or nursing homes, and feel blessed by it.' },
  { id: 66, gift: 'miracles', text: 'Because of my intercession, God has acted in a direct way to bring about a healing.' },
  { id: 67, gift: 'missionary', text: 'I would enjoy being able to start new churches in a different culture.' },
  { id: 68, gift: 'pastor', text: 'I know and am well-known by others for whom I am a spiritual and emotional support.' },
  { id: 69, gift: 'prophecy', text: 'I feel God gives me a message for the assembled church, though I may be afraid to speak out.' },
  { id: 70, gift: 'service', text: 'I feel fulfilled when I assist those who feel defeated.' },
  { id: 71, gift: 'teaching', text: 'I can explain passages in the Bible so that others are able to discover what the passage means.' },
  { id: 72, gift: 'tongues', text: 'When I give a message in tongues, it is a profoundly moving experience.' },
  { id: 73, gift: 'wisdom', text: 'I minister to others by helping them clarify alternatives and by making them aware of the Spirit within them.' },
  { id: 74, gift: 'administration', text: 'I am able to organize ideas, people, things and time for more effective ministry.' },
  { id: 75, gift: 'apostleship', text: 'I enjoy proclaiming the Gospel to other congregations for the purpose of building up the Body of Christ.' },
  { id: 76, gift: 'discernment', text: 'I am aware of the presence of evil spirits in certain persons, places, and things.' },
  { id: 77, gift: 'evangelism', text: 'I continue to seek out friends and acquaintances who do not go to church, in order to bring them to my church.' },
  { id: 78, gift: 'exhortation', text: 'I am able to counsel effectively the perplexed, guilty, or the addicted.' },
  { id: 79, gift: 'faith', text: 'I "hang in there" because God said to.' },
  { id: 80, gift: 'giving', text: 'I live to do the work of the Lord with delight and love.' },
  { id: 81, gift: 'healing', text: 'When praying for someone to be healed, I feel a deep awareness of the presence of God.' },
  { id: 82, gift: 'helps', text: 'I am willing to do time-consuming detail work to aid others.' },
  { id: 83, gift: 'hospitality', text: 'I have a knack for making strangers feel at home.' },
  { id: 84, gift: 'intercession', text: 'God answers my prayers for others in a tangible way.' },
  { id: 85, gift: 'interpretation', text: 'I feel that God gives me the interpretation to a message in tongues, even though I\'m uneasy about speaking out.' },
  { id: 86, gift: 'knowledge', text: 'I am able to recognize key and important facts of the Scriptures.' },
  { id: 87, gift: 'leadership', text: 'I am able to lead a group in making decisions.' },
  { id: 88, gift: 'martyrdom', text: 'I will joyfully stick my neck out if I feel that God wants me to.' },
  { id: 89, gift: 'mercy', text: 'I feel blessed by helping someone who is "down and out".' },
  { id: 90, gift: 'miracles', text: 'At times God has intervened to do impossible things through me.' },
  { id: 91, gift: 'missionary', text: 'I fit in easily and feel at home with people whose lifestyles differ from my own.' },
  { id: 92, gift: 'pastor', text: 'Other Christians seek me out for encouragement and guidance.' },
  { id: 93, gift: 'prophecy', text: 'I speak out boldly concerning what I feel is God\'s will in specific situations.' },
  { id: 94, gift: 'service', text: 'I am willing to take orders rather than to give them.' },
  { id: 95, gift: 'teaching', text: 'I enjoy explaining what something means.' },
  { id: 96, gift: 'tongues', text: 'I feel that God gives me a message in tongues for the assembled church even though I am too timid to speak.' },
  { id: 97, gift: 'wisdom', text: 'I am able to recognize the spiritual gifts of others.' },
  { id: 98, gift: 'administration', text: 'I am able to set goals and to make effective plans to reach them.' },
  { id: 99, gift: 'apostleship', text: 'I feel called to be sent out by my church to start new ministries.' },
  { id: 100, gift: 'celibacy', text: 'I am drawn to a life without sexual fulfillment.' },
]

export const TOTAL_QUESTIONS = QUESTIONS.length
export const MAX_PER_GIFT = 12

export type GiftTier = 'strong' | 'probable' | 'some' | 'little'
// Standard Houts thresholds on the 0-12 per-gift scale.
export function giftTier(score: number): GiftTier {
  if (score >= 10) return 'strong'
  if (score >= 7) return 'probable'
  if (score >= 4) return 'some'
  return 'little'
}
export const TIER_LABEL: Record<GiftTier, string> = { strong: 'Strong', probable: 'Probable', some: 'Some', little: 'Little' }

export type GiftScore = { key: GiftKey; name: string; description: string; ministries: string[]; score: number; max: number; tier: GiftTier }

// responses: map of question id -> 0..3. Returns every gift scored, ranked high→low.
export function scoreGifts(responses: Record<number, number>): GiftScore[] {
  const totals: Record<string, number> = {}
  for (const q of QUESTIONS) {
    const v = responses[q.id]
    totals[q.gift] = (totals[q.gift] ?? 0) + (typeof v === 'number' ? v : 0)
  }
  return GIFTS.map(g => {
    const score = totals[g.key] ?? 0
    return { key: g.key, name: g.name, description: g.description, ministries: g.ministries, score, max: g.questions.length * 3, tier: giftTier(score) }
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export function topGifts(responses: Record<number, number>, n = 3): GiftScore[] {
  return scoreGifts(responses).slice(0, n)
}
