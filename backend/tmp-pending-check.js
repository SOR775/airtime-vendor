const prisma = require('./src/config/db');

async function main() {
  try {
    const pending = await prisma.transaction.findMany({
      where: { status: 'PENDING_PAYMENT' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    console.log('PENDING_TRANSACTIONS', JSON.stringify(pending, null, 2));

    const callbacks = await prisma.mpesaCallback.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 20,
    });
    console.log('MPESA_CALLBACKS', JSON.stringify(callbacks, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
