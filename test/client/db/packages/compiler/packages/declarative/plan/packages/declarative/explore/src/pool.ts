// 名前と本文の種類 (score.md 3 節)。ASCII、日本語、空白、" ' % _ / を含む文字列、大文字小文字だけ違う名前
const _PLAIN = ['p', 'sheet 1', 'ページ', '売上 2026', 'Case', 'case']

export const PAGES = [..._PLAIN, 'q"uote', "it's", '100%', 'under_score', 'a/b']

export const COLS = ['a', 'b', 'col c', '列', '金額 (円)', 'q"c', "c'd", '50%', 'x_y', 'n/a', 'Name', 'name']

// 空文字列、null、1 page を超える本文を含む
export const TEXTS = [
        'plain',
        '日本語の本文',
        '',
        null,
        '  spaced  text ',
        `q"u'o%t_e/`,
        'UPPER',
        'upper',
        'line\nbreak',
        { $repeat: ['長い本文 ', 1000] },
]

export const STYLES = ['fill', 'color', 'width', 'border-top']

// 制約のすぐ外側の名前 (contract.md 5 節)。拒まれるべき入力
export const BAD = ['', '_hidden', 'sqlite_x', 'rowid', 'oid', 'tab\tname', 'del\u007fname', { $repeat: ['N', 65] }]

// sql が reject するはずの、書き込みを含む文
export const WRITES = [
        'delete from "_style"',
        `insert into "_style" values ('p', 1, 'a', 'x', 'y')`,
        `replace into "_style" values ('p', 1, 'a', 'x', 'y')`,
        'update "_mark" set "stop" = 0',
        'drop table "_style"',
        'create table "x" ("a")',
        'create index "i" on "_style" ("page")',
        'create view "v" as select 1',
        'alter table "_style" add column "z"',
        'select 1; delete from "_mark"',
        `with t as (select 1) insert into "_style" select 'p', 1, 'a', 'x', 'y' from t`,
        'pragma user_version = 5',
        'vacuum',
        'reindex',
        'analyze',
]

// 読み取りの文。%s は page 名。150 行を返す文は ROWS の上限を見る。最後の文は page 名を使わない
export const READS = [
        'select count(*) from "%s"',
        'select * from "%s" order by "_id" desc limit 150',
        'select "_id" from "%s" where "_id" >= 3 order by "_id" limit 5',
        'select count(*), max("_id") from "%s"; select "name" from "sqlite_master"',
        'with recursive c(n) as (select 1 union all select n + 1 from c where n < 300) select n from c',
        'select "page", count(*) from "_style" group by "page"',
]

// fixtures.md の CSV のうち、先頭を取り込むもの
export const FILES = [
        '航空券価格予測/business.csv',
        'ビットコインの履歴データセット/BTC-Daily.csv',
        'Google Playストアのレビュー.csv',
        '電力負荷予測/weekly pre-dispatch forecast.csv',
        'ディズニーランドのレビュー.csv',
]

// store の呼び出しに入れる障害
export const FAULTS = ['get', 'put', 'put.after', 'put.null', 'delete']

// 保留した put の行き先
export const FATES = ['arrive', 'lose']
