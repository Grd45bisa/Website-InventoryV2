import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Initialize client with ANON key
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function main() {
  const email = 'admin@hogababy.id';
  const id = '70338df1-219d-455c-9526-8d072e7fdcb6';
  const tempPassword = 'TempPassword123!';

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

  // Set the token on the client headers or configure it
  const authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  console.log('Fetching document items from Supabase directly...');
  const { data, error } = await authClient.from('document_items').select('*').limit(5);

  if (error) {
    console.error(error);
  } else {
    console.log('Document items count:', data.length);
    if (data.length > 0) {
      console.log('First Item:', JSON.stringify(data[0], null, 2));
    }
  }

  console.log('Fetching documents with items from Supabase directly...');
  const { data: docs, error: docsError } = await authClient
    .from('documents')
    .select('*, items:document_items(*)')
    .limit(2);

  if (docsError) {
    console.error(docsError);
  } else {
    console.log('Docs count:', docs.length);
    if (docs.length > 0) {
      console.log('First Doc items keys:', Object.keys(docs[0].items?.[0] || {}));
      console.log('First Doc items sample:', JSON.stringify(docs[0].items?.[0], null, 2));
    }
  }
}
main();
