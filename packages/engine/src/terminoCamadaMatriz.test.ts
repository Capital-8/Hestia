import { describe, expect, it } from 'vitest';
import { CENARIOS, caixaEsperada, caixasDoCenario, casosCamada, larguraMinimaDasPecas, esperadoCamada, medir, projetoDaMatriz, projetoDoCenario, type Intervalos } from '../../../tests/termino-camada-matriz.ts';

const arred = (a: Intervalos): number[][] => a.map((i) => i.map((v) => +v.toFixed(5)));

describe('matriz do término por camada (TypeScript): a borda sai das espessuras', () => {
  for (const c of casosCamada()) {
    it(`${c.grupo} ${c.nome}`, () => {
      const m = medir(projetoDaMatriz(c));
      const e = esperadoCamada(c);
      const por = (id: string) => m.find((x) => x.elemento === id)!;
      for (const id of ['lp', 'fp']) {
        expect(arred(por(id).horizontal), `${id} horizontal`).toEqual(arred(e.perimetroH));
        expect(arred(por(id).vertical), `${id} vertical`).toEqual(arred(e.perimetroV));
      }
      for (const id of ['ls', 'fs']) expect(arred(por(id).horizontal), `${id} horizontal`).toEqual(arred(e.salaH));
    });
  }
});

describe('cenários do caso real (TypeScript): excesso sub-micrométrico e junção em T', () => {
  for (const cen of CENARIOS) {
    for (const c of casosCamada().filter((k) => k.grupo === 'preset')) {
      it(`${cen.nome}: ${c.nome}`, () => {
        const m = caixasDoCenario(projetoDoCenario(c, cen.id));
        for (const id of ['lq', 'fq']) expect(m[id]!.map((v) => +v.toFixed(5)), id).toEqual(caixaEsperada(c, cen.id).map((v) => +v.toFixed(5)));
      });
    }
  }

  for (const c of casosCamada().filter((k) => k.grupo === 'preset')) {
    it(`excesso: ${c.nome}: o contorno não guarda peça fio (largura média menor que 1 µm) que a extrusão leva à face da parede`, () => {
      const m = larguraMinimaDasPecas(projetoDoCenario(c, 'excesso'));
      for (const id of ['lq', 'fq']) expect(m[id]!, id).toBeGreaterThanOrEqual(1e-6);
    });
  }
});
