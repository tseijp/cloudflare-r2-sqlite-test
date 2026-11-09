export const TREE = 'tree'

export const ORIGIN = { win: 'win', user: 'user' } as const

export const KEY = {
        pages: 'pages/',
        cols: '/cols/',
        rows: 'rows/',
        deco: '/deco',
        win: 'win',
        sel: 'sel',
        editing: 'editing',
        view: 'view',
} as const

export const REFRESH_KINDS = ['row.add', 'row.remove', 'col.rename'] as const
