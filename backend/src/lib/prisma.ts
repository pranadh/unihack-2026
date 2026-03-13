import { PrismaClient } from "@prisma/client";

import { getRequiredEnv } from "./env.js";

const { DATABASE_URL } = getRequiredEnv();

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});
