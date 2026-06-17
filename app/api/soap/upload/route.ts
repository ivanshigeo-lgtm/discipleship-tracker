import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const personId = formData.get('personId') as string | null

  if (!file || !personId) {
    return NextResponse.json({ error: 'file and personId required' }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (10MB max)' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${personId}/${Date.now()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: upErr } = await supabase.storage
    .from('soap-photos')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (upErr) {
    console.error('SOAP photo upload error:', upErr)
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data } = supabase.storage.from('soap-photos').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
