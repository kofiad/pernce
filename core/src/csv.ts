export function toCSV(rows: Record<string, string | number | null>[], columns: string[]) {
  const escape = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    // Formula injection guard: a field starting with =, +, -, or @ is
    // interpreted as a formula by Excel/Sheets when the CSV is opened, so a
    // transaction note like `=cmd|'/c calc'!A1` would execute on whoever
    // opens the exported file. Prefixing with a quote neutralizes it while
    // keeping the visible text (and the leading `'` is invisible in-cell).
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c])).join(","));
  }
  return lines.join("\n");
}

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes,
 * and commas/newlines inside quotes. Good enough for bank-export style CSVs
 * without pulling in a dependency. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function csvToObjects(text: string) {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = r[i] ?? ""));
    return obj;
  });
}
