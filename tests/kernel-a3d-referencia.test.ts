/**
 * A3d sem wasm: a seção `perfis_z`, os argumentos de `resolver_nivel` e a referência (`referenciaA3d`, extraída de `resolveLevel`).
 * Prova que (1) `perfis_z` leva exatamente o que o motor calcula (topo e base derivados e `topProfile` do modelo), (2) o estresse exercita
 * o que o Rust precisa acompanhar (paredes com perfil de topo, de base e do modelo; membranas; faixas inclinadas; paredes curvas com perfil) e
 * (3) as propriedades valem na referência: perfil dentro da altura, membranas nas pontas, faixas dentro da altura. Se o estresse não
 * exercitasse algo, a mutação correspondente no Rust seria invisível a `kernel-a3d.wasm.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { montarCenaA1, zDoNivel } from '../packages/engine/src/kernelA1.ts';
import { montarPerfisA3d, referenciaA3d } from '../packages/engine/src/kernelA3d.ts';
import { CONSULTAS, SECOES } from '../packages/geom/src/kernel/v2/esquema.gerado.ts';
import { projetoDeEstresseA3d, projetoDeParedeComPerfil } from '../scripts/kernel-a3d-estresse.mts';

describe('A3d: perfis_z, argumentos e referência do motor TypeScript', () => {
  it('perfis_z segue o esquema v7 e leva topo, base e topProfile do modelo', () => {
    const p = projetoDeEstresseA3d(2, { paredes: 16, pavimentos: 2 });
    const a1 = montarCenaA1(p);
    const perfis = montarPerfisA3d(p, a1);
    expect(Object.keys(perfis.colunas)).toEqual(SECOES.perfis_z.colunas.map((c) => c.nome));
    expect(CONSULTAS.resolver_nivel.args).toEqual(CONSULTAS.cluster_resolvido.args);
    const lista = (n: number): number => perfis.colunas['lista']!.filter((x) => x === n).length;
    expect(lista(0), 'pontos de topo derivado').toBeGreaterThan(0);
    expect(lista(1), 'pontos de base derivada').toBeGreaterThan(0);
    expect(lista(2), 'pontos de topProfile do modelo').toBeGreaterThan(0);
    // chaves únicas e índices 0..n-1 em cada (parede, lista)
    expect(new Set(perfis.colunas['id_num']).size).toBe(perfis.n);
    const por = new Map<string, number[]>();
    perfis.colunas['id_num']!.forEach((_, i) => {
      const k = `${perfis.colunas['parede_num']![i]}/${perfis.colunas['lista']![i]}`;
      por.set(k, [...(por.get(k) ?? []), perfis.colunas['indice']![i]!]);
    });
    for (const ix of por.values()) expect(ix).toEqual(ix.map((_, i) => i));
    // os pontos são os do motor
    const l = p.levels[0]!;
    const z = zDoNivel(p, l.id);
    for (const [id, w] of z) {
      const num = a1.idDe.get(id)!;
      const topo = perfis.colunas['parede_num']!.flatMap((n, i) => (n === num && perfis.colunas['lista']![i] === 0 ? [{ t: perfis.colunas['t']![i]!, h: perfis.colunas['h']![i]! }] : []));
      expect(topo).toEqual(w.profile ?? []);
    }
  });

  it('o estresse exercita perfis de topo, de base e do modelo, membranas, faixas inclinadas e paredes curvas com perfil', () => {
    let topo = 0;
    let base = 0;
    let modelo = 0;
    let membranas = 0;
    let inclinadas = 0;
    let curvaComPerfil = 0;
    let comTopoEBase = 0;
    for (let semente = 1; semente <= 4; semente++) {
      const p = projetoDeEstresseA3d(semente, { paredes: 16, pavimentos: 2 });
      const a1 = montarCenaA1(p);
      for (const l of p.levels) {
        const r = referenciaA3d(p, l.id, a1);
        for (const w of r.paredes) {
          if (w.profileTop) topo++;
          if (w.profileBottom) base++;
          if (w.profileTop && w.profileBottom) comTopoEBase++;
          membranas += w.membranas.length;
        }
        for (const c of r.camadas) for (const f of c.faixas) if (f.slope) inclinadas++;
      }
      for (const e of Object.values(p.elements)) {
        if (e.kind !== 'wall') continue;
        if (e.topProfile) modelo++;
        if (e.topProfile && e.sag !== 0) curvaComPerfil++;
      }
    }
    expect(topo, 'paredes com profileTop').toBeGreaterThan(5);
    expect(base, 'paredes com profileBottom').toBeGreaterThan(5);
    expect(modelo, 'paredes com topProfile do modelo').toBeGreaterThan(5);
    expect(membranas, 'membranas').toBeGreaterThan(3);
    expect(inclinadas, 'faixas com topo inclinado').toBeGreaterThan(10);
    expect(curvaComPerfil, 'paredes curvas com topProfile').toBeGreaterThan(0);
    console.log(`[A3d referência] profileTop ${topo}, profileBottom ${base} (topo e base ${comTopoEBase}), topProfile do modelo ${modelo} (curvas ${curvaComPerfil}), membranas ${membranas}, faixas inclinadas ${inclinadas}`);
  }, 120_000);

  it('propriedades da referência: perfil dentro da altura, membranas nas pontas, faixas dentro da altura', () => {
    let verificadas = 0;
    for (let semente = 5; semente <= 7; semente++) {
      const p = projetoDeEstresseA3d(semente, { paredes: 16, pavimentos: 2 });
      const a1 = montarCenaA1(p);
      for (const l of p.levels) {
        const r = referenciaA3d(p, l.id, a1);
        const alturaDe = new Map(r.paredes.map((w) => [w.id, w]));
        for (const w of r.paredes) {
          for (const q of [...(w.profileTop ?? []), ...(w.profileBottom ?? [])]) {
            expect(q.h, 'perfil dentro da altura da parede').toBeLessThanOrEqual(w.height + 1e-9);
            expect(q.h).toBeGreaterThanOrEqual(0);
          }
          // membranas: uma linha cujas pontas ficam na vizinhança das extremidades a e b (esquadria do canto, no máximo a espessura do tipo)
          for (const m of w.membranas) {
            expect(m.pts).toHaveLength(2);
            const ao = (q: { x: number; y: number }, o: { x: number; y: number }): number => Math.hypot(q.x - o.x, q.y - o.y);
            expect(Math.min(ao(m.pts[0]!, w.a), ao(m.pts[0]!, w.b))).toBeLessThan(1);
            verificadas++;
          }
        }
        for (const c of r.camadas) {
          const w = alturaDe.get(c.parede)!;
          for (const f of c.faixas) {
            expect(f.z0).toBeGreaterThanOrEqual(-1e-6);
            expect(f.z1).toBeLessThanOrEqual(w.height + 1e-6);
            expect(f.z0).toBeLessThan(f.z1 + 1e-9);
            if (f.slope) {
              expect(f.slope.h0).toBeGreaterThanOrEqual(-1e-9);
              expect(Math.max(f.slope.h0, f.slope.h1)).toBeCloseTo(f.z1, 6);
            }
          }
        }
      }
    }
    expect(verificadas, 'membranas verificadas').toBeGreaterThan(3);
  }, 120_000);

  it('parede isolada com topProfile e com base anexada: as faixas seguem o perfil e sem perfil não há inclinação', () => {
    const rampa = projetoDeParedeComPerfil([{ t: 0, h: 1 }, { t: 6, h: 2.5 }], true);
    const a1 = montarCenaA1(rampa);
    const r = referenciaA3d(rampa, rampa.levels[0]!.id, a1);
    expect(r.paredes[0]!.profileTop).toBeUndefined();
    expect(r.paredes[0]!.profileBottom, 'piso cobre só parte do eixo').toBeDefined();
    expect(r.camadas.some((c) => c.faixas.some((f) => f.slope))).toBe(true);
    const reta = projetoDeParedeComPerfil(null, false);
    const rr = referenciaA3d(reta, reta.levels[0]!.id, montarCenaA1(reta));
    expect(rr.camadas.every((c) => c.faixas.every((f) => !f.slope && f.z0 === 0))).toBe(true);
  });

});
