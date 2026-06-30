import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'
import { writeFile, readFile, unlink, chmod, copyFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import ffmpegStatic from 'ffmpeg-static'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Transcode an uploaded video to MP4 (H.264/AAC) so it plays on EVERY device —
// iPhones/Safari can't play webm at all. Returns the new public MP4 url.
export async function POST(req: NextRequest) {
  try {
    const { bucket, path } = await req.json()
    if (!bucket || !path) return NextResponse.json({ error: 'bucket and path required' }, { status: 400 })

    // Already MP4 — nothing to do.
    if (String(path).toLowerCase().endsWith('.mp4')) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      return NextResponse.json({ url: data.publicUrl, transcoded: false })
    }

    const ffmpegPath = ffmpegStatic as unknown as string | null
    if (!ffmpegPath) return NextResponse.json({ error: 'ffmpeg unavailable' }, { status: 500 })

    const { data: file, error: dErr } = await supabase.storage.from(bucket).download(path)
    if (dErr || !file) return NextResponse.json({ error: dErr?.message || 'download failed' }, { status: 500 })
    const inBuf = Buffer.from(await file.arrayBuffer())

    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`
    const inPath = join(tmpdir(), `in-${stamp}`)
    const outPath = join(tmpdir(), `out-${stamp}.mp4`)
    // Copy the binary to a writable tmp path and ensure it's executable (the
    // bundled node_modules copy can be read-only / lose the +x bit).
    const binPath = join(tmpdir(), `ffmpeg-${stamp}`)
    await copyFile(ffmpegPath, binPath)
    await chmod(binPath, 0o755)
    await writeFile(inPath, inBuf)

    await new Promise<void>((resolve, reject) => {
      const p = spawn(binPath, [
        '-y', '-i', inPath,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
        '-vf', "scale='min(1280,iw)':-2",
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', outPath,
      ])
      let err = ''
      p.stderr.on('data', d => { err += d.toString() })
      p.on('error', reject)
      p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-500)}`)))
    })

    const outBuf = await readFile(outPath)
    const mp4Path = String(path).replace(/\.[^./]+$/, '') + `-${stamp}.mp4`
    const { error: uErr } = await supabase.storage.from(bucket).upload(mp4Path, outBuf, { contentType: 'video/mp4', upsert: false })

    await Promise.allSettled([unlink(inPath), unlink(outPath), unlink(binPath)])

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(mp4Path)
    return NextResponse.json({ url: pub.publicUrl, transcoded: true })
  } catch (e) {
    console.error('Transcode error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'transcode failed' }, { status: 500 })
  }
}
