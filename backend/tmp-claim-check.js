const mpesa = require('./src/services/mpesa.service');
const prisma = require('./src/config/db');

const text = `UH64529DJ6 Confirmed. KSH5.00 sent to Daraja-Sandbox for account f2fb5475-ef1 on 6/8/26 at 2:39 PM New M-PESA balance is KSH656.69. Transaction cost, KSH0.00.Amount you can transact within the day is 499,433.00. Download My OneApp on https://saf.cx/kWQpy`;

async function main() {
  try {
    const parsed = mpesa.parseMpesaClaimInput({ mpesaText: text, phone: null, amount: null });
    console.log('PARSED', JSON.stringify(parsed, null, 2));
    const redeem = await prisma.redeemedCode.findUnique({ where: { code: parsed.claimReference }, include: { transaction: true } });
    console.log('REDEEM', JSON.stringify(redeem, null, 2));
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
}

main();