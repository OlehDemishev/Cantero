/** One line of text found on a photo; the box is in fractions of the image, origin top-left. */
export interface OcrLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

/**
 * Rebuilds the rows of a receipt from recognized lines: pieces whose vertical centres are within
 * about half a line height of each other are one row, joined left to right — so "SUMME EUR" and
 * the "3,50" printed at the far right come back as "SUMME EUR 3,50", the way the server's OCR
 * reports them and the receipt field parser expects.
 */
export function linesToText(lines: OcrLine[]): string {
  const sorted = [...lines].filter((l) => l.text.trim()).sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const rows: OcrLine[][] = [];
  for (const line of sorted) {
    const centre = line.y + line.height / 2;
    const row = rows.at(-1);
    if (row) {
      const rowCentre = row.reduce((s, l) => s + l.y + l.height / 2, 0) / row.length;
      const rowHeight = Math.max(...row.map((l) => l.height), line.height);
      if (Math.abs(centre - rowCentre) < rowHeight * 0.5) {
        row.push(line);
        continue;
      }
    }
    rows.push([line]);
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x).map((l) => l.text.trim()).join(" ")).join("\n");
}
