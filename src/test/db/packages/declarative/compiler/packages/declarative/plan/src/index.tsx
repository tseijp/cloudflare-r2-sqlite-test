import { act } from '@db/test-compiler-plan-act'
import { watch } from '@db/test-compiler-plan-watch'
import { rule } from '@db/test-compiler-plan-rule'
import { book } from '@db/test-compiler-plan-book'
import type { Code, Facts, Step } from '@db/test-share'

export const plan = (step: Step, facts: Facts): Code[] => book(rule(watch(act(step, facts))))
