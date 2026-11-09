import type { ColType } from '../../../utils/share/types.ts'

export const STYLE = 'cell_style'

export const MARK = 'mark'

export const META = 'meta'

export const DECO = [STYLE, MARK]

export const RESERVED = [STYLE, MARK, META]

export const DROP = '_drop:'

export const SYSTEM = ['_id', '_at', '_up', '_pos', '_trashed', '_pinned', '_src']

export const SYSTEM_DDL = '"_id" INTEGER PRIMARY KEY, "_at" INTEGER, "_up" INTEGER, "_pos" REAL, "_trashed" INTEGER, "_pinned" INTEGER, "_src" TEXT'

export const SQL_TYPE: Record<ColType, string> = { text: 'TEXT', number: 'REAL', int: 'INTEGER', bool: 'INTEGER', date: 'TEXT', datetime: 'TEXT', json: 'TEXT' }

export const KIND_OF: Record<string, ColType> = { TEXT: 'text', REAL: 'number', INTEGER: 'int' }

export const TRUE = ['1', 'true', 'yes', 'on']

export const PRAGMAS = ['PRAGMA locking_mode = EXCLUSIVE', 'PRAGMA journal_mode = MEMORY', 'PRAGMA synchronous = OFF', 'PRAGMA cache_spill = OFF']

export const TABLES = [`CREATE TABLE IF NOT EXISTS ${STYLE} (page TEXT, row INTEGER, col TEXT, json TEXT, PRIMARY KEY (page, row, col)) WITHOUT ROWID`, `CREATE TABLE IF NOT EXISTS ${MARK} (page TEXT, row INTEGER, col TEXT, "from" INTEGER, attr TEXT, "to" INTEGER, val TEXT, PRIMARY KEY (page, row, col, "from", attr)) WITHOUT ROWID`, `CREATE TABLE IF NOT EXISTS ${META} (key TEXT PRIMARY KEY, bytes BLOB) WITHOUT ROWID`]

export const SETUP = [...PRAGMAS, 'BEGIN IMMEDIATE', ...TABLES, 'COMMIT']
