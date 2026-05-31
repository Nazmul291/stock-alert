import { PrismaClient } from "@prisma/client";
import { autoSeedAdmin } from "@nazmulcodes/shopify-admin-and-support-chat/server";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

autoSeedAdmin(prisma.adminUser).catch(console.error);

export default prisma;
