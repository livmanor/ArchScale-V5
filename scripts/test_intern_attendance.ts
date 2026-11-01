import axios from 'axios';
import fs from 'fs';

async function testApi() {
  const users = JSON.parse(fs.readFileSync('.local/test-users.json', 'utf8'));
  const intern = users.intern;
  console.log('Logging in as intern:', intern.email);

  try {
    const loginRes = await axios.post('http://127.0.0.1:3000/api/session/sign-in', {
      identifier: intern.email,
      password: intern.password,
    });
    console.log('Login success! Status:', loginRes.status);
    const { token, availableContexts } = loginRes.data;
    console.log('Available Contexts for intern:', availableContexts);

    if (!availableContexts || availableContexts.length === 0) {
      console.log('No contexts for intern!');
      return;
    }

    const ctx = availableContexts[0];
    const ctxRes = await axios.post('http://127.0.0.1:3000/api/session/context', {
      membershipId: ctx.membershipId,
      workspaceId: ctx.workspaceId,
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const activeContextId = ctxRes.data.contextId;
    console.log('Created active contextId:', activeContextId);

    // Try GET /api/attendance
    try {
      const getRes = await axios.get('http://127.0.0.1:3000/api/attendance', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-archscale-context': activeContextId,
        },
      });
      console.log('GET /api/attendance success! Records count:', getRes.data.records.length);
    } catch (err: any) {
      console.error('GET /api/attendance error:', err.response?.status, err.response?.data || err.message);
    }

    // Try POST /api/attendance/check-in
    try {
      const checkInRes = await axios.post('http://127.0.0.1:3000/api/attendance/check-in', {}, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-archscale-context': activeContextId,
        },
      });
      console.log('POST /api/attendance/check-in success!', checkInRes.data);
    } catch (err: any) {
      console.error('POST /api/attendance/check-in error:', err.response?.status, err.response?.data || err.message);
    }

  } catch (err: any) {
    console.error('Login error:', err.response?.status, err.response?.data || err.message);
  }
}

testApi();
