import { attempt, jsonBytes, rowsOf } from './product.mjs'

const pagesOf = (shape, w) => (shape?.f > 0 ? Math.ceil(w / shape.f) + shape.depth - 1 : null)

const ratioOf = (a, b) => (a != null && b ? a / b : null)

const baselineOf = ({ full, tenth, page, w }) => {
        const shape = full.base.shape(page)
        const pages = pagesOf(shape, w)
        const pagesTenth = pagesOf(tenth.base.shape(page), w)
        return { pages, pages_tenth: pagesTenth, ratio: ratioOf(pages, pagesTenth), f: shape.f, depth: shape.depth }
}

export const measureWindow = async (ctx) => {
        const { full, tenth, page, rowBytes, w, pageSize } = ctx
        const baseline = baselineOf(ctx)
        if (!full.db?.image) return { ok: false, error: 'image facet missing', baseline }
        const req = { page, from: 0, to: w }
        const res = await attempt(() => full.db.image.window(req))
        const rows = rowsOf(res.value)
        const bytes = jsonBytes(res.value)
        const pages = pagesOf(full.shape, w)
        const pagesTenth = pagesOf(tenth.shape, w)
        const limit = rowBytes * rows.length * 1.5
        const { f, depth, overflow } = full.shape ?? {}
        return {
                ok: res.ok && rows.length > 0,
                error: res.error,
                req,
                pages,
                pages_tenth: pagesTenth,
                ratio: ratioOf(pages, pagesTenth),
                bytes,
                rows_returned: rows.length,
                byte_limit: limit,
                byte_ratio: limit ? bytes / limit : null,
                is_small: (tenth.shape?.rows ?? 0) < w,
                read_ratio: pages && full.shape?.bytes ? (pages * pageSize) / full.shape.bytes : null,
                shape: { f, depth, overflow, f_tenth: tenth.shape?.f, depth_tenth: tenth.shape?.depth },
                baseline,
        }
}
