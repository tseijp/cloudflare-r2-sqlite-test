---
name: sqlite
description: 方眼紙型 spreadsheet を 1 file 1 sqlite image として object storage に置き、yjs を表示窓として同期し、WAL frame 単位で複製する PoC の不変条件と採点規約。実装・計測・審査のどの場面でも最初に読む
---

# sqlite

この skill は「何を作るか」ではなく「何を守り、何で測られるか」を定める。
製品の振る舞いはすべて `.bench/` の runner が出す点数に写り、点数は `references/score.md` の式でしか決まらない。
点数を上げる以外の変更は仕事ではない。

## 1. 不変条件

### 1.1. 1 つの file は 1 つの sqlite image であり、行の値と装飾はその image だけが所有する

yjs の tree は image の写しではなく窓であり、tree に載る行は表示中 page の表示範囲に限られ、tree の大きさは行数 N に依存しない。

### 1.2. 書き込みの向きは常に操作 → SQL → tree の一方向である

tree を直接書いて後から SQL へ流す経路を作った時点で、窓と image の不一致が生まれる。

### 1.3. 1 回の操作は 1 つの transaction であり、1 cell の確定は leaf page 1 枚の frame に収まる

同じ値を再確定したときに frame が生まれない性質 (SQLite は無変更の page を書かない) を壊してはならない。

### 1.4. page table には永続 index を作らない

index は追加 1 行の frame を 2 倍から 11 倍に増やし、DROP COLUMN を拒み、file を 1 割以上太らせる。
並べ替えと絞り込みは全走査で行い、その所要時間は行数に比例するものとして受け入れる。

### 1.5. 列の削除と行の削除は、装飾 table の該当行の削除と同じ transaction で行う

孤児 (本体に無い位置を指す装飾) は 0 件が常態であり、1 件でも gate を落とす。

### 1.6. 複製は image の丸ごとではなく WAL frame の単位で object storage へ送る

送った byte 数は編集で汚れた page 数に比例し、file の大きさには比例しない。
復元した image は元の image と整合 (integrity と行数と checksum) し、任意の TXID の時点へ戻せる。

### 1.7. LLM が観測する面は窓と schema と SQL の返答だけであり、どれも行数 N に対して定数か対数で収まる

## 2. 構成

```
 browser ──yjs (窓: layout + 表示範囲の行)──► Durable Object ──WAL frame──► object storage
    │                                           │  sqlite image (memory)        ├─ snapshot (全 page)
    │ gesture → act                             │  act → SQL → 窓を patch       ├─ 差分 object (L0 … L3)
    └───────────────────────────────────────────┘                               └─ page index を先に読む
 LLM ──MCP (窓 / schema / SQL)──────────────────┘
```

image は Durable Object の memory に 1 つだけ開かれ、起動時に snapshot と差分 object から復元される。
表示範囲が動いたときだけ SQL で範囲を読み直し、窓の入れ替えは編集とは別の origin で transact して undo の対象から外す。

## 3. 計測の流儀

絶対値ではなく同じ run の中の比で語る。
1 cell の書き込みは「frame 数」、窓の読みは「page 数と、行数を 10 分の 1 にしたときとの比」、
複製は「送った byte ÷ 汚れた page × page size」、image は「image byte ÷ 元 CSV byte」で表す。
こうすると機械が変わっても点数が変わらず、設計の性質だけが数字に残る。

runner は `.bench/run.mjs` 1 本で、入力は `.bench/data/` の fixtures、出力は `.bench/out/` の台帳 1 行 (JSON) である。
台帳には runner と `src/` の内容 hash を併記し、hash が一致しない台帳は無効とする。
製品コードから runner を参照してはならず、runner は製品の公開面 (storage adapter / SQL / tree) だけを叩く。

## 4. 参照表

| 場面                                              | 読む file                |
| ------------------------------------------------- | ------------------------ |
| 点数の式と gate、台帳の形                         | `references/score.md`    |
| fixtures の分類と取り込み契約                     | `references/fixtures.md` |
| page / frame / 差分 object / yjs のコスト model   | `references/cost.md`     |
| table 設計の正規化と崩し方、宣言から DDL への写像 | `references/tables.md`   |
| 方眼紙の操作と窓、装飾の anchoring                | `references/grid.md`     |
| 先行案の主張の検証結果                            | `references/errata.md`   |

## 5. 完了の定義

「できました」は台帳の最新行が最新の `src/` hash を指し、全 gate が pass で、点数が前回を下回っていないときにだけ言える。
それ以外の報告は進捗であり、未達の軸を数字で示す。
