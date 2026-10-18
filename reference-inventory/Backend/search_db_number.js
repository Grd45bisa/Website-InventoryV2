import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const tables = ['products', 'contacts', 'documents', 'document_items', 'templates', 'activity_logs'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');
    if (!error && data) {
      const json = JSON.stringify(data);
      if (json.includes('85627555') || json.includes('85.627.555')) {
        console.log(`Found in table: ${table}`);
        console.log(data);
      }
    }
  }
}
main();
