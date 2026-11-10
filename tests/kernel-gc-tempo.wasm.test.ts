/**
 * Tempo de ligar o guarda-corpo numa escada (L e caracol, dois lados) por etapa, sobre o Rust REAL, e prova de que editar uma parede não recalcula
 * o guarda-corpo (e vice-versa). Os tempos só são impressos com `KERNEL_TEMPO=1`; as provas de não recálculo rodam sempre em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeGuardaCorpo, makeLevel, makeStair, makeWall, type Project, type StairLanding, type StairRun } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateLShape } from '../packages/engine/src/stairGenerators.ts';
import { generateSpiralRun } from '../packages/engine/src/stairSpiral.ts';
import { montarCenaGC } from '../packages/engine/src/kernelGuardaCorpo.ts';
import { ServicoGuardaCorpo } from '../packages/engine/src/kernelGuardaCorpoServico.ts';
import * as THREE from 'three';
import { resolveLevel } from '../packages/engine/src/resolve.ts';
import { definirGerenciadorDoGuardaCorpo } from '../packages/engine/src/kernelGuardaCorpoServico.ts';
import { ModelScene } from '../packages/render/src/model3d/scene3d.ts';
import { buildGuardaCorpoSolids } from '../packages/render/src/model3d/guardaCorpo3d.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;
beforeAll(async () => {
  if (bytes) ger = await GerenciadorKernelV2.dosBytes(bytes).catch(() => null);
});

const lado = { lance: true, patamar: true };
const hosp = { tipo: 'escada' as const, escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' as const };

function base(comps: (StairRun | StairLanding)[]): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_top', name: 'Topo', elevation: 3.06 }) });
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_top', components: comps }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: s.project.defaults.wallTypeId, levelId: 'lv_0', a: { x: -3, y: -3 }, b: { x: 3, y: -3 } }) });
  return s;
}
function escadaL(): ProjectStore {
  const sk = generateLShape({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, tread: 0.28, risersFirst: 9, risersSecond: 9 });
  return base(sk.map((x, k) => (x.kind === 'run' ? ({ id: `c${k}`, kind: 'run', ...x.run } as StairRun) : ({ id: `c${k}`, kind: 'landing', ...x.landing } as StairLanding))));
}
function caracol(): ProjectStore {
  const r = generateSpiralRun({ center: { x: 0, y: 0 }, rInner: 0.1, rOuter: 1, startAngle: 0, sweep: (540 * Math.PI) / 180, risers: 19 });
  return base([{ id: 'c0', kind: 'run', ...r } as StairRun]);
}
const ligar = (s: ProjectStore): Project => {
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc1', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: hosp }) });
  return s.project;
};
const ms = <T>(f: () => T): [T, number] => {
  const t = performance.now();
  const r = f();
  return [r, performance.now() - t];
};
/** Tudo o que o app pede ao ligar: 3D, planta, corte, quantidades e avisos. */
function pedirTudo(srv: ServicoGuardaCorpo, p: Project): Record<string, number> {
  const t: Record<string, number> = {};
  t['preparar (montar TS + enviar)'] = ms(() => srv['preparar'](p))[1];
  t['malha (Rust+decod)'] = ms(() => srv.malhas(p))[1];
  t['3D (lotes)'] = ms(() => buildGuardaCorpoSolids(srv.malhas(p)!))[1];
  t['planta'] = ms(() => srv.planta(p, 'lv_0', 1.2, 1))[1];
  t['corte'] = ms(() => srv.corte(p, null, 1, -2, 0, 1, 6))[1];
  t['quantidades'] = ms(() => srv.quantidades(p))[1];
  t['avisos'] = ms(() => srv.avisos(p))[1];
  return t;
}

describe.skipIf(!bytes)('guarda-corpo: tempo e não recálculo', () => {
  if (process.env['KERNEL_TEMPO']) {
    for (const [nome, fab] of [['escada em L', escadaL], ['caracol', caracol]] as const) {
      it(`tempo ao ligar: ${nome}`, () => {
        const s = fab();
        const p0 = s.project;
        const srv = new ServicoGuardaCorpo(() => ger);
        const [, tMontar] = ms(() => montarCenaGC(ligar(fab())));
        const p = ligar(s);
        const rodadas: Record<string, number>[] = [];
        for (let i = 0; i < 3; i++) {
          srv.encerrar();
          srv.planta(p0, 'lv_0', 1.2); // a cena existe (ligar a caixa numa sessão já com guarda-corpo)
          rodadas.push(pedirTudo(srv, p));
        }
        const mediana = (k: string): number => rodadas.map((r) => r[k]!).sort((a, b) => a - b)[1]!;
        const linhas = Object.keys(rodadas[0]!).map((k) => `${k} ${mediana(k).toFixed(1)}`);
        const total = Object.keys(rodadas[0]!).reduce((a, k) => a + mediana(k), 0);
        // eslint-disable-next-line no-console
        console.log(`[GC-TEMPO] ${nome}: montarCenaGC ${tMontar.toFixed(1)} | ${linhas.join(' | ')} | TOTAL ${total.toFixed(1)} ms`);
        srv.encerrar();
      }, 120_000);
    }
  }

  it('editar uma parede não recalcula o guarda-corpo; editar o guarda-corpo recalcula', () => {
    const s = escadaL();
    const p1 = ligar(s);
    const srv = new ServicoGuardaCorpo(() => ger);
    const m1 = srv.malhas(p1)!;
    const pl1 = srv.planta(p1, 'lv_0', 1.2)!;
    // Parede editada: outro objeto de projeto, mesmo guarda-corpo.
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: s.project.defaults.wallTypeId, levelId: 'lv_0', a: { x: -3, y: 3 }, b: { x: 3, y: 3 } }) });
    const p2 = s.project;
    expect(p2).not.toBe(p1);
    expect(srv.malhas(p2)).toBe(m1);
    expect(srv.planta(p2, 'lv_0', 1.2)).toBe(pl1);
    // Guarda-corpo editado: recalcula.
    s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc2', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { ...hosp, lados: { esquerdo: lado, direito: { lance: false, patamar: false } } } }) });
    const p3 = s.project;
    const m3 = srv.malhas(p3)!;
    expect(m3).not.toBe(m1);
    expect(m3.map((m) => m.guardaId).sort()).toEqual(['gc1', 'gc2']);
    srv.encerrar();
  });

  it('3D: o guarda-corpo tem lote próprio; editar parede não o refaz e ligar/ocultar o guarda-corpo não remonta os níveis', () => {
    definirGerenciadorDoGuardaCorpo(() => ger);
    const s = escadaL();
    const p1 = ligar(s);
    const ms = new ModelScene({ instanciar: false });
    const niveis = (p: Project) => p.levels.map((l) => resolveLevel(p, l.id));
    const opt = { edges: false, shadows: false, dark: false };
    const gruposRailing = (): THREE.Object3D[] => {
      const out: THREE.Object3D[] = [];
      ms.scene.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData['kind'] === 'railing') out.push(o.parent!);
      });
      return [...new Set(out)];
    };
    const gruposNivel = (): THREE.Object3D[] => (ms['cenaNiveis'] as { grupo: THREE.Object3D }[]).map((e) => e.grupo);
    // Sem guarda-corpo: nenhum lote. Com: o lote existe e os níveis são os mesmos objetos.
    const p0 = escadaL().project;
    ms.update(p0, niveis(p0), opt);
    expect(gruposRailing()).toHaveLength(0);
    const niveis0 = gruposNivel();
    ms.update(p1, niveis(p1), opt);
    const gc1 = gruposRailing();
    expect(gc1).toHaveLength(1);
    expect(gruposNivel()).toEqual(niveis0);
    // Editar uma parede: o lote do guarda-corpo é o mesmo objeto; o nível editado é refeito.
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w9', typeId: s.project.defaults.wallTypeId, levelId: 'lv_0', a: { x: -3, y: 4 }, b: { x: 3, y: 4 } }) });
    const p2 = s.project;
    ms.update(p2, niveis(p2), opt);
    expect(gruposRailing()).toEqual(gc1);
    expect(gruposNivel()[0]).not.toBe(niveis0[0]);
    // Ocultar o guarda-corpo: o lote some e os níveis seguem os mesmos objetos.
    const antes = gruposNivel();
    ms.update(p2, niveis(p2), { ...opt, hidden: new Set(['gc1']) });
    expect(gruposRailing()).toHaveLength(0);
    expect(gruposNivel()).toEqual(antes);
    ms.dispose();
  });
});
