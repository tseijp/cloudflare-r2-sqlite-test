# 方眼紙と窓

## 1. 方眼紙の model

方眼紙は横 35 マス (A から AI)、縦は行数ぶんの正方形の格子であり、1 page に table が 1 つだけ A1 を原点に置かれる。
table が横に伸びるのは利用者が列を足したときだけで、列の幅はマス数の整数 (1 から 12) である。
1 行目は列名の行、2 行目以降は 1 行 1 マスの高さの data 行で、行を足すと table が 1 マス下へ伸びる。
table の外のマスは data も装飾も持たず、列幅の合計が 35 を超えたときは横 scroll で窓を動かす。

```
      A  B  C  D  E  F  G  H  I  J  K  L  M  N  …  AI
   1 [会社名        ][案件名        ][確度  ][受注日  ]      ← 列名の行 (幅はマス数)
   2 [             ][             ][     ][       ]      ← data 行 (1 マス高)
   3 [             ][             ][     ][       ]
   …                                                     ← 窓 w 行だけが tree に載る
```

## 2. 操作から SQL への写像

操作 1 つは transaction 1 つに対応し、SQL が要らない操作は tree だけを書く。

| 操作                               | SQL                                                                               | tree                                  | frame            |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- | ---------------- |
| click / shift+click / drag で選択  | 無し                                                                              | 無し (browser の一時状態)             | 0                |
| 矢印 / Tab で移動                  | 無し                                                                              | 無し (browser の一時状態)             | 0                |
| Enter / F2 / 文字 key で編集開始   | 無し                                                                              | 無し (確定まで browser の局所)        | 0                |
| 編集の確定                         | `UPDATE page_x SET "列" = ? WHERE _id = ?` と該当 cell の MARK の delete / insert | 窓内なら行 1 key を patch             | 1 (同値なら 0)   |
| Delete で範囲 clear                | 範囲の行を `IN` で 1 文                                                           | 窓の該当行を patch                    | 行数 ÷ f         |
| space でチェック反転               | UPDATE 1 文 (0 / 1)                                                               | 行 1 key                              | 1                |
| 選択肢 chip を選ぶ                 | UPDATE 1 文 (選択肢の文字列)                                                      | 行 1 key                              | 1                |
| 行を足す                           | INSERT 1 文                                                                       | 窓の末尾なら行 1 key                  | 1 から 2         |
| 行を消す                           | DELETE 3 文 (本体と装飾 2 table) を 1 transaction                                 | 行 1 key を delete                    | 1 から 3         |
| 列を足す                           | ADD COLUMN                                                                        | layout に記入欄 1 つ (幅のマス数付き) | 1                |
| 列幅を drag                        | `_col` の 1 行を upsert (drag 中は browser の一時状態だけ)                        | layout の幅                           | 1                |
| 列名を変える                       | RENAME COLUMN + 装飾の col 更新                                                   | layout の名前                         | 1 + 装飾件数 ÷ f |
| 列を消す                           | `_drop:` へ RENAME と装飾の delete (DROP は full の save 時)                       | layout から外す                       | 1 から 2         |
| 並べ替え / 絞り込み / group / 検索 | 窓の読み直しの文が ORDER BY / WHERE を持つ                                        | 一時 key と窓の入れ替え               | 0 (読みは O(N))  |
| scroll                             | `BETWEEN` の範囲読み直し                                                          | 窓の入れ替え (別 origin)              | 0                |
| CSV の取り込み                     | INSERT を 1 transaction                                                           | 窓の先頭を載せ直す                    | O(N)             |
| CSV の出力                         | 全走査の SELECT を stream                                                         | 無し                                  | 0                |
| undo / redo                        | act が返した逆向きの op を同じ経路で流す                                          | 窓を読み直す                          | 元の op と同じ   |

undo は act が transaction の中で求めた逆向きの op を DO の memory に積み、同じ act の経路で SQL に流す。窓の外の行の編集も履歴に入り、move は履歴に入らない。
履歴は DO の生存期間に限られ、過去の時点へ戻す機能は持たない。

## 3. 窓

窓は表示中 page の連続する w 行 (既定 50、前後に 1 窓ぶんの先読み) と、横 35 マスの範囲である。
tree の key は `page/<名前>` (layout)、`win` (範囲と表示順の `_id`)、`row/<_id>` (値の Y.Array)、`deco/<_id>` (装飾) であり、scroll で範囲が外れた行は delete し新しい行を set する。
1 cell の編集は Y.Array の 1 要素の差し替えだけを送る。入れ替えは `win` origin で transact し、編集は `act` origin で transact する。
tree は保存しない。tree の大きさは窓の key を除くと行数 N に依存しない。

窓の読みは本体 1 文と装飾 2 文の 3 文で、どれも (page, row) の範囲走査であり行数 N に依存しない。
並べ替えや絞り込みを選んでいるときの窓は全走査の結果から LIMIT と OFFSET で切るので O(N) になるが、1 行あたりの走査は µs の桁であり 10^6 行でも秒を超えない。

## 4. 装飾の anchoring

文字の装飾 (色、太字、取り消し) は「どの文字か」に付くので (row, col, from, to) で持ち、editor の確定が位置を再計算して書き直す。
cell の装飾 (塗り、枠、揃え) は「どの cell か」に付くので (row, col) で持ち、本文が空になっても残る。
行は row id に付いているので並べ替えで一緒に動き、列は列名に付いているので改名時に同じ transaction で更新する。

利用者が table 全体を動かす操作は 1 page 1 table で原点が A1 に固定されているため存在しない。
将来 table の外のマスに装飾を許すときは、絶対座標 (page, square_row, square_col) に付く別 table として足し、row id に付く CELL_STYLE とは混ぜない。

## 5. LLM が観測する面

LLM に返る状態は、layout と窓の行と装飾であり、行数 N に依存しない。選択と編集中の buffer は browser ごとの一時状態で tree に載せない。
schema 一覧は page ごとの列名と型と既定値と現在の行数を返す。
自由 SQL は全走査で実行し、返す行数は窓の行数 (50) を上限に切る。
集計 (COUNT、SUM、GROUP BY) は O(N) で許す。
書き込みは SQL ではなく操作 (act) を経由させ、操作 → SQL → tree の一方向を LLM にも適用する。
