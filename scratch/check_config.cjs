const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const config = await db.configuration.findFirst();
  console.log(JSON.stringify(config, null, 2));
}
main().catch(console.error).finally(() => db.$disconnect());
