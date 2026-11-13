// Alça da linha de grade selecionada na parede cortina, na planta (decisão 0056, fase 2, §10): a linha selecionada como subelemento
// mostra a alça (e o cadeado, quando travada); arrastar a alça move a linha com `moveGridLine`, encaixada na grade do projeto e presa
// entre as vizinhas. Um arraste vira um passo de desfazer. A lógica pura (alças, limites e cadeado) está em `curtainHandles.ts`; este
// arquivo só liga essa lógica ao modelo, ao estado do editor e ao registro de alças das ferramentas. Só a linha vertical (U) arrasta
// na planta: a horizontal (V) é uma altura, que o cursor da planta não lê.
import { dist, type Vec2 } from '@hestia/geom';
import { isWall, resolverParede, type LineRef, type Project, type SubelementoCortina, type Wall } from '@hestia/model';
import { encaixeNaGradeDaParede, registrarAlcasDeElemento, type GripHold, type PreviewItem, type ToolEnv } from '@hestia/tools';
import { alcasDeLinhas, resultadoArraste, type AlcaDeLinha } from './curtainHandles.ts';
import { useUi } from './state.ts';

/** Raio (px) em que o cursor pega a alça. */
const TOL_PX = 8;
/** Meia-extensão (m) da prévia da linha, perpendicular à parede. */
const MEIA_PREVIA = 0.3;
/** Deslocamento (px) do cadeado em relação à alça. */
const CADEADO_DESLOCAMENTO_PX = 10;

/** Mesma referência de linha? Extra pelo id; gerada pelo eixo e pelo índice (a forma que o kernel e as alças usam). */
function mesmaRef(a: LineRef, b: LineRef): boolean {
  if ('added' in a) return 'added' in b && a.added === b.added;
  if ('added' in b) return false;
  return a.axis === b.axis && a.index === b.index;
}

/** Ponto da parede a `s` metros do início (a) ao longo do eixo da parede. */
const pontoNaParede = (w: Wall, dir: Vec2, s: number): Vec2 => ({ x: w.a.x + dir.x * s, y: w.a.y + dir.y * s });

/** Parede cortina, direção unitária da parede e alça da linha selecionada, só quando a linha é vertical (U). */
function linhaSelecionada(p: Project, sub: SubelementoCortina | null): { wall: Wall; dir: Vec2; alca: AlcaDeLinha } | null {
  if (!sub || sub.kind !== 'line') return null;
  const w = p.elements[sub.wallId];
  if (!w || !isWall(w)) return null;
  const res = resolverParede(p, w);
  if (!res) return null;
  const alca = alcasDeLinhas(w.id, res).find((a) => mesmaRef(a.line, sub.line));
  if (!alca || alca.eixo !== 'u') return null;
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  if (!(L > 0)) return null;
  return { wall: w, dir: { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L }, alca };
}

/** Prévia da linha na posição `s` (ponto da alça e traço perpendicular à parede). */
function previaDaLinha(w: Wall, dir: Vec2, s: number): PreviewItem[] {
  const c = pontoNaParede(w, dir, s);
  const n: Vec2 = { x: -dir.y, y: dir.x };
  return [
    { kind: 'point', at: c },
    { kind: 'line', a: { x: c.x - n.x * MEIA_PREVIA, y: c.y - n.y * MEIA_PREVIA }, b: { x: c.x + n.x * MEIA_PREVIA, y: c.y + n.y * MEIA_PREVIA }, dashed: true },
  ];
}

/**
 * Alça da linha selecionada sob o cursor (provedor de alças da seleção). Arrastar: o cursor é projetado no eixo da parede, encaixa
 * na grade do projeto e prende entre as vizinhas (`resultadoArraste`). Soltar grava `moveGridLine` num único passo de desfazer.
 */
export function alcaDaLinhaDeCortina(env: ToolEnv, at: Vec2): GripHold | null {
  if (useUi.getState().view !== 'plan') return null;
  const sel = linhaSelecionada(env.project(), env.subelemento?.() ?? null);
  if (!sel) return null;
  const { wall, dir, alca } = sel;
  const cabeca = pontoNaParede(wall, dir, alca.pos);
  if (dist(at, cabeca) > TOL_PX * env.metersPerPixel()) return null;
  let novo = alca.pos;
  return {
    at: cabeca,
    keepsFocus: false,
    drag(_p, snap) {
      const cursor = snap({});
      const s = (cursor.x - wall.a.x) * dir.x + (cursor.y - wall.a.y) * dir.y;
      novo = resultadoArraste(alca, encaixeNaGradeDaParede(s, wall.a, dir, env.gridStep()), 0, 0).pos;
      return previaDaLinha(wall, dir, novo);
    },
    release() {
      const r = resultadoArraste(alca, novo, 0, 0);
      if (!r.comando) return;
      try {
        env.transaction('Mover linha de grade', () => env.exec(r.comando!));
      } catch (e) {
        env.say(e instanceof Error ? e.message : String(e));
      }
    },
  };
}

/**
 * Prévia da alça da linha selecionada (ociosa): um ponto na linha e, quando travada, um cadeado ao lado. Desenhado em pontos e
 * linhas da planta (o cadeado é um contorno pequeno: corpo e arco). Só na planta.
 */
export function previaDaAlcaDeCortina(env: ToolEnv): PreviewItem[] {
  if (useUi.getState().view !== 'plan') return [];
  const sel = linhaSelecionada(env.project(), env.subelemento?.() ?? null);
  if (!sel) return [];
  const { wall, dir, alca } = sel;
  const cabeca = pontoNaParede(wall, dir, alca.pos);
  const items: PreviewItem[] = [{ kind: 'point', at: cabeca }];
  if (alca.travada) items.push(...cadeado(cabeca, env.metersPerPixel()));
  return items;
}

/** Cadeado fechado em contorno (corpo retangular e arco), na escala de pixel `mpp`, com o canto à direita e acima da alça. */
function cadeado(alvo: Vec2, mpp: number): PreviewItem[] {
  const s = mpp;
  const o = { x: alvo.x + CADEADO_DESLOCAMENTO_PX * mpp, y: alvo.y + CADEADO_DESLOCAMENTO_PX * mpp };
  // Coordenadas do desenho de 16 px (corpo de 4 a 12 em x, de 7 a 14 em y; arco de centro (8, 5) e raio 2,5).
  const q = (x: number, y: number): Vec2 => ({ x: o.x + (x - 8) * s, y: o.y + (8 - y) * s });
  const corpo = [q(4, 7), q(12, 7), q(12, 14), q(4, 14), q(4, 7)];
  const arco: Vec2[] = [];
  for (let k = 0; k <= 12; k++) {
    const th = Math.PI - (Math.PI * k) / 12;
    arco.push(q(8 + 2.5 * Math.cos(th), 5 - 2.5 * Math.sin(th)));
  }
  return [
    { kind: 'polygon', ring: corpo },
    { kind: 'line', a: q(5.5, 7), b: arco[0]! },
    ...arco.slice(0, -1).map((p, k) => ({ kind: 'line' as const, a: p, b: arco[k + 1]! })),
    { kind: 'line', a: arco[arco.length - 1]!, b: q(10.5, 7) },
  ];
}

registrarAlcasDeElemento(alcaDaLinhaDeCortina, previaDaAlcaDeCortina);
