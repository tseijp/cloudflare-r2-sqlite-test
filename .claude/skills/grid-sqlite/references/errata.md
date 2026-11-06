# 先行案の検証

先行する設計案 2 本の主張を、一次資料 (file format と複製器の仕様と object storage の API) と手元の実測で確かめた結果。確認できたものは cost.md に吸収済みであり、ここでは修正と未検証だけを残す。

## 1. 修正

| 主張 | 判定 | 実測 |
| --- | --- | --- |
| 型付き横持ちは文字列のままの横持ちより常に小さい | 条件付き | 短い小数が多い file では REAL 8 byte が TEXT より大きく、文字列のままのほうが 1 割小さかった。float 多列と整数では型付きが小さい。写像は宣言の型で決め、小数の桁が短い列は TEXT を選ぶ余地がある |
| ADD COLUMN 直後の空列の DROP COLUMN は 2 frame | 誤り | 空列でも 9 frame から file 全量まで振れた。DROP は常に file に比例するものとして扱う |
| 隣接行に 1 cell ずつ 30 transaction で 30 frame | 正しい | 同じ page でも transaction ごとに frame が出る。加えて、同じ値を再確定すると frame が 0 になる (無変更 page は書かれない) ことを新たに観測 |
| 連続 50 行を 1 transaction で 3 frame | 式に依存 | frame は ceil(50 ÷ f) 前後で、leaf の行数 f により 1 から 9 に振れる。固定値ではなく式で持つ |
| 1 行追加は index 2 本で 15 frame | 桁は正しい | index 1 本で 2 から 11 frame。index の列の値の分布で振れる |
| ALTER COLUMN SET NOT NULL は 1 frame | 補足 | 1 frame だが全行を走査し (N に比例)、NULL が 1 つでもあれば拒否される |
| rich text の包みは本文の 3 から 8 倍 | 式に依存 | 包みは 1 cell あたり固定 (本文 100 byte 相当) なので、比は 1 + 固定 ÷ 本文長になる。100 字の cell では 2 倍 |
| yjs の V2 encoding は 1 割しか減らない | 条件付き | 新規 doc では差が無いが、全行を 100 回上書きした doc では V1 が 2.4 倍になるのに V2 は 1.0 倍のままだった |
| 無料階級は image 丸ごと 5MB | 前提と矛盾 | 手元の fixtures はすべて image が 7MB から 58MB になり、丸ごと階級に 1 件も入らない。PoC は最初から frame 単位の複製で採点する |

## 2. 確認

次は一次資料または実測で確認でき、cost.md の数値の根拠になっている。database header の offset (16 page size、20 reserved、24 change counter、28 page 数、40 schema cookie)、leaf の上限 X = U − 35 と M の式、serial type (NULL と 0 と 1 が 0 byte、TEXT 2L + 13、BLOB 2L + 12)、lock-byte page の位置、WAL header 32 byte と frame header 24 byte と checksum の計算と salt の規則、ALTER COLUMN SET / DROP NOT NULL が 3.53.0 で入ったこと、DROP COLUMN の制約と内容の書き直し、12 手順の再作成、差分 object の header 100 byte と page header 6 byte と圧縮 size 4 byte と零終端 6 byte と varint index と trailer 16 byte と version field が無いこと、複製器の読み側が既定 read-only で LRU 10MB と 1 秒 polling で journal mode を DELETE に見せること、圧縮段階が 30 秒 / 5 分 / 1 時間 / 24 時間で L0 が 5 分で消えること、object storage の range get と条件付き put と list 1000 件と multipart の均等 part と 7 日の破棄、yjs の mergeUpdates が削除済み内容を回収しないこと、宣言 schema から JSON Schema への変換が default / description / integer / enum / format / meta を保つこと、UndoManager が origin で追跡対象を選べること。

## 3. 未検証

次は確かめる手段を持たなかったので、採点にも設計にも使っていない。read-only の wasm sqlite の page size の推奨値、bytes から直接 image を開く API の有無、Durable Object 内で node の sqlite が使えるかどうか、object storage の put が custom metadata を引き継ぐかどうか (API 文書に記載が無い)、同期 server が room が空になったときに保存 hook を呼ぶかどうか。これらに依存する設計を採るときは、先に runner で確かめてから台帳に残す。
