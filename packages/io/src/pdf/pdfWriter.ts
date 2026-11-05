import { pdfString } from './helvetica.ts';

/**
 * Escritor de PDF 1.4 sem dependências: catálogo, páginas, uma fonte Helvetica e um fluxo de conteúdo por página, com
 * tabela xref de offsets reais. Os textos do conteúdo já vêm em WinAnsi (um byte por caractere), então a montagem
 * usa só os códigos 0 a 255 e os offsets são comprimentos de string.
 */
export interface PdfPageSpec {
  widthPt: number;
  heightPt: number;
  content: string;
}


const pad10 = (n: number): string => String(n).padStart(10, '0');

function toBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** Monta o documento: `pages` na ordem; `title` vai no dicionário de informações e `lang` no catálogo. */
export function buildPdf(pages: PdfPageSpec[], title = 'Hestia', lang: 'pt' | 'en' = 'pt'): Uint8Array {
  const objects: string[] = [];
  // 1 catálogo, 2 páginas, 3 fonte, 4 informações; página i = 5 + 2i, fluxo = 6 + 2i.
  const kids = pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ');
  objects[1] = `<< /Type /Catalog /Pages 2 0 R /Lang (${lang === 'en' ? 'en-US' : 'pt-BR'}) >>`;
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = `<< /Title ${pdfString(title)} /Producer (Hestia) >>`;
  pages.forEach((pg, i) => {
    const pageId = 5 + 2 * i;
    const streamId = 6 + 2 * i;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pg.widthPt)} ${num(pg.heightPt)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`;
    objects[streamId] = `<< /Length ${pg.content.length} >>\nstream\n${pg.content}\nendstream`;
  });
  const size = objects.length;
  let body = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  for (let id = 1; id < size; id++) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id++) body += `${pad10(offsets[id]!)} 00000 n \n`;
  body += `trailer\n<< /Size ${size} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return toBytes(body);
}

/** Número com até três casas, sem "-0" e sem notação científica. */
export function num(n: number): string {
  const v = Math.abs(n) < 5e-4 ? 0 : n;
  // units-ok: coordenada do PDF (formato de máquina)
  return v.toFixed(3);
}

