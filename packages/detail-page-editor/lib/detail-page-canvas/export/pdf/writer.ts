/**
 * Minimal PDF 1.7 writer — just enough for the Illustrator (.ai) exporter.
 *
 * An ``.ai`` file has been a PDF underneath since Illustrator 9 ("PDF
 * compatibility"): Illustrator opens a plain PDF renamed to ``.ai`` and turns
 * its content stream back into editable paths and text. So the exporter's job
 * is to emit a well-formed PDF, and this module is the byte layer for it —
 * object table, streams, cross-reference table, trailer.
 *
 * Kept dependency-free on purpose: jsPDF (the obvious alternative) can only
 * embed TrueType fonts it has the binary for, and our fonts ship as ~2,000
 * unicode-range woff2 subsets. See ``ai.ts`` for how text works without them.
 */

const ENCODER = new TextEncoder();

export type PdfRef = number;

/** Compact fixed-point formatting; PDF content streams get long fast. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Escape a PDF literal string: ``(Adobe)``. */
export function pdfString(value: string): string {
  return `(${value.replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

/** UTF-16BE hex string — the text encoding our CID fonts read (see ai.ts). */
export function utf16Hex(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export class PdfBuilder {
  /** Index = object number; index 0 is the free head, so it stays null. */
  private objects: (Uint8Array | null)[] = [null];

  /** Reserve an object number before its body exists (forward references). */
  alloc(): PdfRef {
    this.objects.push(null);
    return this.objects.length - 1;
  }

  set(ref: PdfRef, body: string | Uint8Array): PdfRef {
    this.objects[ref] = typeof body === "string" ? ENCODER.encode(body) : body;
    return ref;
  }

  add(body: string | Uint8Array): PdfRef {
    return this.set(this.alloc(), body);
  }

  /**
   * A stream object. ``extra`` carries the dict entries that describe the data
   * (``/Filter``, ``/Subtype``, image geometry…); ``/Length`` is added here.
   */
  addStream(extra: string, data: Uint8Array, ref: PdfRef = this.alloc()): PdfRef {
    const head = ENCODER.encode(`<< ${extra} /Length ${data.length} >>\nstream\n`);
    const tail = ENCODER.encode("\nendstream");
    return this.set(ref, concat([head, data, tail]));
  }

  /** Serialize the document; ``root`` must be the /Catalog object. */
  build(root: PdfRef): Uint8Array {
    // Binary comment on line 2 marks the file as binary for transfer tools.
    const chunks: Uint8Array[] = [ENCODER.encode("%PDF-1.7\n"), new Uint8Array([37, 226, 227, 207, 211, 10])];
    let offset = chunks.reduce((acc, c) => acc + c.length, 0);
    const offsets: number[] = new Array(this.objects.length).fill(0);

    for (let n = 1; n < this.objects.length; n++) {
      const body = this.objects[n];
      if (!body) continue; // allocated but never filled — emitted as a free slot
      offsets[n] = offset;
      const head = ENCODER.encode(`${n} 0 obj\n`);
      const tail = ENCODER.encode("\nendobj\n");
      chunks.push(head, body, tail);
      offset += head.length + body.length + tail.length;
    }

    const xrefAt = offset;
    const size = this.objects.length;
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let n = 1; n < size; n++) {
      xref += offsets[n]
        ? `${String(offsets[n]).padStart(10, "0")} 00000 n \n`
        : "0000000000 65535 f \n";
    }
    xref += `trailer\n<< /Size ${size} /Root ${root} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
    chunks.push(ENCODER.encode(xref));
    return concat(chunks);
  }
}
