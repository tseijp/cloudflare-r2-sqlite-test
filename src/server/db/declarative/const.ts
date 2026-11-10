// sqlite の page size。R2 の object はこの大きさの page を並べた形で置かれ、既存の object が読めなくなるので変えない
const _PAGE_SIZE = 4096

export const CONFIG = {
        engine: {
                pageSize: _PAGE_SIZE,
                head: 4,
                patience: 8,
                // 1 回の range GET で取り寄せる page 数の上限 (256 × 4096 byte = 1MB)。取り寄せた page は Durable Object の memory に載るので変更しないこと
                widest: 256,
        },
        table: {
                sample: 2000,
                // 取込で 1 文に渡す行数の上限。JSON 文字列とその wasm heap への写しが Durable Object の memory に同時に載るので変更しないこと
                chunk: 4000,
        },
        window: {
                size: 50,
                // 1 回の move で窓に載せる行数の上限。窓の入れ替えは 1 つの yjs update として 1 つの WebSocket message で届くので変更しないこと
                max: 200,
                limit: 50,
                views: 8,
        },
        replica: {
                pageSize: _PAGE_SIZE,
                diffs: 16,
                ratio: 0.5,
        },
}
