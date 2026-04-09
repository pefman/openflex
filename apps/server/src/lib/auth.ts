import type { FastifyRequest, FastifyReply } from 'fastify'

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}

export function getUser(req: FastifyRequest): { id: number; email: string; role: string } {
  return req.user as { id: number; email: string; role: string }
}
