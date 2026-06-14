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

// Only seed the admin user from the web process, not the background worker.
// The worker imports this module too, but admin seeding is a web-only concern.
if (process.env.PROCESS_TYPE !== "worker") {
  autoSeedAdmin(prisma.adminUser).catch(console.error);
}

export default prisma;
