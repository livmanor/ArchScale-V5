import { runtimePool } from '../src/db/index.js';
import fs from 'fs';

async function test() {
  const users = JSON.parse(fs.readFileSync('.local/test-users.json', 'utf8'));
  console.log('Test users available:', Object.keys(users));

  const client = await runtimePool.connect();
  try {
    // Check table privilege for archscale_app_runtime on attendance_records
    const privs = await client.query(`
      SELECT table_schema, table_name, privilege_type 
      FROM information_schema.role_table_grants 
      WHERE grantee = 'archscale_app_runtime' AND table_name = 'attendance_records';
    `);
    console.log('archscale_app_runtime privileges on attendance_records:', privs.rows);

    // Check attendance_comments as well
    const comPrivs = await client.query(`
      SELECT table_schema, table_name, privilege_type 
      FROM information_schema.role_table_grants 
      WHERE grantee = 'archscale_app_runtime' AND table_name = 'attendance_comments';
    `);
    console.log('archscale_app_runtime privileges on attendance_comments:', comPrivs.rows);

  } catch (err: any) {
    console.error('Error:', err);
  } finally {
    client.release();
    await runtimePool.end();
  }
}
test();

