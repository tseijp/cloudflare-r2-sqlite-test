# 方眼紙と窓

## 1. 方眼紙

紙は 1 マス 24px の正方形の格子で、横は 35 マス (A 〜 AI) から始まる。1 page に table が 1 つ、左上を原点に置かれる。

```
        A  B  C  D  E  F  G  H  I  J  K  L  …  AI     列の文字 (マス 1 つずつ)
       [列 1       ][列 2       ][列 3 ]               列名の行 (slot -1)。幅はマスの数
   12  [           ][           ][     ]               data 行 (slot 0)。高さは 1 マス。左端は _id
   13  [           ][           ][     ]               slot 1
```

table が横に伸びるのは列を足したときだけで、列の幅は 1 〜 12 マスの整数である。行を足すと 1 マス下に伸びる。table の外のマスは値も装飾も持たない。列幅の合計が 35 マスを超えると紙が横に伸びる。

## 2. 操作から命令へ

browser は利用者の操作を `Op` にして server に送り、tree は読むだけである。選択、編集中の文字列、表示中の page と位置は browser の局所状態で、tree にも SQL にも入らない。

| 操作                                   | 送る `Op`                              | SQL が書く page                    |
| -------------------------------------- | -------------------------------------- | ---------------------------------- |
| click、矢印、Tab                       | 無し                                   | 0                                  |
| Enter / F2 / double click / 文字 key   | 無し (編集の開始)                      | 0                                  |
| 確定 (Enter、Tab、blur)                | `cell`。本文も装飾も同じなら送らない   | leaf 1 枚と page 1                 |
| 列名の行で確定                         | `col.name`                             | page 1 と装飾の leaf               |
| Delete / Backspace                     | `cell` (本文を空に)                    | leaf 1 枚と page 1                 |
| 「行を追加」                           | `row.add` と `window` (末尾へ)         | 末尾の leaf と page 1              |
| 「列を追加」                           | `col.add`                              | page 1                             |
| 「行を削除」「列を削除」「ページを削除」 | `row.del` / `col.del` / `page.del`     | 本体と装飾。列は table の全 leaf   |
| 列名の右端を drag                      | 離したときに `style` (`row: 0, width`) | `_style` の leaf 1 枚と page 1     |
| 「塗り」                               | `style` (`name: 'fill'`)               | `_style` の leaf 1 枚と page 1     |
| 「太字」                               | 編集中は局所状態だけ。確定で `cell`    | `_mark` の leaf と page 1          |
| wheel、窓の端での矢印                  | `window`                               | 0                                  |
| tab の切り替え                         | `window`                               | 0                                  |
| CSV を drop                            | `import` を 2000 行ずつ、最後に `window` | 取り込んだ行の leaf                |
| Mod+Z / Mod+Y                          | `undo` / `redo`                        | 戻した cell の leaf                |
| 「保存」「開き直す」                   | `save` / `open`                        | 0                                  |
| SQL 欄で Enter                         | `sql`                                  | 0                                  |

## 3. 窓

窓は「ある client が今見ている範囲」で、server に登録された問い合わせの集まりである。`window` は列、行、cell の装飾、文字区間の装飾、最大の `_id` の 5 つを `<id>/…` の名前で登録する。書き込みの命令は最後に `refresh` を置き、登録済みの問い合わせを全員ぶん実行し直して、変わった行だけを tree に書く。

行の読みは `"_id" >= top order by "_id" limit size` で、木を root から 1 回降りて leaf を右へ辿るだけである。行数にも、消した行の数にも依らない。縦の scroll bar の長さは `max("_id")` から決める。下へ進むときは窓の中の k 行目の `_id` を次の `top` にし、上へ戻るときは `top - k` にする。

窓の大きさは `size` (browser は 30 行) で決まり、table の行数に依らない。client が去るときは `leave` で問い合わせの登録と結果を消す。

## 4. 装飾の付き先

| 種類             | 付き先                       | 本文を空にしたとき | 行 / 列を消したとき      | 列名を変えたとき     |
| ---------------- | ---------------------------- | ------------------ | ------------------------ | -------------------- |
| cell の装飾      | `(page, _id, 列名)`          | 残る               | 同じ transaction で消える | 同じ transaction で付け替わる |
| 文字区間の装飾   | `(page, _id, 列名, start)`   | 区間が空になり消える | 同じ transaction で消える | 同じ transaction で付け替わる |
| 列の幅           | `(page, 0, 列名, 'width')`   | 関係しない         | 列と一緒に消える          | 付け替わる           |

文字区間は本文の文字位置 (`start` 以上 `stop` 未満) で持つ。本文が変わっても区間は自動では動かないので、確定のたびに editor が区間を送り直し、server は本文の長さで切り詰めて、その cell の `_mark` を消してから入れ直す。

## 5. undo

SQLite には戻す仕組みを持たせない。`cell` と `style` は、書く前の値を `edit` map に置いてから (`fill`)、新しい値を client ごとの origin で書く (`set`)。`undo` は yjs の UndoManager に `edit` map を 1 つ戻させ、戻った key と値を logical な命令に読み替えて、同じ compile の経路で SQL に流す。

| 性質                                         | 理由                                                             |
| -------------------------------------------- | ---------------------------------------------------------------- |
| 窓の外の cell も戻せる                       | `edit` map の key は cell の位置で、窓とは別の map である        |
| 窓の移動は履歴に入らない                     | UndoManager の対象は `edit` map だけである                       |
| 他の client が後から書いた cell は戻らない   | UndoManager は自分の origin 以外が上書きした key を戻さない      |
| 行、列、page の削除と列名の変更は履歴を捨てる | 消えた位置を指す key が残ると、戻したときに無い行や列へ書くため  |
| 履歴は Durable Object の生存期間に限られる   | tree は保存しない                                                |
