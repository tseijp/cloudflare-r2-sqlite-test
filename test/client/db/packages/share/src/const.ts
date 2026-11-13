// 探索の既定値。steps は準備の後の命令の数、faults / rivals / crashes は 1 命令あたりの重み (命令の重みの合計は 82)
export const DEFAULTS = { steps: 40, faults: 0.04, rivals: 0.03, crashes: 0.04, shrink: 60 }

// seed から決まる層。image の大きさ (seed % 4)、save の間隔 (seed ÷ 4 % 4)、
// 命令の切れ目の作り直しの重み (seed ÷ 16 % 3)
export const LAYERS = {
        sizes: ['one', 'few', 'many', 'near'],
        cadences: ['every', 'rare', 'none', 'timer'],
        restarts: [
                ['save', 0.01],
                ['open', 0.25],
                ['mixed', 0.08],
        ] as [string, number][],
        clients: [1, 1, 2, 3, 5, 10],
}

// 命令の種類の重み
export const WEIGHTS: [number, string][] = [
        [24, 'cell'],
        [8, 'style'],
        [6, 'undo'],
        [3, 'redo'],
        [8, 'rowAdd'],
        [3, 'rowDel'],
        [2, 'colAdd'],
        [1, 'colDel'],
        [2, 'colName'],
        [1, 'pageAdd'],
        [0.5, 'pageDel'],
        [3, 'load'],
        [8, 'window'],
        [1, 'leave'],
        [5, 'read'],
        [2, 'refuse'],
        [2, 'invalid'],
        [2, 'direct'],
        [1.5, 'grow'],
]
