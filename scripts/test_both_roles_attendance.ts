import fs from 'fs';

async function testRole(roleKey: string) {
  const users = JSON.parse(fs.readFileSync('.local/test-users.json', 'utf8'));
  const user = users[roleKey];
  console.log(`\n========================================`);
  console.log(`Testing attendance for ${roleKey} (${user.email})...`);

  const signInRes = await fetch('http://127.0.0.1:3000/api/session/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email.toLowerCase(), password: user.password }),
  });
  const signInData = await signInRes.json();
  if (!signInRes.ok) {
    console.error(`Sign in failed for ${roleKey}:`, signInData);
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
  console.log(`Context created: ${contextId} (org: ${ctxData.context?.organisation_name})`);

  // Check In
  const checkInRes = await fetch('http://127.0.0.1:3000/api/attendance/check-in', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-archscale-context': contextId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const checkInData = await checkInRes.json();
  console.log(`Check In status: ${checkInRes.status}`, checkInData.success ? 'SUCCESS' : checkInData);

  // Check Out
  const checkOutRes = await fetch('http://127.0.0.1:3000/api/attendance/check-out', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-archscale-context': contextId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const checkOutData = await checkOutRes.json();
  console.log(`Check Out status: ${checkOutRes.status}`, checkOutData.success ? 'SUCCESS' : checkOutData);

  // Read attendance
  const getRes = await fetch('http://127.0.0.1:3000/api/attendance', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-archscale-context': contextId,
    },
  });
  const getData = await getRes.json();
  console.log(`GET attendance status: ${getRes.status}, count: ${getData.records?.length}`);
  if (getData.records?.length > 0) {
    const r = getData.records[0];
    console.log(`Record sample: ID=${r.attendanceId}, CheckIn=${r.checkInTime}, CheckOut=${r.checkOutTime}, Status=${r.status}`);
  }
}

async function main() {
  await testRole('intern');
  await testRole('business_owner');
}

main().catch(console.error);

