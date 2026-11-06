// index.tsx
import Google from '@auth/core/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { authHandler, initAuthConfig, verifyAuth } from '@hono/auth-js'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { createMiddleware } from 'hono/factory'
import { routePartykitRequest } from 'partyserver'
import { getUserBySub } from './queries'

type Env = { my_d1_designer: D1Database }

const authMiddleware = initAuthConfig((c) => ({
        adapter: DrizzleAdapter(drizzle(c.env.my_d1_designer)),
        providers: [Google({ clientId: c.env.GOOGLE_CLIENT_ID, clientSecret: c.env.GOOGLE_CLIENT_SECRET })],
        secret: c.env.AUTH_SECRET,
        session: { strategy: 'jwt' },
}))
const myMiddleware = createMiddleware(async (c) => {
        const headers = new Headers(c.req.raw.headers)
        headers.set('x-user-sub', c.get('authUser')?.token?.sub!)
        const req = new Request(c.req.raw, { headers })
        const res = await routePartykitRequest(req, env(c))
        return res ?? c.text('Not Found', 404)
})

export default new Hono<{ Bindings: Env }>()
        .get('/api/res', (c) => c.text('ok'))
        .use('*', authMiddleware)
        .use('/parties/*', verifyAuth())
        .use('/parties/*', myMiddleware)
        .use('/api/auth/*', authHandler())
        .use('/api/v1/*', verifyAuth())
        .get('/api/v1/me', async (c) => {
                const { token } = c.get('authUser')
                if (!token || !token.sub) return c.json(null, 401)
                const [user] = await getUserBySub(c.env.my_d1_designer, token.sub)
                return c.json({ username: user.name || null })
        })

export * from './server'
