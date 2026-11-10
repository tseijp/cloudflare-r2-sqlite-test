import { parse } from '@db/server-compiler-parse'
import { plan } from '@db/server-compiler-plan'
import type { Code, Op, Stat } from '@db/server-share'

export const compile = (op: Op, stat: Stat): Code[] => plan(parse(op), stat)
