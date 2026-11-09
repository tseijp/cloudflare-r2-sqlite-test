const _Vec = typeof Float32Array !== 'undefined' ? Float32Array : Array
export const vec2 = (x = 0, y = 0, out = new _Vec(2)): Vec2 => {
        out[0] = x
        out[1] = y
        return out as Vec2
}
export type Vec2 = [x: number, y: number]
export const addV = (a: Vec2, b: Vec2, out = vec2()): Vec2 => {
        out[0] = a[0] + b[0]
        out[1] = a[1] + b[1]
        return out
}
export const subV = (a: Vec2, b: Vec2, out = vec2()): Vec2 => {
        out[0] = a[0] - b[0]
        out[1] = a[1] - b[1]
        return out
}
export const cpV = (a: Vec2, out = vec2()): Vec2 => {
        out[0] = a[0]
        out[1] = a[1]
        return out
}
