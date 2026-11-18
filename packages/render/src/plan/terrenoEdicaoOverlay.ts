import { alcasNaJanela, indiceDasFontes, linhaDeRotulo, mesmaRef, pontoCotado, type FonteRef, type JanelaMundo } from '@hestia/tools';
import { isTerrain, type Id } from '@hestia/model';
import type { PlanInput } from './build.ts';
import { ALCA_PX, quadradoEm } from './marcadores.ts';
import type { PlanOps } from './types.ts';
import { visibleBounds, type Viewport } from '../viewport.ts';

/**
 * Sobreposição do modo "Editar terreno" na planta (ficha T2, A.6): uma alça em cada ponto, vértice de curva e vértice de linha de quebra do terreno
 * em edição, o item escolhido em destaque. São as FONTES do modelo (nada de malha nem curva derivada). Com mais de 500 vértices na janela não desenha
 * alça nenhuma e mostra a mensagem ("aproxime para editar pontos").
 *
 * O estado chega em `input.terrenoEdicao` (a U1 o preenche a partir de `useUi.terrenoEdicao` e da ferramenta `terrainEdit`: `selecionado` e a
 * `mensagem` que `tool.alcas()` devolve, já no idioma da interface). A mesma janela que a ferramenta recebe em `definirJanela` vem de `janelaDaVista`.
 */
export interface TerrenoEdicaoVista {
  terrenoId: Id;
  /** Item escolhido (vértice, rótulo ou ponto cotado): ganha o destaque. */
  selecionado?: FonteRef | null;
  /** Texto de "aproxime para editar pontos" no idioma da interface; sai no centro da vista quando há alças demais. */
  mensagem?: string | null;
}

/** A entrada da planta com o modo de edição: a `PlanInput` comum mais o campo opcional (sem ele, o modo está desligado). */
export type PlanInputComEdicao = PlanInput & { terrenoEdicao?: TerrenoEdicaoVista | null };

/** Janela do mundo (m) que a vista mostra: o limite de 500 alças vale nela. */
export function janelaDaVista(v: Viewport): JanelaMundo {
  const b = visibleBounds(v);
  return { min: { x: b.minX, y: b.minY }, max: { x: b.maxX, y: b.maxY } };
}

const BRANCO = '#ffffff';

/** Alças e destaques do modo de edição (vazio quando o modo está desligado, o terreno não existe ou é de outro nível). */
export function terrenoEdicaoOps(input: PlanInputComEdicao): PlanOps {
  const out: PlanOps = { fills: [], strokes: [], labels: [] };
  const ed = input.terrenoEdicao;
  const tn = ed ? input.project.elements[ed.terrenoId] : undefined;
  if (!ed || !isTerrain(tn) || tn.levelId !== input.levelId || input.hidden?.has(tn.id)) return out;
  const cor = input.theme.select;
  const sel = ed.selecionado ?? null;
  const a = alcasNaJanela(indiceDasFontes(tn), janelaDaVista(input.viewport));
  if (a.excedeu) {
    if (ed.mensagem) out.labels.push({ at: { x: input.viewport.cx, y: input.viewport.cy }, text: ed.mensagem, tone: 'accent' });
    return out;
  }
  const alca = (at: { x: number; y: number }, meio: number, cheia: boolean): void => {
    const q = quadradoEm(at, meio);
    out.fills.push({ ...q.fill, color: cheia ? cor : BRANCO, alpha: 1 });
    out.strokes.push({ ...q.traco, widthPx: 1.6, color: cor, alpha: 1 });
  };
  for (const v of a.vertices) if (!mesmaRef(v.ref, sel)) alca(v, ALCA_PX, false);
  for (const v of a.vertices) if (mesmaRef(v.ref, sel)) alca(v, ALCA_PX + 1.5, true);
  if (sel?.tipo === 'rotulo') {
    const l = linhaDeRotulo(tn, sel.i);
    if (l) out.strokes.push({ pts: [l[0], l[1]], closed: false, widthPx: 3, color: cor, alpha: 1 });
  } else if (sel?.tipo === 'cotado') {
    const q = pontoCotado(tn, sel.i);
    if (q) alca(q, ALCA_PX + 1.5, true);
  }
  return out;
}
