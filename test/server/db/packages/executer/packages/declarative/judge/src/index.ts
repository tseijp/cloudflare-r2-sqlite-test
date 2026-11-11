import { claim } from '@test/server-executer-judge-claim'
import { count } from '@test/server-executer-judge-count'
import { safety } from '@test/server-executer-judge-safety'
import { surface } from '@test/server-executer-judge-surface'
import type { Env } from '@test/server-executer-judge-share'

// 判定の規則の表。規則の名前 → 観測を比べて、判定の記録に書く操作
export const createJudge = (env: Env) => ({ ...safety(env), ...surface(env), ...count(env), ...claim(env) })
