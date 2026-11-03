/**
 * Equivalência da sub-etapa B3 (decisão 0050 §3): `junction_nivel` do Rust x `levelCutterSet` e `junctionLevel` do motor TypeScript (`referenciaB3`).
 * Roda só em `npm run test:wasm`. Identidade, ordem, ids, marcas e campos escalares a 1e-6; polígonos por canonicalização e diferença simétrica
 * sob 1e-6 m² e, quando a medição pede, a 0049 (K medido e registrado em 0050, "B3 entregue"). A junção lê as paredes de TODOS os níveis (cortadores
 * externos), então cada comparação resolve o prédio inteiro nos dois lados.
 */
import { existsSync, readFileSync } from 'node:fs';
import { intersection, union, type MultiPolygon } from '@hestia/geom';
import { ProjectStore, makeFloor, makeSlab, migrateProject, type Command, type Project } from '@hestia/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enclosedRooms, roomAt } from '../packages/engine/src/enclosed.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { winsOver } from '../packages/engine/src/junctionPlanar.ts';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaA3 } from '../packages/engine/src/kernelA3.ts';
import { montarPerfisA3d } from '../packages/engine/src/kernelA3d.ts';
import { montarCenaB1 } from '../packages/engine/src/kernelB.ts';
import { argumentosB3, decodificarB3, montarCenaB3, referenciaB3, type JuncaoB3, type PecaB3 } from '../packages/engine/src/kernelB3.ts';
import { areaDaForma } from '../packages/engine/src/kernelComparaA2.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararB3, comparacaoB3Vazia, type ComparacaoB3 } from '../scripts/kernel-harness-b.mts';
import { projetoDeEstresseB1 } from '../scripts/kernel-b1-estresse.mts';

/**
 * `K` da regra 3 da 0049 para as partes e regiões da junção (limite `1e-5 + K x perímetro x 1e-6`): ver 0050, "B3 entregue". `B3_K` troca o valor só para
 * MEDIR (com um K enorme nada reprova pelo limite; o K medido sai no resumo `[B3 medido]`); sem `B3_K` vale o K adotado.
 */
const K_B3_0049 = Number(process.env['B3_K'] ?? 0.08);
const SEMENTES = Number(process.env['B3_SEMENTES'] ?? 12);

/** Modo de MEDIÇÃO (B3_MEDIR=1): junta todas as divergências e imprime o resumo no fim. */
const MEDIR = process.env['B3_MEDIR'] === '1';
const medidas: string[] = [];
const maior = { sim: 0, k: 0, casoSim: '', casoK: '' };
afterAll(() => {
  console.log(`[B3 medido] maior simétrica ${maior.sim} m² (${maior.casoSim}); maior K ${maior.k} (${maior.casoK})`);
  if (MEDIR) console.log(['[B3 medição] ' + medidas.length + ' divergências', ...medidas.map((m) => m.slice(0, 700))].join('\n'));
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

/**
 * A cena da B3: as seções da fatia A e da B com a cota do término por camada (`flatAttach`, a variante da B2), os perfis dessa variante em `perfis_z`
 * e, em `paredes_z_juncao` e `perfis_z_juncao`, a variante da junção (sem `flatAttach`) das paredes em que ela difere.
 */
const cenaDe = (p: Project, opcoes: { todas?: boolean } = {}) => {
  const a1 = montarCenaA1(p, true);
  const a3 = montarCenaA3(p, a1);
  const perfis = montarPerfisA3d(p, a1, true);
  const b = montarCenaB1(p, a1.materialDe);
  const b3 = montarCenaB3(p, a1, opcoes);
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
      perfis_z: { colunas: perfis.colunas, n: perfis.n },
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
      paredes_z_juncao: { colunas: b3.secoes.paredes_z_juncao, n: b3.nLinhas.paredes_z_juncao },
      perfis_z_juncao: { colunas: b3.secoes.perfis_z_juncao, n: b3.nLinhas.perfis_z_juncao },
    })),
  );
  return { cena, a1, b, b3 };
};

interface Cobertura extends ComparacaoB3 {
  comparacoes: number;
  /** Faixas de parede planas e inclinadas; peças externas por tipo de elemento; níveis comparados. */
  paredesComVariante: number;
  externasDeNivelNaoAdjacente: number;
  externasPorTipo: number[];
  pecasPorSpan: { constante: number; laje: number; faixa: number };
  /** Elementos da junção por tipo (piso e laje) e camadas de paredes cortadas por camada de piso e de laje. */
  lajesNaJuncao: number;
  pisosNaJuncao: number;
}

const zero = (): Cobertura => ({ ...comparacaoB3Vazia(), comparacoes: 0, paredesComVariante: 0, externasDeNivelNaoAdjacente: 0, externasPorTipo: [0, 0, 0], pecasPorSpan: { constante: 0, laje: 0, faixa: 0 }, lajesNaJuncao: 0, pisosNaJuncao: 0 });
const SOMAS = ['cortadores', 'pecas', 'pecasExternas', 'pecasInclinadas', 'pecasSemMeta', 'membranas', 'elementos', 'elementosCortados', 'camadas', 'partes', 'paredes', 'paredesCortadas', 'faixas', 'regioes', 'poligonos', 'estritos', 'pela0049', 'paredesComVariante', 'externasDeNivelNaoAdjacente', 'lajesNaJuncao', 'pisosNaJuncao'] as const;
const soma = (a: Cobertura, b: Cobertura): void => {
  a.comparacoes += b.comparacoes;
  for (const k of SOMAS) a[k] += b[k];
  b.cortadoresPorTipo.forEach((v, i) => (a.cortadoresPorTipo[i] = (a.cortadoresPorTipo[i] ?? 0) + v));
  b.externasPorTipo.forEach((v, i) => (a.externasPorTipo[i] = (a.externasPorTipo[i] ?? 0) + v));
  for (const k of ['constante', 'laje', 'faixa'] as const) a.pecasPorSpan[k] += b.pecasPorSpan[k];
  a.maxSimetrica = Math.max(a.maxSimetrica, b.maxSimetrica);
  a.maxK = Math.max(a.maxK, b.maxK);
  a.desvioMaximo = Math.max(a.desvioMaximo, b.desvioMaximo);
  for (const k of ['n', 'acima1e4', 'acima1e3', 'resolvidos', 'fiapos'] as const) a.semPar[k] += b.semPar[k];
  a.semPar.max = Math.max(a.semPar.max, b.semPar.max);
};

/** Compara os pavimentos pedidos do projeto (todos, por padrão). */
function compararProjeto(p: Project, rotulo = p.name, niveis?: readonly string[], opcoes: { todas?: boolean } = {}): Cobertura {
  const { cena, a1, b, b3 } = cenaDe(p, opcoes);
  const cov = zero();
  cov.paredesComVariante = b3.comVariante;
  try {
    for (const l of p.levels) {
      if (niveis && !niveis.includes(l.id)) continue;
      const ref = referenciaB3(p, l.id, b, a1);
      const rust = decodificarB3(cena.consultar('junction_nivel', argumentosB3(p, l.id, b)));
      const cmp = compararB3(ref, rust, { k0049: K_B3_0049 });
      const nome = `${rotulo} ${l.id}`;
      if (cmp.maxSimetrica > maior.sim) Object.assign(maior, { sim: cmp.maxSimetrica, casoSim: nome });
      if (cmp.maxK > maior.k) Object.assign(maior, { k: cmp.maxK, casoK: nome });
      if (MEDIR) medidas.push(...cmp.divergencias.map((d) => `${nome}: ${d}`));
      else expect(cmp.divergencias, `${nome}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
      const c: Cobertura = { ...zero(), ...cmp, comparacoes: 1 };
      // cobertura própria: tipo de span e peças externas de nível não adjacente, por dono
      const nivelDe = donosPorNivel(p, a1, b);
      const adjacentes = new Set(adjacentes_(p, l.id));
      ref.cortadores.forEach((cort) =>
        cort.pecas.forEach((pc) => {
          if (pc.externa && pc.meta) {
            c.externasPorTipo[pc.meta.tipo] = (c.externasPorTipo[pc.meta.tipo] ?? 0) + 1;
            const dono = nivelDe.get(`${pc.meta.tipo}/${pc.meta.dono}`);
            if (dono !== undefined && !adjacentes.has(dono)) c.externasDeNivelNaoAdjacente++;
          }
          c.pecasPorSpan[tipoDeSpan(pc)]++;
        }),
      );
      for (const e of ref.elementos) if (e.tipo === 2) c.lajesNaJuncao++;
      else c.pisosNaJuncao++;
      soma(cov, c);
    }
  } finally {
    cena.destruir();
  }
  return cov;
}

const tipoDeSpan = (pc: PecaB3): 'constante' | 'laje' | 'faixa' => (pc.meta?.tipo === 0 ? 'faixa' : pc.plana ? 'constante' : 'laje');

/** Nível de cada elemento (chave `tipo/dono`), para saber de que nível vem uma peça externa. */
function donosPorNivel(p: Project, a1: ReturnType<typeof montarCenaA1>, b: ReturnType<typeof montarCenaB1>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [id, n] of a1.idDe) m.set(`0/${n}`, (p.elements[id] as { levelId: string }).levelId);
  for (const [id, n] of b.pisoDe) m.set(`1/${n}`, (p.elements[id] as { levelId: string }).levelId);
  for (const [id, n] of b.lajeDe) m.set(`2/${n}`, (p.elements[id] as { levelId: string }).levelId);
  return m;
}

/** Níveis imediatamente acima e abaixo de `levelId` (`adjacentLevelIds`), para contar as peças que vêm de níveis NÃO adjacentes. */
function adjacentes_(p: Project, levelId: string): string[] {
  const ord = [...p.levels].sort((x, y) => x.elevation - y.elevation);
  const i = ord.findIndex((l) => l.id === levelId);
  return [ord[i - 1]?.id, ord[i + 1]?.id].filter((x): x is string => x !== undefined);
}

const relata = (rotulo: string, c: Cobertura): void => {
  console.log(
    `[B3 ${rotulo}] ${c.comparacoes} comparações, cortadores ${c.cortadores} (parede/piso/laje ${c.cortadoresPorTipo.join('/')}), peças ${c.pecas} (externas ${c.pecasExternas}: parede/piso/laje ${c.externasPorTipo.join('/')}, de nível não adjacente ${c.externasDeNivelNaoAdjacente}; inclinadas ${c.pecasInclinadas}; membranas ${c.membranas}; span constante/laje/faixa ${c.pecasPorSpan.constante}/${c.pecasPorSpan.laje}/${c.pecasPorSpan.faixa}), elementos na junção ${c.elementos} (pisos ${c.pisosNaJuncao}, lajes ${c.lajesNaJuncao}; cortados ${c.elementosCortados}), camadas ${c.camadas}, paredes ${c.paredes} (cortadas ${c.paredesCortadas}; com variante da junção ${c.paredesComVariante}), faixas ${c.faixas}, partes ${c.partes}, regiões ${c.regioes}, polígonos ${c.poligonos} (estritos ${c.estritos}; só pela 0049: ${c.pela0049}), simétrica máx. ${c.maxSimetrica} m², K máx. ${c.maxK}, componentes sem par ${c.semPar.n} (maior ${c.semPar.max} m², acima de 1e-4: ${c.semPar.acima1e4}, acima de 1e-3: ${c.semPar.acima1e3}; resolvidos pela equivalência ${c.semPar.resolvidos}), fiapos ${c.semPar.fiapos}, desvio máx. de campos ${c.desvioMaximo}`,
  );
};

const totalEstresse = zero();

describe.skipIf(!bytes)('B3: junction_nivel do Rust x levelCutterSet e junctionLevel do motor TypeScript', () => {
  const pula = (): boolean => ger === null;

  // Uma semente por teste: cada `it` fica bem abaixo de 30 s.
  for (let semente = 1; semente <= SEMENTES; semente++) {
    it(`estresse, semente ${semente} (paredes com anexos atravessando pisos e lajes, portas, paralelas, diagonais e curva)`, () => {
      if (pula()) return;
      soma(totalEstresse, compararProjeto(projetoDeEstresseB1(semente, { paredesB2: true, anexos: true }), `semente ${semente}`));
    });
  }

  it(`estresse (agregado das sementes 1..${SEMENTES}): cobertura`, () => {
    if (pula()) return;
    const t = totalEstresse;
    relata('estresse', t);
    expect(t.cortadoresPorTipo[1], 'cortadores de piso').toBeGreaterThan(SEMENTES * 4);
    expect(t.cortadoresPorTipo[2], 'cortadores de laje').toBeGreaterThan(SEMENTES * 4);
    expect(t.pecasExternas, 'peças externas').toBeGreaterThan(SEMENTES * 5);
    expect(t.externasPorTipo[0], 'paredes externas').toBeGreaterThan(SEMENTES);
    expect(t.externasPorTipo[2], 'lajes externas').toBeGreaterThan(SEMENTES);
    expect(t.externasDeNivelNaoAdjacente, 'peças externas de níveis NÃO adjacentes').toBeGreaterThan(0);
    expect(t.pecasInclinadas, 'peças inclinadas (laje com caimento e faixa de parede com topo inclinado)').toBeGreaterThan(SEMENTES * 3);
    expect(t.pecasPorSpan.faixa, 'faixas de parede').toBeGreaterThan(SEMENTES * 20);
    expect(t.membranas, 'membranas (espessura zero, fora da junção)').toBeGreaterThan(0);
    expect(t.paredesCortadas, 'paredes recortadas pela junção').toBeGreaterThan(SEMENTES);
    expect(t.elementosCortados, 'pisos e lajes recortados pela junção').toBeGreaterThan(SEMENTES);
    expect(t.regioes, 'regiões de elementos cortados').toBeGreaterThan(SEMENTES);
    expect(t.paredesComVariante, 'paredes com cota ou perfil diferente da variante da junção').toBeGreaterThan(SEMENTES * 5);
    expect(t.desvioMaximo, 'desvio de campos escalares').toBeLessThanOrEqual(1e-6);
  }, 120_000);

  it('a cena com a variante da junção em TODAS as paredes dá o mesmo resultado que só nas que diferem', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(3, { paredesB2: true, anexos: true, pavimentos: 3, semParedes: false });
    const { cena, a1, b } = cenaDe(p);
    const todas = cenaDe(p, { todas: true });
    try {
      for (const l of p.levels) {
        const args = argumentosB3(p, l.id, b);
        expect(decodificarB3(todas.cena.consultar('junction_nivel', args))).toEqual(decodificarB3(cena.consultar('junction_nivel', args)));
        expect(compararB3(referenciaB3(p, l.id, b, a1), decodificarB3(cena.consultar('junction_nivel', args)), { k0049: K_B3_0049 }).divergencias).toEqual([]);
      }
      expect(todas.b3.comVariante).toBeGreaterThan(cenaDe(p).b3.comVariante);
    } finally {
      cena.destruir();
      todas.cena.destruir();
    }
  }, 120_000);

  it('sintéticos de 10 e 20 pavimentos: um pavimento por comparação (primeiro, intermediários e último)', () => {
    if (pula()) return;
    for (const n of [10, 20]) {
      const p = syntheticProject(n);
      const escolhidos = p.levels.map((l) => l.id).filter((_, i) => i === 0 || i === n - 1 || i % 4 === 1);
      const cov = compararProjeto(p, `sintético ${n}`, escolhidos);
      expect(cov.comparacoes).toBe(escolhidos.length);
      expect(cov.elementos).toBeGreaterThanOrEqual(escolhidos.length);
      expect(cov.paredes).toBeGreaterThanOrEqual(escolhidos.length);
      relata(`sintético ${n}`, cov);
    }
  }, 240_000);

  it('fixture do repositório (casa de 2 quartos) com um piso e uma laje vinculados a cada ambiente', () => {
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
    }
    store.exec({ type: 'batch', commands: cmds });
    const cov = compararProjeto(store.project, 'casa de 2 quartos');
    relata('casa de 2 quartos', cov);
    expect(cov.pisosNaJuncao + cov.lajesNaJuncao).toBeGreaterThan(3);
    expect(cov.paredes).toBeGreaterThan(3);
  }, 120_000);

  it('níveis não adjacentes: parede de dois pavimentos de altura atravessa a laje do segundo pavimento acima (peça externa de nível não adjacente)', () => {
    if (pula()) return;
    let externas = 0;
    let cortadas = 0;
    for (let semente = 41; semente <= 43; semente++) {
      const p = projetoDeEstresseB1(semente, { paredesB2: true, anexos: true, pavimentos: 4, semParedes: false });
      const cov = compararProjeto(p, `semente ${semente}`, [p.levels[0]!.id, p.levels[1]!.id]);
      externas += cov.externasDeNivelNaoAdjacente;
      cortadas += cov.paredesCortadas;
    }
    expect(externas, 'peças externas de níveis não adjacentes').toBeGreaterThan(0);
    expect(cortadas, 'paredes recortadas').toBeGreaterThan(0);
  }, 240_000);

  it('propriedades do Rust: partes sem sobreposição e volume conservado (original menos o cortado, recalculado com as primitivas do motor)', () => {
    if (pula()) return;
    let camadas = 0;
    let recortadas = 0;
    for (let semente = 31; semente <= 33; semente++) {
      const p = projetoDeEstresseB1(semente, { paredesB2: true, anexos: true, pavimentos: 3, semParedes: false });
      const { cena, b } = cenaDe(p);
      try {
        for (const l of p.levels) {
          const j: JuncaoB3 = decodificarB3(cena.consultar('junction_nivel', argumentosB3(p, l.id, b)));
          const pecas = j.cortadores.flatMap((c) => c.pecas).filter((pc) => pc.meta);
          const planas = pecas.map((pc) => ({ pc, z: pc.faixa! })).filter((x) => x.z && (x.pc.meta!.tipo !== 2 || x.pc.plana) && x.z[1] - x.z[0] > 1e-9);
          const camadaDe = (tipo: number, dono: number, camada: number, banda: number | null) => planas.find(({ pc }) => pc.meta!.tipo === tipo && pc.meta!.dono === dono && pc.meta!.camada === camada && (pc.meta!.banda ?? null) === banda && !pc.externa);
          const confere = (tipo: number, dono: number, camada: number, banda: number | null, partes: JuncaoB3['elementos'][number]['camadas'][number]['partes']): void => {
            const origem = camadaDe(tipo, dono, camada, banda);
            if (!origem) return;
            camadas++;
            const original = areaDaForma(origem.pc.poligono) * (origem.z[1] - origem.z[0]);
            // partes: faixas de cota crescentes, sem sobreposição de cota; em cada faixa a região cabe na original
            let volumeDasPartes = 0;
            partes.forEach((x, i) => {
              if (i > 0) expect(x.z0, `partes da camada ${tipo}/${dono}/${camada}: cotas fora de ordem`).toBeGreaterThanOrEqual(partes[i - 1]!.z1 - 1e-9);
              const dentro = x.poligono.length && origem.pc.poligono.length ? areaDaForma(intersection(x.poligono, origem.pc.poligono)) : 0;
              expect(areaDaForma(x.poligono) - dentro, `parte ${i} da camada ${tipo}/${dono}/${camada} fora da original`).toBeLessThanOrEqual(1e-6);
              volumeDasPartes += areaDaForma(x.poligono) * (x.z1 - x.z0);
            });
            // volume cortado: para cada faixa de cota, a interseção da camada com as peças que a vencem (primitivas do motor: winsOver, intersection)
            let cortado = 0;
            const vencedoras = planas.filter(({ pc }) => {
              if (pc === origem.pc) return false;
              if (pc.externa || origem.pc.externa) {
                if (!(pc.externa !== origem.pc.externa && (pc.meta!.tipo === 0) !== (origem.pc.meta!.tipo === 0))) return false;
              } else if ((pc.meta!.tipo === origem.pc.meta!.tipo && pc.meta!.dono === origem.pc.meta!.dono) || (pc.meta!.tipo === 0 && origem.pc.meta!.tipo === 0)) return false;
              const m = (q: PecaB3) => ({ kind: (['wall', 'floor', 'slab'] as const)[q.meta!.tipo]!, priority: q.meta!.prioridade, core: q.meta!.nucleo, ...(q.meta!.explicita ? { explicit: true } : {}) });
              return winsOver(m(pc), m(origem.pc)) === true;
            });
            const cotas = [...new Set([origem.z[0], origem.z[1], ...vencedoras.flatMap((w) => [w.z[0], w.z[1]])].filter((z) => z >= origem.z[0] && z <= origem.z[1]))].sort((u, v) => u - v);
            for (let k = 0; k + 1 < cotas.length; k++) {
              const meio = (cotas[k]! + cotas[k + 1]!) / 2;
              const ativas = vencedoras.filter((w) => w.z[0] < meio && w.z[1] > meio).map((w) => w.pc.poligono);
              if (cotas[k + 1]! - cotas[k]! <= 1e-6 || ativas.length === 0) continue;
              // área da interseção com a UNIÃO das ativas: interseção de cada ativa com a original, unida por canonicalização
              const partesComuns: MultiPolygon[] = ativas.map((q) => (q.length && origem.pc.poligono.length ? intersection(origem.pc.poligono, q) : []));
              const unida = partesComuns.flat().length ? areaDaForma(unirTudo(partesComuns)) : 0;
              cortado += unida * (cotas[k + 1]! - cotas[k]!);
            }
            if (cortado > 1e-9) recortadas++;
            expect(Math.abs(original - cortado - volumeDasPartes), `camada ${tipo}/${dono}/${camada}/${banda}: ${original} - ${cortado} != ${volumeDasPartes}`).toBeLessThanOrEqual(1e-5);
          };
          for (const e of j.elementos) e.camadas.forEach((c) => confere(e.tipo, e.dono, c.camada, null, c.partes));
          for (const w of j.paredes) w.faixas.forEach((f) => confere(0, w.parede, f.camada, f.banda, f.partes));
        }
      } finally {
        cena.destruir();
      }
    }
    expect(camadas, 'camadas conferidas').toBeGreaterThan(200);
    expect(recortadas, 'camadas com volume cortado').toBeGreaterThan(20);
  }, 240_000);

  it('upsert e remoção seguem o projeto: remover as paredes do nível, a variante da junção e a seção niveis mudam o resultado, e devolvê-las o restaura', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(5, { paredesB2: true, anexos: true, pavimentos: 2, semParedes: false });
    const { cena, a1, b, b3 } = cenaDe(p);
    try {
      const args = argumentosB3(p, p.levels[0]!.id, b);
      const antes = decodificarB3(cena.consultar('junction_nivel', args));
      expect(decodificarB3(cena.consultar('junction_nivel', args))).toEqual(antes);
      // remover a variante da junção: as paredes voltam à cota do término por camada (a consulta muda)
      expect(b3.comVariante).toBeGreaterThan(0);
      cena.remover('paredes_z_juncao', b3.secoes.paredes_z_juncao['id_num']!);
      cena.remover('perfis_z_juncao', b3.secoes.perfis_z_juncao['id_num']!);
      const semVariante = decodificarB3(cena.consultar('junction_nivel', args));
      expect(semVariante).not.toEqual(antes);
      cena.upsert('paredes_z_juncao', b3.secoes.paredes_z_juncao, b3.nLinhas.paredes_z_juncao);
      cena.upsert('perfis_z_juncao', b3.secoes.perfis_z_juncao, b3.nLinhas.perfis_z_juncao);
      expect(decodificarB3(cena.consultar('junction_nivel', args))).toEqual(antes);
      // remover as paredes do nível 0 (as quatro seções da fatia A que o nível usa)
      const ids = a1.secoes.paredes['id_num']!.filter((_, i) => a1.secoes.paredes['nivel_num']![i] === 0);
      expect(ids.length).toBeGreaterThan(10);
      cena.remover('paredes', ids);
      cena.remover('paredes_quadro', ids);
      cena.remover('paredes_z', ids);
      cena.remover('paredes_z_juncao', ids);
      const sem = decodificarB3(cena.consultar('junction_nivel', args));
      expect(sem.paredes.length).toBeLessThan(antes.paredes.length);
      cena.upsert('paredes', a1.secoes.paredes, a1.nLinhas.paredes);
      cena.upsert('paredes_quadro', a1.secoes.paredes_quadro, a1.nLinhas.paredes_quadro);
      cena.upsert('paredes_z', a1.secoes.paredes_z, a1.nLinhas.paredes_z);
      cena.upsert('paredes_z_juncao', b3.secoes.paredes_z_juncao, b3.nLinhas.paredes_z_juncao);
      expect(decodificarB3(cena.consultar('junction_nivel', args))).toEqual(antes);
      // sem a seção niveis o nível fica sozinho: nenhuma peça externa
      cena.remover('niveis', b.secoes.niveis['id_num']!);
      const sozinho = decodificarB3(cena.consultar('junction_nivel', args));
      expect(sozinho.cortadores.flatMap((c) => c.pecas).some((pc) => pc.externa)).toBe(false);
      expect(antes.cortadores.flatMap((c) => c.pecas).some((pc) => pc.externa)).toBe(true);
      cena.upsert('niveis', b.secoes.niveis, b.nLinhas.niveis);
      expect(decodificarB3(cena.consultar('junction_nivel', args))).toEqual(antes);
    } finally {
      cena.destruir();
    }
  }, 120_000);

  it('entradas inválidas viram falha leve, nunca panic', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(3, { paredesB2: true, anexos: true, pavimentos: 1, semParedes: false });
    const { cena } = cenaDe(p);
    try {
      expect(() => cena.consultar('junction_nivel', [0xffffffff, 0.02])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('junction_nivel', [0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('junction_nivel', [0, 0.02, 1])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('junction_nivel', [0.5, 0.02])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('junction_nivel', [0, -0.01])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('junction_nivel', [0, Number.NaN])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('junction_nivel', [0, 0.02])).not.toThrow();
      // seções da variante inválidas: cota não finita, lista fora do domínio, chave duplicada ou reservada
      const z = { id_num: [900001], z0: [0], altura: [2.8] };
      expect(() => cena.upsert('paredes_z_juncao', { ...z, z0: [Number.NaN] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('paredes_z_juncao', { ...z, altura: [Number.POSITIVE_INFINITY] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('paredes_z_juncao', { id_num: [900001, 900001], z0: [0, 0], altura: [1, 1] }, 2)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('paredes_z_juncao', { ...z, id_num: [0xffffffff] }, 1)).toThrow(ErroKernelLeve);
      const pf = { id_num: [900001], parede_num: [1], lista: [0], indice: [0], t: [0], h: [1] };
      expect(() => cena.upsert('perfis_z_juncao', { ...pf, lista: [3] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('perfis_z_juncao', { ...pf, t: [Number.NaN] }, 1)).toThrow(ErroKernelLeve);
      // perfil com lacuna de índice numa parede com variante: a consulta recusa (nunca panic)
      cena.upsert('paredes_z_juncao', { id_num: [1], z0: [0], altura: [2.8] }, 1);
      cena.upsert('perfis_z_juncao', { ...pf, indice: [2] }, 1);
      expect(() => cena.consultar('junction_nivel', [0, 0.02])).toThrow(ErroKernelLeve);
      cena.remover('perfis_z_juncao', [900001]);
      // parede sem `paredes_z`: a cena fica incompleta e a consulta recusa
      cena.remover('paredes_z_juncao', [1]);
      cena.remover('paredes_z', [1]);
      expect(() => cena.consultar('junction_nivel', [0, 0.02])).toThrow(ErroKernelLeve);
    } finally {
      cena.destruir();
    }
  });

  it('sem vazamento de memória depois de destruir a cena', () => {
    if (pula()) return;
    const antes = ger!.instancia().exports.memoria_usada();
    for (let i = 0; i < 3; i++) {
      const p = projetoDeEstresseB1(11, { pavimentos: 2, paredesB2: true, anexos: true });
      const { cena, b } = cenaDe(p);
      try {
        for (const l of p.levels) expect(decodificarB3(cena.consultar('junction_nivel', argumentosB3(p, l.id, b))).cortadores.length).toBeGreaterThan(0);
      } finally {
        cena.destruir();
      }
    }
    expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
  }, 60_000);
});

/** União por canonicalização de várias regiões (o motor: `union` do polygon-clipping). */
function unirTudo(regioes: MultiPolygon[]): MultiPolygon {
  const polis = regioes.flat();
  return polis.length ? union(...polis.map((q) => [q])) : [];
}
