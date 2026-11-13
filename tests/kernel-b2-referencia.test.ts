/**
 * B2 sem wasm: a seção `niveis`, os argumentos de `pisos_lajes_com_paredes`, a decodificação sem `precisa_paredes` e a referência (`referenciaB2`, a
 * extração de `resolveFloors` e `resolveSlabs` COM as paredes do projeto). Prova que (1) as seções seguem o esquema v9, (2) o estresse da B2 exercita o
 * que o Rust precisa acompanhar (portas com a soleira no piso e acima dele, paredes paralelas coladas, diagonais que cruzam os contornos, parede curva,
 * lajes que leem as paredes dos níveis vizinhos, todos os términos) e (3) as paredes MUDAM o resultado do motor (sem isso o teste wasm seria vazio).
 */
import { describe, expect, it } from 'vitest';
import { terminoOf, type Floor, type Opening, type Slab } from '@hestia/model';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { argumentosB2, decodificarB1, decodificarB2, montarCenaB1, referenciaB1, referenciaB2 } from '../packages/engine/src/kernelB.ts';
import { areaDaForma } from '../packages/engine/src/kernelComparaA2.ts';
import { resolveFloors } from '../packages/engine/src/floors.ts';
import { resolveSlabs } from '../packages/engine/src/slabs.ts';
import { adjacentLevelIds, wallTouchesZone, wallsOfLevel, wallZoneAt } from '../packages/engine/src/terminoBlock.ts';
import { CONSULTAS, SECOES } from '../packages/geom/src/kernel/v2/esquema.gerado.ts';
import { projetoDeEstresseB1 } from '../scripts/kernel-b1-estresse.mts';

describe('B2: seções, argumentos e referência do motor TypeScript', () => {
  it('a seção niveis segue o esquema v9 e a consulta tem nível e tolerância', () => {
    const p = projetoDeEstresseB1(1, { paredesB2: true });
    const cena = montarCenaB1(p);
    expect(Object.keys(cena.secoes.niveis)).toEqual(['id_num', 'nivel_num', 'cota']);
    expect(cena.nLinhas.niveis).toBe(p.levels.length);
    expect(cena.secoes.niveis['cota']).toEqual(p.levels.map((l) => l.elevation));
    expect(cena.secoes.niveis['nivel_num']).toEqual(p.levels.map((_, i) => i));
    expect(SECOES.niveis.id).toBe(19);
    expect(SECOES.niveis.colunas.map((c) => c.nome)).toEqual(['id_num', 'nivel_num', 'cota']);
    expect([...CONSULTAS.pisos_lajes_com_paredes.args]).toEqual(['nivel_num', 'tol_juncao']);
    expect(argumentosB2(p, p.levels[1]!.id, cena)).toEqual([1, 0.02]);
    const comTol = { ...p, settings: { ...p.settings, joinTolerance: 0.05 } };
    expect(argumentosB2(comTol, p.levels[2]!.id, montarCenaB1(comTol))).toEqual([2, 0.05]);
  });

  it('a decodificação da B2 usa 7 colunas por camada e não traz precisa_paredes; a da B1 traz', () => {
    const s = {
      elementos: [0, 3, 1, 0, 0, 0, 1, 0, 1],
      elementos_num: [3, 2.9, 0, 0, 0, 0, 0],
      camadas_num: [2.9, 3, 4],
      poligonos: [0, 1],
      aneis: [0, 4],
      pontos: [0, 0, 1, 0, 1, 1, 0, 1],
    };
    const b2 = decodificarB2({ ...s, camadas: [0, 7, 0, 0, 1, 0, 1] });
    expect(b2[0]!.camadas[0]).toMatchObject({ indice: 0, material: 7, nucleo: false, membrana: false, explicita: true, z0: 2.9, z1: 3, prioridade: 4 });
    expect('pedeParedes' in b2[0]!.camadas[0]!).toBe(false);
    expect(areaDaForma(b2[0]!.camadas[0]!.poligono)).toBe(1);
    const b1 = decodificarB1({ ...s, camadas: [0, 7, 0, 0, 1, 1, 0, 1] });
    expect(b1[0]!.camadas[0]!.pedeParedes).toBe(true);
    expect(areaDaForma(b1[0]!.camadas[0]!.poligono)).toBe(1);
  });

  it('o estresse exercita portas (soleira no piso e acima), paralelas, diagonais, curva, vizinhos e todos os términos', () => {
    const cobre = { portas: 0, portasNoPiso: 0, portasAcima: 0, paralelas: 0, diagonais: 0, curvas: 0, lajesComVizinho: 0, termino: new Set<string>(), camadasAlteradasPelasParedes: 0, lajesAlteradas: 0, pisosAlterados: 0 };
    for (let semente = 1; semente <= 4; semente++) {
      const p = projetoDeEstresseB1(semente, { paredesB2: true });
      for (const e of Object.values(p.elements)) {
        if (e.kind === 'door') {
          cobre.portas++;
          const o = e as Opening;
          // a soleira (peitoril) até 2 cm chega a qualquer camada de piso de cota normal; 8 e 15 cm só chegam às camadas de topo mais alto
          if ((o.sillOverride ?? 0) <= 0.02) cobre.portasNoPiso++;
          else cobre.portasAcima++;
        }
        if (e.kind === 'wall') {
          if (e.id.startsWith('bp_')) cobre.paralelas++;
          if (e.id.startsWith('bd_')) cobre.diagonais++;
          if (e.id.startsWith('bc_')) cobre.curvas++;
        }
      }
      const comParedes = new Set(Object.values(p.elements).filter((e) => e.kind === 'wall').map((e) => (e as { levelId: string }).levelId));
      for (const l of p.levels) {
        const vizinhos = adjacentLevelIds(p, l.id);
        if (vizinhos.some((v) => comParedes.has(v)) && Object.values(p.elements).some((e) => e.kind === 'slab' && (e as Slab).levelId === l.id)) cobre.lajesComVizinho++;
        // as paredes mudam o resultado: o mesmo nível com `layers: false` (sem término por parede) difere em algumas camadas
        const com = [...resolveFloors(p, l.id), ...resolveSlabs(p, l.id)];
        const sem = [...resolveFloors(p, l.id, { layers: false }), ...resolveSlabs(p, l.id, { layers: false })];
        com.forEach((c, i) => {
          const s = sem[i]!;
          const laje = 'slabId' in c;
          c.layers.forEach((camada, k) => {
            if (Math.abs(areaDaForma(camada.polygon) - areaDaForma(s.layers[k]!.polygon)) > 1e-6) {
              cobre.camadasAlteradasPelasParedes++;
              if (laje) cobre.lajesAlteradas++;
              else cobre.pisosAlterados++;
            }
          });
        });
      }
      for (const el of Object.values(p.elements)) {
        if (el.kind !== 'floor' && el.kind !== 'slab') continue;
        const tipo = el.kind === 'floor' ? p.floorTypes[(el as Floor).typeId]! : p.slabTypes[(el as Slab).typeId]!;
        for (const l of tipo.layers) {
          const t = terminoOf(l);
          cobre.termino.add(typeof t === 'string' ? t : 'ate' in t ? 'ate' : 'cm');
        }
      }
    }
    expect(cobre.portas, 'portas').toBeGreaterThan(40);
    expect(cobre.portasNoPiso, 'portas com a soleira no piso').toBeGreaterThan(10);
    expect(cobre.portasAcima, 'portas com a soleira acima do piso').toBeGreaterThan(10);
    expect(cobre.paralelas, 'paredes paralelas').toBeGreaterThan(10);
    expect(cobre.diagonais, 'paredes diagonais').toBeGreaterThan(5);
    expect(cobre.curvas, 'paredes curvas').toBeGreaterThan(3);
    expect(cobre.lajesComVizinho, 'níveis com laje e paredes nos vizinhos').toBeGreaterThan(3);
    expect([...cobre.termino].sort()).toEqual(['ate', 'auto', 'cm', 'face', 'nucleo', 'passa']);
    expect(cobre.camadasAlteradasPelasParedes, 'camadas que as paredes alteram').toBeGreaterThan(50);
    expect(cobre.lajesAlteradas, 'camadas de laje que as paredes alteram').toBeGreaterThan(10);
    expect(cobre.pisosAlterados, 'camadas de piso que as paredes alteram').toBeGreaterThan(10);
    console.log(`[B2 referência] ${JSON.stringify({ ...cobre, termino: [...cobre.termino] })}`);
  }, 240_000);

  it('a referência da B2 é a da B1 e a zona da porta que chega ao piso muda a região', () => {
    expect(referenciaB2).toBe(referenciaB1);
    // com a porta, a zona da parede perde o vão no piso (acima da verga a parede é contínua); sem a porta, não
    const comPortas = projetoDeEstresseB1(2, { paredesB2: true, pavimentos: 1, semParedes: false });
    let achou = false;
    for (const rw of wallsOfLevel(comPortas, comPortas.levels[0]!.id)) {
      const aberturas = Object.values(comPortas.elements).filter((e) => e.kind === 'door' && (e as Opening).hostId === rw.wallId);
      if (aberturas.length === 0) continue;
      const base = rw.baseZ;
      const pegada = wallZoneAt(comPortas, rw, { kind: 'face' }, base + 1);
      const semPortas = wallZoneAt({ ...comPortas, elements: Object.fromEntries(Object.entries(comPortas.elements).filter(([, e]) => e.kind !== 'door')) }, rw, { kind: 'face' }, base + 1);
      if (areaDaForma(pegada) < areaDaForma(semPortas) - 1e-6 && wallTouchesZone(rw, base, base + 1)) achou = true;
    }
    expect(achou, 'alguma porta tira o vão da zona da parede').toBe(true);
  });

  it('as seções da A (flatAttach) e as da B levam os mesmos materiais e a cena inteira monta sem ignorar nada', () => {
    const p = projetoDeEstresseB1(4, { paredesB2: true });
    const a1 = montarCenaA1(p, true);
    const b = montarCenaB1(p, a1.materialDe);
    expect(b.ignorados).toBe(0);
    expect(a1.nLinhas.paredes_z).toBe(a1.nLinhas.paredes);
  });
});
