import { parse } from '@db/client-compiler-parse'
import { plan } from '@db/client-compiler-plan'
import type { Code, Event, Snap } from '@db/client-share'

export const compile = (event: Event, snap: Snap): Code[] => plan(parse(event, snap), snap)
