/**
 * Benchmark da frente de disciplinas: projeto de referência "Teste de disciplinas (completo)".
 *
 * Mede, em CPU (sem navegador/GPU), o custo de trocar a apresentação (clareamento/opacidade) e a
 * visibilidade de categoria em:
 *   - comandos do ProjectStore (perfil de disciplina, planta e vista 3D salva);
 *   - estilo + geometria da planta (`planStyleOf`, `planViewOf`, `buildPlanDrawList`);
 *   - montagem da cena 3D (`ModelScene.update`), com a mesma apresentação e com apresentação nova.
 *
 * Uso: `npx vite-node scripts/bench-disciplinas.mts` (ou `~/hestia-tools/pesado.sh npx vite-node ...`).
 * Os números de navegador (React/GPU) ficam em docs/desempenho/DISCIPLINAS-2026-11-24.md.
 */
import { performance } from 'node:perf_hooks';
import { GRAPHICS_CATEGORIES, ProjectStore, buildTemplate, type Apresentacao, type GraphicsCategory } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { LIGHT, ModelScene, buildPlanDrawList, planStyleOf, planViewOf, type PlanInput } from '@hestia/render';

const p = buildTemplate('casa-disciplinas');
const levelId = p.levels[0]!.id;
const resolved = resolveLevel(p, levelId, new Map());
const normal = (): Apresentacao => ({ tone: 'normal', clareamento: 0, opacidade: 1 });
const apA: Partial<Record<GraphicsCategory, Apresentacao>> = Object.fromEntries(GRAPHICS_CATEGORIES.map((c) => [c, normal()]));
const apB: Partial<Record<GraphicsCategory, Apresentacao>> = { ...apA, wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } };
const apC: Partial<Record<GraphicsCategory, Apresentacao>> = { ...apA, wall: { tone: 'halftone', clareamento: 0.5, opacidade: 0.25 } };

const med = (n: number, fn: () => void): number => {
  const xs: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    fn();
    xs.push(performance.now() - t);
  }
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)]!;
};

const planInput = (apresentacoes: Partial<Record<GraphicsCategory, Apresentacao>>): PlanInput => ({
  project: p,
  levelId,
  resolved,
  below: null,
  viewport: { cx: 6, cy: 6, zoom: 30, width: 1200, height: 800 },
  theme: LIGHT,
  dark: false,
  selection: [],
  hover: null,
  preview: [],
  inference: null,
  showGrid: true,
  showRoofProjection: true,
  hidden: new Set(),
  halftone: new Set(),
  apresentacoes,
});

const scene = new ModelScene({ instanciar: true });
const opt = (apresentacoes: Partial<Record<GraphicsCategory, Apresentacao>>) => ({ edges: true, shadows: true, dark: false, toneCategories: {}, apresentacoes, hidden: new Set<string>(), revealed: new Set<string>() });

console.log('projeto', p.elements && Object.keys(p.elements).length, 'elementos,', p.levels.length, 'níveis');
console.log('3D montagem inicial', med(1, () => scene.update(p, [resolved], opt(apA))).toFixed(1), 'ms');
console.log('3D mesma apresentação', med(5, () => scene.update(p, [resolved], opt(apA))).toFixed(1), 'ms');
console.log('3D apresentação nova', med(5, () => scene.update(p, [resolved], opt(apB))).toFixed(1), 'ms');
console.log('3D outra apresentação', med(5, () => scene.update(p, [resolved], opt(apC))).toFixed(1), 'ms');
console.log('planta estilo', med(20, () => planStyleOf(p, levelId, 1, undefined, undefined, apB)).toFixed(2), 'ms');
planViewOf(p, levelId);
console.log('planta vista (cache)', med(20, () => planViewOf(p, levelId)).toFixed(2), 'ms');
console.log('planta lista de desenho', med(10, () => buildPlanDrawList(planInput(apB))).toFixed(2), 'ms');

const s = new ProjectStore(p);
console.log('comando perfil (1x)', med(20, () => s.exec({ type: 'setDisciplineProfile', discipline: 'estrutura', tones: { wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } } })).toFixed(2), 'ms');
