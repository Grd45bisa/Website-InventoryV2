import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase.from('document_items').select('*').limit(1);
  if (error) {
    console.error(error);
  } else {
    console.log('Sample Row:', data[0]);
    console.log('Sample Row Keys:', Object.keys(data[0] || {}));
  }
}
main();
