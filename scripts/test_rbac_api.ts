import fs from 'fs';

async function main() {
  // Read local test users
  const testUsers = JSON.parse(fs.readFileSync('.local/test-users.json', 'utf8'));
  const founder = testUsers.find((u: any) => u.role === 'founder' || u.email?.includes('founder'));

  console.log('Testing with user:', founder.email);

  // Sign in to get token
  const signInRes = await fetch('http://127.0.0.1:3000/api/session/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: founder.email, password: founder.password }),
  });
  const signInData = await signInRes.json();
  if (!signInRes.ok) {
    console.error('Sign in failed:', signInData);
    process.exit(1);
  }
  const token = signInData.accessToken;

  // Get memberships
  const memsRes = await fetch('http://127.0.0.1:3000/api/session/memberships', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const memsData = await memsRes.json();
  const platformMem = memsData.memberships.find((m: any) => m.portal === 'platform');

  // Create context
  const ctxRes = await fetch('http://127.0.0.1:3000/api/session/context', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organisationId: platformMem.organisationId,
      workspaceId: platformMem.workspaces[0].workspaceId,
    }),
  });
  const ctxData = await ctxRes.json();
  const contextId = ctxData.context?.contextId || ctxData.context?.id || ctxData.contextId || ctxData.id;

  // Test GET /api/platform/rbac/matrix
  const matrixRes = await fetch('http://127.0.0.1:3000/api/platform/rbac/matrix', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-ArchScale-Context': contextId,
    }
  });
  const matrixData = await matrixRes.json();
  console.log('Matrix HTTP status:', matrixRes.status);
  console.log('Roles returned:', matrixData.roles?.length);
  console.log('Permissions returned:', matrixData.permissions?.length);
  console.log('Grants keys:', Object.keys(matrixData.grants || {}));

  // Test Grant
  const grantRes = await fetch('http://127.0.0.1:3000/api/platform/rbac/grant', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-ArchScale-Context': contextId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ roleKey: 'intern', permissionKey: 'project.records.read' }),
  });
  console.log('Grant HTTP status:', grantRes.status, await grantRes.json());

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
