import { SQ, TREE } from './utils/share/const.ts'
import { CSS } from './utils/share/config.ts'
import { createEditor } from './utils/events/editor.ts'
import { createKeyboard } from './utils/events/keyboard.ts'
import { createBoot } from './boot.ts'
import { createCommit } from './commit.ts'
import { createGesture } from './gesture.ts'
import { readPaper } from './paper.ts'
import { createPointer } from './pointer.ts'
import { createResize } from './resize.ts'
import { createScroll } from './scroll.ts'
import { createStore } from './tree.ts'
import { useTree } from './utils/hooks/hooks.tsx'
import { Bar, Editor, Header, Lines, Ruler, Selection } from './cells.tsx'
import type * as Y from 'yjs'
import type { Send, Tree } from './utils/share/types.ts'

export type { Op, Provider, Req, Send } from './utils/share/types.ts'

export const createGrid = (doc: Y.Doc, send: Send) => {
        const _tree = doc.getMap(TREE) as Tree
        const _store = createStore(_tree)
        const _sheet = { current: null as HTMLDivElement | null }
        const _scroll = createScroll(_tree, send, _sheet)
        const _commit = createCommit(_tree, send)
        const _gesture = createGesture(_tree, _scroll.reveal)
        const _resize = createResize(_tree)
        const _pointer = createPointer(_tree, { gesture: _gesture, commit: _commit, resize: _resize })
        const _keyboard = createKeyboard({ gesture: _gesture, commit: _commit })
        const _editor = createEditor({ gesture: _gesture, commit: _commit, focus: () => _sheet.current?.focus() })
        return {
                Grid: () => {
                        useTree(_store)
                        const paper = readPaper(_tree, _gesture.isMine())
                        const width = paper.squares * SQ
                        return (
                                <div style={CSS.root}>
                                        <Bar pages={paper.pages} current={paper.page} onOpen={_commit.open} onAddRow={_commit.addRow} onAddCol={_commit.addCol} />
                                        <div ref={_sheet} tabIndex={0} {..._pointer} onKeyDown={_keyboard.onKeyDown} onScroll={_scroll.onScroll} style={CSS.sheet}>
                                                <div style={{ ...CSS.sticky, width }}>
                                                        <Ruler squares={paper.squares} />
                                                        <div style={CSS.band}>
                                                                <Header cols={paper.cols} xs={paper.xs} />
                                                                {paper.field?.isHead && <Editor field={paper.field} row={1} seed={_gesture.seed()} handlers={_editor} />}
                                                        </div>
                                                </div>
                                                <div style={{ ...CSS.paper, width, height: paper.rows * SQ }}>
                                                        <Lines lines={paper.lines} cols={paper.cols} xs={paper.xs} />
                                                        {paper.sel && <Selection sel={paper.sel} xs={paper.xs} />}
                                                        {paper.field && !paper.field.isHead && <Editor field={paper.field} row={paper.field.y} seed={_gesture.seed()} handlers={_editor} />}
                                                </div>
                                        </div>
                                </div>
                        )
                },
                boot: createBoot(_tree, send),
        }
}
