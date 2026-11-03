/**
 * Equivalência da sub-etapa B1 (decisão 0050 §3): `pisos_lajes_nivel` do Rust x `resolveFloors` e `resolveSlabs` do motor TypeScript
 * (`referenciaB1`). Roda só em `npm run test:wasm`. Identidade, ordem, ids e campos escalares (cotas, prioridade, inclinação) a 1e-6; polígonos
 * por canonicalização e diferença simétrica sob 1e-6 m² (e a 0049 só se a medição pedir, ver 0050 "B1 entregue"). Camadas cujo término depende das
 * paredes do nível (B2) saem do Rust sem paredes: o projeto completo as compara por contenção, e o MESMO projeto sem paredes as compara por igualdade.
 */
import { existsSync, readFileSync } from 'node:fs';
import { ProjectStore, makeFloor, makeSlab, migrateProject, terminoOf, type Command, type Floor, type Project, type Slab } from '@hestia/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enclosedRooms, roomAt } from '../packages/engine/src/enclosed.ts';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { argumentosB1, decodificarB1, montarCenaB1, referenciaB1, type ElementoB1 } from '../packages/engine/src/kernelB.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararB1, type ComparacaoB1 } from '../scripts/kernel-harness-b.mts';
import { projetoComRampa, projetoDeEstresseB1, semParedes } from '../scripts/kernel-b1-estresse.mts';

/** Modo de MEDIÇÃO (B1_MEDIR=1): junta todas as divergências e imprime o resumo no fim (números para o dono quando a regra geral reprova). */
const MEDIR = process.env['B1_MEDIR'] === '1';
const medidas: string[] = [];
const maior = { sim: 0, k: 0, casoSim: '', casoK: '' };
afterAll(() => {
  console.log(`[B1 medido] maior simétrica ${maior.sim} m² (${maior.casoSim}); maior K ${maior.k} (${maior.casoK})`);
  if (MEDIR) console.log(['[B1 medição] ' + medidas.length + ' divergências', ...medidas.map((m) => m.slice(0, 700))].join('\n'));
});

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null; // binário sem ABI v2 (ainda é o da v1): os testes são pulados
  }
});

const cenaDe = (p: Project) => {
  const b = montarCenaB1(p, montarCenaA1(p).materialDe);
  const s = b.secoes;
  const n = b.nLinhas;
  const cena = CenaV2.criar(
    ger!,
    fonteDeSecoes(() => ({
      tipos_piso: { colunas: s.tipos_piso, n: n.tipos_piso },
      tipos_laje: { colunas: s.tipos_laje, n: n.tipos_laje },
      camadas_piso: { colunas: s.camadas_piso, n: n.camadas_piso },
      camadas_laje: { colunas: s.camadas_laje, n: n.camadas_laje },
      pisos: { colunas: s.pisos, n: n.pisos },
      lajes: { colunas: s.lajes, n: n.lajes },
      contornos_estaticos: { colunas: s.contornos_estaticos, n: n.contornos_estaticos },
      contornos_vinculados: { colunas: s.contornos_vinculados, n: n.contornos_vinculados },
      furos_nivel: { colunas: s.furos_nivel, n: n.furos_nivel },
    })),
  );
  return { cena, b };
};

interface Cobertura {
  comparacoes: number;
  pisos: number;
  lajes: number;
  lajesInclinadas: number;
  camadas: number;
  membranas: number;
  explicitas: number;
  comProblema: number;
  poligonos: number;
  estritos: number;
  porContencao: number;
  pedeParedesIguais: number;
  pela0049: number;
  maxSimetrica: number;
  maxK: number;
  desvioMaximo: number;
  /** Elementos vinculados com circuito fechado e elementos com furo de escada ou rampa (do projeto, não da comparação). */
  vinculadosFechados: number;
  comFuro: number;
  perimetros: number;
}
const zero = (): Cobertura => ({ comparacoes: 0, pisos: 0, lajes: 0, lajesInclinadas: 0, camadas: 0, membranas: 0, explicitas: 0, comProblema: 0, poligonos: 0, estritos: 0, porContencao: 0, pedeParedesIguais: 0, pela0049: 0, maxSimetrica: 0, maxK: 0, desvioMaximo: 0, vinculadosFechados: 0, comFuro: 0, perimetros: 0 });
const SOMAS = ['pisos', 'lajes', 'lajesInclinadas', 'camadas', 'membranas', 'explicitas', 'comProblema', 'poligonos', 'estritos', 'porContencao', 'pedeParedesIguais', 'pela0049', 'vinculadosFechados', 'comFuro', 'perimetros'] as const;
const soma = (a: Cobertura, b: ComparacaoB1 | Cobertura): void => {
  a.comparacoes += 'comparacoes' in b ? b.comparacoes : 1;
  for (const k of SOMAS) a[k] += k in b ? (b as unknown as Record<string, number>)[k]! : 0;
  a.maxSimetrica = Math.max(a.maxSimetrica, b.maxSimetrica);
  a.maxK = Math.max(a.maxK, b.maxK);
  a.desvioMaximo = Math.max(a.desvioMaximo, b.desvioMaximo);
};

/** Compara todos os pavimentos do projeto. `contencao`: camadas que pedem paredes por contenção (projeto com paredes). */
function compararProjeto(p: Project, contencao: boolean, rotulo = p.name): Cobertura {
  const { cena, b } = cenaDe(p);
  const cov = zero();
  try {
    for (const l of p.levels) {
      const ref = referenciaB1(p, l.id, b);
      const rust = decodificarB1(cena.consultar('pisos_lajes_nivel', argumentosB1(p, l.id, b)));
      const cmp = compararB1(ref, rust, { contencao });
      const nome = `${rotulo} ${l.id} ${contencao ? '(com paredes)' : '(sem paredes)'}`;
      if (cmp.maxSimetrica > maior.sim) Object.assign(maior, { sim: cmp.maxSimetrica, casoSim: nome });
      if (cmp.maxK > maior.k) Object.assign(maior, { k: cmp.maxK, casoK: nome });
      if (MEDIR) medidas.push(...cmp.divergencias.map((d) => `${nome}: ${d}`));
      else expect(cmp.divergencias, `${nome}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
      soma(cov, cmp);
    }
    // cobertura do projeto: vinculados com circuito fechado, perímetros e elementos com furo
    const v = b.secoes.contornos_vinculados;
    const f = b.secoes.furos_nivel;
    const com = (secao: { elemento_num?: number[]; tipo_el?: number[]; papel?: number[] }, tipoEl: number, papel?: number): Set<number> =>
      new Set(secao.elemento_num!.filter((_, i) => secao.tipo_el![i] === tipoEl && (papel === undefined || secao.papel![i] === papel)));
    for (const tipoEl of [0, 1]) {
      cov.vinculadosFechados += com(v, tipoEl, 0).size;
      cov.perimetros += com(v, tipoEl, 2).size;
      cov.comFuro += com(f, tipoEl).size;
    }
  } finally {
    cena.destruir();
  }
  return cov;
}

/** Compara com paredes (contenção nas camadas que pedem paredes) e sem paredes (igualdade em todas). */
const compararDuplo = (p: Project, rotulo?: string): Cobertura => {
  const cov = compararProjeto(p, true, rotulo);
  soma(cov, compararProjeto(semParedes(p), false, rotulo));
  return cov;
};

const relata = (rotulo: string, c: Cobertura): void => {
  console.log(
    `[B1 ${rotulo}] ${c.comparacoes} comparações, pisos ${c.pisos}, lajes ${c.lajes} (inclinadas ${c.lajesInclinadas}), camadas ${c.camadas} (membranas ${c.membranas}, explícitas ${c.explicitas}), elementos com problema ${c.comProblema}, vinculados com circuito fechado ${c.vinculadosFechados}, perímetros ${c.perimetros}, com furo ${c.comFuro}, polígonos ${c.poligonos} (estritos ${c.estritos}; só pela 0049: ${c.pela0049}), camadas que pedem paredes ${c.porContencao} (iguais mesmo assim: ${c.pedeParedesIguais}), simétrica máx. ${c.maxSimetrica} m², K máx. ${c.maxK}, desvio máx. de campos ${c.desvioMaximo}`,
  );
};

const totalEstresse = zero();

describe.skipIf(!bytes)('B1: pisos_lajes_nivel do Rust x motor TypeScript', () => {
  const pula = (): boolean => ger === null;

  // Uma semente por teste: cada `it` fica bem abaixo de 30 s.
  for (let semente = 1; semente <= 12; semente++) {
    it(`estresse, semente ${semente} (3 pavimentos e um sem paredes): pisos, lajes, camadas, vinculados, furos e inclinadas`, () => {
      if (pula()) return;
      soma(totalEstresse, compararDuplo(projetoDeEstresseB1(semente), `semente ${semente}`));
    });
  }

  it('estresse (agregado das sementes 1..12): cobertura', () => {
    if (pula()) return;
    const t = totalEstresse;
    relata('estresse', t);
    expect(t.pisos, 'pisos comparados').toBeGreaterThan(400);
    expect(t.lajes, 'lajes comparadas').toBeGreaterThan(400);
    expect(t.lajesInclinadas, 'lajes inclinadas').toBeGreaterThan(100);
    expect(t.vinculadosFechados, 'vinculados com circuito fechado').toBeGreaterThan(100);
    expect(t.perimetros, 'elementos de perímetro').toBeGreaterThan(50);
    expect(t.comFuro, 'elementos com furo de escada ou rampa').toBeGreaterThan(30);
    expect(t.comProblema, 'elementos com problema (aberto ou fora)').toBeGreaterThan(30);
    expect(t.membranas, 'camadas de membrana').toBeGreaterThan(50);
    expect(t.explicitas, 'camadas com término explícito').toBeGreaterThan(200);
    expect(t.porContencao, 'camadas que pedem paredes (por contenção)').toBeGreaterThan(50);
    expect(t.desvioMaximo, 'desvio de campos escalares').toBeLessThanOrEqual(1e-6);
  });

  it('sintéticos de 10 e 20 pavimentos', () => {
    if (pula()) return;
    for (const n of [10, 20]) {
      const cov = compararDuplo(syntheticProject(n), `sintético ${n}`);
      expect(cov.pisos).toBeGreaterThanOrEqual(2 * n);
      expect(cov.lajes).toBeGreaterThanOrEqual(2 * n);
    }
  }, 120_000);

  it('fixture do repositório (casa de 2 quartos) com um piso e uma laje vinculados a cada ambiente e os do perímetro', () => {
    if (pula()) return;
    const base = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
    // a fixture não tem pisos nem lajes: um vinculado por ambiente (acabamento no piso, núcleo na laje) e um de perímetro por tipo de piso e de laje
    const store = new ProjectStore(base);
    const cmds: Command[] = [];
    let n = 0;
    for (const l of base.levels) {
      const salas = enclosedRooms(base, l.id, 'finish');
      for (const sala of salas) {
        const xs = sala[0]!.map((q) => q.x);
        const ys = sala[0]!.map((q) => q.y);
        const seed = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
        if (!roomAt(salas, seed)) continue;
        cmds.push({ type: 'addFloor', floor: makeFloor({ id: `fx_f_${n}`, typeId: n % 2 ? 'ft_unico' : 'ft_ceram', levelId: l.id, boundary: sala[0]!, outlineSource: { mode: 'walls-finish', seed, linked: true } }) });
        cmds.push({ type: 'addSlab', slab: makeSlab({ id: `fx_s_${n}`, typeId: n % 2 ? 'ls_unica' : 'ls_mac15', levelId: l.id, boundary: sala[0]!, outlineSource: { mode: 'walls-core', seed, linked: true } }) });
        n++;
      }
      cmds.push({ type: 'addFloor', floor: makeFloor({ id: `fx_fp_${l.id}`, typeId: 'ft_unico', levelId: l.id, boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], outlineSource: { mode: 'perimeter', seed: { x: 1, y: 1 }, linked: true } }) });
      cmds.push({ type: 'addSlab', slab: makeSlab({ id: `fx_sp_${l.id}`, typeId: 'ls_unica', levelId: l.id, boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], outlineSource: { mode: 'perimeter', seed: { x: 1, y: 1 }, linked: true, extend: 'core' } }) });
    }
    store.exec({ type: 'batch', commands: cmds });
    const cov = compararDuplo(store.project, 'casa de 2 quartos');
    expect(cov.pisos).toBeGreaterThanOrEqual(3);
    expect(cov.lajes).toBeGreaterThanOrEqual(3);
    expect(cov.vinculadosFechados, 'ambientes vinculados com circuito fechado').toBeGreaterThanOrEqual(4);
    expect(cov.perimetros).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('furo manual que passa do circuito do vinculado: corte, limite e deslocamento {cm} iguais ao TS (o porte do ClipperOffset reproduz até os pedaços soltos que o offset do Clipper deixa em volta do furo)', () => {
    if (pula()) return;
    let emCm = 0;
    const outras: string[] = [];
    for (let semente = 1; semente <= 8; semente++) {
      const p = projetoDeEstresseB1(semente, { pavimentos: 2, semParedes: false, furosLivres: true });
      const { cena, b } = cenaDe(p);
      try {
        for (const l of p.levels) {
          const ref = referenciaB1(p, l.id, b);
          const rust = decodificarB1(cena.consultar('pisos_lajes_nivel', argumentosB1(p, l.id, b)));
          const cmp = compararB1(ref, rust, { contencao: true, maxDivergencias: 10_000 });
          for (const d of cmp.detalhes) {
            const e = ref[d.elemento]!;
            const [idElemento] = [...(e.laje ? b.lajeDe : b.pisoDe)].find(([, n]) => n === e.id)!;
            const el = p.elements[idElemento] as Floor | Slab;
            const tipo = e.laje ? p.slabTypes[el.typeId]! : p.floorTypes[el.typeId]!;
            const t = d.camada === null ? null : terminoOf(tipo.layers[d.camada]!);
            if (t !== null && typeof t === 'object' && 'cm' in t && t.cm !== 0 && el.outlineSource?.linked) emCm++;
            else outras.push(`semente ${semente} ${l.id}: ${d.mensagem}`);
          }
        }
      } finally {
        cena.destruir();
      }
    }
    // Antes do `offset_clipper` (B2) o offset do i_overlay limpava esses pedaços e 2 camadas {cm} divergiam (a "exceção nomeada" da B1); com o porte do
    // ClipperOffset (cantos quadrados, pontos a 1 µm) não diverge nenhuma: a exceção era diferença de offset, não defeito do TS.
    expect(outras.slice(0, 3), 'divergências').toEqual([]);
    expect(emCm, 'camadas {cm} divergentes').toBe(0);
    console.log(`[B1 furo fora do circuito] camadas {cm} divergentes: ${emCm}`);
  }, 120_000);

  it('rampa e escada que furam: modos headroom, full e none; laje reta e inclinada', () => {
    if (pula()) return;
    for (const modo of ['headroom', 'full', 'none'] as const) {
      for (const inclinada of [false, true]) {
        const cov = compararDuplo(projetoComRampa(modo, inclinada), `rampa ${modo}${inclinada ? ' inclinada' : ''}`);
        expect(cov.pisos).toBeGreaterThanOrEqual(2);
        if (modo !== 'none') expect(cov.comFuro, `furo da rampa (${modo})`).toBeGreaterThan(0);
      }
    }
  }, 60_000);

  it('propriedades do Rust: camadas empilhadas sem lacuna, laje inclinada dentro das cotas, área igual à soma das partes', () => {
    if (pula()) return;
    let camadas = 0;
    let inclinadas = 0;
    for (let semente = 300; semente < 303; semente++) {
      const p = projetoDeEstresseB1(semente, { pavimentos: 2 });
      const { cena, b } = cenaDe(p);
      try {
        for (const l of p.levels) {
          const lista: ElementoB1[] = decodificarB1(cena.consultar('pisos_lajes_nivel', argumentosB1(p, l.id, b)));
          for (const e of lista) {
            let z = e.topoZ;
            for (const c of e.camadas) {
              expect(c.z1).toBe(z);
              expect(c.z0).toBeLessThanOrEqual(c.z1);
              z = c.z0;
              camadas++;
            }
            expect(z).toBe(e.baseZ);
            const area = (m: ElementoB1['poligono']): number => m.reduce((t, peca) => t + peca.reduce((s, anel, i) => s + (i === 0 ? 1 : -1) * Math.abs(anel.reduce((u, q, k) => u + q.x * anel[(k + 1) % anel.length]!.y - anel[(k + 1) % anel.length]!.x * q.y, 0) / 2), 0), 0);
            expect(area(e.poligono)).toBeGreaterThan(0);
            expect(area(e.poligono)).toBeCloseTo(e.poligono.reduce((t, peca) => t + area([peca]), 0), 9);
            if (e.inclinacao) {
              inclinadas++;
              const s = e.inclinacao;
              const alcance = Math.max(...e.poligono.flatMap((peca) => peca[0]!.map((q) => Math.abs((q.x - s.origem.x) * s.direcao.x + (q.y - s.origem.y) * s.direcao.y))));
              // a face de cima sobe no máximo `percentual` % da distância ao longo da direção, e a de baixo sobe o mesmo (espessura constante)
              expect((s.percentual / 100) * alcance).toBeGreaterThanOrEqual(0);
              expect(e.topoZ - e.baseZ).toBeGreaterThanOrEqual(0);
            }
          }
        }
      } finally {
        cena.destruir();
      }
    }
    expect(camadas, 'camadas verificadas').toBeGreaterThan(100);
    expect(inclinadas, 'lajes inclinadas verificadas').toBeGreaterThan(3);
  }, 120_000);

  it('upsert e remoção seguem o projeto: remover os furos devolve a laje inteira e o upsert os devolve', () => {
    if (pula()) return;
    const p = projetoComRampa('headroom');
    const { cena, b } = cenaDe(p);
    try {
      const l = p.levels[1]!;
      const args = argumentosB1(p, l.id, b);
      const antes = decodificarB1(cena.consultar('pisos_lajes_nivel', args));
      const livre = decodificarB1(cena.consultar('pisos_lajes_nivel', args));
      expect(livre).toEqual(antes);
      const areaDe = (e: ElementoB1): number => compararArea(e.poligono);
      const furos = b.secoes.furos_nivel;
      expect(furos['id_num']!.length).toBeGreaterThan(0);
      cena.remover('furos_nivel', furos['id_num']!);
      const sem = decodificarB1(cena.consultar('pisos_lajes_nivel', args));
      expect(sem.length).toBe(antes.length);
      for (let i = 0; i < antes.length; i++) expect(areaDe(sem[i]!)).toBeGreaterThan(areaDe(antes[i]!));
      const projetoLivre = projetoComRampa('none');
      const refLivre = referenciaB1(projetoLivre, projetoLivre.levels[1]!.id, montarCenaB1(projetoLivre));
      expect(compararB1(refLivre, sem, {}).divergencias.filter((d) => d.includes('polígono') && !d.includes('camada'))).toEqual([]);
      cena.upsert('furos_nivel', furos, b.nLinhas.furos_nivel);
      const volta = decodificarB1(cena.consultar('pisos_lajes_nivel', args));
      expect(volta).toEqual(antes);
      // remover um piso e devolvê-lo
      const pisos = b.secoes.pisos;
      cena.remover('pisos', [pisos['id_num']![0]!]);
      const semPiso = decodificarB1(cena.consultar('pisos_lajes_nivel', args));
      expect(semPiso.length).toBe(antes.length - 1);
      cena.upsert('pisos', pisos, b.nLinhas.pisos);
      expect(decodificarB1(cena.consultar('pisos_lajes_nivel', args))).toEqual(antes);
    } finally {
      cena.destruir();
    }
  }, 60_000);

  it('entradas inválidas viram falha leve, nunca panic', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(3, { pavimentos: 1, semParedes: false });
    const { cena, b } = cenaDe(p);
    try {
      expect(() => cena.consultar('pisos_lajes_nivel', [0xffffffff])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('pisos_lajes_nivel', [])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('pisos_lajes_nivel', [0, 1])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('pisos_lajes_nivel', [0.5])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('pisos_lajes_nivel', [0])).not.toThrow();
      // seções inválidas: enum fora do domínio, valor não finito, chave reservada, papel e tipo_el fora do domínio
      const camada = Object.fromEntries(Object.entries(b.secoes.camadas_piso).map(([k, v]) => [k, v.slice(0, 1)]));
      expect(() => cena.upsert('camadas_piso', { ...camada, funcao: [6] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('camadas_piso', { ...camada, termino: [6] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('camadas_piso', { ...camada, espessura: [Number.NaN] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('camadas_piso', { ...camada, id_num: [0xffffffff] }, 1)).toThrow(ErroKernelLeve);
      const piso = Object.fromEntries(Object.entries(b.secoes.pisos).map(([k, v]) => [k, v.slice(0, 1)]));
      expect(() => cena.upsert('pisos', { ...piso, modo: [4] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('pisos', { ...piso, vinculado: [2] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('pisos', { ...piso, problema: [3] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('pisos', { ...piso, nivel_num: [0xffffffff] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('pisos', { ...piso, cota_nivel: [Number.POSITIVE_INFINITY] }, 1)).toThrow(ErroKernelLeve);
      const ponto = { id_num: [900001], tipo_el: [2], elemento_num: [1], papel: [0], anel: [0], indice: [0], x: [0], y: [0] };
      expect(() => cena.upsert('contornos_vinculados', ponto, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('contornos_vinculados', { ...ponto, tipo_el: [0], papel: [4] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('contornos_estaticos', { id_num: [900001], tipo_el: [0], elemento_num: [1], anel: [0], indice: [0], x: [Number.NaN], y: [0] }, 1)).toThrow(ErroKernelLeve);
      // índice repetido e lacuna no anel: recusados na consulta, não na seção
      cena.upsert('contornos_estaticos', { id_num: [900001, 900002], tipo_el: [0, 0], elemento_num: [1, 1], anel: [0, 0], indice: [0, 0], x: [0, 1], y: [0, 0] }, 2);
      expect(() => cena.consultar('pisos_lajes_nivel', [0])).toThrow(ErroKernelLeve);
      cena.remover('contornos_estaticos', [900001, 900002]);
      cena.upsert('contornos_estaticos', { id_num: [900001, 900002], tipo_el: [0, 0], elemento_num: [1, 1], anel: [0, 0], indice: [0, 5], x: [0, 1], y: [0, 0] }, 2);
      expect(() => cena.consultar('pisos_lajes_nivel', [0])).toThrow(ErroKernelLeve);
      cena.remover('contornos_estaticos', [900001, 900002]);
      // tipo cujas camadas não batem com n_camadas
      cena.remover('camadas_piso', b.secoes.camadas_piso['id_num']!.slice(0, 1));
      expect(() => cena.consultar('pisos_lajes_nivel', [0])).toThrow(ErroKernelLeve);
    } finally {
      cena.destruir();
    }
  });

  it('sem vazamento de memória depois de destruir a cena', () => {
    if (pula()) return;
    const antes = ger!.instancia().exports.memoria_usada();
    compararDuplo(projetoDeEstresseB1(11, { pavimentos: 2 }), 'vazamento');
    expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
  }, 60_000);
});

/** Área líquida de um multipolígono (externo menos furos), só para as comparações de upsert e remoção. */
function compararArea(m: ElementoB1['poligono']): number {
  const a = (anel: ElementoB1['poligono'][number][number]): number => Math.abs(anel.reduce((u, q, k) => u + q.x * anel[(k + 1) % anel.length]!.y - anel[(k + 1) % anel.length]!.x * q.y, 0) / 2);
  return m.reduce((t, peca) => t + peca.reduce((s, anel, i) => s + (i === 0 ? 1 : -1) * a(anel), 0), 0);
}
