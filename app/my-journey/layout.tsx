// My Journey ships often; force per-request rendering so the edge never
// serves a stale HTML shell pointing at old bundles after a deploy.
export const dynamic = 'force-dynamic'

export default function MyJourneyLayout({ children }: { children: React.ReactNode }) {
  return children
}
