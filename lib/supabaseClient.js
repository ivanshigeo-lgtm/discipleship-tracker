import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yddjlhdptsundeimugba.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZGpsaGRwdHN1bmRlaW11Z2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDI1OTUsImV4cCI6MjA5NTUxODU5NX0.9noWlySqIcSJE_YBQPtjXkDCBL0ttkqom3vuVhHIGag'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
