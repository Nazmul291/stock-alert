import prisma from '../db.server';

export const syncState = {
  async start(shop: string): Promise<void> {
    await prisma.syncState.upsert({
      where: { shop },
      create: { shop, running: true, progress: 5, startedAt: new Date() },
      update: { running: true, progress: 5, startedAt: new Date(), completedAt: null, syncedCount: null, error: null },
    });
  },

  async progress(shop: string, pct: number): Promise<void> {
    await prisma.syncState.upsert({
      where: { shop },
      create: { shop, running: true, progress: pct, startedAt: new Date() },
      update: { progress: pct },
    });
  },

  async done(shop: string, synced: number): Promise<void> {
    await prisma.syncState.upsert({
      where: { shop },
      create: { shop, running: false, progress: 100, startedAt: new Date(), completedAt: new Date(), syncedCount: synced },
      update: { running: false, progress: 100, completedAt: new Date(), syncedCount: synced, error: null },
    });
  },

  async fail(shop: string, error: string): Promise<void> {
    await prisma.syncState.upsert({
      where: { shop },
      create: { shop, running: false, progress: 0, startedAt: new Date(), error },
      update: { running: false, progress: 0, error },
    });
  },

  async get(shop: string) {
    return prisma.syncState.findUnique({ where: { shop } });
  },
};
