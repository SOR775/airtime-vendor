const config = require('../src/config/env');
const { sendAirtime } = require('../src/services/airtime.service');

async function main() {
  const phone = process.argv[2] || config.TEST_PHONE || '0712345678';
  const amount = Number(process.argv[3] || config.TEST_AMOUNT || 50);

  console.log('Using provider:', config.airtimeProvider);
  try {
    const result = await sendAirtime({ phone, amount });
    console.log('Airtime result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Airtime call failed:', err.message || err);
    process.exitCode = 1;
  }
}

main();
