import { sql } from 'drizzle-orm'
import { CHUNK, LIMIT, SWAP } from '@db/server-share'
import { create, mark, query, run, style } from '@db/server-compiler-plan-share'
import type { Code, Op, Stat } from '@db/server-share'

const _PAGES = sql`select "name" from "sqlite_master" where "type" = 'table' and substr("name", 1, 1) <> '_' and "name" not like 'sqlite_%' order by "rowid"`

export const sync = {
        open: (): Code[] => [
                ['pull'],
                ['open'],
                run(sql`pragma journal_mode = memory`),
                run(sql`pragma temp_store = memory`),
                run(sql`pragma max_page_count = ${sql.raw(String(LIMIT))}`),
                run(create(style)),
                run(create(mark)),
                ['view', 'pages', ...query(_PAGES), []],
                ['refresh'],
                ['forget'],
        ],
        save: (_: Op, stat: Stat): Code[] => {
                const isSmall = stat.base <= CHUNK
                const isHeavy = stat.patch + stat.dirty >= CHUNK
                const isDue = (stat.deltas * (stat.deltas + 1)) / 2 >= 1 + (2 * stat.pages) / SWAP
                if (stat.dirty === 0) return []
                if (isSmall || isHeavy || isDue) return [['merge']]
                return [['push']]
        },
}
