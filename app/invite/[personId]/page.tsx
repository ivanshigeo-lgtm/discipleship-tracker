import { redirect } from 'next/navigation'

// The old anonymous claim page read `people` before login, which the RLS
// lockdown broke ("Profile not found"). Invite links now route through the
// open self-service wizard, which claims the profile server-side (service role).
// Kept as a redirect so any invite links already shared keep working.
export default async function InviteRedirect({
  params,
}: {
  params: Promise<{ personId: string }>
}) {
  const { personId } = await params
  redirect(`/sign-up?claim=${personId}`)
}
