import { drizzle } from 'drizzle-orm/d1'
import { users } from './schema'
import { eq } from 'drizzle-orm'

export const getUserBySub = (DB: D1Database, sub: string) => drizzle(DB).select().from(users).where(eq(users.id, sub)).limit(1)
