/**
 * Custo de desenhar escadas e guarda-corpos em cortes e elevações, comparado a paredes e lajes (pedido do dono: "precisa
 * desenhar rapidamente igual aos outros"). Projetos 100% sintéticos; o kernel Rust fica ligado como no app (fatias A e B e
 * guarda-corpo), então os tempos incluem o despacho.
 *
 * Por tipo de elemento e N (1, 10, 50, 100, espalhados por vários níveis) mede, em ms:
 *   corteL    computeSection + buildSectionDrawList (+ linhas do guarda-corpo), corte longitudinal, projeto novo (frio)
 *   corteT    idem, corte transversal
 *   elev      idem, elevação (linha fora da construção)
 *   quente    redesenho da elevação sobre o mesmo projeto (pan, zoom, hover)
 *   edicao    elevação depois de uma edição que NÃO toca nos elementos (move uma parede distante): o app recalcula
 *   planta    resolveLevel + buildPlanDrawList do nível mais carregado (frio)
 *   cena3d    ModelScene.update (todos os níveis, frio)
 * Uso: npx vite-node scripts/bench-escada-vistas.mts [N,N,...]   (BENCH_REP muda as repetições; padrão 3, mediana)
 * Saída: tabela em texto e JSON em BENCH_SAIDA (se definido).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  ProjectStore,
  createEmptyProject,
  makeGuardaCorpo,
  makeLevel,
  makeSlab,
  makeStair,
  makeWall,
  DEFAULT_STAIR_TYPES,
  type Command,
  type Id,
  type Project,
  type StairLanding,
  type StairRun,
  type StairType,
} from '@hestia/model';
import { computeSection, iniciarDespachoKernel, planStairFree, resolveLevel, resolveFloors, resolveSlabs, resolveRoofs, servicoGuardaCorpo, generateLShape, generateStraightRun, type StairComponentSketch } from '@hestia/engine';
import { LIGHT, ModelScene, buildPlanDrawList, buildSectionDrawList, type PlanInput } from '@hestia/render';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';

export type Tipo = 'parede' | 'laje' | 'reta' | 'L' | 'livre' | 'reta+acab' | 'L+acab' | 'livre+acab' | 'reta+gc' | 'L+gc' | 'gc-manual';
export const TIPOS: Tipo[] = ['parede', 'laje', 'reta', 'L', 'livre', 'reta+acab', 'L+acab', 'livre+acab', 'reta+gc', 'L+gc', 'gc-manual'];

const ALTURA = 3.06;
const PASSO = 7;
const ACAB = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.02 } as const;
const comps = (sk: StairComponentSketch[]): Array<StairRun | StairLanding> =>
  sk.map((c, i) => (c.kind === 'run' ? ({ id: `c${i}`, kind: 'run', ...c.run } as StairRun) : ({ id: `c${i}`, kind: 'landing', ...c.landing } as StairLanding)));

function tipoComAcabamento(): StairType {
  const base = DEFAULT_STAIR_TYPES.find((t) => t.id === 'stt_monolitica')!;
  return { ...base, id: 'stt_acab', ...ACAB } as StairType;
}

/** Projeto com `n` elementos do tipo, espalhados em níveis (um elemento por posição x; nível = i mod níveis). */
export function projetoDe(tipo: Tipo, n: number): { project: Project; niveis: Id[] } {
  const store = new ProjectStore(createEmptyProject('Bench'));
  const nNiveis = Math.max(2, Math.min(n, 10) + 1);
  const niveis: Id[] = ['lv_0'];
  const cmds: Command[] = [{ type: 'upsertStairType', stairType: tipoComAcabamento() }];
  for (let k = 1; k < nNiveis; k++) {
    niveis.push(`lv_${k}`);
    cmds.push({ type: 'upsertLevel', level: makeLevel({ id: `lv_${k}`, name: `N${k}`, elevation: k * ALTURA }) });
  }
  const wallType = store.project.defaults.wallTypeId;
  const lado = { lance: true, patamar: true };
  for (let i = 0; i < n; i++) {
    const k = i % (nNiveis - 1);
    const lv = `lv_${k}`;
    const top = `lv_${k + 1}`;
    const x = i * PASSO;
    const id = `e${i}`;
    if (tipo === 'parede') cmds.push({ type: 'addWall', wall: makeWall({ id, typeId: wallType, levelId: lv, a: { x, y: 0 }, b: { x: x + 5, y: 0 } }) });
    else if (tipo === 'laje') cmds.push({ type: 'addSlab', slab: makeSlab({ id, typeId: 'ls_mac15', levelId: lv, boundary: [{ x, y: -1 }, { x: x + 5, y: -1 }, { x: x + 5, y: 1 }, { x, y: 1 }] }) });
    else if (tipo === 'gc-manual') {
      cmds.push({
        type: 'addGuardaCorpo',
        guardaCorpo: makeGuardaCorpo({ id, levelId: lv, typeId: 'gct_balaustres', cotaBase: k * ALTURA, altura: 1.1, hospedeiro: { tipo: 'manual', uso: 'varanda', caminho: [{ x, y: 0, dz: 0 }, { x: x + 5, y: 0, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' } }),
      });
    } else {
      const comAcab = tipo.includes('acab');
      const typeId = comAcab ? 'stt_acab' : 'stt_monolitica';
      let components: Array<StairRun | StairLanding>;
      if (tipo.startsWith('reta')) components = comps([{ kind: 'run', run: generateStraightRun({ start: { x, y: 0 }, dir: { x: 1, y: 0 }, width: 1.2, risers: 19, tread: 0.25 }) }]);
      else if (tipo.startsWith('L')) components = comps(generateLShape({ start: { x, y: 0 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, tread: 0.27, risersFirst: 10, risersSecond: 9 }));
      else {
        const base = DEFAULT_STAIR_TYPES.find((t) => t.id === 'stt_monolitica')!;
        const r = planStairFree([{ x, y: 0 }, { x: x + 3, y: 0 }, { x: x + 3, y: 3 }], ALTURA, base, { width: 1.2 });
        if ('error' in r) throw new Error(r.error);
        components = comps(r.parts);
      }
      cmds.push({ type: 'addStair', stair: makeStair({ id, typeId, levelId: lv, topLevelId: top, components }) });
      if (tipo.endsWith('+gc')) {
        cmds.push({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: `g${i}`, levelId: lv, typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: id, lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
      }
    }
  }
  // Uma parede distante para a "edição que não toca nos elementos".
  cmds.push({ type: 'addWall', wall: makeWall({ id: 'distante', typeId: wallType, levelId: 'lv_0', a: { x: -50, y: 40 }, b: { x: -40, y: 40 } }) });
  store.exec({ type: 'batch', commands: cmds });
  return { project: store.project, niveis };
}

const vp = { cx: 0, cy: 0, zoom: 30, width: 1400, height: 800 };
function desenhar(p: Project, line: { a: { x: number; y: number }; b: { x: number; y: number }; depth: number }): number {
  const section = computeSection(p, line);
  const dl = buildSectionDrawList({ project: p, section, viewport: { ...vp, cx: section.length / 2, cy: (section.zMin + section.zMax) / 2 }, theme: LIGHT, dark: false, showGrid: false });
  return dl.fills.length + dl.strokes.length;
}
const ms = <T,>(f: () => T): number => {
  const t = performance.now();
  f();
  return performance.now() - t;
};
const mediana = (xs: number[]): number => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

export interface Linha {
  tipo: Tipo;
  n: number;
  corteL: number;
  corteT: number;
  elev: number;
  quente: number;
  edicao: number;
  planta: number;
  cena3d: number;
}

export async function ligarKernel(): Promise<void> {
  const caminho = caminhoDoWasm();
  if (!existsSync(caminho)) throw new Error('geom_wasm.wasm ausente');
  await iniciarDespachoKernel({ fatiaA: true, fatiaB: true, sombra: false }, async () => readFileSync(caminho));
}

export function medir(tipo: Tipo, n: number, rep: number): Linha {
  const col = { corteL: [] as number[], corteT: [] as number[], elev: [] as number[], quente: [] as number[], edicao: [] as number[], planta: [] as number[], cena3d: [] as number[] };
  const larg = n * PASSO + 6;
  for (let r = 0; r < rep; r++) {
    const { project: p0, niveis } = projetoDe(tipo, n);
    // Frio de verdade: cada medida usa um projeto novo (os memos do motor são por projeto).
    const novo = (): Project => projetoDe(tipo, n).project;
    const longit = { a: { x: -2, y: 0.01 }, b: { x: larg, y: 0.01 }, depth: 6 };
    const transv = { a: { x: 2.5, y: -6 }, b: { x: 2.5, y: 6 }, depth: larg };
    const elevacao = { a: { x: -2, y: -20 }, b: { x: larg, y: -20 }, depth: 60 };
    col.corteL.push(ms(() => desenhar(novo(), longit)) - 0); // inclui montar o projeto; descontado abaixo
    col.corteT.push(ms(() => desenhar(novo(), transv)));
    col.elev.push(ms(() => desenhar(novo(), elevacao)));
    const montar = mediana([ms(novo), ms(novo), ms(novo)]);
    col.corteL[col.corteL.length - 1]! -= montar;
    col.corteT[col.corteT.length - 1]! -= montar;
    col.elev[col.elev.length - 1]! -= montar;
    desenhar(p0, elevacao);
    col.quente.push(ms(() => desenhar(p0, elevacao)));
    // Edição que não toca nos elementos: novo objeto de projeto, mesmo conteúdo dos elementos.
    const store = new ProjectStore(p0);
    desenhar(store.project, elevacao);
    store.exec({ type: 'updateElements', ids: ['distante'], patch: { b: { x: -39, y: 40 } } });
    col.edicao.push(ms(() => desenhar(store.project, elevacao)));
    // Planta do nível mais carregado e cena 3D (frio).
    const lvPlanta = niveis[0]!;
    const pp = novo();
    col.planta.push(
      ms(() => {
        const resolved = resolveLevel(pp, lvPlanta);
        const input: PlanInput = {
          project: pp, levelId: lvPlanta, resolved, below: null, belowFloors: resolveFloors(pp, lvPlanta), belowSlabs: resolveSlabs(pp, lvPlanta), belowRoofs: resolveRoofs(pp, lvPlanta),
          viewport: { ...vp, cx: larg / 2, zoom: Math.min(30, 1400 / larg) }, theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: true,
        } as PlanInput;
        buildPlanDrawList(input);
      }) - 0,
    );
    const p3 = novo();
    const ms3 = new ModelScene();
    col.cena3d.push(ms(() => ms3.update(p3, p3.levels.map((l) => resolveLevel(p3, l.id)), { edges: false, shadows: false, dark: false })));
    ms3.dispose();
  }
  return { tipo, n, corteL: mediana(col.corteL), corteT: mediana(col.corteT), elev: mediana(col.elev), quente: mediana(col.quente), edicao: mediana(col.edicao), planta: mediana(col.planta), cena3d: mediana(col.cena3d) };
}

async function main(): Promise<void> {
  await ligarKernel();
  await new Promise((r) => setTimeout(r, 500));
  const ns = (process.argv[2] ?? '1,10,50,100').split(',').map(Number);
  const tipos = (process.env['BENCH_TIPOS'] ?? TIPOS.join(',')).split(',') as Tipo[];
  const rep = Number(process.env['BENCH_REP'] ?? 3);
  // aquecimento do JIT e do wasm
  medir('parede', 2, 1);
  medir('reta+gc', 2, 1);
  const out: Linha[] = [];
  console.log('tipo\tN\tcorteL\tcorteT\telev\tquente\tedicao\tplanta\tcena3d  (ms; por elemento = elev/N)');
  for (const tipo of tipos) {
    for (const n of ns) {
      const l = medir(tipo, n, rep);
      out.push(l);
      console.log([l.tipo, l.n, ...[l.corteL, l.corteT, l.elev, l.quente, l.edicao, l.planta, l.cena3d].map((v) => v.toFixed(0))].join('\t') + `\t${(l.elev / n).toFixed(1)}/el`);
      if (process.env['BENCH_SAIDA']) writeFileSync(process.env['BENCH_SAIDA'], JSON.stringify(out, null, 1));
    }
  }
  servicoGuardaCorpo().encerrar();
  process.exit(0);
}
if (!process.env.SEM_MAIN) void main();
