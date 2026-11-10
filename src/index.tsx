// import { Hono } from 'hono'
// import { routePartykitRequest } from 'partyserver'
// import type { Context } from 'hono'

// const routeParty = async (c: Context) => (await routePartykitRequest(c.req.raw, c.env)) ?? c.notFound()

// export default new Hono().all('/parties/*', routeParty)

// export { PartyServer } from './server'

import { Hono } from 'hono'
import { routePartykitRequest } from 'partyserver'

const app = new Hono<{ Bindings: Env }>().all('/parties/*', async (c) => (await routePartykitRequest(c.req.raw, c.env)) ?? c.notFound())

export default app

export { PartyServer } from './server.tsx'
