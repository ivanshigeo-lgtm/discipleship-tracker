import { redirect } from 'next/navigation'

// Constellations home = My Journey. The coach CRM lives at /my-constellations
// (gated to the Empowered tier).
export default function Home() {
  redirect('/my-journey')
}
