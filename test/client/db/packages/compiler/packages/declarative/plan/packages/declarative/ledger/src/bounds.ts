import { DEFAULTS, LAYERS, WEIGHTS } from '@test/client-share'

type Limits = Record<string, number>

// 走らせる前に決めた区切りと頻度 (score.md 3 節、4 節)。台帳の bounds にそのまま書く
export const bounds = (limits: Limits, settings: unknown) => ({
        limits,
        settings,
        defaults: DEFAULTS,
        layers: LAYERS,
        weights: WEIGHTS,
        regions: {
                chunk: 'image の chunk 数。1、2 〜 ROOM、ROOM 超。near は LIMIT の 0.2 〜 0.8 chunk 手前',
                delta: 'delta の数。0、1-2、3-4、5 以上、outside (製品の save の式が merge を選ぶ数を超えた delta)',
                load: 'patch + dirty。0、1-63、64-255、256 以上 (2 chunk 以上の image だけ)',
                change: '1 回の save までに解決した命令の種類。near は page 数が LIMIT - CHUNK 以上',
                ratio: 'measure の後の open と、変化のある save の比。save / open が 2 倍以上、他は mixed',
                text: '命令の名前と本文の種類。outside は制約の外の入力',
        },
        faults: 'get は次の 1 〜 3 回目の呼び出し、put / put.after / put.null / delete は次の save。障害の後は開き直す',
        rivals: '2 つ目の instance。進行中の put を挟んだ引き継ぎと、2 つが開いたままの交互の save を半々',
        crashes: 'put を store の手前で止めて instance を失い、put は arrive か lose を半々',
        cost: 'reject した命令と、障害が入った命令は、費用の出来事に数えない。measure の前 (準備) も数えない',
        thinning: {
                unique: '間引かない。書き込みごとの写しを、scenario に 1 つの観測用 instance で開き直す',
                durable: '間引かない。instance の put が store に入った手の後に、twin と全行を比べる',
                bind: '8 文字以上の値だけ。取込は先頭 20 行',
                history: 'client ごとの直前の 1 編集だけ',
                shrink: `未知の崩れだけを縮める。試行は ${DEFAULTS.shrink} 回まで`,
        },
})

