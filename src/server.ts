import { Server } from 'partyserver'
import type { Connection, ConnectionContext } from 'partyserver'

export type Conn = Connection<{ username: string }>

export class PartyServer extends Server {
        static options = { hibernate: true }
        async onConnect(conn: Conn, c: ConnectionContext) {}
        async onMessage(conn: Conn, message: string) {}
        onClose(conn: Conn) {}
}
