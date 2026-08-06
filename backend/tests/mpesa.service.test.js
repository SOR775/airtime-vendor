const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMpesaClaimInput } = require('../src/services/mpesa.service');

test('parses a full MPesa SMS message', () => {
  const result = parseMpesaClaimInput({
    mpesaText: 'You have received KES 100 from John. Receipt No. QZ2T4A. On 07/08/2026 at 10:30. From 0712345678',
    phone: '0712345678',
  });

  assert.equal(result.amount, 100);
  assert.equal(result.receipt, 'QZ2T4A');
  assert.equal(result.phone, '0712345678');
});

test('accepts a plain receipt code when amount and phone are supplied', () => {
  const result = parseMpesaClaimInput({
    mpesaText: 'QZ2T4A',
    phone: '0712345678',
    amount: 100,
  });

  assert.equal(result.amount, 100);
  assert.equal(result.receipt, 'QZ2T4A');
  assert.equal(result.phone, '0712345678');
});

test('treats amount-only strings like KES250 as amounts', () => {
  const result = parseMpesaClaimInput({
    mpesaText: 'KES250',
    phone: '0712345678',
  });

  assert.equal(result.amount, 250);
  assert.equal(result.receipt, null);
  assert.equal(result.phone, '0712345678');
});

test('uses the same claim reference for the same message regardless of recipient phone', () => {
  const first = parseMpesaClaimInput({
    mpesaText: 'You have received KES 5 from John. Receipt No. ABC123',
    phone: '0712345678',
  });

  const second = parseMpesaClaimInput({
    mpesaText: 'You have received KES 5 from John. Receipt No. ABC123',
    phone: '0711111111',
  });

  assert.equal(first.claimReference, second.claimReference);
});
