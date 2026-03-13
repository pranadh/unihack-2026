import { prisma } from "../lib/prisma.js";

const run = async (): Promise<void> => {
  await prisma.$queryRaw`SELECT 1`;
  console.log("Database connection successful.");
};

run()
  .catch((error: unknown) => {
    console.error("Database connection failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
