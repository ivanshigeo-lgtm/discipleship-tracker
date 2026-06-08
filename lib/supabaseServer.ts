import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yddjlhdptsundeimugba.supabase.co'

export function getSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  }
  return createClient(supabaseUrl, serviceRoleKey)
}
