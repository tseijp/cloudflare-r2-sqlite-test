import { Hono } from 'hono'
import { routePartykitRequest } from 'partyserver'

// @ts-ignore
const app = new Hono<{ Bindings: Env }>().all('/parties/*', async (c) => (await routePartykitRequest(c.req.raw, c.env)) ?? c.notFound())

export default app

export { PartyServer } from './server.tsx'
