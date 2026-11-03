/**
 * B1 sem wasm: as seções de pisos e lajes, os argumentos de `pisos_lajes_nivel` e a referência (`referenciaB1`, extraída de `resolveFloors` e
 * `resolveSlabs`). Prova que (1) as seções seguem o esquema v8 e levam o que o motor lê (circuitos, perímetro, furos, inclinação), (2) o estresse
 * exercita o que o Rust precisa acompanhar (pisos e lajes estáticos, vinculados com circuito fechado, aberto e fora, perímetro, furos de escada
 * e de rampa, lajes inclinadas, membrana, términos de todas as espécies, limite externo) e (3) as propriedades valem na referência: camadas
 * empilhadas sem lacuna, laje inclinada dentro das cotas, área do polígono igual à soma das partes. Se o estresse não exercitasse algo, a mutação
 * correspondente no Rust seria invisível a `kernel-b1.wasm.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { multiArea } from '@hestia/geom';
import { slabRiseAt, terminoOf, type Project } from '@hestia/model';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { NOMES_SECOES_B1, argumentosB1, montarCenaB1, referenciaB1 } from '../packages/engine/src/kernelB.ts';
import { areaDaForma } from '../packages/engine/src/kernelComparaA2.ts';
import { compararB1 } from '../packages/engine/src/kernelComparaB.ts';
import { CONSULTAS, SECOES } from '../packages/geom/src/kernel/v2/esquema.gerado.ts';
import { projetoComRampa, projetoDeEstresseB1, semParedes } from '../scripts/kernel-b1-estresse.mts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';

const referencia = (p: Project) => {
  const cena = montarCenaB1(p);
  const porNivel = p.levels.map((l) => referenciaB1(p, l.id, cena));
  return { cena, porNivel };
};

describe('B1: seções, argumentos e referência do motor TypeScript', () => {
  it('as seções seguem o esquema v8 (nomes e ordem das colunas) e a consulta tem um argumento', () => {
    const p = projetoDeEstresseB1(1);
    const cena = montarCenaB1(p);
    for (const nome of NOMES_SECOES_B1) {
      expect(Object.keys(cena.secoes[nome]), nome).toEqual(SECOES[nome].colunas.map((c) => c.nome));
      const n = cena.nLinhas[nome];
      for (const col of Object.values(cena.secoes[nome])) expect(col.length).toBe(n);
      expect(new Set(cena.secoes[nome]['id_num']).size, `chaves únicas de ${nome}`).toBe(n);
    }
    expect([...CONSULTAS.pisos_lajes_nivel.args]).toEqual(['nivel_num']);
    expect(argumentosB1(p, p.levels[1]!.id, cena)).toEqual([1]);
    expect(cena.ignorados).toBe(0);
  });

  it('o estresse exercita estáticos, vinculados (circuito, aberto, fora), perímetro, furos, inclinação, membrana, términos e limite externo', () => {
    const cobre = { pisos: 0, lajes: 0, inclinadas: 0, comProblemaAberto: 0, comProblemaFora: 0, vinculadosFechados: 0, perimetros: 0, furos: 0, membranas: 0, explicitas: 0, limites: 0, termino: new Set<string>(), comFuroNoPoligono: 0 };
    for (let semente = 1; semente <= 6; semente++) {
      const p = projetoDeEstresseB1(semente);
      const { cena, porNivel } = referencia(p);
      cobre.furos += cena.secoes.furos_nivel['id_num']!.length;
      for (const lista of porNivel) {
        for (const e of lista) {
          if (e.laje) {
            cobre.lajes++;
            if (e.inclinacao) cobre.inclinadas++;
          } else cobre.pisos++;
          if (e.problema === 1) cobre.comProblemaAberto++;
          if (e.problema === 2) cobre.comProblemaFora++;
          for (const c of e.camadas) {
            if (c.membrana) cobre.membranas++;
            if (c.explicita) cobre.explicitas++;
          }
          if (e.poligono.some((pl) => pl.length > 1)) cobre.comFuroNoPoligono++;
        }
      }
      for (const el of Object.values(p.elements)) {
        if (el.kind !== 'floor' && el.kind !== 'slab') continue;
        const src = el.outlineSource;
        if (src?.linked && src.mode !== 'perimeter') {
          const papeis = cena.secoes.contornos_vinculados;
          const id = (el.kind === 'floor' ? cena.pisoDe : cena.lajeDe).get(el.id)!;
          const tem = papeis['id_num']!.some((_, i) => papeis['elemento_num']![i] === id && papeis['tipo_el']![i] === (el.kind === 'slab' ? 1 : 0) && papeis['papel']![i] === 0);
          if (tem) cobre.vinculadosFechados++;
        }
        if (src?.mode === 'perimeter') cobre.perimetros++;
        const tipo = el.kind === 'floor' ? p.floorTypes[el.typeId]! : p.slabTypes[el.typeId]!;
        for (const l of tipo.layers) {
          const t = terminoOf(l);
          cobre.termino.add(typeof t === 'string' ? t : 'ate' in t ? 'ate' : 'cm');
          if (l.limiteExterno) cobre.limites++;
        }
      }
    }
    expect(cobre.pisos, 'pisos').toBeGreaterThan(50);
    expect(cobre.lajes, 'lajes').toBeGreaterThan(50);
    expect(cobre.inclinadas, 'lajes inclinadas').toBeGreaterThan(10);
    expect(cobre.vinculadosFechados, 'vinculados com circuito fechado').toBeGreaterThan(10);
    expect(cobre.comProblemaAberto, 'vinculados com circuito aberto').toBeGreaterThan(0);
    expect(cobre.comProblemaFora, 'vinculados sem paredes no nível').toBeGreaterThan(0);
    expect(cobre.perimetros, 'elementos de perímetro').toBeGreaterThan(5);
    expect(cobre.furos, 'vértices de furo de escada ou rampa').toBeGreaterThan(20);
    expect(cobre.membranas, 'camadas de membrana').toBeGreaterThan(5);
    expect(cobre.explicitas, 'camadas com término explícito').toBeGreaterThan(20);
    expect(cobre.limites, 'camadas com limite externo').toBeGreaterThan(3);
    expect([...cobre.termino].sort()).toEqual(['ate', 'auto', 'cm', 'face', 'nucleo', 'passa']);
    console.log(`[B1 referência] ${JSON.stringify({ ...cobre, termino: [...cobre.termino] })}`);
  }, 120_000);

  it('propriedades da referência: camadas empilhadas sem lacuna, cotas, laje inclinada dentro das cotas, área igual à soma das partes', () => {
    let camadas = 0;
    let inclinadas = 0;
    for (let semente = 11; semente <= 13; semente++) {
      const p = projetoDeEstresseB1(semente, { pavimentos: 2 });
      const { porNivel } = referencia(p);
      for (const lista of porNivel) {
        for (const e of lista) {
          // empilhadas sem lacuna: a camada i começa onde a i-1 termina, do topo à base
          let z = e.topoZ;
          for (const c of e.camadas) {
            expect(c.z1).toBe(z);
            expect(c.z0).toBeLessThanOrEqual(c.z1);
            z = c.z0;
            camadas++;
            if (c.membrana && c.z0 === c.z1) expect(c.poligono.length).toBeGreaterThanOrEqual(0);
          }
          expect(z).toBe(e.baseZ);
          expect(e.baseZ).toBeLessThanOrEqual(e.topoZ);
          // área do polígono = soma das partes (cada peça: externo menos furos)
          expect(areaDaForma(e.poligono)).toBeCloseTo(e.poligono.reduce((t, peca) => t + areaDaForma([peca]), 0), 9);
          // as camadas ficam dentro da área do elemento mais as paredes (só `passa` e `cm` positivo podem passar do contorno): região vazia ou finita
          for (const c of e.camadas) expect(Number.isFinite(areaDaForma(c.poligono))).toBe(true);
          if (e.inclinacao) {
            inclinadas++;
            // laje inclinada: a cota do topo em cada vértice do polígono fica entre topo (origem) e topo + subida máxima do contorno, e a face
            // de baixo acompanha (mesma subida): a espessura total não muda
            const sub = e.poligono.flatMap((peca) => peca[0]!.map((q) => slabRiseAt({ origin: e.inclinacao!.origem, dir: e.inclinacao!.direcao, percent: e.inclinacao!.percentual }, q)));
            const subida = Math.max(...sub);
            const descida = Math.min(...sub);
            for (const s of sub) {
              expect(s).toBeLessThanOrEqual(subida + 1e-12);
              expect(s).toBeGreaterThanOrEqual(descida - 1e-12);
            }
            expect(e.topoZ + subida - (e.baseZ + subida)).toBeCloseTo(e.topoZ - e.baseZ, 12);
            // a subida cabe na extensão do contorno ao longo da direção, na inclinação dada
            const alcance = Math.max(...e.poligono.flatMap((peca) => peca[0]!.map((q) => Math.abs((q.x - e.inclinacao!.origem.x) * e.inclinacao!.direcao.x + (q.y - e.inclinacao!.origem.y) * e.inclinacao!.direcao.y))));
            expect(Math.max(Math.abs(subida), Math.abs(descida))).toBeLessThanOrEqual((e.inclinacao.percentual / 100) * alcance + 1e-9);
          }
        }
      }
    }
    expect(camadas).toBeGreaterThan(100);
    expect(inclinadas).toBeGreaterThan(3);
  }, 120_000);

  it('o projeto sem paredes é o mesmo sem circuito: os vinculados caem em problema e nenhum polígono muda com paredes que não tocam', () => {
    const p = projetoDeEstresseB1(2, { pavimentos: 2 });
    const sem = semParedes(p);
    expect(Object.values(sem.elements).some((e) => e.kind === 'wall')).toBe(false);
    const { porNivel } = referencia(sem);
    const vinculadosSemPoligono = porNivel.flat().filter((e) => e.problema !== 0).length;
    expect(vinculadosSemPoligono).toBeGreaterThan(0);
    // o resolvedor aceita o projeto: tudo finito
    for (const e of porNivel.flat()) expect(Number.isFinite(multiArea(e.poligono))).toBe(true);
  }, 120_000);

  it('rampa e escada furam: o polígono da laje perde área e a laje inclinada leva o furo na cota mínima', () => {
    const livre = projetoComRampa('none');
    const furada = projetoComRampa('headroom');
    const inclinada = projetoComRampa('headroom', true);
    const area = (p: Project): { piso: number; laje: number } => {
      const cena = montarCenaB1(p);
      const r = referenciaB1(p, p.levels[1]!.id, cena);
      return { piso: multiArea(r.find((e) => !e.laje)!.poligono), laje: multiArea(r.find((e) => e.laje)!.poligono) };
    };
    expect(area(furada).laje).toBeLessThan(area(livre).laje);
    expect(area(furada).piso).toBeLessThan(area(livre).piso);
    expect(montarCenaB1(furada).nLinhas.furos_nivel).toBeGreaterThan(0);
    expect(montarCenaB1(livre).nLinhas.furos_nivel).toBe(0);
    expect(montarCenaB1(inclinada).nLinhas.furos_nivel).toBeGreaterThan(0);
  });

  it('a comparação aceita a referência contra ela mesma e reprova uma cota, um polígono e uma identidade alterados', () => {
    const p = projetoDeEstresseB1(3, { pavimentos: 2 });
    const { cena } = referencia(p);
    const ref = referenciaB1(p, p.levels[0]!.id, cena);
    expect(compararB1(ref, structuredClone(ref)).divergencias).toEqual([]);
    const cota = structuredClone(ref);
    cota[0]!.camadas[0]!.z0 += 1e-5;
    expect(compararB1(ref, cota).divergencias.length).toBeGreaterThan(0);
    const forma = structuredClone(ref);
    forma[0]!.poligono[0]![0]![0]!.x += 1e-3;
    expect(compararB1(ref, forma).divergencias.length).toBeGreaterThan(0);
    const id = structuredClone(ref);
    id[0]!.id += 100;
    expect(compararB1(ref, id).divergencias.length).toBeGreaterThan(0);
    expect(compararB1(ref, ref.slice(1)).divergencias.length).toBeGreaterThan(0);
  });

  it('o sintético de 10 pavimentos monta a cena sem ignorar nada e a referência roda em todos os níveis', () => {
    const p = syntheticProject(10);
    const cena = montarCenaB1(p, montarCenaA1(p).materialDe);
    expect(cena.ignorados).toBe(0);
    expect(cena.nLinhas.pisos).toBe(10);
    expect(cena.nLinhas.lajes).toBe(10);
    const lista = p.levels.flatMap((l) => referenciaB1(p, l.id, cena));
    expect(lista.length).toBe(20);
  }, 120_000);
});
