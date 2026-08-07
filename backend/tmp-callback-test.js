const http = require('http');
const https = require('https');
const payload = JSON.stringify({
  Body: {
    stkCallback: {
      MerchantRequestID: 'test-merchant',
      CheckoutRequestID: 'test-checkout',
      ResultCode: 0,
      ResultDesc: 'Accepted',
    },
  },
});

function post(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https://') ? https : http;
    const req = lib.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ url, statusCode: res.statusCode, body }));
    });
    req.on('error', (err) => resolve({ url, error: err.message }));
    req.write(payload);
    req.end();
  });
}

(async () => {
  const results = [];
  results.push(await post('http://127.0.0.1:4000/api/payments/callback'));
  results.push(await post('https://dining-demystify-clothes.ngrok-free.dev/api/payments/callback'));
  console.log(JSON.stringify(results, null, 2));
})();
