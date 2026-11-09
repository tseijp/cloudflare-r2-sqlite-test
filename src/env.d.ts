declare module '*.wasm?module' {
        const wasm: WebAssembly.Module
        export default wasm
}

declare namespace Cloudflare {
        interface Env {
                r2: R2Bucket
        }
}
