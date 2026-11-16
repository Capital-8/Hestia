import type { LabelOp } from './types.ts';

/** Largura média de um caractere em relação à altura da fonte (sem medir o texto na tela). */
const CHAR_ASPECT = 0.62;
/** Altura da linha em relação à fonte. */
const LINE_ASPECT = 1.3;
/** Folga (mm de papel) mantida entre rótulos. */
const GAP_MM = 0.6;
const MAX_PASSES = 4;

interface Box { label: LabelOp; cx: number; cy: number; hw: number; hh: number; fixed: boolean }

function boxOf(l: LabelOp): Box | null {
  const mm = l.papel?.fontMm;
  if (mm === undefined || l.papel === undefined || l.maskBoundary) return null;
  const mPerMm = l.papel.escala / 1000;
  const lines = l.text.split('\n');
  const chars = Math.max(1, ...lines.map((s) => s.length));
  const pad = l.badge ? 1.1 : 0.3;
  const vertical = (l.rotation ?? 0) % 180 !== 0;
  const w = (chars * mm * CHAR_ASPECT + pad * mm) * mPerMm;
  const h = (lines.length * mm * LINE_ASPECT + pad * mm) * mPerMm;
  return { label: l, cx: l.at.x, cy: l.at.y, hw: (vertical ? h : w) / 2, hh: (vertical ? w : h) / 2, fixed: l.auto !== true };
}

/**
 * Afasta rótulos que se sobrepõem (ArchiCAD: anti-colisão de etiquetas). Só se movem os rótulos de posição
 * automática (`auto`): a etiqueta que o usuário colocou fica onde ele pôs. Cada par que se cobre se afasta pelo eixo
 * de menor penetração. Função pura sobre a lista: devolve quantos rótulos foram movidos.
 */
export function separateAutoLabels(labels: LabelOp[], scale: number): number {
  void scale;
  const boxes = labels.map(boxOf).filter((b): b is Box => b !== null);
  if (boxes.length < 2) return 0;
  const moved = new Set<Box>();
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (a.fixed && b.fixed) continue;
        const gap = ((a.label.papel?.fontMm ?? 1.6) * GAP_MM / 1.6) * ((a.label.papel?.escala ?? 100) / 1000);
        const ox = a.hw + b.hw + gap - Math.abs(a.cx - b.cx);
        const oy = a.hh + b.hh + gap - Math.abs(a.cy - b.cy);
        if (ox <= 0 || oy <= 0) continue;
        // Quem se move: o automático; se os dois são automáticos, o de trás divide o deslocamento.
        const shares: Array<[Box, number]> = a.fixed ? [[b, 1]] : b.fixed ? [[a, 1]] : [[a, 0.5], [b, 0.5]];
        const alongX = ox < oy;
        for (const [box, share] of shares) {
          const other = box === a ? b : a;
          const dir = alongX ? Math.sign(box.cx - other.cx) || (box === a ? -1 : 1) : Math.sign(box.cy - other.cy) || (box === a ? -1 : 1);
          if (alongX) box.cx += dir * ox * share; else box.cy += dir * oy * share;
          moved.add(box);
        }
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const b of moved) b.label.at = { x: b.cx, y: b.cy };
  return moved.size;
}
