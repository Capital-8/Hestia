import { buildPdf, num } from './pdfWriter.ts';
import { pdfString, textWidthMm } from './helvetica.ts';
import type { Lang } from '../i18n.ts';
import type { PdfFill, PdfGroup, PdfPath, PdfPoint, PdfSheet, PdfText } from './types.ts';

/** Milímetros para pontos tipográficos (1 pt = 25,4 / 72 mm). */
const PT_PER_MM = 72 / 25.4;
const toPt = (mm: number): string => num(mm * PT_PER_MM);

/** Cor #rrggbb como operandos de 0 a 1 (`rgb` ou `RGB` no operador). */
function rgbOperands(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const c = (v: number): string => num(v / 255);
  return `${c((n >> 16) & 255)} ${c((n >> 8) & 255)} ${c(n & 255)}`;
}

const pathOps = (pts: PdfPoint[]): string => {
  if (pts.length === 0) return '';
  const [first, ...rest] = pts;
  return `${toPt(first!.x)} ${toPt(first!.y)} m ` + rest.map((q) => `${toPt(q.x)} ${toPt(q.y)} l`).join(' ');
};

function fillOps(f: PdfFill): string {
  const rings = f.polygons.flatMap((poly) => poly.map((ring) => `${pathOps(ring)} h`).filter((r) => r.length > 2));
  if (rings.length === 0) return '';
  // Regra par-ímpar: anéis externos e furos de um polígono ficam certos sem olhar a orientação.
  return `${rgbOperands(f.color)} rg ${rings.join(' ')} f*`;
}

function strokeOps(s: PdfPath): string {
  if (s.pts.length < 2) return '';
  const dash = s.dashMm ? `[${toPt(s.dashMm[0])} ${toPt(s.dashMm[1])}] 0 d` : '[] 0 d';
  return `${rgbOperands(s.color)} RG ${toPt(s.widthMm)} w ${dash} ${pathOps(s.pts)}${s.closed ? ' h' : ''} S`;
}

function textOps(t: PdfText): string {
  if (t.text === '') return '';
  const theta = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // Centralizado: recua meia largura ao longo da direção do texto.
  const half = t.center ? textWidthMm(t.text, t.sizeMm) / 2 : 0;
  const x = t.at.x - half * cos;
  const y = t.at.y - half * sin;
  return `BT /F1 ${toPt(t.sizeMm)} Tf ${rgbOperands(t.color)} rg ${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${toPt(x)} ${toPt(y)} Tm ${pdfString(t.text)} Tj ET`;
}

function groupOps(g: PdfGroup): string {
  const out: string[] = ['q'];
  if (g.clip) out.push(`${toPt(g.clip.x)} ${toPt(g.clip.y)} ${toPt(g.clip.w)} ${toPt(g.clip.h)} re W n`);
  for (const f of g.fills) out.push(fillOps(f));
  for (const s of g.paths) out.push(strokeOps(s));
  for (const t of g.texts) out.push(textOps(t));
  out.push('Q');
  return out.filter((s) => s.length > 0).join('\n');
}

/**
 * PDF vetorial com uma página por prancha (decisão 0022). Tamanho da página = folha em pontos; traços em pt
 * (mm × 72/25,4); textos em Helvetica; cada grupo com recorte fica dentro da caixa da vista.
 */
export function exportSheetsPdf(sheets: PdfSheet[], title = 'Hestia', lang: Lang = 'pt'): Uint8Array {
  const pages = sheets.map((s) => ({
    widthPt: s.widthMm * PT_PER_MM,
    heightPt: s.heightMm * PT_PER_MM,
    content: s.groups.map(groupOps).join('\n'),
  }));
  return buildPdf(pages, title, lang);
}
