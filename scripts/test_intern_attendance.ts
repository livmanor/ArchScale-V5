import fs from 'fs';

async function testIntern() {
  const users = JSON.parse(fs.readFileSync('.local/test-users.json', 'utf8'));
  const intern = users.intern;
  console.log('Testing with intern email:', intern.email);

  const signInRes = await fetch('http://127.0.0.1:3000/api/session/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: intern.email.toLowerCase(), password: intern.password }),
  });
  const signInData = await signInRes.json();
  if (!signInRes.ok) {
    console.error('Sign in failed:', signInData);
    process.exit(1);
  }
  const token = signInData.accessToken;
  console.log('Sign in success! Token received.');

  // Create context for intern
  const ctxRes = await fetch('http://127.0.0.1:3000/api/session/context', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organisationId: intern.orgId,
      workspaceId: intern.workspaceId,
    }),
  });
  const ctxData = await ctxRes.json();
  console.log('Context response:', ctxData);
  const contextId = ctxData.context?.contextId || ctxData.context?.id || ctxData.contextId || ctxData.id;
  console.log('Context ID:', contextId);

  // Try GET /api/attendance
  console.log('\n--- Testing GET /api/attendance ---');
  const getRes = await fetch('http://127.0.0.1:3000/api/attendance', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-archscale-context': contextId,
    },
  });
  console.log('GET /api/attendance status:', getRes.status);
  const getData = await getRes.json();
  console.log('GET /api/attendance data:', getData);

  // Try POST /api/attendance/check-in
  console.log('\n--- Testing POST /api/attendance/check-in ---');
  const checkInRes = await fetch('http://127.0.0.1:3000/api/attendance/check-in', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-archscale-context': contextId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  console.log('POST /api/attendance/check-in status:', checkInRes.status);
  const checkInData = await checkInRes.json();
  console.log('POST /api/attendance/check-in data:', checkInData);
}

testIntern().catch(console.error);
