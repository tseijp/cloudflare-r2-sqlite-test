import { fork } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const _RUN = join(dirname(fileURLToPath(import.meta.url)), 'run.mjs')

// 子 process を打ち切るまでの既定の秒。scenario は limit の手で短くも長くもできる
const _LIMIT = 540

// file を 1 つ、子 process で走らせる。記録 (default export)、終了 code、打ち切りの秒、かかった秒を返す
export const launch = (file, args = [], output = 'inherit') =>
        new Promise((resolve) => {
                const started = Date.now()
                const child = fork(_RUN, [file, ...args], { stdio: ['ignore', output, output, 'ipc'] })
                const state = { tally: null, limit: 0 }
                const cut = (seconds) => {
                        state.limit = seconds
                        child.kill('SIGKILL')
                }
                let timer = setTimeout(cut, _LIMIT * 1000, _LIMIT)
                child.on('message', (message) => {
                        if (message.tally !== undefined) state.tally = message.tally
                        if (!message.limit) return
                        clearTimeout(timer)
                        timer = setTimeout(cut, message.limit * 1000, message.limit)
                })
                child.on('exit', (code) => {
                        clearTimeout(timer)
                        const seconds = (Date.now() - started) / 1000
                        resolve({ file, ...state, code: state.limit ? 124 : (code ?? 1), seconds })
                })
        })
