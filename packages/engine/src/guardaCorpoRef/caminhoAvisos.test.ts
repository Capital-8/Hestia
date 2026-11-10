import type { GuardaCorpo, Project, Stair } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { projetoGuardaCorpo } from '../fixtureGuardaCorpo.ts';
import { montarCenaGC } from '../kernelGuardaCorpo.ts';
import { AV, avisoPerfilAutoIntersecta, avisoTrechoCurto, deCaminho, deDistribuicao } from './avisos.ts';
import { AVISO_CAMINHO_NULO, AVISO_CAMINHO_REPETIDO, AVISO_DESLOCAMENTO_EXCEDE, AVISO_SEM_BORDA, guardaCaminhosRef } from './caminho.ts';

const edit = (p: Project, id: string, f: (g: GuardaCorpo) => void): Project => {
  const q = structuredClone(p);
  f(q.elements[id] as GuardaCorpo);
  return q;
};
const codigos = (p: Project): number[] => {
  const r = guardaCaminhosRef(montarCenaGC(p), 0, 1e-6);
  return r.avisos.filter((_, i) => i % 4 === 1);
};
const manual = (g: GuardaCorpo, caminho: Array<{ x: number; y: number; dz: number }>): void => {
  if (g.hospedeiro.tipo === 'manual') g.hospedeiro.caminho = caminho;
};

describe('avisos de geometria degenerada na referência (paridade com o Rust)', () => {
  const { p } = projetoGuardaCorpo();

  it('a fixture não avisa', () => {
    expect(codigos(p)).toEqual([]);
  });

  it('vértices repetidos no caminho manual', () => {
    const q = edit(p, 'gc_m', (g) => manual(g, [{ x: 0, y: 8, dz: 0 }, { x: 0, y: 8, dz: 0 }, { x: 4, y: 8, dz: 0 }, { x: 4, y: 8, dz: 0 }, { x: 4, y: 11, dz: 0 }]));
    const r = guardaCaminhosRef(montarCenaGC(q), 0, 1e-6);
    expect(codigos(q)).toEqual([AVISO_CAMINHO_REPETIDO]);
    expect(r.valores.slice(0, 2)).toEqual([2, 0]);
    expect(r.avisos[3]).toBe(1);
    expect(r.trechos.length / 5).toBeGreaterThan(0);
  });

  it('caminho manual sem segmento (todos os vértices no mesmo ponto)', () => {
    const q = edit(p, 'gc_m', (g) => manual(g, [{ x: 1, y: 1, dz: 0 }, { x: 1, y: 1, dz: 0 }]));
    expect(codigos(q)).toEqual([AVISO_CAMINHO_REPETIDO, AVISO_CAMINHO_NULO]);
  });

  it('deslocamento maior que a largura', () => {
    const q = edit(p, 'gc_m', (g) => {
      if (g.hospedeiro.tipo === 'manual') {
        g.hospedeiro.caminho = [{ x: 0, y: 8, dz: 0 }, { x: 0.1, y: 8, dz: 0 }, { x: 0.1, y: 8.1, dz: 0 }, { x: 0, y: 8.1, dz: 0 }];
        g.hospedeiro.fechado = true;
        g.deslocamento = 0.2;
      }
    });
    expect(codigos(q)).toEqual([AVISO_DESLOCAMENTO_EXCEDE]);
  });

  it('hospedeiro sem borda: escada sem componentes', () => {
    const q = structuredClone(p);
    (q.elements['st1'] as Stair).components = [];
    expect(codigos(q).filter((c) => c === AVISO_SEM_BORDA).length).toBeGreaterThanOrEqual(1);
  });

  it('traduz os códigos do caminho e da distribuição para os de guarda_avisos', () => {
    const a = deCaminho([1, 3, 2, 4, 1, 6, 0, 1, 1, 99, 0, 0], [0.5, 1e-6, 1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(a.map((x) => x.codigo)).toEqual([AV.trechoCurto, AV.semBorda]);
    expect(a[0]).toMatchObject({ guarda: 1, trecho: 2, indice: 4, medido: 0.5, x: 1, y: 2, z: 3 });
    expect([1, 2, 3, 4].map((c) => deDistribuicao(1, 0, c, 0.3, 0.1)!.codigo)).toEqual([AV.padraoNaoCabe, AV.padraoComprimido, AV.vaoSemEspaco, AV.sobraCurta]);
    expect(deDistribuicao(1, 0, 9, 0, 0)).toBeNull();
  });

  it('trecho que vira ponto e perfil que se auto-intersecta', () => {
    expect(avisoTrechoCurto(1, 0, 5e-7, 1e-6, [0, 0, 0])?.codigo).toBe(AV.trechoCurto);
    expect(avisoTrechoCurto(1, 0, 0.5, 1e-6, [0, 0, 0])).toBeNull();
    const apertada: Array<[number, number, number]> = [[0, 0, 0], [2, 0, 0], [2, 0.01, 0], [0, 0.01, 0]];
    const a = avisoPerfilAutoIntersecta(1, 0, apertada, 0.02, false)!;
    expect(a.codigo).toBe(AV.perfilAutoIntersecta);
    expect(a.limite).toBeCloseTo(0.01, 9);
    expect(a.medido).toBeGreaterThan(a.limite);
    const folgada: Array<[number, number, number]> = [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]];
    expect(avisoPerfilAutoIntersecta(1, 0, folgada, 0.02, false)).toBeNull();
    expect(avisoPerfilAutoIntersecta(1, 0, apertada, 0.02, true)).not.toBeNull();
  });
});
