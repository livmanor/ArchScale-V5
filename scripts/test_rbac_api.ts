import fs from 'fs';

async function main() {
  const testUsers = JSON.parse(fs.readFileSync('.local/test-users.json', 'utf8'));
  const founder = testUsers.founder;

  console.log('Testing with founder email:', founder.email);

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
  let token = signInData.accessToken;

  // If MFA required, verify MFA
  if (signInData.mfaRequired) {
    console.log('MFA required, elevating...');
    const { generateTotp } = await import('../src/utils/totp.js');
    const totp = generateTotp(founder.totpSecret);
    const mfaRes = await fetch('http://127.0.0.1:3000/api/session/mfa/verify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: totp }),
    });
    const mfaData = await mfaRes.json();
    token = mfaData.accessToken;
  }

  // Create context for platform
  const ctxRes = await fetch('http://127.0.0.1:3000/api/session/context', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organisationId: founder.orgId,
      workspaceId: founder.workspaceId,
    }),
  });
  const ctxData = await ctxRes.json();
  const contextId = ctxData.context?.contextId || ctxData.context?.id || ctxData.contextId || ctxData.id;
  console.log('Context ID:', contextId);

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
  console.log('Sample roles:', matrixData.roles?.slice(0, 3).map((r: any) => r.name));

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

  // Test Revoke
  const revokeRes = await fetch('http://127.0.0.1:3000/api/platform/rbac/revoke', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-ArchScale-Context': contextId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ roleKey: 'intern', permissionKey: 'project.records.read' }),
  });
  console.log('Revoke HTTP status:', revokeRes.status, await revokeRes.json());

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
