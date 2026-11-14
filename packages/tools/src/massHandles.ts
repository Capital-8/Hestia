import { dist, type Vec2 } from '@hestia/geom';
import { copiarSecoes, isMass, massIssue, type Id, type Mass, type Project } from '@hestia/model';
import { registrarAlcasDeElemento, type GripHold } from './selectGrips.ts';
import type { PreviewItem, ToolEnv } from './types.ts';

/**
 * Alças da massa em planta (A.9: alças só em planta; no 3D não). Duas: a de ORIGEM (arrastar move a massa inteira, pelo mesmo `transform` do
 * Mover) e, quando a PRIMEIRA seção tem perfil `livre`, uma por VÉRTICE do perfil da base (arrastar muda só aquele ponto, por `setMassSecoes`).
 * Cada arraste é UMA transação. O arraste do vértice é validado com `massIssue`: se o resultado for inválido (perfil não simples, por exemplo),
 * nada é gravado. Padrão de `guardaCorpoGrips.ts`; a alça entra na ferramenta Selecionar pelo registro de provedores (`registrarAlcasDeElemento`).
 */

/** Alça de uma massa selecionada. */
export type AlcaDaMassa = { massaId: Id; at: Vec2 } & ({ tipo: 'origem' } | { tipo: 'vertice'; indice: number });

/** Ponto local do perfil da base levado ao mundo: escala, rotação e deslocamento da primeira seção, depois a origem (A.4 regra 3, sem arranjo). */
function paraMundo(m: Mass, q: Vec2): Vec2 {
  const s = m.secoes[0]!;
  const c = Math.cos(s.rotacao);
  const sn = Math.sin(s.rotacao);
  const x = q.x * s.escala;
  const y = q.y * s.escala;
  return { x: m.origem.x + s.dx + x * c - y * sn, y: m.origem.y + s.dy + x * sn + y * c };
}

/** Ponto do mundo levado ao perfil local da primeira seção (a inversa de `paraMundo`). */
function paraLocal(m: Mass, w: Vec2): Vec2 {
  const s = m.secoes[0]!;
  const c = Math.cos(-s.rotacao);
  const sn = Math.sin(-s.rotacao);
  const x = w.x - m.origem.x - s.dx;
  const y = w.y - m.origem.y - s.dy;
  return { x: (x * c - y * sn) / s.escala, y: (x * sn + y * c) / s.escala };
}

/** Vértices do perfil `livre` da base no mundo (cópia original do arranjo); vazio para os demais perfis. */
export function verticesDaBase(m: Mass): Vec2[] {
  const perfil = m.secoes[0]?.perfil;
  return perfil?.forma === 'livre' ? perfil.pontos.map((q) => paraMundo(m, q)) : [];
}

/** Alças da massa: a origem e, com perfil livre na base, os vértices dele. */
export function alcasDaMassa(m: Mass): AlcaDaMassa[] {
  const out: AlcaDaMassa[] = [{ massaId: m.id, tipo: 'origem', at: { x: m.origem.x, y: m.origem.y } }];
  verticesDaBase(m).forEach((at, indice) => out.push({ massaId: m.id, tipo: 'vertice', indice, at }));
  return out;
}

/** Alça sob `at` entre as massas selecionadas (a mais próxima vence; no empate, a origem). */
export function alcaDaMassaEm(p: Project, ids: readonly Id[], at: Vec2, mpp: number): AlcaDaMassa | null {
  const tol = 9 * mpp;
  let melhor: { a: AlcaDaMassa; d: number } | null = null;
  for (const id of ids) {
    const m = p.elements[id];
    if (!isMass(m)) continue;
    for (const a of alcasDaMassa(m)) {
      const d = dist(a.at, at);
      if (d <= tol && (!melhor || d < melhor.d - 1e-12)) melhor = { a, d };
    }
  }
  return melhor?.a ?? null;
}

/**
 * Massa com o vértice `indice` do perfil livre da base levado a `ponto` (mundo). `null` quando a massa não tem perfil livre na base, o índice não
 * existe ou o resultado não passa em `massIssue` (a regra do modelo: nada inválido é gravado).
 */
export function massaComVerticeMovido(m: Mass, indice: number, ponto: Vec2): Mass | null {
  const perfil = m.secoes[0]?.perfil;
  if (perfil?.forma !== 'livre' || indice < 0 || indice >= perfil.pontos.length) return null;
  const secoes = copiarSecoes(m.secoes);
  const primeira = secoes[0]!;
  const novo = paraLocal(m, ponto);
  primeira.perfil = { forma: 'livre', pontos: perfil.pontos.map((q, i) => (i === indice ? novo : { x: q.x, y: q.y })) };
  const candidata: Mass = { ...m, secoes };
  return massIssue(candidata) === null ? candidata : null;
}

/** Alça como `GripHold`: prévia tracejada durante o arraste; soltar grava uma única transação (ou nada, se inválido ou sem movimento). */
export function massHold(env: ToolEnv, a: AlcaDaMassa): GripHold {
  let ponto: Vec2 = a.at;
  return {
    at: a.at,
    keepsFocus: false,
    drag(_p, snap): PreviewItem[] {
      const m = env.project().elements[a.massaId];
      if (!isMass(m)) return [];
      if (a.tipo === 'origem') {
        ponto = snap({});
        const d = { x: ponto.x - a.at.x, y: ponto.y - a.at.y };
        return [{ kind: 'line', a: a.at, b: ponto, dashed: true }, { kind: 'point', at: { x: m.origem.x + d.x, y: m.origem.y + d.y } }];
      }
      ponto = snap({ extraPoints: verticesDaBase(m).filter((_, i) => i !== a.indice) });
      const nova = massaComVerticeMovido(m, a.indice, ponto);
      // Inválido: sem prévia do perfil (o arraste não vai gravar); só o ponto sob o cursor.
      if (!nova) return [{ kind: 'point', at: ponto }];
      const anel = verticesDaBase(nova);
      return anel.map((q, i) => ({ kind: 'line' as const, a: q, b: anel[(i + 1) % anel.length]!, dashed: true }));
    },
    release(): void {
      const m = env.project().elements[a.massaId];
      if (!isMass(m) || dist(ponto, a.at) < 1e-9) return;
      if (a.tipo === 'origem') {
        const d = { x: ponto.x - a.at.x, y: ponto.y - a.at.y };
        env.transaction('Mover massa', () => env.exec({ type: 'transform', ids: [a.massaId], transform: { kind: 'translate', d } }));
        return;
      }
      const nova = massaComVerticeMovido(m, a.indice, ponto);
      if (!nova) return;
      env.transaction('Mover vértice da massa', () => env.exec({ type: 'setMassSecoes', id: a.massaId, secoes: nova.secoes }));
    },
  };
}

/** Alças das massas selecionadas, desenhadas como pontos (com a grade de alças do canvas). */
export function massHandlePreview(p: Project, sel: readonly Id[]): PreviewItem[] {
  const items: PreviewItem[] = [];
  for (const id of sel) {
    const m = p.elements[id];
    if (isMass(m)) for (const a of alcasDaMassa(m)) items.push({ kind: 'point', at: a.at });
  }
  return items;
}

// A ferramenta Selecionar ganha as alças da massa por este registro (o mesmo ponto de extensão que o app usa para a grade da cortina).
registrarAlcasDeElemento(
  (env, at) => {
    const a = alcaDaMassaEm(env.project(), env.selection(), at, env.metersPerPixel());
    return a ? massHold(env, a) : null;
  },
  // A prévia das alças é desenhada pelo `selectTool` (só fora da planta de área); este registro só liga o arraste.
  () => [],
);
