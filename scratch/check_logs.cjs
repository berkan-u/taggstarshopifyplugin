const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const logs = await db.diagnosticLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  for (const log of logs) {
    console.log(`\n--- Order: ${log.orderId} ---`);
    console.log(`Status: ${log.status}`);
    console.log(`Payload: ${log.requestPayload}`);
    console.log(`Response: ${log.responseBody}`);
  }
}
main().catch(console.error).finally(() => db.$disconnect());
