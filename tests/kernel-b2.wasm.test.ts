/**
 * Equivalência da sub-etapa B2 (decisão 0050 §3): `pisos_lajes_com_paredes` do Rust x `resolveFloors` e `resolveSlabs` do motor TypeScript
 * COM as paredes do projeto (`layerOutlines` e `terminoBlock`; `referenciaB2`). Roda só em `npm run test:wasm`. Identidade, ordem, ids e campos
 * escalares a 1e-6; polígonos por canonicalização e diferença simétrica sob 1e-6 m² (a 0049 só se a medição pedir, ver 0050 "B2 entregue").
 * Diferente da B1, TODA camada se compara por igualdade: o Rust aplica `regionMinusWalls` e `regionPlusWalls` por dentro, com as paredes do nível
 * resolvidas na própria cena (`resolver_nivel` e `aberturas_geom`, sem ida e volta ao JS).
 */
import { existsSync, readFileSync } from 'node:fs';
import { intersection } from '@hestia/geom';
import { ProjectStore, makeFloor, makeSlab, migrateProject, terminoOf, type Command, type Floor, type Layer, type Project, type Slab } from '@hestia/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enclosedRooms, roomAt } from '../packages/engine/src/enclosed.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaA3 } from '../packages/engine/src/kernelA3.ts';
import { argumentosB1, argumentosB2, decodificarB1, decodificarB2, montarCenaB1, referenciaB2, type ElementoB1 } from '../packages/engine/src/kernelB.ts';
import { areaDaForma } from '../packages/engine/src/kernelComparaA2.ts';
import { adjacentLevelIds, wallTouchesZone, wallsOfLevel, wallZoneAt } from '../packages/engine/src/terminoBlock.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararB1, type ComparacaoB1 } from '../scripts/kernel-harness-b.mts';
import { projetoComRampa, projetoDeEstresseB1 } from '../scripts/kernel-b1-estresse.mts';

/** Modo de MEDIÇÃO (B2_MEDIR=1): junta todas as divergências e imprime o resumo no fim. */
const MEDIR = process.env['B2_MEDIR'] === '1';
const medidas: string[] = [];
const maior = { sim: 0, k: 0, casoSim: '', casoK: '' };
afterAll(() => {
  console.log(`[B2 medido] maior simétrica ${maior.sim} m² (${maior.casoSim}); maior K ${maior.k} (${maior.casoK})`);
  if (MEDIR) console.log(['[B2 medição] ' + medidas.length + ' divergências', ...medidas.map((m) => m.slice(0, 700))].join('\n'));
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

/** A cena da B2: as paredes e as aberturas da fatia A com a cota do término por camada (`flatAttach`), mais as seções da B. */
const cenaDe = (p: Project) => {
  const a1 = montarCenaA1(p, true);
  const a3 = montarCenaA3(p, a1);
  const b = montarCenaB1(p, a1.materialDe);
  const s = a1.secoes;
  const n = a1.nLinhas;
  const sb = b.secoes;
  const nb = b.nLinhas;
  const cena = CenaV2.criar(
    ger!,
    fonteDeSecoes(() => ({
      paredes: { colunas: s.paredes, n: n.paredes },
      tipos_parede: { colunas: s.tipos_parede, n: n.tipos_parede },
      camadas: { colunas: s.camadas, n: n.camadas },
      faixas: { colunas: s.faixas, n: n.faixas },
      paredes_quadro: { colunas: s.paredes_quadro, n: n.paredes_quadro },
      paredes_z: { colunas: s.paredes_z, n: n.paredes_z },
      tipos_abertura: { colunas: a3.secoes.tipos_abertura, n: a3.nLinhas.tipos_abertura },
      aberturas: { colunas: a3.secoes.aberturas, n: a3.nLinhas.aberturas },
      tipos_piso: { colunas: sb.tipos_piso, n: nb.tipos_piso },
      tipos_laje: { colunas: sb.tipos_laje, n: nb.tipos_laje },
      camadas_piso: { colunas: sb.camadas_piso, n: nb.camadas_piso },
      camadas_laje: { colunas: sb.camadas_laje, n: nb.camadas_laje },
      pisos: { colunas: sb.pisos, n: nb.pisos },
      lajes: { colunas: sb.lajes, n: nb.lajes },
      contornos_estaticos: { colunas: sb.contornos_estaticos, n: nb.contornos_estaticos },
      contornos_vinculados: { colunas: sb.contornos_vinculados, n: nb.contornos_vinculados },
      furos_nivel: { colunas: sb.furos_nivel, n: nb.furos_nivel },
      niveis: { colunas: sb.niveis, n: nb.niveis },
    })),
  );
  return { cena, a1, b };
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
  pela0049: number;
  maxSimetrica: number;
  maxK: number;
  desvioMaximo: number;
  /** Camadas por tipo de término (do projeto) e as que, pela B1, dependem de paredes e mudaram de fato com elas. */
  porTermino: Record<string, number>;
  pedemParedes: number;
  mudaramComParedes: number;
  /** Camadas de laje que pedem paredes e cujo polígono mudou, e portas do projeto (e as que chegam a alguma camada de piso). */
  lajesComParedes: number;
  portas: number;
}

const zero = (): Cobertura => ({ comparacoes: 0, pisos: 0, lajes: 0, lajesInclinadas: 0, camadas: 0, membranas: 0, explicitas: 0, comProblema: 0, poligonos: 0, estritos: 0, pela0049: 0, maxSimetrica: 0, maxK: 0, desvioMaximo: 0, porTermino: {}, pedemParedes: 0, mudaramComParedes: 0, lajesComParedes: 0, portas: 0 });
const SOMAS = ['pisos', 'lajes', 'lajesInclinadas', 'camadas', 'membranas', 'explicitas', 'comProblema', 'poligonos', 'estritos', 'pela0049', 'pedemParedes', 'mudaramComParedes', 'lajesComParedes', 'portas'] as const;
const soma = (a: Cobertura, b: ComparacaoB1 | Cobertura): void => {
  a.comparacoes += 'comparacoes' in b ? b.comparacoes : 1;
  for (const k of SOMAS) a[k] += k in b ? (b as unknown as Record<string, number>)[k]! : 0;
  if ('porTermino' in b) for (const [k, v] of Object.entries(b.porTermino)) a.porTermino[k] = (a.porTermino[k] ?? 0) + v;
  a.maxSimetrica = Math.max(a.maxSimetrica, b.maxSimetrica);
  a.maxK = Math.max(a.maxK, b.maxK);
  a.desvioMaximo = Math.max(a.desvioMaximo, b.desvioMaximo);
};

/** Tipo de término do projeto para uma camada de elemento, como o nome usado na cobertura. */
const nomeDoTermino = (t: ReturnType<typeof terminoOf>): string => (typeof t === 'string' ? t : 'ate' in t ? 'ate' : 'cm');

/** Compara todos os pavimentos do projeto. A B1 (sem paredes) roda junto só para contar as camadas que dependem das paredes e mudaram com elas. */
function compararProjeto(p: Project, rotulo = p.name, niveis?: readonly string[]): Cobertura {
  const { cena, b } = cenaDe(p);
  const cov = zero();
  try {
    for (const l of p.levels) {
      if (niveis && !niveis.includes(l.id)) continue;
      const ref = referenciaB2(p, l.id, b);
      const rust = decodificarB2(cena.consultar('pisos_lajes_com_paredes', argumentosB2(p, l.id, b)));
      const cmp = compararB1(ref, rust, {});
      const nome = `${rotulo} ${l.id}`;
      if (cmp.maxSimetrica > maior.sim) Object.assign(maior, { sim: cmp.maxSimetrica, casoSim: nome });
      if (cmp.maxK > maior.k) Object.assign(maior, { k: cmp.maxK, casoK: nome });
      if (MEDIR) medidas.push(...cmp.divergencias.map((d) => `${nome}: ${d}`));
      else expect(cmp.divergencias, `${nome}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
      soma(cov, cmp);
      // camadas que dependem das paredes (a B1 as marca) e as que de fato mudaram com elas
      const semParedes = decodificarB1(cena.consultar('pisos_lajes_nivel', argumentosB1(p, l.id, b)));
      semParedes.forEach((e, i) => {
        e.camadas.forEach((c, k) => {
          if (!c.pedeParedes) return;
          cov.pedemParedes++;
          const com = rust[i]!.camadas[k]!.poligono;
          if (Math.abs(areaDaForma(com) - areaDaForma(c.poligono)) > 1e-6 || (com.length !== c.poligono.length)) {
            cov.mudaramComParedes++;
            if (e.laje) cov.lajesComParedes++;
          }
        });
      });
      // cobertura por término (do projeto)
      const elementos = Object.values(p.elements).filter((el): el is Floor | Slab => (el.kind === 'floor' || el.kind === 'slab') && el.levelId === l.id);
      for (const el of elementos) {
        const tipo = el.kind === 'floor' ? p.floorTypes[el.typeId] : p.slabTypes[el.typeId];
        for (const camada of tipo?.layers ?? []) {
          const t = nomeDoTermino(terminoOf(camada));
          cov.porTermino[t] = (cov.porTermino[t] ?? 0) + 1;
        }
      }
    }
    cov.portas += Object.values(p.elements).filter((e) => e.kind === 'door').length;
  } finally {
    cena.destruir();
  }
  return cov;
}

const relata = (rotulo: string, c: Cobertura): void => {
  console.log(
    `[B2 ${rotulo}] ${c.comparacoes} comparações, pisos ${c.pisos}, lajes ${c.lajes} (inclinadas ${c.lajesInclinadas}), camadas ${c.camadas} (membranas ${c.membranas}, explícitas ${c.explicitas}), elementos com problema ${c.comProblema}, polígonos ${c.poligonos} (estritos ${c.estritos}; só pela 0049: ${c.pela0049}), camadas por término ${JSON.stringify(c.porTermino)}, camadas que dependem de paredes (B1) ${c.pedemParedes}, mudaram com as paredes ${c.mudaramComParedes} (de lajes: ${c.lajesComParedes}), portas ${c.portas}, simétrica máx. ${c.maxSimetrica} m², K máx. ${c.maxK}, desvio máx. de campos ${c.desvioMaximo}`,
  );
};

/** O mesmo projeto com os pisos e as lajes trocados por tipos com término por parede (face, núcleo, até, passa) e deslocamento. */
function comTerminos(p: Project): Project {
  const camada = (function_: Layer['function'], thickness: number, termino?: Layer['termino']): Layer => ({ function: function_, materialId: 'mat_concreto', thickness, wraps: false, ...(termino === undefined ? {} : { termino }) });
  const camadas = [camada('finish1', 0.01, 'face'), camada('substrate', 0.03, 'nucleo'), camada('substrate', 0.02, { ate: { prioridade: 3 } }), camada('structure', 0.12, 'passa'), camada('finish2', 0.01, { cm: 2 })];
  const pisoTipo = { id: 'ft_b2_termos', name: 'Piso B2', code: 'PB2', description: '', layers: camadas, cost: 0 };
  const lajeTipo = { id: 'ls_b2_termos', name: 'Laje B2', code: 'LB2', description: '', layers: camadas, cost: 0 };
  return {
    ...p,
    floorTypes: { ...p.floorTypes, [pisoTipo.id]: pisoTipo },
    slabTypes: { ...p.slabTypes, [lajeTipo.id]: lajeTipo },
    elements: Object.fromEntries(Object.entries(p.elements).map(([id, e]) => [id, e.kind === 'floor' ? { ...e, typeId: pisoTipo.id } : e.kind === 'slab' ? { ...e, typeId: lajeTipo.id } : e])),
  };
}

const totalEstresse = zero();

describe.skipIf(!bytes)('B2: pisos_lajes_com_paredes do Rust x motor TypeScript (com paredes)', () => {
  const pula = (): boolean => ger === null;

  // Uma semente por teste: cada `it` fica bem abaixo de 30 s.
  for (let semente = 1; semente <= 12; semente++) {
    it(`estresse, semente ${semente} (3 pavimentos com portas, paralelas, diagonais e curva, e um sem paredes)`, () => {
      if (pula()) return;
      soma(totalEstresse, compararProjeto(projetoDeEstresseB1(semente, { paredesB2: true }), `semente ${semente}`));
    });
  }

  it('estresse (agregado das sementes 1..12): cobertura', () => {
    if (pula()) return;
    const t = totalEstresse;
    relata('estresse', t);
    expect(t.pisos, 'pisos comparados').toBeGreaterThan(300);
    expect(t.lajes, 'lajes comparadas').toBeGreaterThan(300);
    expect(t.lajesInclinadas, 'lajes inclinadas').toBeGreaterThan(100);
    expect(t.portas, 'portas').toBeGreaterThan(100);
    expect(t.pedemParedes, 'camadas que dependem de paredes').toBeGreaterThan(200);
    expect(t.mudaramComParedes, 'camadas que mudaram com as paredes').toBeGreaterThan(100);
    expect(t.lajesComParedes, 'camadas de laje que mudaram com as paredes').toBeGreaterThan(30);
    for (const termino of ['auto', 'face', 'nucleo', 'passa', 'ate', 'cm']) expect(t.porTermino[termino] ?? 0, `camadas com término ${termino}`).toBeGreaterThan(30);
    expect(t.desvioMaximo, 'desvio de campos escalares').toBeLessThanOrEqual(1e-6);
  });

  it('níveis adjacentes: a laje do pavimento 1 lê as paredes dos pavimentos 0 e 2 (sem a seção niveis o resultado muda), e o piso só as do próprio', () => {
    if (pula()) return;
    let lajesQueMudam = 0;
    let pisosQueMudam = 0;
    // sementes 22 a 24: a 21 dá, nesta configuração, um caso de topologia por pescoço de largura nanométrica (ver 0050, "B2 entregue")
    for (let semente = 22; semente <= 24; semente++) {
      const p = projetoDeEstresseB1(semente, { paredesB2: true, pavimentos: 3, semParedes: false });
      const { cena, b } = cenaDe(p);
      try {
        const meio = p.levels[1]!.id;
        expect(adjacentLevelIds(p, meio)).toEqual([p.levels[0]!.id, p.levels[2]!.id]);
        const args = argumentosB2(p, meio, b);
        const ref = referenciaB2(p, meio, b);
        const rust = decodificarB2(cena.consultar('pisos_lajes_com_paredes', args));
        const cmp = compararB1(ref, rust, {});
        expect(cmp.divergencias, `semente ${semente}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
        // sem vizinhos (seção niveis removida) o Rust deixa de ler as paredes dos outros níveis: as lajes mudam, os pisos não
        cena.remover('niveis', b.secoes.niveis['id_num']!);
        const sozinho = decodificarB2(cena.consultar('pisos_lajes_com_paredes', args));
        expect(sozinho.length).toBe(rust.length);
        rust.forEach((e, i) => {
          const mudou = e.camadas.some((c, k) => c.poligono.length !== sozinho[i]!.camadas[k]!.poligono.length || Math.abs(areaDaForma(c.poligono) - areaDaForma(sozinho[i]!.camadas[k]!.poligono)) > 1e-6);
          if (mudou && e.laje) lajesQueMudam++;
          if (mudou && !e.laje) pisosQueMudam++;
        });
      } finally {
        cena.destruir();
      }
    }
    expect(lajesQueMudam, 'lajes que dependem das paredes dos níveis vizinhos').toBeGreaterThan(3);
    expect(pisosQueMudam, 'pisos nunca leem o nível vizinho').toBe(0);
  }, 120_000);

  it('sintéticos de 10 e 20 pavimentos, com os tipos padrão e com tipos de todos os términos', () => {
    if (pula()) return;
    for (const n of [10, 20]) {
      const cov = compararProjeto(syntheticProject(n), `sintético ${n}`);
      expect(cov.pisos).toBeGreaterThanOrEqual(n);
      expect(cov.lajes).toBeGreaterThanOrEqual(n);
      expect(cov.portas).toBeGreaterThanOrEqual(n);
      relata(`sintético ${n}`, cov);
      // os tipos padrão só têm término automático (nenhuma camada consulta paredes): o mesmo prédio com tipos de piso e laje que usam face, núcleo, até,
      // passa e deslocamento, em todos os pavimentos
      const termos = compararProjeto(comTerminos(syntheticProject(n)), `sintético ${n} com términos`);
      expect(termos.porTermino['face'], 'camadas face').toBeGreaterThanOrEqual(n);
      expect(termos.pedemParedes, 'camadas que dependem de paredes').toBeGreaterThanOrEqual(2 * n);
      expect(termos.mudaramComParedes, 'camadas que mudaram com as paredes').toBeGreaterThanOrEqual(n);
      relata(`sintético ${n} com términos`, termos);
    }
  }, 240_000);

  it('fixture do repositório (casa de 2 quartos) com um piso e uma laje vinculados a cada ambiente e os do perímetro', () => {
    if (pula()) return;
    const base = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
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
    const cov = compararProjeto(store.project, 'casa de 2 quartos');
    relata('casa de 2 quartos', cov);
    expect(cov.pisos).toBeGreaterThanOrEqual(3);
    expect(cov.lajes).toBeGreaterThanOrEqual(3);
    expect(cov.portas, 'portas da fixture').toBeGreaterThan(0);
  }, 120_000);

  it('rampa e escada que furam: modos headroom, full e none; laje reta e inclinada (sem paredes no nível: as zonas não mudam nada)', () => {
    if (pula()) return;
    for (const modo of ['headroom', 'full', 'none'] as const) {
      for (const inclinada of [false, true]) {
        const cov = compararProjeto(projetoComRampa(modo, inclinada), `rampa ${modo}${inclinada ? ' inclinada' : ''}`);
        expect(cov.pisos).toBeGreaterThanOrEqual(1);
        expect(cov.lajes).toBeGreaterThanOrEqual(1);
      }
    }
  }, 60_000);

  it('propriedades do Rust: face não invade a zona das paredes que a tocam; nucleo e passa ficam dentro do contorno do elemento', () => {
    if (pula()) return;
    let faces = 0;
    let nucleos = 0;
    let passas = 0;
    for (let semente = 31; semente <= 34; semente++) {
      const p = projetoDeEstresseB1(semente, { paredesB2: true, pavimentos: 3, semParedes: false });
      const { cena, b } = cenaDe(p);
      try {
        for (const l of p.levels) {
          const lista: ElementoB1[] = decodificarB2(cena.consultar('pisos_lajes_com_paredes', argumentosB2(p, l.id, b)));
          for (const e of lista) {
            const id = [...(e.laje ? b.lajeDe : b.pisoDe)].find(([, n]) => n === e.id)![0];
            const el = p.elements[id] as Floor | Slab;
            const tipo = e.laje ? p.slabTypes[el.typeId]! : p.floorTypes[el.typeId]!;
            // o recorte esperado só vale para o contorno SEM circuito (estático): no vinculado `face` e `nucleo` vêm dos circuitos
            const estatico = !el.outlineSource || (!el.outlineSource.linked && el.outlineSource.mode !== 'perimeter');
            if (!estatico) continue;
            const niveis = e.laje ? [l.id, ...adjacentLevelIds(p, l.id)] : [l.id];
            e.camadas.forEach((c, k) => {
              const camada = tipo.layers[k]!;
              if (camada.limiteExterno) return;
              const t = terminoOf(camada);
              if (t !== 'face' && t !== 'nucleo' && t !== 'passa') return;
              // dentro do contorno do elemento (o polígono do elemento já traz os furos de escada)
              const fora = c.poligono.length && e.poligono.length ? areaDaForma(c.poligono) - areaDaForma(intersection(c.poligono, e.poligono)) : 0;
              expect(fora, `semente ${semente} ${l.id} ${id} camada ${k} (${t}): fora do contorno do elemento`).toBeLessThanOrEqual(1e-6);
              if (t === 'passa') {
                // sem recorte: o mesmo polígono do elemento
                expect(Math.abs(areaDaForma(c.poligono) - areaDaForma(e.poligono)), `semente ${semente} ${id} camada ${k}: passa`).toBeLessThanOrEqual(1e-6);
                passas++;
                return;
              }
              for (const nivel of niveis) {
                for (const rw of wallsOfLevel(p, nivel)) {
                  if (!wallTouchesZone(rw, c.z0, c.z1)) continue;
                  const zona = wallZoneAt(p, rw, { kind: t }, c.z1);
                  if (zona.length === 0 || c.poligono.length === 0) continue;
                  const invade = areaDaForma(intersection(c.poligono, zona));
                  expect(invade, `semente ${semente} ${l.id} ${id} camada ${k} (${t}) invade a parede ${rw.wallId}`).toBeLessThanOrEqual(1e-6);
                }
              }
              if (t === 'face') faces++;
              else nucleos++;
            });
          }
        }
      } finally {
        cena.destruir();
      }
    }
    expect(faces, 'camadas face verificadas').toBeGreaterThan(10);
    expect(nucleos, 'camadas nucleo verificadas').toBeGreaterThan(10);
    expect(passas, 'camadas passa verificadas').toBeGreaterThan(10);
  }, 120_000);

  it('upsert e remoção seguem o projeto: remover uma parede devolve a região sem a zona dela e o upsert a devolve', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(5, { paredesB2: true, pavimentos: 2, semParedes: false });
    const { cena, a1, b } = cenaDe(p);
    try {
      const args = argumentosB2(p, p.levels[0]!.id, b);
      const antes = decodificarB2(cena.consultar('pisos_lajes_com_paredes', args));
      expect(decodificarB2(cena.consultar('pisos_lajes_com_paredes', args))).toEqual(antes);
      // remover todas as paredes do nível 0 (as quatro seções da fatia A que o nível usa) deixa as camadas com a região sem paredes
      const ids = a1.secoes.paredes['id_num']!.filter((_, i) => a1.secoes.paredes['nivel_num']![i] === 0);
      expect(ids.length).toBeGreaterThan(10);
      cena.remover('paredes', ids);
      cena.remover('paredes_quadro', ids);
      cena.remover('paredes_z', ids);
      const sem = decodificarB2(cena.consultar('pisos_lajes_com_paredes', args));
      expect(sem.length).toBe(antes.length);
      const mudou = sem.some((e, i) => e.camadas.some((c, k) => Math.abs(areaDaForma(c.poligono) - areaDaForma(antes[i]!.camadas[k]!.poligono)) > 1e-6));
      expect(mudou, 'a remoção das paredes muda alguma camada').toBe(true);
      cena.upsert('paredes', a1.secoes.paredes, a1.nLinhas.paredes);
      cena.upsert('paredes_quadro', a1.secoes.paredes_quadro, a1.nLinhas.paredes_quadro);
      cena.upsert('paredes_z', a1.secoes.paredes_z, a1.nLinhas.paredes_z);
      expect(decodificarB2(cena.consultar('pisos_lajes_com_paredes', args))).toEqual(antes);
      // a seção niveis: sem ela a laje do nível não lê os vizinhos (as lajes do nível 0 perdem a leitura do nível 1)
      const niveis = b.secoes.niveis;
      cena.remover('niveis', niveis['id_num']!);
      const semNiveis = decodificarB2(cena.consultar('pisos_lajes_com_paredes', args));
      expect(semNiveis.length).toBe(antes.length);
      cena.upsert('niveis', niveis, b.nLinhas.niveis);
      expect(decodificarB2(cena.consultar('pisos_lajes_com_paredes', args))).toEqual(antes);
    } finally {
      cena.destruir();
    }
  }, 60_000);

  it('entradas inválidas viram falha leve, nunca panic', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(3, { paredesB2: true, pavimentos: 1, semParedes: false });
    const { cena } = cenaDe(p);
    try {
      expect(() => cena.consultar('pisos_lajes_com_paredes', [0xffffffff, 0.02])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('pisos_lajes_com_paredes', [0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('pisos_lajes_com_paredes', [0, 0.02, 1])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('pisos_lajes_com_paredes', [0.5, 0.02])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('pisos_lajes_com_paredes', [0, -0.01])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('pisos_lajes_com_paredes', [0, Number.NaN])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('pisos_lajes_com_paredes', [0, 0.02])).not.toThrow();
      // seção niveis inválida: cota não finita, nível reservado, chave duplicada
      const nv = { id_num: [900001], nivel_num: [7], cota: [0] };
      expect(() => cena.upsert('niveis', { ...nv, cota: [Number.NaN] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('niveis', { ...nv, cota: [Number.POSITIVE_INFINITY] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('niveis', { ...nv, nivel_num: [0xffffffff] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('niveis', { id_num: [900001, 900001], nivel_num: [7, 8], cota: [0, 1] }, 2)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('niveis', { ...nv, id_num: [0xffffffff] }, 1)).toThrow(ErroKernelLeve);
      // parede sem `paredes_z`: a cena fica incompleta para quem lê paredes e a consulta recusa (nunca panic)
      cena.remover('paredes_z', [1]);
      expect(() => cena.consultar('pisos_lajes_com_paredes', [0, 0.02])).toThrow(ErroKernelLeve);
    } finally {
      cena.destruir();
    }
  });

  it('sem vazamento de memória depois de destruir a cena', () => {
    if (pula()) return;
    const antes = ger!.instancia().exports.memoria_usada();
    // só a memória: a equivalência está nos testes de estresse (aqui as consultas rodam e a cena é destruída, três vezes)
    for (let i = 0; i < 3; i++) {
      const p = projetoDeEstresseB1(11, { pavimentos: 2, paredesB2: true });
      const { cena, b } = cenaDe(p);
      try {
        for (const l of p.levels) expect(decodificarB2(cena.consultar('pisos_lajes_com_paredes', argumentosB2(p, l.id, b))).length).toBeGreaterThan(0);
      } finally {
        cena.destruir();
      }
    }
    expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
  }, 60_000);
});

