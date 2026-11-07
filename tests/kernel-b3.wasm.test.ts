/**
 * Equivalência da sub-etapa B3 (decisão 0050 §3): `junction_nivel` do Rust x `levelCutterSet` e `junctionLevel` do motor TypeScript (`referenciaB3`).
 * Roda só em `npm run test:wasm`. Identidade, ordem, ids, marcas e campos escalares a 1e-6; polígonos por canonicalização e diferença simétrica
 * sob 1e-6 m² e, quando a medição pede, a 0049 (K medido e registrado em 0050, "B3 entregue"). A junção lê as paredes de TODOS os níveis (cortadores
 * externos), então cada comparação resolve o prédio inteiro nos dois lados.
 */
import { existsSync, readFileSync } from 'node:fs';
import { boxOf, boxesOverlap, difference, intersection, multiPoints } from '@hestia/geom';
import { ProjectStore, makeFloor, makeSlab, migrateProject, type Command, type Project } from '@hestia/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enclosedRooms, roomAt } from '../packages/engine/src/enclosed.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { winsOver, zOverlaps } from '../packages/engine/src/junctionPlanar.ts';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaA3 } from '../packages/engine/src/kernelA3.ts';
import { montarPerfisA3d } from '../packages/engine/src/kernelA3d.ts';
import { montarCenaB1 } from '../packages/engine/src/kernelB.ts';
import { argumentosB3, decodificarB3, montarCenaB3, montarFaixasB3, referenciaB3, type JuncaoB3, type PecaB3 } from '../packages/engine/src/kernelB3.ts';
import { areaDaForma } from '../packages/engine/src/kernelComparaA2.ts';
import { perimetroDaForma } from '../packages/engine/src/kernelComparaA3c.ts';
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
const K_B3_0049 = Number(process.env['B3_K'] ?? 0.14);
const SEMENTES = Number(process.env['B3_SEMENTES'] ?? 5);

/** Modo de MEDIÇÃO (B3_MEDIR=1): junta todas as divergências e imprime o resumo no fim. */
const MEDIR = process.env['B3_MEDIR'] === '1';
const medidas: string[] = [];
/**
 * Lista de casos com DEFEITO CONHECIDO da junção: VAZIA desde a saída 3 da 0050 (as faixas de parede vêm do TypeScript, e o Rust só recorta). O mecanismo
 * `it.fails` fica para o próximo defeito. Histórico (0050, "B3 encerrada sem a junção"): em parede com faixas inclinadas cruzada por piso ou laje o Rust
 * deixa de recortar faixas que o TypeScript recorta (de 0,04 a 0,65 m² na camada de parede). A partição vertical do TS depende da ordem textual dos anéis do
 * `polygon-clipping`, que o `i_overlay` não reproduz; três correções locais no Rust foram tentadas e cada uma consertou um caso e quebrou outros.
 * `it.fails` EXIGE que o caso continue reprovando: se um deles passar o teste reprova e esta lista deve ser atualizada (o defeito foi corrigido). Nada foi
 * afrouxado: o comparador segue bloqueante e a junção NÃO é despachada ao Rust. Em modo de medição (B3_MEDIR=1) o comparador não lança e a lista não vale.
 * Chaves: `estresse:<semente>:<pavimento>` e `naoAdjacente:<semente>:<pavimento>`.
 */
const DEFEITO_CONHECIDO = new Set<string>(); // vazia desde a saída 3 da 0050 (faixas de parede vindas do TypeScript): nenhum caso falha por defeito conhecido.
const itB3 = (chave: string) => (!MEDIR && DEFEITO_CONHECIDO.has(chave) ? it.fails : it);
const maior = { sim: 0, k: 0, casoSim: '', casoK: '' };
const memo = new Map<string, { p: Project; cena: CenaV2; a1: ReturnType<typeof montarCenaA1>; b: ReturnType<typeof montarCenaB1>; b3: ReturnType<typeof montarCenaB3> }>();
afterAll(() => {
  for (const m of memo.values()) m.cena.destruir();
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
      faixas_juncao: { colunas: b3.secoes.faixas_juncao, n: b3.nLinhas.faixas_juncao },
      pontos_faixas_juncao: { colunas: b3.secoes.pontos_faixas_juncao, n: b3.nLinhas.pontos_faixas_juncao },
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
  // A cena (e a referência de cada projeto) é reaproveitada entre os `it` de um mesmo projeto: um pavimento por teste fica abaixo de 30 s.
  let m = memo.get(rotulo);
  if (!m) memo.set(rotulo, (m = { p, ...cenaDe(p, opcoes) }));
  const { cena, a1, b, b3 } = m;
  const cov = zero();
  cov.paredesComVariante = b3.comVariante;
  {
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

  // Uma semente por teste: cada `it` fica bem abaixo de 30 s. A cena de uma semente é destruída no fim dos testes dela (o pavimento 0
  // inclui montar o projeto e a cena, cerca de 15 s sem carga), e não no fim do arquivo, para a varredura de 40 sementes não acumular cenas.
  for (let semente = 1; semente <= SEMENTES; semente++) {
    describe(`estresse semente ${semente}`, () => {
      const rotulo = `semente ${semente}`;
      afterAll(() => {
        const m = memo.get(rotulo);
        if (m) {
          m.cena.destruir();
          memo.delete(rotulo);
        }
      });
      for (let nivel = 0; nivel < 4; nivel++) {
        itB3(`estresse:${semente}:${nivel}`)(`estresse, semente ${semente}, pavimento ${nivel} (paredes com anexos atravessando pisos e lajes, portas, paralelas, diagonais e curva)`, () => {
          if (pula()) return;
          const p = memo.get(rotulo)?.p ?? projetoDeEstresseB1(semente, { paredesB2: true, anexos: true });
          soma(totalEstresse, compararProjeto(p, rotulo, [p.levels[nivel]!.id]));
        }, 90_000);
      }
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

  // As duas cenas (variante só nas paredes que diferem x em todas) são montadas uma vez para os três níveis ficarem em testes separados.
  let variante: { p: Project; base: ReturnType<typeof cenaDe>; todas: ReturnType<typeof cenaDe> } | null = null;
  const cenasVariante = () => {
    if (!variante) {
      const p = projetoDeEstresseB1(3, { paredesB2: true, anexos: true, pavimentos: 3, semParedes: false });
      variante = { p, base: cenaDe(p), todas: cenaDe(p, { todas: true }) };
    }
    return variante;
  };
  afterAll(() => {
    if (!variante) return;
    variante.base.cena.destruir();
    variante.todas.cena.destruir();
    variante = null;
  });
  for (let nivel = 0; nivel < 3; nivel++) {
    it(`a variante da junção em TODAS as paredes dá o mesmo resultado que só nas que diferem, pavimento ${nivel}`, () => {
      if (pula()) return;
      const { p, base, todas } = cenasVariante();
      const l = p.levels[nivel]!;
      const args = argumentosB3(p, l.id, base.b);
      const rust = decodificarB3(base.cena.consultar('junction_nivel', args));
      expect(comparavelB3(decodificarB3(todas.cena.consultar('junction_nivel', args)))).toEqual(comparavelB3(rust));
      expect(compararB3(referenciaB3(p, l.id, base.b, base.a1), rust, { k0049: K_B3_0049 }).divergencias).toEqual([]);
      if (nivel === 0) expect(todas.b3.comVariante).toBeGreaterThan(base.b3.comVariante);
    }, 90_000);
  }

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

  // Um `it` por semente e pavimento (a cena de cada semente fica em cache e é destruída no fim dela): cada um fica abaixo de 30 s.
  const naoAdjacentes = { externas: 0, cortadas: 0 };
  for (let semente = 41; semente <= 43; semente++) {
    describe(`níveis não adjacentes, semente ${semente}`, () => {
      const rotulo = `semente ${semente}`;
      afterAll(() => {
        const m = memo.get(rotulo);
        if (m) {
          m.cena.destruir();
          memo.delete(rotulo);
        }
      });
      for (const indice of [0, 1]) {
        itB3(`naoAdjacente:${semente}:${indice}`)(`parede de dois pavimentos de altura atravessa a laje do segundo pavimento acima, pavimento ${indice}`, () => {
          if (pula()) return;
          const p = memo.get(rotulo)?.p ?? projetoDeEstresseB1(semente, { paredesB2: true, anexos: true, pavimentos: 4, semParedes: false });
          const cov = compararProjeto(p, rotulo, [p.levels[indice]!.id]);
          naoAdjacentes.externas += cov.externasDeNivelNaoAdjacente;
          naoAdjacentes.cortadas += cov.paredesCortadas;
        }, 90_000);
      }
    });
  }
  it('níveis não adjacentes: agregado (peças externas de nível não adjacente e paredes recortadas)', () => {
    if (pula()) return;
    expect(naoAdjacentes.externas, 'peças externas de níveis não adjacentes').toBeGreaterThan(0);
    expect(naoAdjacentes.cortadas, 'paredes recortadas').toBeGreaterThan(0);
  });

  // Uma semente por teste (cada uma monta e destrói a própria cena), abaixo de 30 s; o agregado confere a cobertura das três.
  const propriedades = { camadas: 0, recortadas: 0 };
  for (const semente of [31, 32, 33]) {
    it(`propriedades do Rust, semente ${semente}: partes sem sobreposição e volume conservado (original menos o cortado, recalculado com as primitivas do motor)`, () => {
      if (pula()) return;
      let camadas = 0;
      let recortadas = 0;
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
            // Limite de contenção (ADR 0049, "Contenção de partes após arredondamento à grade"): as coordenadas das partes são arredondadas
            // à grade EPS_Z = 1e-6 m, então cada coordenada da borda pode sair da original por até EPS_Z / 2 (meio micrômetro). Pela borda,
            // o excesso de área fora da original é no máximo perímetro x EPS_Z / 2, somado à tolerância base de 1e-6 m².
            const EPS_Z_CONTENCAO = 1e-6;
            const limiteForaDaOriginal = 1e-6 + perimetroDaForma(origem.pc.poligono) * EPS_Z_CONTENCAO / 2;
            // partes: faixas de cota crescentes, sem sobreposição de cota; em cada faixa a região cabe na original
            let volumeDasPartes = 0;
            partes.forEach((x, i) => {
              if (i > 0) expect(x.z0, `partes da camada ${tipo}/${dono}/${camada}: cotas fora de ordem`).toBeGreaterThanOrEqual(partes[i - 1]!.z1 - 1e-9);
              const dentro = x.poligono.length && origem.pc.poligono.length ? areaDaForma(intersection(x.poligono, origem.pc.poligono)) : 0;
              expect(areaDaForma(x.poligono) - dentro, `parte ${i} da camada ${tipo}/${dono}/${camada} fora da original`).toBeLessThanOrEqual(limiteForaDaOriginal);
              volumeDasPartes += areaDaForma(x.poligono) * (x.z1 - x.z0);
            });
            // volume esperado: para cada faixa de cota que a junção mantém (`resolveJunction` descarta faixas de até Z_EPS = 1e-6, então a soma das
            // faixas é o que a camada conserva), a camada MENOS as peças que a vencem (`winsOver` e `difference`, as primitivas do motor).
            let esperado = 0;
            // A recomputação usa as booleanas do motor sobre os polígonos do Rust; quando a faixa tem vencedoras, o erro de arredondamento
            // (i_overlay x polygon-clipping) é o da 0049: limite por perímetro x largura da faixa, com o K medido e registrado em 0050.
            let limiteVolume = 0;
            const areaOriginal = areaDaForma(origem.pc.poligono);
            const perimetro = perimetroDaForma(origem.pc.poligono);
            let cortou = false;
            const caixaOrigem = origem.pc.poligono.length ? boxOf(multiPoints(origem.pc.poligono)) : null;
            const vencedoras = planas.filter(({ pc, z }) => {
              if (pc === origem.pc || !caixaOrigem || !pc.poligono.length) return false;
              // como `resolveJunction`: só entra quem cruza de verdade a caixa em planta e a faixa de cota (Z_EPS = 1e-6)
              if (!boxesOverlap(caixaOrigem, boxOf(multiPoints(pc.poligono))) || !zOverlaps({ z0: origem.z[0], z1: origem.z[1] }, { z0: z[0], z1: z[1] })) return false;
              if (pc.externa || origem.pc.externa) {
                if (!(pc.externa !== origem.pc.externa && (pc.meta!.tipo === 0) !== (origem.pc.meta!.tipo === 0))) return false;
              } else if ((pc.meta!.tipo === origem.pc.meta!.tipo && pc.meta!.dono === origem.pc.meta!.dono) || (pc.meta!.tipo === 0 && origem.pc.meta!.tipo === 0)) return false;
              const m = (q: PecaB3) => ({ kind: (['wall', 'floor', 'slab'] as const)[q.meta!.tipo]!, priority: q.meta!.prioridade, core: q.meta!.nucleo, ...(q.meta!.explicita ? { explicit: true } : {}) });
              return winsOver(m(pc), m(origem.pc)) === true;
            });
            // As alturas de corte das vencedoras vão à grade EPS_Z (1e-6) e são presas ao intervalo bruto da origem, como `resolveJunction` (junctionPlanar.ts,
            // `grade`); os extremos da origem seguem brutos. Z_EPS é o mesmo valor de junctionPlanar.ts (não é a tolerância de comparação, que segue 1e-6).
            const Z_EPS = 1e-6;
            const grade = (z: number): number => Math.min(origem.z[1], Math.max(origem.z[0], Math.round(z / Z_EPS) * Z_EPS));
            const cotas = [...new Set([origem.z[0], origem.z[1], ...vencedoras.flatMap((w) => [grade(w.z[0]), grade(w.z[1])])].filter((z) => z >= origem.z[0] && z <= origem.z[1]))].sort((u, v) => u - v);
            for (let k = 0; k + 1 < cotas.length; k++) {
              const dz = cotas[k + 1]! - cotas[k]!;
              if (dz <= 1e-6) continue;
              const meio = (cotas[k]! + cotas[k + 1]!) / 2;
              const ativas = vencedoras.filter((w) => w.z[0] < meio && w.z[1] > meio).map((w) => w.pc.poligono);
              const restante = ativas.length === 0 || !origem.pc.poligono.length ? origem.pc.poligono : difference(origem.pc.poligono, ...ativas);
              const areaRestante = areaDaForma(restante);
              if (areaRestante < areaOriginal - 1e-9) cortou = true;
              esperado += areaRestante * dz;
              if (ativas.length > 0) limiteVolume += (1e-5 + K_B3_0049 * perimetro * 1e-6) * dz;
            }
            if (cortou) recortadas++;
            expect(Math.abs(esperado - volumeDasPartes), `camada ${tipo}/${dono}/${camada}/${banda}: volume conservado ${esperado} (original ${original}) != partes ${volumeDasPartes}`).toBeLessThanOrEqual(Math.max(1e-6, limiteVolume));
          };
          for (const e of j.elementos) e.camadas.forEach((c) => confere(e.tipo, e.dono, c.camada, null, c.partes));
          for (const w of j.paredes) w.faixas.forEach((f) => confere(0, w.parede, f.camada, f.banda, f.partes));
        }
      } finally {
        cena.destruir();
      }
      expect(camadas, 'camadas conferidas').toBeGreaterThan(60);
      propriedades.camadas += camadas;
      propriedades.recortadas += recortadas;
    }, 90_000);
  }
  it('propriedades do Rust: agregado (camadas conferidas e camadas com volume cortado)', () => {
    if (pula()) return;
    expect(propriedades.camadas, 'camadas conferidas').toBeGreaterThan(200);
    expect(propriedades.recortadas, 'camadas com volume cortado').toBeGreaterThan(20);
  });

  it('upsert e remoção seguem o projeto: remover as paredes do nível, a variante da junção e a seção niveis mudam o resultado, e devolvê-las o restaura', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(5, { paredesB2: true, anexos: true, pavimentos: 2, semParedes: false });
    const { cena, a1, b, b3 } = cenaDe(p);
    try {
      const args = argumentosB3(p, p.levels[0]!.id, b);
      // (v11) com faixas_juncao a junção usa as faixas do TypeScript; as asserções antigas valem no caminho anterior, então a cena começa SEM a seção.
      // (o adaptador de produção não manda as faixas; aqui o oráculo TS as manda só para exercitar o mecanismo)
      const fx = montarFaixasB3(p, a1);
      cena.upsert('faixas_juncao', fx.faixas, fx.nLinhas.faixas);
      cena.upsert('pontos_faixas_juncao', fx.pontos, fx.nLinhas.pontos);
      const comFaixas = decodificarB3(cena.consultar('junction_nivel', args));
      cena.remover('faixas_juncao', fx.faixas['id_num']!);
      cena.remover('pontos_faixas_juncao', fx.pontos['id_num']!);
      const antes = decodificarB3(cena.consultar('junction_nivel', args));
      expect(comparavelB3(decodificarB3(cena.consultar('junction_nivel', args)))).toEqual(comparavelB3(antes));
      // remover a variante da junção: as paredes voltam à cota do término por camada (a consulta muda)
      expect(b3.comVariante).toBeGreaterThan(0);
      cena.remover('paredes_z_juncao', b3.secoes.paredes_z_juncao['id_num']!);
      cena.remover('perfis_z_juncao', b3.secoes.perfis_z_juncao['id_num']!);
      const semVariante = decodificarB3(cena.consultar('junction_nivel', args));
      expect(comparavelB3(semVariante)).not.toEqual(comparavelB3(antes));
      cena.upsert('paredes_z_juncao', b3.secoes.paredes_z_juncao, b3.nLinhas.paredes_z_juncao);
      cena.upsert('perfis_z_juncao', b3.secoes.perfis_z_juncao, b3.nLinhas.perfis_z_juncao);
      expect(comparavelB3(decodificarB3(cena.consultar('junction_nivel', args)))).toEqual(comparavelB3(antes));
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
      expect(comparavelB3(decodificarB3(cena.consultar('junction_nivel', args)))).toEqual(comparavelB3(antes));
      // sem a seção niveis o nível fica sozinho: nenhuma peça externa
      cena.remover('niveis', b.secoes.niveis['id_num']!);
      const sozinho = decodificarB3(cena.consultar('junction_nivel', args));
      expect(sozinho.cortadores.flatMap((c) => c.pecas).some((pc) => pc.externa)).toBe(false);
      expect(antes.cortadores.flatMap((c) => c.pecas).some((pc) => pc.externa)).toBe(true);
      cena.upsert('niveis', b.secoes.niveis, b.nLinhas.niveis);
      expect(comparavelB3(decodificarB3(cena.consultar('junction_nivel', args)))).toEqual(comparavelB3(antes));
      // (v11) o mecanismo novo: de volta com as faixas do TypeScript, a consulta é a de antes da remoção
      cena.upsert('faixas_juncao', fx.faixas, fx.nLinhas.faixas);
      cena.upsert('pontos_faixas_juncao', fx.pontos, fx.nLinhas.pontos);
      expect(comparavelB3(decodificarB3(cena.consultar('junction_nivel', args)))).toEqual(comparavelB3(comFaixas));
    } finally {
      cena.destruir();
    }
  }, 120_000);

  it('entradas inválidas viram falha leve, nunca panic', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(3, { paredesB2: true, anexos: true, pavimentos: 1, semParedes: false });
    const { cena, b3 } = cenaDe(p);
    try {
      // (v11) as asserções de variante valem no caminho anterior: a cena começa sem faixas_juncao (as inválidas da seção nova estão no teste seguinte)
      cena.remover('faixas_juncao', b3.secoes.faixas_juncao['id_num']!);
      cena.remover('pontos_faixas_juncao', b3.secoes.pontos_faixas_juncao['id_num']!);
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

  it('faixas_juncao e pontos_faixas_juncao inconsistentes viram falha leve na consulta (nunca panic) e a remoção devolve a cena', () => {
    if (pula()) return;
    const p = projetoDeEstresseB1(3, { paredesB2: true, anexos: true, pavimentos: 1, semParedes: false });
    const { cena, a1 } = cenaDe(p);
    try {
      const args = [0, 0.02];
      const parede = [...a1.idDe.values()][0]!;
      expect(() => cena.consultar('junction_nivel', args)).not.toThrow();
      const faixa = (id: number, z0 = 0, z1 = 2.8, par = parede) => ({
        id_num: [id], nivel_num: [0], parede_num: [par], camada: [0], banda: [0], prioridade: [1], nucleo: [1], base_z: [0], z0: [z0], z1: [z1],
        inclinada: [0], o_x: [0], o_y: [0], d_x: [0], d_y: [0], t0: [0], t1: [0], h0: [0], h1: [0],
      });
      const vertices = (faixaNum: number, ids: number[], indices: number[], poligono = 0, anel = 0) => ({
        id_num: ids, faixa_num: ids.map(() => faixaNum), poligono: ids.map(() => poligono), anel: ids.map(() => anel), indice: indices,
        x: indices.map((i) => i * 0.1), y: indices.map((i) => i * 0.1),
      });
      const quadrado = (faixaNum: number, ids: number[], poligono = 0, anel = 0) => vertices(faixaNum, ids, [0, 1, 2, 3], poligono, anel);
      const naoSobe = (fn: () => unknown) => expect(fn).toThrow(ErroKernelLeve);
      // parede que não existe na cena
      cena.upsert('faixas_juncao', faixa(900001, 0, 2.8, 999999), 1);
      naoSobe(() => cena.consultar('junction_nivel', args));
      cena.remover('faixas_juncao', [900001]);
      // lacuna de índice (índice 1 falta)
      cena.upsert('faixas_juncao', faixa(900002), 1);
      cena.upsert('pontos_faixas_juncao', vertices(900002, [900101, 900102, 900103], [0, 2, 3]), 3);
      naoSobe(() => cena.consultar('junction_nivel', args));
      cena.remover('pontos_faixas_juncao', [900101, 900102, 900103]);
      // índice repetido
      cena.upsert('pontos_faixas_juncao', vertices(900002, [900101, 900102, 900103], [0, 1, 1]), 3);
      naoSobe(() => cena.consultar('junction_nivel', args));
      cena.remover('pontos_faixas_juncao', [900101, 900102, 900103]);
      // lacuna de anel (falta o anel 0; só há o anel 1)
      cena.upsert('pontos_faixas_juncao', quadrado(900002, [900101, 900102, 900103, 900104], 0, 1), 4);
      naoSobe(() => cena.consultar('junction_nivel', args));
      cena.remover('pontos_faixas_juncao', [900101, 900102, 900103, 900104]);
      // lacuna de polígono (há o polígono 1, falta o 0)
      cena.upsert('pontos_faixas_juncao', quadrado(900002, [900101, 900102, 900103, 900104], 1, 0), 4);
      naoSobe(() => cena.consultar('junction_nivel', args));
      cena.remover('pontos_faixas_juncao', [900101, 900102, 900103, 900104]);
      // vértices de uma faixa que não existe em faixas_juncao (faixa órfã)
      cena.upsert('pontos_faixas_juncao', quadrado(900777, [900111, 900112, 900113, 900114]), 4);
      naoSobe(() => cena.consultar('junction_nivel', args));
      cena.remover('pontos_faixas_juncao', [900111, 900112, 900113, 900114]);
      cena.remover('faixas_juncao', [900002]);
      expect(() => cena.consultar('junction_nivel', args)).not.toThrow();
      // valores fora do contrato na carga: z0 não finito, z0 >= z1, colunas de tamanhos diferentes
      expect(() => cena.upsert('faixas_juncao', faixa(900003, Number.NaN), 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('faixas_juncao', faixa(900003, 2.8, 2.8), 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('faixas_juncao', { ...faixa(900003), z1: [2.8, 2.8] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('pontos_faixas_juncao', { ...quadrado(900003, [900121, 900122, 900123, 900124]), y: [0, 1] }, 4)).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('junction_nivel', args)).not.toThrow();
    } finally {
      cena.destruir();
    }
  }, 120_000);

  // Uma cena por teste (montagem + consulta + destruição), cada um abaixo de 30 s; a memória volta ao valor do início de cada um.
  for (let i = 0; i < 3; i++) {
    it(`sem vazamento de memória depois de destruir a cena (${i + 1}/3)`, () => {
      if (pula()) return;
      const antes = ger!.instancia().exports.memoria_usada();
      const p = projetoDeEstresseB1(11, { pavimentos: 2, paredesB2: true, anexos: true });
      const { cena, b } = cenaDe(p);
      try {
        for (const l of p.levels) expect(decodificarB3(cena.consultar('junction_nivel', argumentosB3(p, l.id, b))).cortadores.length).toBeGreaterThan(0);
      } finally {
        cena.destruir();
      }
      expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
    }, 60_000);
  }
});

/**
 * Forma comparável de uma junção para `toEqual` entre duas saídas do Rust: `span` é uma função (duas decodificações nunca compartilham a
 * referência), então é amostrada nos vértices do polígono. Fora isso, os campos são os mesmos.
 */
function comparavelB3(j: JuncaoB3): unknown {
  return {
    ...j,
    cortadores: j.cortadores.map((c) => ({
      ...c,
      pecas: c.pecas.map((pc) => ({
        ...pc,
        span: pc.poligono.flatMap((poly) => poly.flatMap((anel) => anel)).map((v) => [pc.span(v)[0], pc.span(v)[1]] as const),
      })),
    })),
  };
}
