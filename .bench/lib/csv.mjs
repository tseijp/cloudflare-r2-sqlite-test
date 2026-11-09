const _QUOTE = 34
const _COMMA = 44
const _LF = 10
const _CR = 13

const _skipBom = (buf) => (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0)

const _quoted = (buf, i, out) => {
        let j = i
        let esc = 0
        let cr = 0
        while (j < buf.length) {
                const b = buf[j]
                if (b === _QUOTE && buf[j + 1] === _QUOTE) {
                        esc++
                        j += 2
                        continue
                }
                if (b === _QUOTE) break
                if (b === _CR) cr++
                j++
        }
        let text = buf.toString('utf8', i, j)
        if (esc) text = text.replaceAll('""', '"')
        if (cr) text = text.replaceAll('\r', '')
        out.text = text
        out.bytes = j - i - esc - cr
        return j + 1
}

const _plain = (buf, i, out) => {
        let j = i
        let cr = 0
        while (j < buf.length && buf[j] !== _COMMA && buf[j] !== _LF) {
                if (buf[j] === _CR) cr++
                j++
        }
        let text = buf.toString('utf8', i, j)
        if (cr) text = text.replaceAll('\r', '')
        out.text += text
        out.bytes += j - i - cr
        return j
}

const _field = (buf, i, out) => {
        out.text = ''
        out.bytes = 0
        if (buf[i] !== _QUOTE) return _plain(buf, i, out)
        return _plain(buf, _quoted(buf, i + 1, out), out)
}

export const readCsv = (buf, onRow) => {
        const out = { text: '', bytes: 0 }
        let i = _skipBom(buf)
        let row = []
        let rowBytes = 0
        let rowMax = 0
        const _emit = () => {
                const isBlank = row.length === 1 && row[0] === ''
                if (!isBlank) onRow(row, rowBytes + 1, rowMax)
                row = []
                rowBytes = 0
                rowMax = 0
        }
        while (i < buf.length) {
                i = _field(buf, i, out)
                row.push(out.text)
                rowBytes += out.bytes
                if (out.bytes > rowMax) rowMax = out.bytes
                if (buf[i] !== _COMMA) {
                        i++
                        _emit()
                        continue
                }
                i++
                rowBytes++
                if (i < buf.length) continue
                row.push('')
                _emit()
        }
}
