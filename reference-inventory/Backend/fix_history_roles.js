import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const SUPER_ADMIN_TENANT_ID = '00000000-0000-0000-0000-000000000000';
  
  const { data: setting, error: fetchError } = await supabase
    .from('workspace_settings')
    .select('value')
    .eq('owner_id', SUPER_ADMIN_TENANT_ID)
    .eq('key', 'modules')
    .maybeSingle();

  if (fetchError) {
    console.error('Fetch error:', fetchError);
    return;
  }

  if (setting && setting.value) {
    const modules = setting.value;
    
    if (modules.history) {
      const roles = modules.history.roles || ['owner'];
      if (!roles.includes('admin')) {
        roles.push('admin');
      }
      modules.history.roles = roles;
    }

    if (modules.settings) {
      const roles = modules.settings.roles || ['owner'];
      if (!roles.includes('admin')) {
        roles.push('admin');
      }
      modules.settings.roles = roles;
    }

    const { error: updateError } = await supabase
      .from('workspace_settings')
      .update({ value: modules })
      .eq('owner_id', SUPER_ADMIN_TENANT_ID)
      .eq('key', 'modules');

    if (updateError) {
      console.error('Update error:', updateError);
    } else {
      console.log('Database updated successfully! History module roles:', modules.history.roles);
    }
  } else {
    console.log('No modules setting found in database.');
  }
}
main();
