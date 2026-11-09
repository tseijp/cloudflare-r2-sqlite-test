import { authHandler } from '@hono/auth-js'
import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { createMiddleware } from 'hono/factory'
import { routePartykitRequest } from 'partyserver'

type Env = { my_d1_designer: D1Database }

const myMiddleware = createMiddleware(async (c) => {
        const headers = new Headers(c.req.raw.headers)
        const req = new Request(c.req.raw, { headers })
        const res = await routePartykitRequest(req, env(c))
        return res ?? c.text('Not Found', 404)
})

export default new Hono<{ Bindings: Env }>()
        .get('/api/res', (c) => c.text('ok'))
        .use('/parties/*', myMiddleware)
        .use('/api/auth/*', authHandler())

export * from './server'
