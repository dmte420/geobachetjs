import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zlsnnwavxrwssuqhtwbp.supabase.co'
const supabaseAnonKey = 'sb_publishable_KXUIIk0Rg45ienBvw3YrFg__G1BTsiW'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { 
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: { 
    fetch: (...args) => fetch(...args) 
  },
})