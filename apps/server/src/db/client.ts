import { PrismaClient } from '@prisma/client'

export const db = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
})

process.on('beforeExit', async () => {
  await db.$disconnect()
})
