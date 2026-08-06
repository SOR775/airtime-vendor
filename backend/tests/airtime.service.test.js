const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

function clearModuleCache() {
  const servicePath = require.resolve('../src/services/airtime.service');
  const configPath = require.resolve('../src/config/env');
  delete require.cache[servicePath];
  delete require.cache[configPath];
}

test('falls back to a mock airtime provider when credentials are missing', async () => {
  process.env.NODE_ENV = 'test';
  process.env.AIRTIME_PROVIDER = 'statum';
  process.env.AIRTIME_API_KEY = '';
  process.env.AIRTIME_API_SECRET = '';
  process.env.AIRTIME_USERNAME = '';
  process.env.AIRTIME_BASE_URL = '';

  const originalPost = axios.post;
  axios.post = async () => {
    throw new Error('network should not be called in mock fallback');
  };

  try {
    clearModuleCache();
    const { sendAirtime } = require('../src/services/airtime.service');
    const result = await sendAirtime({ phone: '0712345678', amount: 100 });

    assert.equal(result.success, true);
    assert.match(result.providerRef, /^mock-/);
    assert.equal(result.error, null);
  } finally {
    axios.post = originalPost;
    clearModuleCache();
  }
});
