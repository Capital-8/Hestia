import { ESTILO_CORTE_MASSA, linhasCorteDaMassa, linhasVisiveisMassa, massaNoPonto, massasNaCaixa, type SectionResult } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { mix } from '../plan/color.ts';
import type { PlanPaint } from '../plan/style.ts';
import type { FillOp, PlanTheme, StrokeOp } from '../plan/types.ts';

type Pt = { x: number; y: number };

/** Sem ocultos: o conjunto vazio compartilhado (evita criar um Set por chamada). */
const VAZIO: ReadonlySet<Id> = new Set<Id>();

/**
 * Massas no corte e na elevação (ficha V3, A.4 regra 9): as linhas vêm do kernel (`massa_corte`) em `(s, z)`, pelo mesmo caminho do guarda-corpo.
 * Peça cortada (estilo 0): contorno pesado (`paint.cut`) e preenchimento claro. Peça projetada (estilo 1): contorno fino (`paint.proj`) na cor
 * fraca do guarda-corpo. Feição (estilo 3): linha aberta com `paint.proj` numa cor mais fraca ainda (mais fina na leitura, sem peso novo).
 * Categoria desligada ou massa oculta não desenha. Sem kernel pronto não desenha (sem reserva em corte), e nunca lança.
 */
export function massaCorteOps(
  p: Project,
  s: SectionResult,
  theme: PlanTheme,
  dark: boolean,
  hidden: ReadonlySet<Id> | undefined,
  paint: PlanPaint,
  fills: FillOp[],
  strokes: StrokeOp[],
  /** Seleção e cursor da vista: a massa selecionada leva a cor de seleção, como o guarda-corpo (decisão 0016). */
  highlight?: { selection: readonly Id[]; hover: Id | null },
): void {
  if (!paint.visible) return;
  const linhas = linhasCorteDaMassa(p, s);
  if (!linhas) return;
  const base = dark ? theme.bg : '#ffffff';
  const cor = paint.color ?? theme.ink;
  const fraco = mix(cor, base, 0.45);
  const feicao = mix(cor, base, 0.7);
  const selecionados = new Set<Id>(highlight?.selection ?? []);
  // Realce por cima de todas as linhas da massa (como o guarda-corpo): sai depois do laço.
  const realceFills: FillOp[] = [];
  const realceStrokes: StrokeOp[] = [];
  for (const l of linhasVisiveisMassa(linhas, hidden ?? VAZIO)) {
    if (l.pontos.length < 2) continue;
    const pts = l.pontos.map((q) => ({ x: q.s, y: q.z }));
    const cortado = l.estilo === ESTILO_CORTE_MASSA.cortado;
    const fechada = l.estilo !== ESTILO_CORTE_MASSA.feicao;
    if (cortado) {
      if (pts.length >= 3) fills.push({ polygons: [[pts]], color: mix(cor, base, 0.7), alpha: 1 });
      strokes.push({ pts, closed: true, ...paint.cut, color: cor, alpha: 1 });
    } else if (fechada) {
      strokes.push({ pts, closed: true, ...paint.proj, color: fraco, alpha: 1 });
    } else {
      strokes.push({ pts, closed: false, ...paint.proj, color: feicao, alpha: 1 });
    }
    if (selecionados.has(l.massaId)) {
      if (fechada && pts.length >= 3) realceFills.push({ polygons: [[pts]], color: theme.select, alpha: 0.25 });
      realceStrokes.push({ pts, closed: fechada, widthPx: 2, color: theme.select, alpha: 1 });
    } else if (highlight?.hover === l.massaId) {
      realceStrokes.push({ pts, closed: fechada, widthPx: 1.5, color: theme.select, alpha: 0.55 });
    }
  }
  fills.push(...realceFills);
  strokes.push(...realceStrokes);
}

/**
 * Massa sob o ponto (s, z) do corte ou da elevação, pelas mesmas linhas que o corte desenha. Oculta na vista não é alvo; sem kernel, null.
 * O contorno cortado ou projetado é a região clicável; a tolerância vem do chamador (unidades do desenho).
 */
export function pickMassaNoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined, ponto: Pt, tolerance: number): Id | null {
  const linhas = linhasCorteDaMassa(p, s);
  return linhas ? massaNoPonto(linhas, hidden ?? VAZIO, ponto, tolerance) : null;
}

/** Massas que a caixa de seleção do corte pega (coordenadas (s, z)): janela ou cruzamento, como o guarda-corpo. Sem kernel, vazio. */
export function massasNaCaixaDoCorte(p: Project, s: SectionResult, hidden: ReadonlySet<Id> | undefined, a: Pt, b: Pt): Id[] {
  const linhas = linhasCorteDaMassa(p, s);
  return linhas ? massasNaCaixa(linhas, hidden ?? VAZIO, a, b) : [];
}
