import { describe, expect, it } from 'vitest';
import { secaoCirculo, type Project } from '@hestia/model';
import { decodificarAvisosMassa, decodificarFatiasMassa, decodificarPlantaMassa, decodificarQuantMassa, ServicoMassa } from './massaServico.ts';
import { massaAvisosDoProjeto } from './massaIssues.ts';
import { massaM2, projetoComMassas } from './fixtureMassa.ts';

/** Resolve só a massa 'm1' (as demais saem das decodificações, como uma massa que o projeto não tem). */
const apenasM1 = (id: string): string | undefined => (id === 'm1' ? 'm1' : undefined);

describe('massa: kernel desligado ou com erro (A.5)', () => {
  it('sem kernel, todas as consultas devolvem null e não lançam', () => {
    const srv = new ServicoMassa(() => null);
    const p = projetoComMassas();
    expect(srv.pronto()).toBe(false);
    expect(srv.malha(p)).toBeNull();
    expect(srv.malha(p, 'lv_0', 2)).toBeNull();
    expect(srv.planta(p, null, 1.2, 0, 30)).toBeNull();
    expect(srv.fatias(p)).toBeNull();
    expect(srv.corte(p, null, 0, 0, 1, 0, 100)).toBeNull();
    expect(srv.quantidades(p)).toBeNull();
    expect(srv.avisos(p)).toBeNull();
    expect(srv.ultimoErro()).toBeNull();
  });

  it('sem kernel, cada massa enviável ganha massa-sem-kernel e a recusada ganha massa-invalida', () => {
    const srv = new ServicoMassa(() => null);
    const p = projetoComMassas();
    // Massa de uma seção só: o comando `addMass` a recusaria; aqui ela entra direto no projeto, como um arquivo ruim entraria.
    const q: Project = { ...p, elements: { ...p.elements, ruim: { ...massaM2(), id: 'ruim', secoes: [secaoCirculo(0, 1)] } } };
    const avisos = massaAvisosDoProjeto(q, srv, 'pt');
    const codigos = avisos.map((a) => `${a.code}:${String(a.elementId)}`);
    expect(codigos).toContain('massa-sem-kernel:m1');
    expect(codigos).toContain('massa-sem-kernel:m5p');
    expect(codigos).not.toContain('massa-sem-kernel:ruim');
    expect(codigos).toContain('massa-invalida:ruim');
    expect(avisos.filter((a) => a.code === 'massa-sem-kernel')).toHaveLength(6);
  });
});

describe('massa: decodificação das saídas das consultas', () => {
  it('planta: linhas de 4 valores e pontos em sequência, com massas desconhecidas fora', () => {
    const s = {
      linhas: Float64Array.from([1, 0, 0, 3, 9, 0, 1, 2]),
      pontos: Float64Array.from([0, 0, 1, 0, 1, 1, 5, 5]),
    };
    const out = decodificarPlantaMassa(s, apenasM1);
    expect(out).toHaveLength(1);
    expect(out[0]!.pontos).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
  });

  it('fatias: a área e o perímetro vêm dos valores de cada fatia, e o nível vem do índice', () => {
    const s = {
      fatias: Float64Array.from([1, 0, 1, 3]),
      pontos: Float64Array.from([0, 0, 2, 0, 2, 2]),
      valores: Float64Array.from([2, 6.8, 3]),
    };
    const [f] = decodificarFatiasMassa(s, apenasM1, (k) => (k === 1 ? 'lv_1' : null));
    expect(f).toMatchObject({ massaId: 'm1', copia: 0, nivelId: 'lv_1', area: 2, perimetro: 6.8, z: 3 });
    expect(f!.pontos).toHaveLength(3);
  });

  it('quantidades e avisos: uma linha por massa e um aviso por registro', () => {
    const q = decodificarQuantMassa({ linhas: Float64Array.from([1]), valores: Float64Array.from([540, 234, 60, 60, 9]) }, apenasM1);
    expect(q).toEqual([{ massaId: 'm1', volume: 540, areaLateral: 234, areaBase: 60, areaTopo: 60, altura: 9 }]);
    const a = decodificarAvisosMassa({ avisos: Float64Array.from([1, 2, 0, 1]), valores: Float64Array.from([2, 0, 1, 2, 3]) }, apenasM1);
    expect(a).toEqual([{ massaId: 'm1', codigo: 2, copia: 0, indice: 1, medido: 2, limite: 0, x: 1, y: 2, z: 3 }]);
  });

  it('saída que falta na consulta é erro do TS (não do kernel) e lança', () => {
    expect(() => decodificarQuantMassa({}, apenasM1)).toThrow(/não veio/);
  });
});
