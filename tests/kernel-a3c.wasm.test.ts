/**
 * Equivalência da sub-etapa A3c (decisão 0047 §7): `cluster_resolvido` do Rust x `resolveLevel` do motor TypeScript
 * (`referenciaA3c`: `solveCluster` por grupo: camadas com `raw`, `fragment`, `cut`, faixas verticais, regiões por material e silhueta).
 * Roda só em `npm run test:wasm`. Identidade e `raw` exatos; o resto como região pelo critério da 0048.
 */
import { existsSync, readFileSync } from 'node:fs';
import { migrateProject, type Project } from '@hestia/model';
import { difference, type MultiPolygon } from '@hestia/geom';
import { beforeAll, describe, expect, it } from 'vitest';
import { montarCenaA1, zDoNivel } from '../packages/engine/src/kernelA1.ts';
import { argumentosA3, argumentosA3c, decodificarA3a, decodificarA3c, montarCenaA3, referenciaA3c, type OpcoesA3c } from '../packages/engine/src/kernelA3.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { areaDaForma } from '../scripts/kernel-harness-a2.mts';
import { compararA3c, type ComparacaoA3c } from '../scripts/kernel-harness-a3.mts';
import { projetoDeEstresseA3c, variantesDoNivel } from '../scripts/kernel-a3c-estresse.mts';

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
    })),
  );
  return { cena, a1, a3 };
};

interface Cobertura {
  comparacoes: number;
  grupos: number;
  camadas: number;
  camadasCurvas: number;
  faixas: number;
  regioes: number;
  silhuetas: number;
  camadasComFaixas: number;
  camadasComVariasFaixas: number;
  camadasComCorte: number;
  estritas: number;
  formas: number;
  faixasPorRefinamento: number;
  fiapos: number;
  fiaposRust: number;
  maxSimetrica: ComparacaoA3c['maxSimetrica'];
  maxFracaoDoLimite: number;
  regioesFora: number;
  silhuetasFora: number;
}
const zero = (): Cobertura => ({
  comparacoes: 0,
  grupos: 0,
  camadas: 0,
  camadasCurvas: 0,
  faixas: 0,
  regioes: 0,
  silhuetas: 0,
  camadasComFaixas: 0,
  camadasComVariasFaixas: 0,
  camadasComCorte: 0,
  estritas: 0,
  formas: 0,
  faixasPorRefinamento: 0,
  fiapos: 0,
  fiaposRust: 0,
  maxSimetrica: { fragment: 0, cut: 0, faixa: 0, regiao: 0, silhueta: 0 },
  maxFracaoDoLimite: 0,
  regioesFora: 0,
  silhuetasFora: 0,
});
const CONTADORES = ['grupos', 'camadas', 'camadasCurvas', 'faixas', 'regioes', 'silhuetas', 'camadasComFaixas', 'camadasComVariasFaixas', 'camadasComCorte', 'estritas', 'formas', 'faixasPorRefinamento', 'fiapos', 'fiaposRust'] as const;
const soma = (a: Cobertura, b: ComparacaoA3c | Cobertura): void => {
  a.comparacoes += 'comparacoes' in b ? b.comparacoes : 1;
  for (const k of CONTADORES) a[k] += b[k];
  for (const k of Object.keys(a.maxSimetrica) as Array<keyof Cobertura['maxSimetrica']>) a.maxSimetrica[k] = Math.max(a.maxSimetrica[k], b.maxSimetrica[k]);
  a.maxFracaoDoLimite = Math.max(a.maxFracaoDoLimite, b.maxFracaoDoLimite);
  a.regioesFora += 'regioesFora' in b ? b.regioesFora : b.regioesForaDaTolerancia;
  a.silhuetasFora += 'silhuetasFora' in b ? b.silhuetasFora : b.silhuetasForaDaTolerancia;
};


/** Opções de planta de um pavimento do teste: `escolhidas` índices de `variantesDoNivel` (padrão: todas). */
interface Plano {
  semente?: number;
  variantes?: (nivel: number) => number[];
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
  try {
    p.levels.forEach((l, nivel) => {
      const z = [...zDoNivel(p, l.id).values()];
      const zBase = z.length ? Math.min(...z.map((x) => x.z0)) : 0;
      const zTopo = z.length ? Math.max(...z.map((x) => x.z0 + x.height)) : 3;
      const todas = variantesDoNivel(p, l.id, plano.semente ?? 0, zBase, zTopo).map((v) => v.opcoes);
      const lista = opcoes ?? (plano.variantes ? plano.variantes(nivel).map((k) => todas[k % todas.length]!) : todas);
      for (const op of lista) {
        const ref = referenciaA3c(p, l.id, a1, op);
        const rust = decodificarA3c(cena.consultar('cluster_resolvido', argumentosA3c(p, l.id, a1, a3, op)));
        const cmp = compararA3c(ref, rust, curvas);
        expect(cmp.divergencias, `${l.id} ${JSON.stringify({ cutZ: op.cutZ, contorno: op.outlineWalls?.size, planOpenings: op.planOpenings?.size })}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
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
    `[A3c ${rotulo}] ${c.comparacoes} comparações, grupos ${c.grupos}, camadas ${c.camadas} (curvas ${c.camadasCurvas}, com faixas ${c.camadasComFaixas}, várias faixas ${c.camadasComVariasFaixas}, com corte ${c.camadasComCorte}), faixas ${c.faixas} (camadas só por refinamento: ${c.faixasPorRefinamento}), regiões ${c.regioes} (fora da 0048: ${c.regioesFora}), silhuetas ${c.silhuetas} (fora: ${c.silhuetasFora}), formas estritas ${c.estritas}/${c.formas}, fiapos ${c.fiapos} (Rust ${c.fiaposRust}), máx. simétrica ${JSON.stringify(c.maxSimetrica)}`,
  );
};

describe.skipIf(!bytes)('A3c: cluster_resolvido do Rust x motor TypeScript', () => {
  const pula = (): boolean => ger === null;

  it('estresse (sementes 1..12, 2 pavimentos): identidade, raw, fragment, cut e faixas verticais, em várias opções de planta', () => {
    if (pula()) return;
    const total = zero();
    for (let semente = 1; semente <= 12; semente++) {
      soma(total, compararProjeto(projetoDeEstresseA3c(semente, { paredes: 16, pavimentos: 2 }), { semente, variantes: (n) => [semente + 3 * n] }));
    }
    relata('estresse', total);
    expect(total.camadas, 'camadas comparadas').toBeGreaterThan(1000);
    expect(total.camadasCurvas, 'camadas em parede curva').toBeGreaterThan(50);
    expect(total.camadasComFaixas, 'camadas com faixas verticais').toBeGreaterThan(1000);
    expect(total.camadasComVariasFaixas, 'camadas com mais de uma faixa (vãos e faixas do tipo)').toBeGreaterThan(100);
    expect(total.camadasComCorte, 'camadas com corte diferente do fragmento (vãos e retornos de planta)').toBeGreaterThan(50);
    expect(total.regioes, 'regiões por material').toBeGreaterThan(50);
    expect(total.fiaposRust, 'fiapos só do Rust: o Rust não inventa camadas').toBe(0);
    expect(total.faixasPorRefinamento / total.camadas, 'fração de camadas cuja fusão de faixas diferiu da do TS').toBeLessThanOrEqual(0.06);
  }, 300_000);

  it('só retas, e só arcos', () => {
    if (pula()) return;
    let arcos = 0;
    for (let semente = 100; semente < 102; semente++) {
      compararProjeto(projetoDeEstresseA3c(semente, { paredes: 20, pavimentos: 1, curvas: 0, ruido: false }), { semente, variantes: () => [semente % 7] });
      arcos += compararProjeto(projetoDeEstresseA3c(semente, { paredes: 10, pavimentos: 1, curvas: 1 }), { semente, variantes: () => [(semente + 3) % 7] }).camadasCurvas;
    }
    expect(arcos, 'camadas em parede curva').toBeGreaterThan(20);
  }, 120_000);

  it('sintéticos de 10 e 20 pavimentos', () => {
    if (pula()) return;
    for (const n of [10, 20]) {
      const p = syntheticProject(n);
      const cov = compararProjeto(p, {}, [{}]);
      expect(cov.camadas).toBeGreaterThan(0);
    }
  }, 120_000);

  it('fixture do repositório (casa de 2 quartos)', () => {
    if (pula()) return;
    const p = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
    const cov = compararProjeto(p, {}, [{}, { cutZ: 0.05 }]);
    expect(cov.camadas).toBeGreaterThan(10);
    expect(cov.regioes).toBeGreaterThan(0);
  }, 120_000);

  it('propriedades: faixas ascendentes e sem sobreposição, cobrindo a altura de parede isolada; faixa dentro do bruto; silhueta contém as regiões', () => {
    if (pula()) return;
    let verificadas = 0;
    let isoladas = 0;
    let maxFora = 0;
    for (let semente = 400; semente < 408; semente++) {
      for (const isolada of [true, false]) {
        // sem retornos de vão nos tipos (a faixa de retorno fica fora do bruto da camada, dentro do vão)
        const p = projetoDeEstresseA3c(semente, { paredes: isolada ? 1 : 14, pavimentos: 1, curvas: isolada ? 0 : 0.12, comTiposDeRetorno: false });
        const { cena, a1, a3 } = cenaDe(p);
        try {
          const l = p.levels[0]!;
          const z = zDoNivel(p, l.id);
          const zPorParede = new Map<number, { z0: number; altura: number }>();
          for (const [id, w] of z) zPorParede.set(a1.idDe.get(id)!, { z0: w.z0, altura: w.height });
          const r = decodificarA3c(cena.consultar('cluster_resolvido', argumentosA3c(p, l.id, a1, a3)));
          const vaos = new Map<number, MultiPolygon[]>();
          for (const g of decodificarA3a(cena.consultar('aberturas_geom', argumentosA3(a1, l.id)))) vaos.set(g.parede, [...(vaos.get(g.parede) ?? []), g.retangulo]);
          for (const c of r.camadas) {
            const altura = zPorParede.get(c.parede)!.altura;
            let anterior = -Infinity;
            for (const f of c.faixas) {
              expect(f.z0).toBeLessThan(f.z1);
              expect(f.z0, 'faixas em ordem crescente, sem sobreposição').toBeGreaterThanOrEqual(anterior - 1e-6);
              expect(f.z0).toBeGreaterThanOrEqual(-1e-6);
              expect(f.z1).toBeLessThanOrEqual(altura + 1e-6);
              anterior = f.z1;
              // cada faixa dentro do bruto da camada (o retorno do acabamento no vão fica fora do bruto, mas dentro do furo do vão)
              if (!c.faixa && f.poly.length && c.raw.length) {
                const fora = difference(f.poly, c.raw);
                const sobra = fora.length ? difference(fora, ...(vaos.get(c.parede) ?? [])) : fora;
                expect(areaDaForma(sobra), `faixa [${f.z0}, ${f.z1}] fora do bruto`).toBeLessThanOrEqual(1e-6);
              }
              verificadas++;
            }
            // parede isolada, camada do tipo: as faixas cobrem a altura inteira sem lacuna
            if (isolada && !c.faixa && c.faixas.length) {
              expect(c.faixas[0]!.z0).toBeCloseTo(0, 6);
              expect(c.faixas[c.faixas.length - 1]!.z1).toBeCloseTo(altura, 6);
              for (let k = 1; k < c.faixas.length; k++) expect(Math.abs(c.faixas[k]!.z0 - c.faixas[k - 1]!.z1), 'lacuna entre faixas').toBeLessThan(1e-6);
              isoladas++;
            }
          }
          // a silhueta de cada grupo contém as regiões do grupo (a menos do ruído do fechamento de frestas: 5e-5 m², medido 1,9e-5)
          r.silhuetas.forEach((sil, g) => {
            for (const reg of r.regioes.filter((x) => x.grupo === g)) {
              if (reg.poligonos.length === 0 || sil.length === 0) continue;
              const fora = areaDaForma(difference(reg.poligonos, sil));
              maxFora = Math.max(maxFora, fora);
              expect(fora, `região do material ${reg.material} fora da silhueta do grupo ${g}`).toBeLessThanOrEqual(5e-5);
            }
          });
        } finally {
          cena.destruir();
        }
      }
    }
    // Medido: Rust 1,85e-5 m² (o fechamento de frestas por offset do i_overlay desloca a borda ~1 µm), TS 2,6e-6 m². O limite é só de sanidade.
    console.log(`[A3c propriedades] região fora da silhueta: máx. ${maxFora} m²`);
    expect(verificadas).toBeGreaterThan(200);
    expect(isoladas, 'camadas de parede isolada com faixas').toBeGreaterThan(20);
  }, 120_000);

  it('planOpenings vazio: o corte é o fragmento; sem planOpenings os vãos furam a planta', () => {
    if (pula()) return;
    const p = projetoDeEstresseA3c(7, { paredes: 24, pavimentos: 1, curvas: 0 });
    const { cena, a1, a3 } = cenaDe(p);
    try {
      const l = p.levels[0]!;
      const todas = decodificarA3c(cena.consultar('cluster_resolvido', argumentosA3c(p, l.id, a1, a3)));
      const nenhuma = decodificarA3c(cena.consultar('cluster_resolvido', argumentosA3c(p, l.id, a1, a3, { planOpenings: new Set() })));
      expect(todas.camadas.length).toBe(nenhuma.camadas.length);
      let furadas = 0;
      todas.camadas.forEach((c, i) => {
        const n = nenhuma.camadas[i]!;
        expect(Math.abs(areaDaForma(n.cut) - areaDaForma(n.fragment))).toBeLessThanOrEqual(1e-6);
        if (areaDaForma(c.fragment) - areaDaForma(c.cut) > 1e-3) furadas++;
        // o 3D (faixas) não depende de planOpenings
        expect(c.faixas.length).toBe(n.faixas.length);
      });
      expect(furadas, 'camadas furadas pelos vãos na planta').toBeGreaterThan(5);
    } finally {
      cena.destruir();
    }
  }, 60_000);

  it('upsert e remoção na cena viva seguem o projeto', () => {
    if (pula()) return;
    const p = projetoDeEstresseA3c(5, { paredes: 18, pavimentos: 1 });
    const { cena, a1, a3 } = cenaDe(p);
    try {
      const l = p.levels[0]!;
      const args = argumentosA3c(p, l.id, a1, a3);
      const antes = decodificarA3c(cena.consultar('cluster_resolvido', args));
      const total = (c: typeof antes): number => c.camadas.reduce((t, x) => t + x.faixas.length, 0);
      const ab = a3.secoes.aberturas['id_num']![0]!;
      cena.remover('aberturas', [ab]);
      const depois = decodificarA3c(cena.consultar('cluster_resolvido', args));
      expect(total(depois)).not.toBe(total(antes));
      const c = a3.secoes.aberturas;
      const i = c['id_num']!.indexOf(ab);
      cena.upsert('aberturas', Object.fromEntries(Object.entries(c).map(([k, v]) => [k, [v[i]!]])), 1);
      const restaurado = decodificarA3c(cena.consultar('cluster_resolvido', args));
      expect(total(restaurado)).toBe(total(antes));
      expect(restaurado.camadas.length).toBe(antes.camadas.length);
    } finally {
      cena.destruir();
    }
  }, 60_000);

  it('entradas inválidas viram falha leve, nunca panic', () => {
    if (pula()) return;
    const p = projetoDeEstresseA3c(3, { paredes: 8, pavimentos: 1 });
    const { cena, a1 } = cenaDe(p);
    try {
      const nivel = a1.nivelDe.get(p.levels[0]!.id)!;
      expect(() => cena.consultar('cluster_resolvido', [0xffffffff, 0.02, 0, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('cluster_resolvido', [nivel, 0.02, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('cluster_resolvido', [nivel, -1, 0, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('cluster_resolvido', [nivel, 0.02, 2, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
      // tem_aberturas_planta 0 com aberturas listadas, contagem inconsistente, id fracionário
      expect(() => cena.consultar('cluster_resolvido', [nivel, 0.02, 0, 0, 0, 0, 1, 5])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('cluster_resolvido', [nivel, 0.02, 0, 0, 0, 1, 2, 5])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('cluster_resolvido', [nivel, 0.02, 0, 0, 1, 1, 0, 1.5])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('cluster_resolvido', [nivel, 0.02, 0, 0, 0, 0, 0])).not.toThrow();
      cena.remover('paredes_z', a1.secoes.paredes_z['id_num']!.slice(0, 1));
      expect(() => cena.consultar('cluster_resolvido', [nivel, 0.02, 0, 0, 0, 0, 0])).toThrow(ErroKernelLeve);
    } finally {
      cena.destruir();
    }
  });

  it('sem vazamento de memória depois de destruir a cena', () => {
    if (pula()) return;
    const antes = ger!.instancia().exports.memoria_usada();
    compararProjeto(projetoDeEstresseA3c(11, { paredes: 20, pavimentos: 1 }), {}, [{}]);
    expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
  }, 60_000);
});
