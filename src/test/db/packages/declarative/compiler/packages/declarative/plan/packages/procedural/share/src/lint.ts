import { quote } from '@db/test-compiler-share'

export const SCHEMA = `select m."name", p."name" from "sqlite_master" m join pragma_table_info(m."name") p where m."type" = 'table' order by m."name", p."cid"`

export const LOST = `select (select count(*) from "_style" where "page" not in (select "name" from "sqlite_master" where "type" = 'table')) + (select count(*) from "_mark" where "page" not in (select "name" from "sqlite_master" where "type" = 'table')), 0`

export const pagesOf = (rows: [string, string][]) => {
        const pages: Record<string, string[]> = {}
        for (const [page, col] of rows.filter(([page]) => !page.startsWith('_') && !page.startsWith('sqlite_'))) pages[page] = [...(pages[page] ?? []), col]
        return pages
}

export const lintOf = (page: string, cols: string[]) => {
        const table = quote(page)
        const names = cols.filter((col) => col !== '_id')
        const style = `select count(*) from "_style" s where s."page" = ?1 and ((s."row" > 0 and s."row" not in (select "_id" from ${table})) or s."col" not in (select "name" from pragma_table_info(?1)))`
        const mark = `select count(*) from "_mark" m where m."page" = ?1 and (m."row" not in (select "_id" from ${table}) or m."col" not in (select "name" from pragma_table_info(?1)))`
        const over = names.map((col, at) => `(select count(*) from "_mark" m join ${table} p on p."_id" = m."row" where m."page" = ?1 and m."col" = ?${at + 2} and m."stop" > length(coalesce(p.${quote(col)}, '')))`)
        return [`select (${style}) + (${mark}), ${over.join(' + ') || '0'}`, [page, ...names]]
}
