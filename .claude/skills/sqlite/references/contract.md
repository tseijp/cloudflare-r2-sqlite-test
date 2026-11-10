# 公開面

検証 code が製品に触れてよい面はこの文書だけである。`src/` の file は読まない。ここに無い振る舞いは測らない。

## 1. 入口

| package      | 入口 file                     | export                                             |
| ------------ | ----------------------------- | -------------------------------------------------- |
| `@db/server` | `src/server/db/src/index.ts`  | `createDb(input)` と型 `Input / Op / Code / Stat / Store / Part` |
| `@db/client` | `src/client/db/src/index.tsx` | `createGrid(input)` と型 `Input / Event / Code / Snap / State`   |

package 名から file への対応は `src/**/package.json` の `name` と `exports` で決まる。`packages.mjs` の `scanPackages()` が全 package の `{ name, dir, entry, deps }` を返し、root の `tsconfig.json` の `paths` も同じ対応を持つ。package 内の相対 import は拡張子 `.ts` / `.tsx` 付きで書かれている。`node_modules/.bin` に `tsx` と `esbuild` がある。

## 2. `createDb({ wasm, store, doc })`

| 引数    | 型                   | 渡すもの                                                                 |
| ------- | -------------------- | ------------------------------------------------------------------------ |
| `wasm`  | `WebAssembly.Module` | `node_modules/wa-sqlite/dist/wa-sqlite-async.wasm` を compile したもの   |
| `store` | 3 節の `Store`       | object storage。1 つの `store` が 1 つの database                        |
| `doc`   | `Y.Doc`              | 表示用の tree を書き込む doc                                             |

返り値は 4 つの関数である。

| 関数               | 振る舞い                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `run(op)`          | logical な命令 1 つを compile して実行する。Promise。呼び出しは 1 本の列に並び、前の命令が終わってから走る |
| `compile(op, stat)` | logical な命令を physical な命令の配列に変える純関数。何も実行しない。不正な命令は例外を投げる             |
| `execute(codes)`   | physical な命令の配列を上から順に実行する。Promise。`run` と同じ列に並ぶ                                   |
| `stat()`           | 6 節の `Stat` を同期で返す                                                                                 |

`createDb` は何も読まない。最初に `run({ type: 'open' })` を呼ぶと store から読み込む。同じ `store` に対して新しい `createDb` を作り `open` すると、最後に成功した `save` の状態が開く。`save` していない変更は memory にしか無い。

## 3. Store

```ts
interface Store {
        get(seq: number, offset?: number, length?: number): Promise<{ bytes: Uint8Array; tag: string } | null>
        put(seq: number, bytes: Uint8Array, tag: string): Promise<string | null>
        delete(seqs: number[]): Promise<unknown>
}
```

`seq` は database の中の object 番号で、0 が image、1 以上が delta である。key への写像は store の実装が決める。

| method   | 契約                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get`    | object が無ければ `null`。`offset` 省略は 0、`length` 省略は末尾まで。範囲が object の末尾を越えたら末尾で切る。`tag` はその object の版を表す文字列 (R2 の etag)      |
| `put`    | 引数 `tag` は「今そこにあるはずの版」。空文字列は「object が無いこと」を表す。一致すれば書いて新しい `tag` を返し、一致しなければ何も書かずに `null` を返す (compare-and-swap) |
| `delete` | 無い番号を含んでもよい                                                                                                                                                 |

製品が store を呼ぶ場面は次の 4 つだけである。

| 場面                 | 呼び出し                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `open`               | `get(0, 0, CHUNK × PAGE)` を 1 回。image が 2 chunk 以上のときだけ `get(1)`、`get(2)` … を `null` か鎖の切れ目まで |
| SQL の page 読み     | memory に無い chunk ごとに `get(0, offset, length)` を 1 回                                                  |
| `save` (push)        | `put(deltas + 1, bytes, '')` を 1 回                                                                         |
| `save` (merge)       | image が 2 chunk 以上なら `get(0)` を 1 回、`put(0, bytes, image の tag)` を 1 回、delta があれば `delete([1..deltas])` を 1 回 |

例外は 3 つある。`open` で鎖に繋がらない delta を見つけたときは、その番号から `SLOTS` までを `delete` で 1 回消す。`put` が reject した後の最初の `save` は、その番号を `get(seq, 0, 1)` で 1 回確かめ、store が変わっていなければ続行し、変わっていれば `store diverged` で reject し続ける (`open` し直すと store の内容で続行できる)。merge の `delete` が reject したときは、次の `put` の前にもう 1 回 `delete` する。

`put` が `null` を返したとき (別の writer が先に書いた) は `store conflict` で reject する。

## 4. object の形

整数は全て big-endian の u32。圧縮は gzip (`CompressionStream('gzip')`)。

```
image (seq 0)
┌────────┬───────┬─────────┬──────────────────┬───────────────────────────┐
│ "SQLI" │ pages │ chunk 数 │ 圧縮後の長さ × n  │ gzip(chunk 0) gzip(chunk 1) … │
└────────┴───────┴─────────┴──────────────────┴───────────────────────────┘
chunk i は sqlite file の page (i × CHUNK + 1) から CHUNK 枚ぶん。最後の chunk は端数

delta (seq 1..) = gzip( 次の並び )
┌────────┬────────┬───────┬────────┬─────┬──────────────────────┐
│ "SQLD" │ commit │ count │ tag 長 │ tag │ (pgno, page) × count │
└────────┴────────┴───────┴────────┴─────┴──────────────────────┘
commit は適用後の page 数。tag は 1 つ前の object (delta 1 なら image) の tag
```

image の chunk を全て伸長して繋ぐと、page size 4096 の SQLite database file になる。delta は「その save で書き換わった page」の集合で、番号順に適用する。delta の `tag` が 1 つ前の object の今の tag と一致しない delta は鎖の外であり、適用されない。

## 5. logical な命令 (`Op`)

`{ type, ...field }` の plain object。表に無い field は捨てられる。

| type       | field                                                  | 意味                                                                                              |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `open`     |                                                        | store から開き直す。保存していない変更は捨てる。system table を用意し、`pages` の view を載せる   |
| `save`     |                                                        | 前回の save から変わった page を保存する。変化が無ければ store を呼ばない                         |
| `page.add` | `page`                                                 | page (= table) を作る                                                                             |
| `page.del` | `page`                                                 | table と、その page の装飾を同じ transaction で消す                                               |
| `row.add`  | `page`                                                 | 末尾に空の行を足す。返り値は `[[_id]]`                                                            |
| `row.del`  | `page, row`                                            | 行と、その行の装飾を同じ transaction で消す                                                       |
| `col.add`  | `page, col`                                            | TEXT の列を右端に足す                                                                             |
| `col.del`  | `page, col`                                            | 列と、その列の装飾を同じ transaction で消す                                                       |
| `col.name` | `page, col, name`                                      | 列名を変え、装飾の列名も同じ transaction で変える                                                 |
| `cell`     | `id, page, row, col, text, marks`                      | cell の本文と文字区間の装飾を置き換える。`text` は文字列か null。同じ本文なら本文の page を書かない |
| `style`    | `id, page, row, col, name, value`                      | cell の装飾 1 項目。`value` が null なら外す。`row` が 0 なら列見出し (`name: 'width'` が列幅)    |
| `window`   | `id, page, top, size`                                  | `id` の表示範囲を「`_id >= top` の先頭 `size` 行」にする。SQL へは書かない                        |
| `import`   | `page, names, rows`                                    | page が無ければ `names` の列で作り、`rows` (文字列か null の配列の配列) を末尾に足す。1 transaction |
| `undo`     | `id`                                                   | `id` が行った直前の `cell` / `style` を戻す                                                       |
| `redo`     | `id`                                                   | 戻したものをやり直す                                                                              |
| `sql`      | `text`                                                 | 読み取り専用で実行する。返り値は `[列名の配列, ...行]` で、行は `ROWS` まで                       |
| `leave`    | `id`                                                   | `id` の view を消す                                                                               |

field の制約。`page` / `col` / `name` は 1 〜 64 文字で、`_` と `sqlite_` で始まらず、`rowid` / `oid` でなく、制御文字を含まない。`id` と装飾の `name` は `[A-Za-z0-9_-]{1,32}`。`row` と `top` は 0 以上の整数、`size` は 1 〜 200。`marks` は `[start, stop, name, value]` の配列で、`stop` は本文の長さに切り詰められ、空になった区間は捨てられる。`row.del` / `col.del` / `col.name` / `page.del` は全員の undo 履歴を捨てる。

## 6. `Stat`

| field    | 意味                                                |
| -------- | --------------------------------------------------- |
| `pages`  | 今の database の page 数                            |
| `base`   | store にある image の page 数 (無ければ 0)          |
| `dirty`  | 前回の save から書き換わった page 数                |
| `deltas` | store にある有効な delta の数                       |
| `patch`  | delta に入っている page 数の合計                    |

`save` の compile は `stat` だけから決まる。`dirty = 0` なら `[]`。`base <= CHUNK`、`patch + dirty >= CHUNK`、`deltas × (deltas + 1) ÷ 2 >= 1 + 2 × pages ÷ SWAP` のどれかなら `[['merge']]`。それ以外は `[['push']]`。

## 7. physical な命令 (`Code`)

`[code, ...operand]` の配列。operand は文字列、数値、配列だけである。

| code      | operand                    | 装置             | 動作                                                                                   |
| --------- | -------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `pull`    |                            | store → page 層  | image の先頭と delta の鎖を読み、page 層を置き換える                                   |
| `open`    |                            | sqlite           | 接続を開き直す                                                                         |
| `sql`     | `text, params`             | sqlite           | 文を実行し、行の配列を返す                                                             |
| `read`    | `text, limit`              | sqlite           | 読み取りしか許さない状態で実行し、`[列名, ...行]` を返す                               |
| `view`    | `name, text, params, tags` | sqlite → tree    | 問い合わせを登録し、結果を tree に載せる                                               |
| `refresh` |                            | sqlite → tree    | 登録済みの問い合わせを全て実行し直し、変わった行だけ tree に書く                       |
| `drop`    | `tag`                      | tree             | その tag を持つ問い合わせの登録と結果を消す                                            |
| `fill`    | `key, text, params`        | sqlite → tree    | 編集 key が無ければ、問い合わせの結果を JSON にして置く (変更前の値)                   |
| `set`     | `key, value, origin`       | tree             | 編集 key を書く。`origin` ごとの履歴に積まれる                                         |
| `undo`    | `origin`                   | tree             | その `origin` の履歴を 1 つ戻す                                                        |
| `redo`    | `origin`                   | tree             | 1 つやり直す                                                                           |
| `forget`  |                            | tree             | 編集 key と全員の履歴を消す                                                            |
| `push`    |                            | page 層 → store  | 汚れた page を delta 1 つにして put する                                               |
| `merge`   |                            | page 層 → store  | 全 page を image 1 つにして put し、delta を消す                                       |

命令の配列の途中で失敗すると、開いている transaction は rollback され、`run` / `execute` は reject する。

## 8. tree

`doc.getMap('view')` の key は `<view 名>/<0 始まりの連番>`、値は問い合わせ結果の 1 行 (配列)。

| view 名       | 1 行の形                               | 登録する命令 |
| ------------- | -------------------------------------- | ------------ |
| `pages`       | `[page 名]` (作成順)                   | `open`       |
| `<id>/cols`   | `[列名, 幅]` (幅は文字列。既定 `'4'`)  | `window`     |
| `<id>/rows`   | `[_id, 列 1 の本文, 列 2 の本文, …]`   | `window`     |
| `<id>/styles` | `[row, col, name, value]`              | `window`     |
| `<id>/marks`  | `[row, col, start, stop, name, value]` | `window`     |
| `<id>/last`   | `[最大の _id]` (行が無ければ null)     | `window`     |

`doc.getMap('edit')` は undo のための map で、key は `JSON.stringify(['cell', page, row, col])` か `JSON.stringify(['style', page, row, col, name])`、値は JSON 文字列である。

## 9. image の中の table

| table       | 列                                                  | 主キー                          |
| ----------- | --------------------------------------------------- | ------------------------------- |
| `<page 名>` | `_id INTEGER PRIMARY KEY` と利用者の列 (全て TEXT)  | `_id`                           |
| `_style`    | `page, row, col, name, value`                       | `(page, row, col, name)`        |
| `_mark`     | `page, row, col, start, name, stop, value`          | `(page, row, col, start, name)` |

`_style` と `_mark` は `WITHOUT ROWID`。`row` は page table の `_id`、`col` は列名である。`row = 0` は列見出しを指す。

## 10. 定数

| 名前    | 値   | 意味                                                         |
| ------- | ---- | ------------------------------------------------------------ |
| `PAGE`  | 4096 | page size (byte)                                             |
| `CHUNK` | 512  | image の 1 chunk の page 数。range GET の単位                 |
| `ROOM`  | 4    | memory に置く chunk の数                                     |
| `LIMIT` | 8192 | database の page 数の上限 (`max_page_count`)                 |
| `SWAP`  | 2048 | GET 1 回と同じ費用とみなす page 数                           |
| `SLOTS` | 8    | delta の番号の上限                                           |
| `ROWS`  | 100  | `sql` が返す行数の上限                                       |

## 11. `createGrid({ doc, id, send })`

`send(op)` は 5 節の `Op` を server に届けて返り値を返す関数、`id` は client の識別子である。返り値は `{ Grid, dispatch, compile }`。

| 関数                   | 振る舞い                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- |
| `compile(event, snap)` | 利用者の操作 1 つを physical な命令の配列に変える純関数                      |
| `dispatch(event)`      | compile して実行する。命令が 1 つ以上あれば true                             |
| `Grid`                 | react component。`doc` の `view` と局所状態を描く                            |

physical な命令は 2 種で、`['state', patch]` は局所状態 (`page, top, sel, edit, result, note`) を書き換え、`['send', op, key?]` は `send(op)` を呼ぶ (`key` があれば返り値を局所状態のその key に置く)。

| event (`type`) | field                        | 命令                                                                 |
| -------------- | ---------------------------- | -------------------------------------------------------------------- |
| `key`          | `key, shift, meta, composing` | 矢印 / Tab / Enter / F2 / Escape / Delete / 文字 / Mod+Z / Mod+Y を下の操作に読み替える |
| `wheel`        | `dy`                         | `scroll` (3 行)                                                      |
| `file`         | `name, text`                 | CSV を読み、`load`                                                   |
| `pick`         | `slot, index`                | 選択。`slot` は窓の中の行位置 (-1 が列名の行)、`index` は列位置      |
| `edit`         | `text?`                      | 編集の開始                                                           |
| `type`         | `text, start, stop`          | 編集中の文字列と選択範囲                                             |
| `commit`       | `dx, dy`                     | 確定。変化があれば `cell` か `col.name` を send                      |
| `cancel`       |                              | 編集の破棄                                                           |
| `move`         | `dx, dy`                     | 選択の移動。窓の端では `scroll`                                      |
| `scroll`       | `dy`                         | `top` を動かして `window` を send                                    |
| `page`         | `page`                       | page を切り替えて `window` を send                                   |
| `add`          | `kind` (`page / row / col`)  | `page.add` / `row.add` / `col.add` を send                           |
| `remove`       | `kind`                       | `page.del` / `row.del` / `col.del` を send                           |
| `resize`       | `index, width`               | `style` (`row: 0, name: 'width'`) を send。幅は 1 〜 12              |
| `fill`         | `value`                      | `style` (`name: 'fill'`) を send                                     |
| `bold`         |                              | 編集中は選択範囲、そうでなければ cell 全体の `bold` を付け外す       |
| `load`         | `name, names, rows`          | `import` を `BATCH` (2000) 行ずつ send                               |
| `undo` `redo` `save` `open` `sql` |           | 同名の `Op` を send                                                  |
