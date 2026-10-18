import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const email = 'admin@hogababy.id';
  const id = '70338df1-219d-455c-9526-8d072e7fdcb6';
  const tempPassword = 'TempPassword123!';

  console.log(`Updating password for ${email}...`);
  const { data: user, error: updateError } = await supabase.auth.admin.updateUserById(id, {
    password: tempPassword
  });

  if (updateError) {
    console.error('Update error:', updateError);
    return;
  }
  console.log('Password updated successfully.');

  console.log('Signing in...');
  const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: tempPassword
  });

  if (signInError) {
    console.error('Sign in error:', signInError);
    return;
  }

  const token = sessionData.session.access_token;
  console.log('Signed in. Token acquired.');

  const liveApiUrl = 'https://docu.notha.my.id/api/workspace/documents?limit=5';
  console.log(`Fetching from live API: ${liveApiUrl}...`);
  const res = await fetch(liveApiUrl, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log('Response status:', res.status);
  const json = await res.json();
  console.log('JSON Output (truncated 2 docs):');
  if (json.data && json.data.length > 0) {
    // print the first doc and its items
    const doc = json.data[0];
    console.log(JSON.stringify({
      id: doc.id,
      document_number: doc.document_number,
      document_type: doc.document_type,
      subtotal: doc.subtotal,
      total: doc.total,
      items: doc.items
    }, null, 2));
  } else {
    console.log('No documents found or structure: ', json);
  }
}
main();
