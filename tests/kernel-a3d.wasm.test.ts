/**
 * Equivalência da sub-etapa A3d (decisão 0047 §7): `resolver_nivel` do Rust x `resolveLevel` do motor TypeScript
 * (`referenciaA3d`: campos de `ResolvedWall`, membranas, perfis de topo e de base, camadas com faixas recortadas pelos perfis, regiões e silhueta).
 * Roda só em `npm run test:wasm`. Identidade, campos escalares (1e-6), perfis copiados (exatos), membranas (1 µm) e `raw` exatos; o resto
 * como nas sub-etapas anteriores (0048) e, para regiões e silhuetas, a decisão 0049.
 */
import { existsSync, readFileSync } from 'node:fs';
import { migrateProject, type Project } from '@hestia/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montarCenaA1, zDoNivel } from '../packages/engine/src/kernelA1.ts';
import { decodificarA3c, montarCenaA3, type OpcoesA3c } from '../packages/engine/src/kernelA3.ts';
import { argumentosA3d, decodificarA3d, montarPerfisA3d, referenciaA3d } from '../packages/engine/src/kernelA3d.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararA3d, estat0049Zero, somaEstat0049, type ComparacaoA3d, type Estat0049, type ExcecaoDeFaixa, type ExcecaoNomeada } from '../scripts/kernel-harness-a3.mts';
import { variantesDoNivel } from '../scripts/kernel-a3c-estresse.mts';
import { projetoDeEstresseA3d, projetoDeParedeComPerfil } from '../scripts/kernel-a3d-estresse.mts';

/**
 * Modo de MEDIÇÃO (A3D_MEDIR=1): não reprova nas divergências de equivalência; junta todas e imprime o resumo no fim. Serve para levar números ao dono
 * quando a 0049 (topologia, limite de região) ou outra regra reprova; o modo normal (padrão) bloqueia em qualquer divergência.
 */
const MEDIR = process.env['A3D_MEDIR'] === '1';
const medidas: string[] = [];
/** Maior K (razão simétrica/perímetro/1e-6, 0049) de todos os casos do arquivo, para o registro no 0047 §11. */
const melhorK = { k: 0, caso: '' };
afterAll(() => {
  console.log(`[A3d K medido] máximo ${melhorK.k} em ${melhorK.caso}`);
  if (MEDIR) console.log(['[A3d medição] ' + medidas.length + ' divergências', ...medidas.map((m) => m.slice(0, 700))].join('\n'));
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
  const a1 = montarCenaA1(p);
  const a3 = montarCenaA3(p, a1);
  const perfis = montarPerfisA3d(p, a1);
  const s = a1.secoes;
  const n = a1.nLinhas;
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
      perfis_z: { colunas: perfis.colunas, n: perfis.n },
    })),
  );
  return { cena, a1, a3, perfis };
};

interface Cobertura {
  comparacoes: number;
  paredes: number;
  paredesComPerfilTopo: number;
  paredesComPerfilBase: number;
  paredesComPerfilDoModelo: number;
  paredesComMembranas: number;
  membranas: number;
  faixasInclinadas: number;
  grupos: number;
  camadas: number;
  camadasCurvas: number;
  faixas: number;
  regioes: number;
  silhuetas: number;
  estritas: number;
  formas: number;
  faixasPorRefinamento: number;
  fiapos: number;
  fiaposRust: number;
  desvioMaximo: number;
  regioesFora: number;
  silhuetasFora: number;
  excecoes: number;
  excecoesDeFaixa: number;
  maxFracaoDoLimite: number;
  estat: Estat0049;
}
const zero = (): Cobertura => ({
  comparacoes: 0,
  paredes: 0,
  paredesComPerfilTopo: 0,
  paredesComPerfilBase: 0,
  paredesComPerfilDoModelo: 0,
  paredesComMembranas: 0,
  membranas: 0,
  faixasInclinadas: 0,
  grupos: 0,
  camadas: 0,
  camadasCurvas: 0,
  faixas: 0,
  regioes: 0,
  silhuetas: 0,
  estritas: 0,
  formas: 0,
  faixasPorRefinamento: 0,
  fiapos: 0,
  fiaposRust: 0,
  desvioMaximo: 0,
  regioesFora: 0,
  silhuetasFora: 0,
  excecoes: 0,
  excecoesDeFaixa: 0,
  maxFracaoDoLimite: 0,
  estat: estat0049Zero(),
});
const SOMAS = ['paredes', 'paredesComPerfilTopo', 'paredesComPerfilBase', 'paredesComPerfilDoModelo', 'paredesComMembranas', 'membranas', 'faixasInclinadas', 'grupos', 'camadas', 'camadasCurvas', 'faixas', 'regioes', 'silhuetas', 'estritas', 'formas', 'faixasPorRefinamento', 'fiapos', 'fiaposRust'] as const;
const soma = (a: Cobertura, b: ComparacaoA3d | Cobertura): void => {
  a.comparacoes += 'comparacoes' in b ? b.comparacoes : 1;
  for (const k of SOMAS) a[k] += b[k];
  a.desvioMaximo = Math.max(a.desvioMaximo, b.desvioMaximo);
  a.maxFracaoDoLimite = Math.max(a.maxFracaoDoLimite, b.maxFracaoDoLimite);
  a.regioesFora += 'regioesFora' in b ? b.regioesFora : b.regioesForaDaTolerancia;
  a.silhuetasFora += 'silhuetasFora' in b ? b.silhuetasFora : b.silhuetasForaDaTolerancia;
  a.excecoes += 'excecoes' in b ? b.excecoes : b.excecoesUsadas;
  a.excecoesDeFaixa += b.excecoesDeFaixa;
  somaEstat0049(a.estat, 'estat' in b ? b.estat : b.estat0049);
};

/** Exceção nomeada da 0049: semente 1, pavimento 0, material 2 (defeito do `unionClipper` do TS; o Rust está a 2e-6 m² da união exata). */
const EXCECAO_SEMENTE_1 = (semente: number, nivel: number): ExcecaoNomeada[] => (semente === 1 && nivel === 0 ? [{ material: 2, grupo: 0, silhueta: true, motivo: 'defeito do TS: o unionClipper infla a região em 3,5e-3 m² e preenche um entalhe junto a uma parede curva (0049)' }] : []);

interface Plano {
  semente?: number;
  variantes?: (nivel: number) => number[];
  excecoes?: (nivel: number) => ExcecaoNomeada[];
  /** Exceções nomeadas de faixa (camada de uma parede): `parede` é o id_num; o pré-recorte vem de `cluster_resolvido`. */
  excecoesDeFaixa?: Array<{ parede: number; indice: number; motivo: string }>;
}

/** Compara todos os pavimentos do projeto nas variantes de opção de planta (ou só nas opções dadas). */
function compararProjeto(p: Project, plano: Plano = {}, opcoes?: OpcoesA3c[]): Cobertura {
  const { cena, a1, a3 } = cenaDe(p);
  const cov = zero();
  const curvas = new Set<number>();
  const q = a1.secoes.paredes_quadro;
  q['id_num']!.forEach((id, i) => {
    if (q['sag']![i] !== 0) curvas.add(id);
  });
  const doModelo = new Set<number>();
  for (const [id, num] of a1.idDe) if ((p.elements[id] as { topProfile?: unknown }).topProfile) doModelo.add(num);
  try {
    p.levels.forEach((l, nivel) => {
      const z = [...zDoNivel(p, l.id).values()];
      const zBase = z.length ? Math.min(...z.map((x) => x.z0)) : 0;
      const zTopo = z.length ? Math.max(...z.map((x) => x.z0 + x.height)) : 3;
      const todas = variantesDoNivel(p, l.id, plano.semente ?? 0, zBase, zTopo).map((v) => v.opcoes);
      const lista = opcoes ?? (plano.variantes ? plano.variantes(nivel).map((k) => todas[k % todas.length]!) : todas);
      for (const op of lista) {
        const ref = referenciaA3d(p, l.id, a1, op);
        const rust = decodificarA3d(cena.consultar('resolver_nivel', argumentosA3d(p, l.id, a1, a3, op)));
        const faixas: ExcecaoDeFaixa[] = (plano.excecoesDeFaixa ?? []).flatMap((e) => {
          const pre = decodificarA3c(cena.consultar('cluster_resolvido', argumentosA3d(p, l.id, a1, a3, op))).camadas.find((c) => c.parede === e.parede && !c.faixa && c.indice === e.indice);
          return pre ? [{ ...e, preRecorte: pre.faixas }] : [];
        });
        const cmp = compararA3d(ref, rust, curvas, doModelo, 20, plano.excecoes?.(nivel) ?? [], faixas);
        const rotulo = `${p.name} ${l.id} ${JSON.stringify({ cutZ: op.cutZ, contorno: op.outlineWalls?.size, planOpenings: op.planOpenings?.size })}`;
        if (cmp.estat0049.maxK > melhorK.k) Object.assign(melhorK, { k: cmp.estat0049.maxK, caso: rotulo });
        if (MEDIR) medidas.push(...cmp.divergencias.map((d) => `${rotulo}: ${d}`));
        else expect(cmp.divergencias, `${rotulo}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
        soma(cov, cmp);
      }
    });
  } finally {
    cena.destruir();
  }
  return cov;
}

const relata = (rotulo: string, c: Cobertura): void => {
  console.log(
    `[A3d ${rotulo}] ${c.comparacoes} comparações, paredes ${c.paredes} (perfil de topo ${c.paredesComPerfilTopo}, de base ${c.paredesComPerfilBase}, topProfile do modelo ${c.paredesComPerfilDoModelo}, com membranas ${c.paredesComMembranas}: ${c.membranas}), grupos ${c.grupos}, camadas ${c.camadas} (curvas ${c.camadasCurvas}), faixas ${c.faixas} (inclinadas ${c.faixasInclinadas}; camadas só por refinamento: ${c.faixasPorRefinamento}), regiões ${c.regioes} (acima do critério 0048, dentro da 0049: ${c.regioesFora}), silhuetas ${c.silhuetas} (idem: ${c.silhuetasFora}), exceções nomeadas ${c.excecoes} (faixas ${c.excecoesDeFaixa}), 0049 (medido): ${JSON.stringify(c.estat)}; máx. fração do limite 0048 ${c.maxFracaoDoLimite.toFixed(2)}, formas estritas ${c.estritas}/${c.formas}, fiapos ${c.fiapos} (Rust ${c.fiaposRust}), desvio máx. de campos ${c.desvioMaximo}`,
  );
};

describe.skipIf(!bytes)('A3d: resolver_nivel do Rust x motor TypeScript', () => {
  const pula = (): boolean => ger === null;

  it('estresse (sementes 1..12, 2 pavimentos, perfis de topo e base, arcos, vãos, retornos): paredes, membranas, perfis, camadas e faixas', () => {
    if (pula()) return;
    const total = zero();
    for (let semente = 1; semente <= 12; semente++) {
      soma(total, compararProjeto(projetoDeEstresseA3d(semente, { paredes: 16, pavimentos: 2 }), { semente, variantes: (n) => [semente + 3 * n], excecoes: (n) => EXCECAO_SEMENTE_1(semente, n) }));
    }
    relata('estresse', total);
    expect(total.paredes, 'paredes comparadas').toBeGreaterThan(300);
    expect(total.paredesComPerfilTopo, 'paredes com profileTop').toBeGreaterThan(10);
    expect(total.paredesComPerfilBase, 'paredes com profileBottom').toBeGreaterThan(30);
    expect(total.paredesComPerfilDoModelo, 'paredes com topProfile do modelo').toBeGreaterThan(30);
    expect(total.paredesComMembranas, 'paredes com membranas').toBeGreaterThan(10);
    expect(total.faixasInclinadas, 'faixas com topo inclinado').toBeGreaterThan(100);
    expect(total.camadasCurvas, 'camadas em parede curva').toBeGreaterThan(30);
    expect(total.regioes, 'regiões por material').toBeGreaterThan(50);
    expect(total.fiaposRust, 'fiapos só do Rust: o Rust não inventa camadas').toBe(0);
    expect(total.desvioMaximo, 'desvio de campos escalares, perfis e membranas').toBeLessThanOrEqual(1e-6);
  }, 300_000);

  it('só retas, e só arcos', () => {
    if (pula()) return;
    let arcos = 0;
    for (let semente = 100; semente < 102; semente++) {
      compararProjeto(projetoDeEstresseA3d(semente, { paredes: 20, pavimentos: 1, curvas: 0, ruido: false }), { semente, variantes: () => [semente % 7], excecoesDeFaixa: semente === 101 ? [{ parede: 18, indice: 4, motivo: 'defeito do TS: polygon-clipping devolve fatias que somam mais que o polígono no recorte pelo perfil (0049)' }] : [] });
      arcos += compararProjeto(projetoDeEstresseA3d(semente, { paredes: 10, pavimentos: 1, curvas: 1 }), { semente, variantes: () => [(semente + 3) % 7] }).camadasCurvas;
    }
    expect(arcos, 'camadas em parede curva').toBeGreaterThan(20);
  }, 120_000);

  it('sintéticos de 10 e 20 pavimentos', () => {
    if (pula()) return;
    for (const n of [10, 20]) {
      const cov = compararProjeto(syntheticProject(n), {}, [{}]);
      expect(cov.paredes).toBeGreaterThan(0);
    }
  }, 120_000);

  it('fixture do repositório (casa de 2 quartos)', () => {
    if (pula()) return;
    const p = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
    const cov = compararProjeto(p, {}, [{}, { cutZ: 0.05 }]);
    expect(cov.paredes).toBeGreaterThan(5);
    expect(cov.regioes).toBeGreaterThan(0);
  }, 120_000);

  it('propriedades do Rust: perfil dentro da altura, membranas nas pontas, faixas cobrem a altura de parede isolada', () => {
    if (pula()) return;
    let membranas = 0;
    let perfis = 0;
    for (let semente = 300; semente < 304; semente++) {
      const p = projetoDeEstresseA3d(semente, { paredes: 14, pavimentos: 1, curvas: 0.1 });
      const { cena, a1, a3 } = cenaDe(p);
      try {
        const r = decodificarA3d(cena.consultar('resolver_nivel', argumentosA3d(p, p.levels[0]!.id, a1, a3)));
        const altura = new Map(r.paredes.map((w) => [w.id, w.height]));
        for (const w of r.paredes) {
          for (const q of [...(w.profileTop ?? []), ...(w.profileBottom ?? [])]) {
            expect(q.h).toBeLessThanOrEqual(w.height + 1e-9);
            expect(q.h).toBeGreaterThanOrEqual(0);
            perfis++;
          }
          for (const m of w.membranas) {
            // as pontas da membrana ficam junto das extremidades da parede (esquadria do canto)
            const perto = (q: { x: number; y: number }, o: { x: number; y: number }): number => Math.hypot(q.x - o.x, q.y - o.y);
            expect(Math.min(perto(m.pts[0]!, w.a), perto(m.pts[0]!, w.b))).toBeLessThan(1);
            expect(Math.min(perto(m.pts[1]!, w.a), perto(m.pts[1]!, w.b))).toBeLessThan(1);
            membranas++;
          }
        }
        for (const c of r.camadas) {
          for (const f of c.faixas) {
            expect(f.z0).toBeGreaterThanOrEqual(-1e-6);
            expect(f.z1).toBeLessThanOrEqual(altura.get(c.parede)! + 1e-6);
            if (f.slope) expect(Math.max(f.slope.h0, f.slope.h1)).toBeCloseTo(f.z1, 6);
          }
        }
      } finally {
        cena.destruir();
      }
    }
    // parede isolada sem perfil: uma faixa por camada do chão ao topo, sem inclinação; com rampa, as faixas cobrem sob a rampa
    const reta = projetoDeParedeComPerfil(null, false);
    const { cena, a1, a3 } = cenaDe(reta);
    try {
      const r = decodificarA3d(cena.consultar('resolver_nivel', argumentosA3d(reta, reta.levels[0]!.id, a1, a3)));
      for (const c of r.camadas) {
        expect(c.faixas.length).toBe(1);
        expect(c.faixas[0]!.z0).toBe(0);
        expect(c.faixas[0]!.slope).toBeUndefined();
      }
    } finally {
      cena.destruir();
    }
    expect(membranas, 'membranas verificadas').toBeGreaterThan(0);
    expect(perfis, 'pontos de perfil verificados').toBeGreaterThan(10);
  }, 120_000);

  it('parede isolada: rampa de topProfile e base anexada ao piso (casos fixos)', () => {
    if (pula()) return;
    for (const [perfil, piso] of [
      [[{ t: 0, h: 1 }, { t: 6, h: 2.5 }], true],
      [[{ t: 0, h: 2 }, { t: 3, h: 2 }, { t: 3, h: 1 }, { t: 6, h: 1 }], false],
      [[{ t: 0, h: 0.5 }, { t: 2, h: 3 }, { t: 4, h: 0.9 }, { t: 7, h: 3 }], true],
    ] as const) {
      const cov = compararProjeto(projetoDeParedeComPerfil([...perfil], piso), {}, [{}]);
      expect(cov.paredes).toBe(1);
      expect(cov.faixasInclinadas + cov.faixas).toBeGreaterThan(0);
    }
  }, 60_000);

  it('limiar: perfil com pontos a 5 µm (degrau quase vertical) mantém o trecho inclinado de 5 µm, como no TS (EPS de 1e-7)', () => {
    if (pula()) return;
    for (const [perfil, piso] of [
      [[{ t: 0, h: 2 }, { t: 3, h: 2 }, { t: 3.000005, h: 1 }, { t: 6, h: 1 }], false],
      [[{ t: 0, h: 2.5 }, { t: 2, h: 2.5 }, { t: 2.000005, h: 0.5 }, { t: 4, h: 0.5 }, { t: 4.000005, h: 2.5 }, { t: 6, h: 2.5 }], false],
    ] as const) {
      const p = projetoDeParedeComPerfil([...perfil], piso);
      const cov = compararProjeto(p, {}, [{}]);
      expect(cov.paredes).toBe(1);
      // o comparador tolera uma faixa de 1 µm² a menos: contagem de faixas e de faixas inclinadas direto, nos dois motores
      const { cena, a1, a3 } = cenaDe(p);
      try {
        const l = p.levels[0]!;
        const ref = referenciaA3d(p, l.id, a1);
        const rust = decodificarA3d(cena.consultar('resolver_nivel', argumentosA3d(p, l.id, a1, a3, {})));
        const conta = (r: typeof ref): number[] => [r.camadas.reduce((t, c) => t + c.faixas.length, 0), r.camadas.reduce((t, c) => t + c.faixas.filter((x) => x.slope).length, 0)];
        expect(conta(ref)[1], 'o TS produz o trecho inclinado de 5 µm').toBeGreaterThan(0);
        expect(conta(rust), 'faixas e faixas inclinadas').toEqual(conta(ref));
      } finally {
        cena.destruir();
      }
    }
  }, 60_000);

  it('upsert e remoção de perfis_z na cena viva seguem o projeto', () => {
    if (pula()) return;
    const p = projetoDeEstresseA3d(5, { paredes: 16, pavimentos: 1 });
    const { cena, a1, a3, perfis } = cenaDe(p);
    try {
      const l = p.levels[0]!;
      const args = argumentosA3d(p, l.id, a1, a3);
      const antes = decodificarA3d(cena.consultar('resolver_nivel', args));
      const comPerfil = (r: typeof antes): number => r.paredes.filter((w) => w.profileTop || w.profileBottom).length;
      const inclinadas = (r: typeof antes): number => r.camadas.reduce((t, c) => t + c.faixas.filter((f) => f.slope).length, 0);
      expect(comPerfil(antes), 'paredes com perfil derivado').toBeGreaterThan(0);
      expect(inclinadas(antes), 'faixas inclinadas').toBeGreaterThan(0);
      // remove todas as linhas de perfil: nenhuma parede com perfil e nenhuma faixa inclinada
      const ids = perfis.colunas['id_num']!;
      cena.remover('perfis_z', ids);
      const sem = decodificarA3d(cena.consultar('resolver_nivel', args));
      expect(comPerfil(sem)).toBe(0);
      expect(inclinadas(sem)).toBe(0);
      // devolve (upsert): o resultado volta a ser o de antes
      cena.upsert('perfis_z', perfis.colunas, perfis.n);
      const volta = decodificarA3d(cena.consultar('resolver_nivel', args));
      expect(comPerfil(volta)).toBe(comPerfil(antes));
      expect(inclinadas(volta)).toBe(inclinadas(antes));
      expect(JSON.stringify(volta.paredes.map((w) => [w.profileTop, w.profileBottom]))).toBe(JSON.stringify(antes.paredes.map((w) => [w.profileTop, w.profileBottom])));
      // uma remoção só: lacuna no índice de uma lista (se a lista tem mais de 2 pontos) vira falha leve
      const lista = perfis.colunas['lista']!;
      const parede = perfis.colunas['parede_num']!;
      const ix = perfis.colunas['indice']!;
      const k = ids.findIndex((_, i) => ix[i] === 1 && perfis.colunas['t']!.length > 0 && ids.some((__, j) => j !== i && parede[j] === parede[i] && lista[j] === lista[i] && ix[j] === 2));
      expect(k, 'lista com 3 pontos ou mais').toBeGreaterThanOrEqual(0);
      cena.remover('perfis_z', [ids[k]!]);
      expect(() => cena.consultar('resolver_nivel', args)).toThrow(ErroKernelLeve);
    } finally {
      cena.destruir();
    }
  }, 60_000);

  it('entradas inválidas viram falha leve, nunca panic', () => {
    if (pula()) return;
    const p = projetoDeEstresseA3d(3, { paredes: 8, pavimentos: 1 });
    const { cena, a1 } = cenaDe(p);
    try {
      const nivel = a1.nivelDe.get(p.levels[0]!.id)!;
      expect(() => cena.consultar('resolver_nivel', [0xffffffff, 0.02, 0, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('resolver_nivel', [nivel, 0.02, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('resolver_nivel', [nivel, -1, 0, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('resolver_nivel', [nivel, 0.02, 2, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('resolver_nivel', [nivel, 0.02, 0, 0, 0, 0, 1, 5])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('resolver_nivel', [nivel, 0.02, 0, 0, 0, 0, 0])).not.toThrow();
      // seção perfis_z inválida: lista fora do domínio, valor não finito, chave reservada
      const c = { id_num: [1], parede_num: [1], lista: [3], indice: [0], t: [0], h: [1] };
      expect(() => cena.upsert('perfis_z', c, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('perfis_z', { ...c, lista: [0], t: [Number.NaN] }, 1)).toThrow(ErroKernelLeve);
      expect(() => cena.upsert('perfis_z', { ...c, lista: [0], id_num: [0xffffffff] }, 1)).toThrow(ErroKernelLeve);
      // índice repetido na mesma lista é recusado na consulta, não na seção
      cena.upsert('perfis_z', { id_num: [900001, 900002], parede_num: [1, 1], lista: [0, 0], indice: [0, 0], t: [0, 1], h: [1, 1] }, 2);
      expect(() => cena.consultar('resolver_nivel', [nivel, 0.02, 0, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
      cena.remover('perfis_z', [900001, 900002]);
      cena.remover('paredes_z', a1.secoes.paredes_z['id_num']!.slice(0, 1));
      expect(() => cena.consultar('resolver_nivel', [nivel, 0.02, 0, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
    } finally {
      cena.destruir();
    }
  });

  it('sem vazamento de memória depois de destruir a cena', () => {
    if (pula()) return;
    const antes = ger!.instancia().exports.memoria_usada();
    compararProjeto(projetoDeEstresseA3d(11, { paredes: 20, pavimentos: 1 }), {}, [{}]);
    expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
  }, 60_000);
});
