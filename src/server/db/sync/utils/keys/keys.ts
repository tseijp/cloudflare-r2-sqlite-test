import { KEY } from '../share/const.ts'

export const pageKey = (pid: string) => `${KEY.pages}${pid}`

export const colKey = (pid: string, cid: string) => `${KEY.pages}${pid}${KEY.cols}${cid}`

export const rowKey = (id: number) => `${KEY.rows}${id}`

export const decoKey = (id: number) => `${KEY.rows}${id}${KEY.deco}`

export const isLayoutKey = (key: string | null) => !!key && key.startsWith(KEY.pages)

export const isPageKey = (key: string) => isLayoutKey(key) && !key.includes(KEY.cols)

export const isColKey = (pid: string) => (key: string) => key.startsWith(`${KEY.pages}${pid}${KEY.cols}`)

export const isWindowKey = (key: string) => key.startsWith(KEY.rows)
