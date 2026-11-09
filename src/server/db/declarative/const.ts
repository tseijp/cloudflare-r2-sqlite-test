export const CONFIG = {
        engine: { pageSize: 4096, tries: 3 },
        table: { sample: 2000, chunk: 4000 },
        window: { size: 50, max: 200, limit: 50 },
        replica: { pageSize: 4096, ahead: 16, diffs: 16, ratio: 0.5 },
}
