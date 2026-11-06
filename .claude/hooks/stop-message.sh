#!/bin/bash
# Stop フック: hooks/stop.message.md があれば、その本文をそのまま Claude へ渡して続行させる
# ファイルを消すか空にすると Claude は普通に止まる
file="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/stop.message.md"

[ -s "$file" ] || exit 0

# jq -n --rawfile r "$file" '{decision: "block", reason: $r}'
