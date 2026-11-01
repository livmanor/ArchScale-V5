import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env', 'utf8');
const env: Record<string, string> = {};
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabase = createClient(env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
async function run() {
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) { console.error(error); process.exit(1); }
  const user = users.find(u => u.email === 'kingofsquares19@gmail.com');
  console.log('User ID:', user?.id);
  console.log('App metadata:', user?.app_metadata);
  console.log('User metadata:', user?.user_metadata);
  console.log('Identities:', user?.identities?.map(i => ({ provider: i.provider, id: i.id })));
  process.exit(0);
}
run();
