import { readFileSync, statSync } from 'node:fs'
import { basename, extname, relative } from 'node:path'
import { parseCsv, toPage } from './csv.mjs'
import { listFiles } from './hash.mjs'
import { parseXlsx } from './xlsx.mjs'

const LIMIT = 100 * 1024 * 1024
const KINDS = new Set(['.csv', '.xlsx'])

export const listFixtures = (dir) =>
        listFiles(dir)
                .filter((file) => KINDS.has(extname(file).toLowerCase()))
                .map((file) => ({ file, name: relative(dir, file), bytes: statSync(file).size }))

const pagesOf = (entry, buffer) => {
        const isXlsx = extname(entry.file).toLowerCase() === '.xlsx'
        if (isXlsx) return parseXlsx(buffer).map((s) => toPage(s.name, s.rows))
        return [toPage(basename(entry.file, extname(entry.file)), parseCsv(buffer))]
}

export const loadFixture = (entry) => {
        const isXlsx = extname(entry.file).toLowerCase() === '.xlsx'
        const pages = pagesOf(entry, readFileSync(entry.file))
        const csvBytes = isXlsx ? pages.reduce((n, p) => n + p.csv_bytes, 0) : entry.bytes
        return { ...entry, container: isXlsx ? '複数' : '単一', pages, csv_bytes: csvBytes }
}

export const mainPageOf = (pages) => pages.reduce((a, p) => (p.rows.length > a.rows.length ? p : a))

export const statsOf = (fixture) => {
        const main = mainPageOf(fixture.pages)
        const numericCols = main.columns.filter((c) => c.type !== 'text').length
        const totalRows = fixture.pages.reduce((n, p) => n + p.rows.length, 0)
        return {
                page: main.name,
                rows: main.rows.length,
                cols: main.columns.length,
                numeric: main.columns.length ? numericCols / main.columns.length : 0,
                max_cell: Math.max(0, ...fixture.pages.map((p) => p.max_cell)),
                total_rows: totalRows,
                row_bytes: totalRows ? fixture.csv_bytes / totalRows : 0,
                csv_bytes: fixture.csv_bytes,
                container: fixture.container,
                pages: fixture.pages.map((p) => ({ name: p.name, rows: p.rows.length, cols: p.columns.length })),
        }
}

export const scanFixtures = (dir) =>
        listFixtures(dir).map((entry) => {
                if (entry.bytes > LIMIT) return { ...entry, excluded: 'over_100mb' }
                return { ...entry, ...statsOf(loadFixture(entry)) }
        })
