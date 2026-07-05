import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Rotate an entry's photo(s) by `degrees` (clockwise) and repoint every entry
// that references the same photo (one imported photo can back several split
// entries, so a single rotate fixes them all).
export async function POST(request: NextRequest) {
  try {
    const { journalId, degrees } = await request.json()
    const deg = ((Number(degrees) % 360) + 360) % 360
    if (!journalId || (deg !== 90 && deg !== 180 && deg !== 270)) {
      return NextResponse.json({ error: 'journalId and degrees (90/180/270) required' }, { status: 400 })
    }

    const { data: journal, error } = await supabase
      .from('soap_journals')
      .select('id, person_id, photo_url, photo_urls')
      .eq('id', journalId)
      .single()
    if (error || !journal) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

    const photos: string[] = (journal.photo_urls?.length ? journal.photo_urls : [journal.photo_url]).filter(Boolean)
    if (!photos.length) return NextResponse.json({ error: 'No photo to rotate' }, { status: 400 })

    // Rotate each distinct photo and map old url -> new url.
    const urlMap: Record<string, string> = {}
    for (const old of photos) {
      const res = await fetch(old)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      const rotated = await sharp(buf).rotate(deg).jpeg({ quality: 85 }).toBuffer()
      const path = `${journal.person_id}/${Date.now()}-${Math.round(Math.random() * 1e6)}-rot.jpg`
      const { error: upErr } = await supabase.storage.from('soap-photos').upload(path, rotated, { contentType: 'image/jpeg', upsert: false })
      if (upErr) continue
      urlMap[old] = supabase.storage.from('soap-photos').getPublicUrl(path).data.publicUrl
    }
    if (!Object.keys(urlMap).length) return NextResponse.json({ error: 'Rotation failed' }, { status: 500 })

    // Repoint every entry (this person) that references any of these photos.
    const { data: affected } = await supabase
      .from('soap_journals')
      .select('id, photo_url, photo_urls')
      .eq('person_id', journal.person_id)
      .or(`photo_url.in.(${photos.map(p => `"${p}"`).join(',')}),photo_urls.ov.{${photos.map(p => `"${p}"`).join(',')}}`)
    for (const row of (affected as { id: string; photo_url: string | null; photo_urls: string[] | null }[]) ?? []) {
      const newUrls = (row.photo_urls ?? []).map(u => urlMap[u] ?? u)
      const newUrl = row.photo_url && urlMap[row.photo_url] ? urlMap[row.photo_url] : row.photo_url
      await supabase.from('soap_journals').update({ photo_url: newUrl, photo_urls: newUrls.length ? newUrls : row.photo_urls, updated_at: new Date().toISOString() }).eq('id', row.id)
    }

    const newPrimary = (journal.photo_url && urlMap[journal.photo_url]) || Object.values(urlMap)[0] || null
    return NextResponse.json({ ok: true, rotated: Object.keys(urlMap).length, url: newPrimary })
  } catch (e) {
    console.error('Rotate error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'rotate failed' }, { status: 500 })
  }
}
