import { supabaseAdmin } from '../src/lib/supabase.js';

const email = process.argv[2];

if (!email) {
  console.error('Usage: npm run auth:delete-user -- user@example.com');
  process.exit(1);
}

async function findUserByEmail(targetEmail) {
  const perPage = 100;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    const user = data.users.find((item) => item.email?.toLowerCase() === targetEmail.toLowerCase());
    if (user) return user;
    if (data.users.length < perPage) return null;

    page += 1;
  }
}

const user = await findUserByEmail(email);

if (!user) {
  console.log(`No auth user found for ${email}`);
  process.exit(0);
}

const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);

if (error) {
  console.error(`Failed to delete ${email}: ${error.message}`);
  process.exit(1);
}

console.log(`Deleted auth user ${email} (${user.id})`);
