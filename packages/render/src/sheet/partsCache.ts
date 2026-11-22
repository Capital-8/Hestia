import { computeSection, type SectionLine, type SectionResult } from '@hestia/engine';
import { viewportAnchor, type Project, type SheetViewport, type SheetViewSource } from '@hestia/model';
import type { Lang } from '../i18n.ts';
import { memo, modelSig, SigCache, type Sig } from './cache.ts';
import type { SheetPoint, ViewportParts } from './types.ts';

/**
 * Cache do desenho de cada vista da prancha (desempenho 0.2.5).
 *
 * Chave: idioma + fonte da vista (com o `planId` da planta de disciplina, então duas plantas do mesmo nível nunca
 * dividem partes) + escala + tamanho da caixa + âncora RELATIVA à caixa. Validade: assinatura do modelo
 * (`modelSig`: todos os campos do projeto menos `sheets`). A posição da caixa (`at`) NÃO entra na chave: o desenho é só
 * transladado por (at - at do cache), o que torna mover uma vista (e inserir outra) livres de recálculo. Vistas 3D não
 * entram no cache (a câmera ao vivo não faz parte do projeto).
 */
export interface CachedParts {
  /** Partes na coordenada de papel do cache (a caixa do cache estava em `at`). */
  parts: ViewportParts;
  /** `at` com que o desenho foi calculado. */
  at: SheetPoint;
}

const partsCache = new SigCache<CachedParts>(48);
const sectionCache = new SigCache<SectionResult>(24);

/** Contadores para testes e medição. */
export const sheetCacheStats = {
  parts: () => ({ hits: partsCache.hits, misses: partsCache.misses, size: partsCache.size }),
  sections: () => ({ hits: sectionCache.hits, misses: sectionCache.misses, size: sectionCache.size }),
  clear: (): void => {
    partsCache.clear();
    sectionCache.clear();
  },
};

const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Chave do desenho de uma vista: tudo que muda o desenho, menos a posição absoluta da caixa. */
export function viewportPartsKey(v: SheetViewport, lang: Lang): string {
  const a = viewportAnchor(v);
  return JSON.stringify([lang, v.view, v.scale, r6(v.size.w), r6(v.size.h), r6(a.x - v.at.x), r6(a.y - v.at.y)]);
}

/** Corte/elevação em cache: o motor só depende do modelo e da linha (a escala da vista não entra no cálculo). */
export function computeSectionCached(p: Project, line: SectionLine): SectionResult {
  const key = JSON.stringify([line.a, line.b, line.depth]);
  return memo(sectionCache, key, modelSig(p), () => computeSection(p, line));
}

export function cacheable(view: SheetViewSource): boolean {
  return view.kind !== '3d';
}

/**
 * Partes da vista com o cache. `compute` calcula do zero (com a vista como está). `exact` = só aceita acerto com a
 * mesma posição (sem translação), para o PDF/DXF saírem bit a bit como o cálculo direto. Devolve o desenho e o
 * deslocamento a somar (zero quando a posição é a mesma do cache).
 */
export function cachedViewportParts(
  p: Project,
  v: SheetViewport,
  lang: Lang,
  compute: () => ViewportParts,
  sig: Sig = modelSig(p),
  exact = false,
): { parts: ViewportParts; shift: SheetPoint } {
  if (!cacheable(v.view)) return { parts: compute(), shift: { x: 0, y: 0 } };
  const key = viewportPartsKey(v, lang);
  const hit = partsCache.get(key, sig);
  if (hit) {
    const shift = { x: v.at.x - hit.at.x, y: v.at.y - hit.at.y };
    if (!exact || (shift.x === 0 && shift.y === 0)) return { parts: hit.parts, shift };
  }
  const parts = compute();
  partsCache.set(key, sig, { parts, at: { x: v.at.x, y: v.at.y } });
  return { parts, shift: { x: 0, y: 0 } };
}
