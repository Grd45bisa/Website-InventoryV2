import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase.from('product_serials')
    .select('*')
    .eq('product_id', 'ba667e2d-aa3c-4106-b6d1-c62d36fd9cbb');
  if (error) {
    console.error(error);
  } else {
    console.log("Serials for Bedong Puffy 90x90:", JSON.stringify(data, null, 2));
  }
}
main();
