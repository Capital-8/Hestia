import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import { computeSection, junctionLevel, resolveLevel } from './index.ts';
import { levelFrames } from './resolveFrames.ts';
import { analyzeLevelTilt } from './wallTiltJoinLevel.ts';
import { limparCachesDeConteudo } from './cachesDeConteudo.ts';

/** Etapa P: cenário EXATO do P7 do navegador (zigue-zague de paredes wt_conc15, multicamada). */
export function zigue(n: number, tilt: number): Project {
  const s = new ProjectStore(createEmptyProject());
  const pts = Array.from({ length: n + 1 }, (_, i) => ({ x: i * 3, y: i % 2 ? 2 : 0 }));
  for (let i = 0; i < n; i++) s.exec({ type: 'addWall', wall: makeWall({ id: `Z${i}`, typeId: 'wt_conc15', levelId: 'lv_0', a: pts[i]!, b: pts[i + 1]!, ...(tilt ? { tilt } : {}) }) });
  return s.project;
}
const ms = (f: () => unknown): number => { const t = performance.now(); f(); return performance.now() - t; };
const CORTE = { a: { x: -2, y: 1 }, b: { x: 92, y: 1 }, depth: 6 };
const ELEV = { a: { x: -2, y: -3 }, b: { x: 92, y: -3 }, depth: 12 };
export function medirCenario(n: number, tilt: number): Record<string, number> {
  limparCachesDeConteudo();
  const p = zigue(n, tilt);
  const r: Record<string, number> = {};
  r.resolver = ms(() => resolveLevel(p, 'lv_0'));
  r.analise = ms(() => analyzeLevelTilt(levelFrames(p, 'lv_0')));
  r.juncao = ms(() => junctionLevel(p, 'lv_0'));
  r.corte = ms(() => computeSection(p, CORTE));
  r.elevacao = ms(() => computeSection(p, ELEV));
  return r;
}

/** Cenário do navegador: cada vista nova muda o projeto (novo snapshot) mas não as paredes; as caches de conteúdo seguem valendo. */
export function medirNovoSnapshot(n: number, tilt: number): Record<string, number> {
  const s = new ProjectStore(zigue(n, tilt));
  computeSection(s.project, CORTE);
  s.exec({ type: 'setProjectName', name: 'outro' });
  const r: Record<string, number> = {};
  r.resolver = ms(() => resolveLevel(s.project, 'lv_0'));
  r.juncao = ms(() => junctionLevel(s.project, 'lv_0'));
  r.corte = ms(() => computeSection(s.project, { ...CORTE, a: { x: -2, y: 1.1 } }));
  r.elevacao = ms(() => computeSection(s.project, { ...ELEV, a: { x: -2, y: -3.1 } }));
  return r;
}
