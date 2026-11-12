import { applyTransform, type Transform } from '@hestia/geom';
import type { Command } from './commands.ts';
import type { GuardaCorpo, HospedeiroGC, LadoGC } from './guardaCorpoTypes.ts';
import { newId } from './ids.ts';
import { isGuardaCorpo, isRamp, isStair, type Element, type Id, type Project } from './types.ts';

// Mover, girar, espelhar e copiar o guarda-corpo (decisão 0055 §4.4 e §25). Mesmo padrão das paredes: o comando
// genérico `transform` leva o elemento.
// - Manual: o caminho acompanha a transformação.
// - Hospedado em escada ou rampa: o caminho vem do hospedeiro, então só acompanha quando o hospedeiro é transformado
//   junto. Sozinho, não se move (as ferramentas recusam com mensagem; o comando ignora).

/** Troca esquerdo e direito: espelhar inverte a mão, e a geometria só se mantém se o lado também trocar. */
const trocaLado = (l: LadoGC | 'centro'): LadoGC | 'centro' => (l === 'esquerdo' ? 'direito' : l === 'direito' ? 'esquerdo' : l);

/** O hospedeiro (escada ou rampa) do guarda-corpo, ou null no manual. */
export function hospedeiroDoGuardaCorpo(g: GuardaCorpo): Id | null {
  const h = g.hospedeiro;
  return h.tipo === 'escada' ? h.escadaId : h.tipo === 'rampa' ? h.rampaId : null;
}

/** Guarda-corpo manual transformado: pontos do caminho transformados; espelhar troca o lado do deslocamento. */
export function transformGuardaCorpo(g: GuardaCorpo, t: Transform): GuardaCorpo {
  const h = g.hospedeiro;
  if (h.tipo !== 'manual') return g;
  const caminho = h.caminho.map((v) => {
    const q = applyTransform(t, v);
    return { x: q.x, y: q.y, dz: v.dz };
  });
  return { ...g, hospedeiro: { ...h, caminho, ...(t.kind === 'mirror' ? { ladoDeslocamento: trocaLado(h.ladoDeslocamento) as typeof h.ladoDeslocamento } : {}) } };
}

/** Hospedeiro com esquerdo e direito trocados (o hospedeiro foi espelhado: o croqui dele troca os limites). */
function hospedeiroEspelhado(h: HospedeiroGC): HospedeiroGC {
  if (h.tipo === 'manual') return h;
  return { ...h, lados: { esquerdo: h.lados.direito, direito: h.lados.esquerdo } };
}

/** Prefixo de id da cópia de guarda-corpo. */
export const PREFIXO_ID_GUARDA_CORPO = 'gc';

/** Ids novos para os guarda-corpos que a cópia leva: manuais selecionados e hospedados nas escadas ou rampas copiadas. */
export function guardaCorposDaCopia(p: Project, ids: readonly Id[]): Id[] {
  const sel = new Set(ids);
  const out: Id[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isGuardaCorpo(e)) continue;
    const host = hospedeiroDoGuardaCorpo(e);
    if (host === null ? sel.has(e.id) : sel.has(host)) out.push(e.id);
  }
  return out;
}

/** Acrescenta ao mapa de ids da cópia os guarda-corpos que seguem as escadas, rampas e manuais copiados. */
export function mapaDeIdsDeGuardaCorpos(p: Project, ids: readonly Id[], map: Record<Id, Id>): void {
  for (const id of guardaCorposDaCopia(p, ids)) map[id] = newId(PREFIXO_ID_GUARDA_CORPO);
}

/**
 * Parte do comando `transform` que cuida dos guarda-corpos. Sem cópia: manuais em `ids` se transformam; hospedados
 * seguem o hospedeiro (só o espelho troca os lados). Com cópia: manuais e hospedados de hospedeiro copiado viram novos
 * elementos (ids de `idMap`), com o hospedeiro remapeado para a escada ou rampa nova.
 */
export function transformarGuardaCorpos(p: Project, c: Extract<Command, { type: 'transform' }>): void {
  const ids = new Set(c.ids);
  const espelho = c.transform.kind === 'mirror';
  const idMap = c.copy?.idMap;
  for (const e of Object.values(p.elements) as Element[]) {
    if (!isGuardaCorpo(e)) continue;
    const host = hospedeiroDoGuardaCorpo(e);
    const hostEmIds = host !== null && ids.has(host) && (isStair(p.elements[host]) || isRamp(p.elements[host]));
    if (host === null ? !ids.has(e.id) : !hostEmIds) continue;
    if (!idMap) {
      if (host === null) p.elements[e.id] = transformGuardaCorpo(e, c.transform);
      else if (espelho) p.elements[e.id] = { ...e, hospedeiro: hospedeiroEspelhado(e.hospedeiro) };
      continue;
    }
    const nid = idMap[e.id];
    if (!nid) continue;
    let next: GuardaCorpo = host === null ? transformGuardaCorpo(e, c.transform) : { ...e, hospedeiro: espelho ? hospedeiroEspelhado(e.hospedeiro) : e.hospedeiro };
    if (host !== null) {
      const nh = idMap[host];
      if (!nh) continue;
      const h = next.hospedeiro;
      next = { ...next, hospedeiro: h.tipo === 'escada' ? { ...h, escadaId: nh } : h.tipo === 'rampa' ? { ...h, rampaId: nh } : h };
    }
    p.elements[nid] = { ...next, id: nid, order: p.nextOrder++ };
  }
}
