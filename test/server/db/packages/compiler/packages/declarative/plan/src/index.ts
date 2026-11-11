import { chaos } from '@test/server-compiler-plan-chaos'
import { claim } from '@test/server-compiler-plan-claim'
import { life } from '@test/server-compiler-plan-life'
import { orders } from '@test/server-compiler-plan-order'
import type { Code, Move, Summary } from '@test/server-share'

// 手の種類 → (手, 状態の要約) => 装置への命令の列
const _TABLE = { ...life, ...orders, ...chaos, ...claim }

export const plan = (move: Move, stat: Summary): Code[] => _TABLE[move.type](move, stat)
