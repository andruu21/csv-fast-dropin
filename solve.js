// Fast drop-in for csv-reader 1.0.0 (make.fun's own reference program).
// run(input) must return exactly csv-reader 1.0.0's readCsv answer for {text, header}:
//   {columns, rows, errors} under make.fun's broken-row policy (see the kit's RULES.txt).
//
// Strategy: a single pass over the text with charCodeAt, no per-character string
// concatenation. Each field's characters are collected as char codes into one array
// and joined once, so an unquoted field costs one scan; quoted fields collect their
// codes as numbers (CRLF and lone CR each become 10). Rows follow the reference's
// policy exactly: BOM dropped at start, a record ends at LF/CRLF, an empty line is no
// record, a stray CR outside quotes is dropped (stray_cr), a quote inside an unquoted
// field is a literal character, a quote that never closes restarts as unquoted
// (unterminated_quote), junk after a closing quote is appended (quote_junk), and rows
// are padded/cut to the first record's width with short_row/long_row errors.
// Pure: nothing kept from one call to the next.

const COMMA = 0, BREAK = 1, END = 2;
const CH_COMMA = 44, CH_QUOTE = 34, CH_CR = 13, CH_LF = 10, CH_BOM = 0xfeff;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === CH_BOM) pos = 1;

  let recordLine = 1;
  let recordRow = null;
  // Scratch for one field's char codes, cleared per field.
  const chunk = [];

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Fast path: an unquoted field with no stray CR and no quote is a plain substring
  // scan. Scans from pos with charCodeAt over comma/quote/CR/LF sentinels only.
  function readUnquotedFast() {
    coded = false;
    chunk.length = 0;
    let start = pos;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === CH_COMMA) {
        chunk.push(start, pos);
        pos += 1;
        return COMMA;
      }
      if (c === CH_LF) {
        chunk.push(start, pos);
        pos += 1;
        line += 1;
        return BREAK;
      }
      if (c === CH_CR) {
        if (pos + 1 < n && text.charCodeAt(pos + 1) === CH_LF) {
          chunk.push(start, pos);
          pos += 2;
          line += 1;
          return BREAK;
        }
        // stray CR: flush what we have as a segment, drop the CR, keep scanning.
        error('stray_cr');
        chunk.push(start, pos);
        pos += 1;
        start = pos;
        continue;
      }
      if (c === CH_QUOTE) {
        // A quote in an unquoted field is a literal character: fall back to the
        // per-character path from here, keeping what we have.
        chunk.push(start, pos);
        pos += 1;
        chunk.push(CH_QUOTE);
        while (pos < n) {
          const c2 = text.charCodeAt(pos);
          if (c2 === CH_COMMA) { pos += 1; return COMMA; }
          if (c2 === CH_LF) { pos += 1; line += 1; return BREAK; }
          if (c2 === CH_CR) {
            if (pos + 1 < n && text.charCodeAt(pos + 1) === CH_LF) { pos += 2; line += 1; return BREAK; }
            error('stray_cr');
            pos += 1;
            continue;
          }
          chunk.push(c2);
          pos += 1;
        }
        return END;
      }
      pos += 1;
    }
    chunk.push(start, pos);
    return END;
  }

  // Collect unquoted codes up to the next comma or break. Returns the end kind.
  // `keep` true continues the codes already in chunk (an unterminated quote's literal).
  function readUnquoted(keep) {
    coded = true;
    if (!keep) chunk.length = 0;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === CH_COMMA) { pos += 1; return COMMA; }
      if (c === CH_LF) { pos += 1; line += 1; return BREAK; }
      if (c === CH_CR) {
        if (pos + 1 < n && text.charCodeAt(pos + 1) === CH_LF) {
          pos += 2; line += 1; return BREAK;
        }
        error('stray_cr');
        pos += 1;
        continue;
      }
      chunk.push(c);
      pos += 1;
    }
    return END;
  }

  // Read a quoted field whose opening quote is at pos; codes collected as numbers,
  // CRLF and a lone CR inside quotes each read as LF. After the closing quote, a
  // comma or break ends the field and anything else is junk appended as it stands
  // up to the next comma or break. An unclosed quote is a literal character and the
  // text after it is re-read as unquoted.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    coded = true;
    chunk.length = 0;
    pos += 1;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === CH_QUOTE) {
        if (pos + 1 < n && text.charCodeAt(pos + 1) === CH_QUOTE) {
          chunk.push(CH_QUOTE);
          pos += 2;
          continue;
        }
        pos += 1;
        if (pos >= n) return END;
        let c2 = text.charCodeAt(pos);
        if (c2 === CH_COMMA) { pos += 1; return COMMA; }
        if (c2 === CH_LF) { pos += 1; line += 1; return BREAK; }
        if (c2 === CH_CR && pos + 1 < n && text.charCodeAt(pos + 1) === CH_LF) {
          pos += 2; line += 1; return BREAK;
        }
        let junk = 0;
        let how = END;
        while (pos < n) {
          c2 = text.charCodeAt(pos);
          if (c2 === CH_COMMA) { pos += 1; how = COMMA; break; }
          if (c2 === CH_LF) { pos += 1; line += 1; how = BREAK; break; }
          if (c2 === CH_CR) {
            if (pos + 1 < n && text.charCodeAt(pos + 1) === CH_LF) { pos += 2; line += 1; how = BREAK; break; }
            error('stray_cr');
            pos += 1;
            continue;
          }
          chunk.push(c2);
          junk += 1;
          pos += 1;
        }
        if (junk > 0) error('quote_junk');
        return how;
      }
      if (c === CH_CR) {
        chunk.push(CH_LF);
        line += 1;
        pos += (pos + 1 < n && text.charCodeAt(pos + 1) === CH_LF) ? 2 : 1;
        continue;
      }
      if (c === CH_LF) line += 1;
      chunk.push(c);
      pos += 1;
    }
    // Unterminated: the quote is a literal, the text after it re-read as unquoted
    // with the literal quote kept (readUnquoted starts the field with it).
    pos = open + 1;
    line = openLine;
    error('unterminated_quote');
    chunk.length = 0;
    chunk.push(CH_QUOTE);
    return readUnquoted(true);
  }

  // chunk holds segments in the fast path ([start,end) pairs into text, segments may
  // be empty strings between them) or char codes on the slow paths. `coded` says which.
  let coded = false;
  function fieldValue() {
    if (!coded) {
      // index-pair mode: splice text between the pairs
      let out = '';
      for (let i = 0; i < chunk.length; i += 2) out += text.slice(chunk[i], chunk[i + 1]);
      return out;
    }
    const len = chunk.length;
    if (len === 0) return '';
    return String.fromCharCode.apply(null, chunk);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === CH_LF) { pos += 1; line += 1; }
      else if (c === CH_CR && pos + 1 < n && text.charCodeAt(pos + 1) === CH_LF) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === CH_QUOTE;
      ended = quoted ? readQuoted() : readUnquotedFast();
      fields.push(fieldValue());
    } while (ended === COMMA);

    // A line that held only stray CRs is no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
