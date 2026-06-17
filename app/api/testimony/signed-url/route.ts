import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const { personId, ext } = await request.json()
  if (!personId || !ext) {
    return NextResponse.json({ error: 'personId and ext required' }, { status: 400 })
  }

  const path = `${personId}/${Date.now()}.${ext}`

  const { data, error } = await supabase.storage
    .from('testimonies')
    .createSignedUploadUrl(path)

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Could not create upload URL' }, { status: 500 })
  }

  const { data: pubData } = supabase.storage.from('testimonies').getPublicUrl(path)

  return NextResponse.json({
    signedUrl: data.signedUrl,
    publicUrl: pubData.publicUrl,
  })
}
