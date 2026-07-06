// Shared manuscript parsing for the book draft — used by the /book reader page
// and the global-edit API so paragraph indexes and hash keys always align.

export type Block =
  | { kind: 'h1' | 'h2' | 'chapter' | 'chtitle' | 'hr' | 'p'; text: string; id?: string }
  | { kind: 'gap'; question: string; markerKey: string }

// Stable content hash: gap answers and paragraph edits survive redeploys for
// as long as the underlying text stands (a revision retires them naturally).
export const hashOf = (s: string) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
export const hashKey = (s: string) => 'gap-' + hashOf(s)
export const paraKey = (s: string) => 'p-' + hashOf(s)

export const CHAPTER_RE = /^(Chapter\s+(\w+)|Epilogue.*)$/

export function parseManuscript(md: string): Block[] {
  const blocks: Block[] = []
  let prevWasChapter = false
  for (const raw of md.split(/\n\s*\n/)) {
    const b = raw.trim()
    if (!b) continue
    const gap = b.match(/\[FOR THE INTERVIEW:\s*([\s\S]*?)\]/)
    if (gap) {
      const q = gap[1].trim()
      blocks.push({ kind: 'gap', question: q, markerKey: hashKey(q) })
      prevWasChapter = false
      continue
    }
    if (b === '---') { blocks.push({ kind: 'hr', text: '' }); prevWasChapter = false; continue }
    if (b.startsWith('# ')) { blocks.push({ kind: 'h1', text: b.slice(2) }); prevWasChapter = false; continue }
    if (b.startsWith('## ')) { blocks.push({ kind: 'h2', text: b.slice(3) }); prevWasChapter = false; continue }
    // "Chapter One\nThe Speed of Trust" arrives as one block with a newline.
    const lines = b.split('\n').map(l => l.trim())
    if (CHAPTER_RE.test(lines[0]) && lines[0].length < 40) {
      blocks.push({ kind: 'chapter', text: lines[0], id: lines[0].toLowerCase().replace(/[^a-z0-9]+/g, '-') })
      if (lines[1]) blocks.push({ kind: 'chtitle', text: lines.slice(1).join(' ') })
      prevWasChapter = true
      continue
    }
    if (prevWasChapter && b.length < 60 && !/[.!?]$/.test(b)) {
      blocks.push({ kind: 'chtitle', text: b })
      prevWasChapter = false
      continue
    }
    blocks.push({ kind: 'p', text: b })
    prevWasChapter = false
  }
  return blocks
}
