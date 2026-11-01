import fs from 'fs';

const fixtures = JSON.parse(fs.readFileSync('.local/test-users.json', 'utf8'));

async function testRoleAttendance(personaKey: string) {
  const user = fixtures[personaKey];
  console.log(`\n========================================`);
  console.log(`Testing attendance for ${personaKey} (${user.email})...`);

  // Sign In
  const signInRes = await fetch('http://127.0.0.1:3000/api/session/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const signInData = await signInRes.json();
  if (!signInRes.ok) {
    console.error(`Sign in failed for ${personaKey}:`, signInData);
    return;
  }
  const token = signInData.accessToken;

  // Create context
  const ctxRes = await fetch('http://127.0.0.1:3000/api/session/context', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organisationId: user.orgId,
      workspaceId: user.workspaceId,
    }),
  });
  const ctxData = await ctxRes.json();
  const contextId = ctxData.context?.contextId || ctxData.context?.id || ctxData.contextId || ctxData.id;
  console.log(`Context created: ${contextId} (role: ${ctxData.context?.role_key}, dept: ${ctxData.context?.department})`);

  // GET Attendance
  const getRes = await fetch('http://127.0.0.1:3000/api/attendance', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-archscale-context': contextId,
    },
  });
  const getData = await getRes.json();
  console.log(`GET attendance status: ${getRes.status}, count: ${getData.records?.length ?? 0}`);
  if (getData.records?.length > 0) {
    for (const r of getData.records) {
      console.log(`  - Record ID: ${r.attendanceId}, Member: ${r.memberName}, Date: ${r.date}, Status: ${r.status}`);
    }
  }
}

async function run() {
  await testRoleAttendance('intern');
  await testRoleAttendance('business_owner');
  await testRoleAttendance('hr_manager');
}

run().catch(console.error);
