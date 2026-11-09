import { SQ, TREE } from './utils/const/const.ts'
import { CSS } from './utils/config/config.ts'
import { createBoot } from './boot.ts'
import { createCommit } from './commit.ts'
import { createEditor } from './editor.ts'
import { createGesture } from './gesture.ts'
import { createKeyboard } from './keyboard.ts'
import { readPaper } from './paper.ts'
import { createPointer } from './pointer.ts'
import { createResize } from './resize.ts'
import { createScroll } from './scroll.ts'
import { createStore } from './tree.ts'
import { useTree } from './utils/hooks/hooks.tsx'
import { Bar, Editor, Header, Lines, Ruler, Selection } from './cells.tsx'
import type * as Y from 'yjs'
import type { Send, Tree } from './utils/types/types.ts'

export type { Op, Provider, Req, Send } from './utils/types/types.ts'

export const createGrid = (doc: Y.Doc, send: Send) => {
        const tree = doc.getMap(TREE) as Tree
        const store = createStore(tree)
        const sheet = { current: null as HTMLDivElement | null }
        const scroll = createScroll(tree, send, sheet)
        const commit = createCommit(tree, send)
        const gesture = createGesture(tree, scroll.reveal)
        const resize = createResize(tree)
        const pointer = createPointer(tree, { gesture, commit, resize })
        const keyboard = createKeyboard({ gesture, commit })
        const editor = createEditor({ gesture, commit, focus: () => sheet.current?.focus() })
        const boot = createBoot(tree, send)
        const Grid = () => {
                useTree(store)
                const paper = readPaper(tree, gesture.isMine())
                const width = paper.squares * SQ
                return (
                        <div style={CSS.root}>
                                <Bar pages={paper.pages} current={paper.page} onOpen={commit.open} onAddRow={commit.addRow} onAddCol={commit.addCol} />
                                <div ref={sheet} tabIndex={0} {...pointer} onKeyDown={keyboard.onKeyDown} onScroll={scroll.onScroll} style={CSS.sheet}>
                                        <div style={{ ...CSS.sticky, width }}>
                                                <Ruler squares={paper.squares} />
                                                <div style={CSS.band}>
                                                        <Header cols={paper.cols} xs={paper.xs} />
                                                        {paper.field?.isHead && <Editor field={paper.field} row={1} seed={gesture.seed()} handlers={editor} />}
                                                </div>
                                        </div>
                                        <div style={{ ...CSS.paper, width, height: paper.rows * SQ }}>
                                                <Lines lines={paper.lines} cols={paper.cols} xs={paper.xs} />
                                                {paper.sel && <Selection sel={paper.sel} xs={paper.xs} />}
                                                {paper.field && !paper.field.isHead && <Editor field={paper.field} row={paper.field.y} seed={gesture.seed()} handlers={editor} />}
                                        </div>
                                </div>
                        </div>
                )
        }
        return { Grid, boot }
}
