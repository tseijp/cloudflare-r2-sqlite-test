import { Server } from 'partyserver'
import type { Connection, ConnectionContext } from 'partyserver'
import { getUserBySub } from './queries'

export type Conn = Connection<{ username: string }>

export class PartyServer extends Server {
        users = {} as Record<string, string>
        static options = { hibernate: true }
        async onConnect(conn: Conn, c: ConnectionContext) {
                const sub = c.request.headers.get('x-user-sub')!
                const [user] = await getUserBySub(this.env.my_d1_designer, sub)
                conn.setState({ username: user.name! })
        }
        async onMessage(conn: Conn, message: string) {
                this.users[conn.state!.username] = message
                this.broadcast(JSON.stringify(this.users))
        }
        onClose(conn: Conn) {
                delete this.users[conn.state!.username]
                this.broadcast(JSON.stringify(this.users), [conn.id])
        }
}
