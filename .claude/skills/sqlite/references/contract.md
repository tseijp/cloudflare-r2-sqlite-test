# 製品の公開面

runner が製品に触れてよいのはこの文書に書いた面だけである。`src/` の file を読んだり、内部の関数を import したりしない。
面に無い振る舞いは測らず、面に書かれた振る舞いが崩れていれば、それを点数または gate に写す。

## 1. 入口

入口は `src/server/db/index.ts` の `openDb(input)` 1 本である。

node 24 で読み込むときは、拡張子の無い相対 import を `.ts`、`.tsx`、`/index.ts` の順に解決する hook を登録する。

| input     | 型                   | 意味                                                                     |
| --------- | -------------------- | ------------------------------------------------------------------------ |
| `storage` | 3 節の Storage       | object storage。無ければ複製をしない                                     |
| `doc`     | `Y.Doc`              | 窓を書き込む doc。無ければ製品が内部で作る。wire を測るときに渡す       |
| `prefix`  | string               | object の key の前置き。1 file = 1 prefix                                |

同じ `storage` と `prefix` で `openDb` をもう一度呼ぶと、最後に `save` した状態が開く。開いた時点では page をほとんど読まず、SQL が page を必要としたときに range GET で取り寄せる。任意の時点への復元は面に無い。

## 2. db の facet

| facet                | 引数 → 返り値                                                                  | 振る舞い                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `load(sheets)`       | `{ name, rows: string[][] }[]` → page 名の配列                                 | 1 sheet = 1 page = 1 table、全体で 1 transaction。header の判定、型の推定、名前の一意化は製品が行う。容器の解読は runner が行う |
| `act(op)`            | 4 節の Op → `{ id }`                                                           | 1 op = 1 transaction。`id` は row.add で行の `_id`、page.add で page 名                                                        |
| `move(req)`          | 5 節の Req → void                                                              | 窓を入れ替える。SQL への書き込みはしない                                                                                       |
| `undo()` / `redo()`  | → void                                                                         | 直前の act を戻す / やり直す。move は履歴に入らない                                                                            |
| `sql(text, params?)` | → `{ cols, rows, changes }`                                                    | 任意の SQL。返る行は最大 50。PRAGMA も通る                                                                                     |
| `schema()`           | → `{ page, rows, columns: { name, type, default, optional }[] }[]`             | page ごとの列と行数                                                                                                            |
| `dump()`             | → plain object                                                                 | LLM が観測する面。6 節の tree をそのまま plain にしたもの                                                                     |
| `save()`             | → `{ key, bytes, isFull, txid }` または null                                   | 前回の save から汚れた page を 1 回の put で送る。変化が無ければ null。`isFull` は全 page を送った回                            |
| `bytes()`            | → `Uint8Array`                                                                 | sqlite file format の image 全体。遅延で開いた db では全 page を取り寄せてから返す                                             |
| `txid()`             | → number                                                                       | 最後に送った object の番号                                                                                                     |
| `pageSize`           | number                                                                         |                                                                                                                                |
| `close()`            | → void                                                                         | memory を解放する                                                                                                              |

## 3. Storage

runner は数え役を兼ねた memory 実装を渡す。

| method                            | 振る舞い                                                                   |
| --------------------------------- | -------------------------------------------------------------------------- |
| `put(key, bytes, { ifNoneMatch })` | `{ etag }` を返す。`ifNoneMatch` が真で key が既にあれば書かずに null      |
| `get(key, range?)`                | range は `{ offset, length }` か `{ suffix }`。無い key は null            |
| `list(prefix)`                    | `{ key, size }[]`                                                          |
| `delete(keys)`                    | 複数 key を 1 回で消す                                                     |

R2 の料金は put、list、delete が 1 回ずつの class A、get が 1 回ずつの class B として数える。

## 4. Op

| kind         | 形                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------- |
| `cells`      | `{ page, cells: { row, col, value?, marks? }[] }`。`row` は `_id`、`value` を省くと値はそのまま |
| `style`      | `{ page, cells: { row, col, json }[] }`。`json` が null なら装飾を外す                      |
| `row.add`    | `{ page, values? }`                                                                         |
| `row.remove` | `{ page, rows: number[] }`                                                                  |
| `col.add`    | `{ page, name, type, width? }`                                                              |
| `col.set`    | `{ page, name, to?, type?, width?, hidden?, options?, pos? }`。`to` があれば改名            |
| `col.remove` | `{ page, name }`                                                                            |
| `page.add`   | `{ name, cols? }`                                                                           |

`type` は `text`、`number`、`int`、`bool`、`date`、`datetime`、`json` のどれかである。`marks` は `{ from, to, attr, val }[]` で、本文の文字区間を指す。

## 5. Req

`{ page, from, to, order?: { col, dir }, filter?: { col, value }, search? }`。

`from` と `to` は 1 始まりの表示位置である。order、filter、search が無いとき、表示位置は `_id` と同じになる。

## 6. tree

`doc.getMap('grid')` に次の key が並ぶ。

| key            | 値                                                                      | 区分 |
| -------------- | ----------------------------------------------------------------------- | ---- |
| `page/<name>`  | `{ name, pos, cols: { name, type, width, pos, hidden, options }[] }`    | 窓外 |
| `win`          | Req に `rows`(全行数)と `ids`(窓の `_id` を表示順に)を足したもの      | 窓   |
| `row/<_id>`    | `Y.Array`。値の並びは page の `cols` と同じ                             | 窓   |
| `deco/<_id>`   | `{ s?: { 列名: json }, m?: { 列名: Mark[] } }`                          | 窓   |

tree snapshot は、窓の区分を除いた key だけを新しい doc に写して測る。

## 7. image の中

`sql` で読んでよい table と規約は次のとおり。

| table         | 列                                                    | 意味                                     |
| ------------- | ----------------------------------------------------- | ---------------------------------------- |
| `<page 名>`   | `_id INTEGER PRIMARY KEY` と利用者の列(列名そのまま) | 1 page 1 table                           |
| `_col`        | `page, name, type, width, pos, hidden, options`       | 既定から外れた列の layout                |
| `_style`      | `page, row, col, json`                                | cell の装飾                              |
| `_mark`       | `page, row, col, from, to, attr, val`                 | 文字区間の装飾                           |

削除した列は `_drop:` で始まる名前へ改名されて残り、全 page を送る save の直前に物理的に削除される。孤児とは、`_style` と `_mark` の行のうち、page table に無い `_id`、または `_drop:` を除いた物理列に無い `col` を指すものである。

image は WAL mode(exclusive locking)で開かれている。1 操作の frame 数は、`sql('PRAGMA wal_checkpoint(TRUNCATE)')` → 操作 → `sql('PRAGMA wal_checkpoint(PASSIVE)')` の返りの 2 列目である。`dbstat` は使えない。f(leaf 1 枚の行数)と木の深さは、`bytes()` の page を sqlite file format に従って読んで求める。
