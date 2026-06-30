import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Upload a short prayer/praise video to the public prayer-media bucket.
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const personId = formData.get('personId') as string | null

  if (!file || !personId) {
    return NextResponse.json({ error: 'file and personId required' }, { status: 400 })
  }

  // Generous cap for a ~2-min modest-quality clip.
  if (file.size > 80 * 1024 * 1024) {
    return NextResponse.json({ error: 'Video too large (80MB max). Try a shorter or lower-quality clip.' }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() || 'webm').toLowerCase()
  const path = `${personId}/${Date.now()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: upErr } = await supabase.storage
    .from('prayer-media')
    .upload(path, buffer, { contentType: file.type || 'video/webm', upsert: false })

  if (upErr) {
    console.error('Prayer video upload error:', upErr)
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data } = supabase.storage.from('prayer-media').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl, path })
}
