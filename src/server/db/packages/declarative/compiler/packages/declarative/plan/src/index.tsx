import { row } from '@db/server-compiler-plan-row'
import { sync } from '@db/server-compiler-plan-sync'
import { table } from '@db/server-compiler-plan-table'
import { view } from '@db/server-compiler-plan-view'
import type { Code, Op, Stat } from '@db/server-share'

const _PLANS: Record<string, (op: Op, stat: Stat) => Code[]> = { ...sync, ...table, ...row, ...view }

export const plan = (op: Op, stat: Stat): Code[] => _PLANS[op.type](op, stat)
