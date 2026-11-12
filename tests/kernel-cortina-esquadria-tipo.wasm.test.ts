/**
 * Parede cortina: trocar o TIPO da esquadria de uma célula (painel de subelemento: `updateCellOpening` com `openingTypeId`) muda o modelo montado e as peças do 3D
 * (material, folha, layout), sobre o Rust REAL. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, openingTypeById, type Project } from '@hestia/model';
import { definirGerenciadorDaCortina, esquadriasDaCortina, modeloDaEsquadriaCortina, resolveLevel } from '../packages/engine/src/index.ts';
import { ModelScene } from '../packages/render/src/index.ts';
import { projetoComCortina } from '../packages/engine/src/fixtureCortina.ts';
import { deslocamentoDaPeca } from '../packages/render/src/model3d/geometriaPeca3d.ts';
import { pecasDoModelo } from '../packages/render/src/model3d/openingParts.ts';
import { assinaturasDasCortinasPorNivel } from '../packages/engine/src/cortinaProjeto.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
  definirGerenciadorDaCortina(() => ger);
});

afterAll(() => definirGerenciadorDaCortina(() => null));

/** Cortina com uma esquadria do tipo dado na célula (1, 0). */
function comTipo(id: string): ProjectStore {
  const s = new ProjectStore(projetoComCortina());
  s.exec({ type: 'setCellOpening', wallId: 'ct1', i: 1, j: 0, openingTypeId: id, flipHand: false, flipFacing: false, mark: 'P1', fit: 'cell', fundir: true });
  return s;
}

/** Materiais (ids do projeto) das peças que o 3D desenha, por papel. */
function materiaisPorPapel(p: Project): Record<string, string[]> {
  const e = esquadriasDaCortina(p)[0]!;
  const t = openingTypeById(p, e.opening.typeId)!;
  const out: Record<string, Set<string>> = {};
  for (const q of pecasDoModelo(p, t, modeloDaEsquadriaCortina(p, e), false)) (out[q.role] ??= new Set()).add(q.materialId);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}

describe('parede cortina: a troca do tipo da esquadria chega ao modelo e ao 3D', () => {
  it.skipIf(!bytes)('tipos do catálogo existem no projeto vazio e têm materiais diferentes', () => {
    const s = new ProjectStore(projetoComCortina());
    for (const id of ['ot_pgiro80', 'ot_psanf80', 'ot_pvid82_8', 'ot_pf60_80', 'ot_pcorrer160', 'ot_pband40_alu_90', 'ot_pband40_pvc_90']) expect(openingTypeById(s.project, id), id).toBeDefined();
    const mats = ['ot_pgiro80', 'ot_psanf80', 'ot_pvid82_8', 'ot_pf60_80'].map((id) => openingTypeById(s.project, id)!.frameMaterialId);
    expect(new Set(mats).size).toBe(4);
  });

  it.skipIf(!bytes)('o material das peças acompanha o tipo (madeira, PVC, aço) e a troca por updateCellOpening reconstrói o modelo', () => {
    const s = comTipo('ot_pgiro80');
    const antes = materiaisPorPapel(s.project);
    expect(antes['leaf']).toContain('mat_madeira');
    const m0 = modeloDaEsquadriaCortina(s.project, esquadriasDaCortina(s.project)[0]!);
    const hash0 = assinaturasDasCortinasPorNivel(s.project).get('lv_0');
    s.exec({ type: 'updateCellOpening', wallId: 'ct1', i: 1, j: 0, patch: { openingTypeId: 'ot_pf60_80' } });
    const e1 = esquadriasDaCortina(s.project)[0]!;
    expect(e1.opening.typeId).toBe('ot_pf60_80');
    expect(modeloDaEsquadriaCortina(s.project, e1)).not.toBe(m0);
    expect(materiaisPorPapel(s.project)['leaf']).toEqual(['mat_aco']);
    // A chave do lote 3D da cortina muda com o tipo (o cache não deixa a esquadria antiga na tela).
    expect(assinaturasDasCortinasPorNivel(s.project).get('lv_0')).not.toBe(hash0);
    s.exec({ type: 'updateCellOpening', wallId: 'ct1', i: 1, j: 0, patch: { openingTypeId: 'ot_psanf80' } });
    expect(materiaisPorPapel(s.project)['leaf']).toEqual(['mat_pvc']);
    s.exec({ type: 'updateCellOpening', wallId: 'ct1', i: 1, j: 0, patch: { openingTypeId: 'ot_pgiro80' } });
    expect(materiaisPorPapel(s.project)['leaf']).toEqual(['mat_madeira']);
  });

  it.skipIf(!bytes)('composição em alumínio e em PVC: batente, folha e vidro saem com o material da composição', () => {
    const alu = materiaisPorPapel(comTipo('ot_pband40_alu_90').project);
    const pvc = materiaisPorPapel(comTipo('ot_pband40_pvc_90').project);
    const mad = materiaisPorPapel(comTipo('ot_pband40_90').project);
    expect([alu['jamb'], alu['leaf'], alu['glass']]).toEqual([['mat_aluminio'], ['mat_aluminio'], ['mat_vidro']]);
    expect([pvc['jamb'], pvc['leaf'], pvc['glass']]).toEqual([['mat_pvc'], ['mat_pvc'], ['mat_vidro']]);
    expect([mad['jamb'], mad['leaf']]).toEqual([['mat_madeira'], ['mat_madeira']]);
  });

  it.skipIf(!bytes)('layout: giro de 1 e 2 folhas, correr, camarão e pivotante geram modelos próprios (folhas e movimento) na célula', () => {
    const resumo = (id: string): { folhas: number; movimento: string[] } => {
      const p = comTipo(id).project;
      const m = modeloDaEsquadriaCortina(p, esquadriasDaCortina(p)[0]!);
      return { folhas: m.parts.filter((q) => q.role === 'leaf').length, movimento: [...new Set(m.parts.filter((q) => q.motion).map((q) => q.motion!.kind))] };
    };
    expect(resumo('ot_pgiro80')).toEqual({ folhas: 1, movimento: ['rotate'] });
    expect(resumo('ot_pgiro2_160')).toEqual({ folhas: 2, movimento: ['rotate'] });
    expect(resumo('ot_pcorrer160')).toEqual({ folhas: 2, movimento: ['slide'] });
    expect(resumo('ot_pcamarao2_160')).toEqual({ folhas: 2, movimento: ['fold'] });
    expect(resumo('ot_ppiv100')).toEqual({ folhas: 1, movimento: ['rotate'] });
  });

  it.skipIf(!bytes)('porta de correr na célula: duas folhas em trilhos na profundidade do sistema, e fechada ou aberta (folha deslizada) tudo fica dentro do vão', () => {
    const p = comTipo('ot_pcorrer160').project;
    const e = esquadriasDaCortina(p)[0]!;
    const t = openingTypeById(p, 'ot_pcorrer160')!;
    const m = modeloDaEsquadriaCortina(p, e);
    const meia = e.geometria.width / 2;
    const prof = e.geometria.thickness / 2;
    for (const aberta of [false, true]) {
      const pecas = pecasDoModelo(p, t, m, aberta);
      const folhas = pecas.filter((q) => q.role === 'leaf');
      expect(folhas).toHaveLength(2);
      // Cada folha em um trilho (lados opostos do plano central).
      expect(Math.sign(folhas[0]!.y)).toBe(-Math.sign(folhas[1]!.y));
      for (const q of pecas) {
        const d = deslocamentoDaPeca(q);
        expect(q.x + d.dx - q.w / 2).toBeGreaterThanOrEqual(-meia - 1e-6);
        expect(q.x + d.dx + q.w / 2).toBeLessThanOrEqual(meia + 1e-6);
        expect(q.z - q.h / 2).toBeGreaterThanOrEqual(-1e-6);
        expect(q.z + q.h / 2).toBeLessThanOrEqual(e.geometria.height + 1e-6);
        expect(Math.abs(q.y + d.dy) + q.d / 2).toBeLessThanOrEqual(prof + 1e-6);
      }
      // Aberta, a folha móvel desliza (a posição muda); fechada, nada se desloca.
      const deslocou = folhas.some((q) => Math.abs(deslocamentoDaPeca(q).dx) > 1e-6);
      expect(deslocou).toBe(aberta);
    }
  });

  for (const instanciar of [false, true]) {
    it.skipIf(!bytes)(`cena 3D (instanciar=${instanciar}): trocar o tipo na MESMA cena troca a cor da porta (madeira, aço, PVC)`, () => {
      const s = comTipo('ot_pgiro80');
      const cena = new ModelScene({ instanciar });
      const niveis = (p: Project) => p.levels.map((l) => resolveLevel(p, l.id));
      const opt = { edges: false, shadows: false, dark: false };
      const cores = (): string[] => {
        const out = new Set<string>();
        cena.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh) || o.userData.kind !== 'door') return;
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            const c = (m as THREE.MeshStandardMaterial).color;
            if (c) out.add(c.getHexString());
          }
        });
        return [...out].sort();
      };
      cena.update(s.project, niveis(s.project), opt);
      const madeira = cores();
      s.exec({ type: 'updateCellOpening', wallId: 'ct1', i: 1, j: 0, patch: { openingTypeId: 'ot_pf60_80' } });
      cena.update(s.project, niveis(s.project), opt);
      const aco = cores();
      s.exec({ type: 'updateCellOpening', wallId: 'ct1', i: 1, j: 0, patch: { openingTypeId: 'ot_psanf80' } });
      cena.update(s.project, niveis(s.project), opt);
      const pvc = cores();
      expect(madeira).toContain('a9794a');
      expect(aco).not.toContain('a9794a');
      expect(aco).toContain('7b8189');
      expect(pvc).toContain('e8e6df');
      expect(pvc).not.toContain('a9794a');
    });
  }
});
