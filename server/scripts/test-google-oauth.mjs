import fetch from 'node-fetch';

const BASE = 'http://localhost:3030';
const CLIENT_ID = '279723837426-9tru5morb1l3kouin3vec65gdgrmnfo2.apps.googleusercontent.com';

async function testOAuthStart() {
  console.log('\n=== TEST 1: /api/auth/google redirect ===');
  const res = await fetch(`${BASE}/api/auth/google?redirect=/home`, { redirect: 'manual' });
  console.log('Status:', res.status);
  const location = res.headers.get('location') || '';
  console.log('Location:', location);
  const isGoogle = location.includes('accounts.google.com');
  console.log('Redirects to Google:', isGoogle);
  console.log('Contains client_id:', location.includes(CLIENT_ID));
  console.log('Contains redirect_uri:', location.includes('redirect_uri='));
  console.log('Contains scope:', location.includes('scope='));
  console.log('Contains state:', location.includes('state='));
  return res.status === 302 && isGoogle;
}

async function testCallbackEndpoint() {
  console.log('\n=== TEST 2: /api/auth/google/callback (no code) ===');
  const res = await fetch(`${BASE}/api/auth/google/callback`, { redirect: 'manual' });
  console.log('Status:', res.status);
  const location = res.headers.get('location') || '';
  console.log('Location:', location);
  const hasError = location.includes('error=');
  console.log('Returns error (expected):', hasError);
  return res.status === 302 && hasError;
}

async function testHealth() {
  console.log('\n=== TEST 0: API Health ===');
  const res = await fetch(`${BASE}/api/health`);
  const data = await res.json();
  console.log('Health:', data);
  return data.status === 'ok';
}

async function main() {
  console.log('🧪 Google OAuth Test Suite');
  console.log('Base URL:', BASE);

  const healthOk = await testHealth();
  if (!healthOk) {
    console.error('❌ API not healthy, aborting');
    process.exit(1);
  }

  const startOk = await testOAuthStart();
  const callbackOk = await testCallbackEndpoint();

  console.log('\n=== SUMMARY ===');
  console.log('Health check:', healthOk ? '✅ PASS' : '❌ FAIL');
  console.log('OAuth start redirect:', startOk ? '✅ PASS' : '❌ FAIL');
  console.log('Callback error handling:', callbackOk ? '✅ PASS' : '❌ FAIL');

  console.log('\n=== MANUAL TEST REQUIRED ===');
  console.log('1. Open http://localhost:3000/auth/login');
  console.log('2. Click "Continue with Google"');
  console.log('3. Select Google account → consent screen shows "NovaFlix"');
  console.log('4. Redirected to /oauth/callback → spinner → /home');
  console.log('5. Verify in DevTools:');
  console.log('   - localStorage.novaflix_token exists');
  console.log('   - user.role === "viewer"');
  console.log('   - Redirected to /home (or role-based)');

  if (startOk && callbackOk) {
    console.log('\n✅ Automated checks passed. Ready for manual test.');
    process.exit(0);
  } else {
    console.log('\n❌ Some automated checks failed.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});