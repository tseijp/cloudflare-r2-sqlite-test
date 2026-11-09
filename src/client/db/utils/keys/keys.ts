import { KEY } from '../share/const'

export const colKey = (pid: string, cid: string) => `${KEY.pages}${pid}${KEY.cols}${cid}`

export const rowKey = (id: number) => `${KEY.rows}${id}`

export const decoKey = (id: number) => `${KEY.rows}${id}${KEY.deco}`

export const isPageKey = (key: string) => key.startsWith(KEY.pages) && !key.includes(KEY.cols)

export const isColKey = (pid: string) => (key: string) => key.startsWith(`${KEY.pages}${pid}${KEY.cols}`)
