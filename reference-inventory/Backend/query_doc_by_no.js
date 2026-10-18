import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Let's find the document
  const { data: documents, error } = await supabase
    .from('documents')
    .select('*, items:document_items(*)')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
  } else {
    for (const doc of documents) {
      console.log(`Document: ${doc.document_number} (ID: ${doc.id})`);
      console.log(`  Subtotal: ${doc.subtotal}, Total: ${doc.total}`);
      console.log(`  Items count: ${doc.items ? doc.items.length : 0}`);
      if (doc.items) {
        doc.items.forEach((item, index) => {
          console.log(`    Item ${index + 1}:`);
          console.log(`      Name: "${item.item_name}"`);
          console.log(`      SKU: "${item.sku}"`);
          console.log(`      Quantity: ${item.quantity}`);
          console.log(`      Unit Price: ${item.unit_price}`);
          console.log(`      Amount: ${item.amount}`);
          console.log(`      Metadata:`, item.metadata);
        });
      }
    }
  }
}
main();
