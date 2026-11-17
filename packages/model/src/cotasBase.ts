import type { SpotCoordBase } from './annotationFamilies.ts';
import type { Project } from './types.ts';
import { coordenadaReal, cotaExibida } from './localizacao.ts';

/**
 * Elevação exibida por base da família (m):
 * - `project`: a COTA REAL do sistema da Localização (z + cotaZero); sem Localização, z menos a cota do ponto-base do projeto.
 * - `survey`: relativa ao ponto de levantamento (`settings.surveyPoint.z`); sem ele, a cota real da Localização (se houver).
 * - `relative`: relativa à cota do nível da vista.
 */
export function elevacaoDaBase(p: Project, base: SpotCoordBase, z: number, levelElev: number): number {
  if (base === 'relative') return z - levelElev;
  if (base === 'survey') {
    if (p.settings.surveyPoint) return z - p.settings.surveyPoint.z;
    return p.localizacao !== undefined ? cotaExibida(p, z) : z;
  }
  return p.localizacao !== undefined ? cotaExibida(p, z) : z - (p.settings.projectBasePoint?.z ?? 0);
}

/**
 * Coordenada (leste, norte) exibida por base da família:
 * - `project`: coordenada REAL da Localização (origem E/N e rotação pelo norte verdadeiro); sem Localização, relativa ao ponto-base.
 * - `survey`: relativa ao ponto de levantamento, girada pelo norte dele; sem ele, a coordenada real da Localização (se houver).
 * - `relative`: relativa ao ponto-base do projeto (sem rotação).
 */
export function coordenadaDaBase(p: Project, base: SpotCoordBase, pt: { x: number; y: number }): { leste: number; norte: number } {
  const bp = p.settings.projectBasePoint;
  if (base === 'relative') return { leste: pt.x - (bp?.x ?? 0), norte: pt.y - (bp?.y ?? 0) };
  if (base === 'survey' && p.settings.surveyPoint) {
    const sp = p.settings.surveyPoint;
    const sx = pt.x - sp.x;
    const sy = pt.y - sp.y;
    const rad = ((sp.trueNorthDeg ?? 0) * Math.PI) / 180;
    return { leste: sx * Math.cos(rad) + sy * Math.sin(rad), norte: -sx * Math.sin(rad) + sy * Math.cos(rad) };
  }
  if (p.localizacao !== undefined) return coordenadaReal(p, pt);
  return base === 'project' ? { leste: pt.x - (bp?.x ?? 0), norte: pt.y - (bp?.y ?? 0) } : { leste: pt.x, norte: pt.y };
}
