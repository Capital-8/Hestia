/**
 * Equivalência da sub-etapa A2 (decisão 0047): `itens_pintados` do Rust x extração do motor TypeScript
 * (`packages/engine/src/kernelA2.ts`: `buildItems` e `paint` de `resolve.ts`), por pavimento e item a item.
 * Roda só em `npm run test:wasm` (vitest.wasm.config.ts); o CI aponta `KERNEL_WASM_PATH` para o binário recém-compilado.
 * Identidade por igualdade exata, área do fragmento a 1e-6 m², coordenadas a 1 µm; nunca se afrouxa.
 */
import { existsSync, readFileSync } from 'node:fs';
import { migrateProject, type Id, type Project } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { argumentosA2, decodificarA2, referenciaA2, type OpcoesA2 } from '../packages/engine/src/kernelA2.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararA2, areaDaForma } from '../scripts/kernel-harness-a2.mts';
import { projetoDeEstresseA2 } from '../scripts/kernel-a2-estresse.mts';

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

const cenaDe = (p: Project): { cena: CenaV2; a1: ReturnType<typeof montarCenaA1> } => {
  const a1 = montarCenaA1(p);
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
    })),
  );
  return { cena, a1 };
};

interface Cobertura {
  itens: number;
  comFragmento: number;
  pecas: number;
  faixas: number;
  contorno: number;
  atravessa: number;
  comEnvoltas: number;
  estritos: number;
  tsPerdeuArea: number;
  desvio: number;
}
const zero = (): Cobertura => ({ itens: 0, comFragmento: 0, pecas: 0, faixas: 0, contorno: 0, atravessa: 0, comEnvoltas: 0, estritos: 0, tsPerdeuArea: 0, desvio: 0 });
const soma = (a: Cobertura, b: Cobertura): void => {
  for (const k of Object.keys(a) as (keyof Cobertura)[]) a[k] = k === 'desvio' ? Math.max(a[k], b[k]) : a[k] + b[k];
};

/** Opções de planta a testar num pavimento, em função da semente. */
function variacoes(p: Project, levelId: Id, semente: number): OpcoesA2[] {
  const paredes = Object.values(p.elements).filter((e) => e.kind === 'wall' && e.levelId === levelId).map((e) => e.id);
  const contorno = new Set(paredes.filter((_, i) => (i + semente) % 3 === 0));
  return [{}, { cutZ: 2.0 }, { cutZ: 3.5, outlineWalls: new Set(paredes) }, { outlineWalls: contorno }];
}

/** Compara todos os pavimentos (com as variações de planta) e devolve estatísticas de cobertura. */
function compararProjeto(p: Project, semente = 0, comVariacoes = true): Cobertura {
  const { cena, a1 } = cenaDe(p);
  const cov = zero();
  try {
    for (const l of p.levels) {
      for (const opcoes of comVariacoes ? variacoes(p, l.id, semente) : [{}]) {
        const ref = referenciaA2(p, l.id, a1, opcoes);
        const rust = decodificarA2(cena.consultar('itens_pintados', argumentosA2(p, l.id, a1, opcoes)));
        const cmp = compararA2(ref, rust);
        expect(cmp.divergencias, `${l.id} ${JSON.stringify(opcoes.cutZ ?? null)}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
        soma(cov, {
          itens: cmp.itens,
          comFragmento: cmp.comFragmento,
          pecas: cmp.pecas,
          estritos: cmp.estritos,
          tsPerdeuArea: cmp.tsPerdeuArea,
          faixas: ref.filter((i) => i.faixa).length,
          contorno: ref.filter((i) => i.contorno).length,
          atravessa: ref.filter((i) => i.atravessa).length,
          comEnvoltas: ref.filter((i) => i.bruto.length > 1).length,
          desvio: cmp.desvioMaximo,
        });
      }
    }
  } finally {
    cena.destruir();
  }
  return cov;
}

describe.skipIf(!bytes)('A2: itens_pintados do Rust x motor TypeScript', () => {
  const pula = (): boolean => ger === null;

  it('projetos de estresse (várias sementes): identidade exata, área a 1e-6 e coordenadas a 1 µm, com cobertura dos casos', () => {
    if (pula()) return;
    const total = zero();
    for (let semente = 1; semente <= 8; semente++) soma(total, compararProjeto(projetoDeEstresseA2(semente, { paredes: 30, pavimentos: 2 }), semente));
    // Sem cobertura o teste seria vazio.
    expect(total.faixas, 'faixas verticais').toBeGreaterThan(0);
    expect(total.contorno, 'itens de contorno').toBeGreaterThan(0);
    expect(total.atravessa, 'paredes que atravessam um T').toBeGreaterThan(0);
    expect(total.comEnvoltas, 'itens com retorno de ponta (wrapEnds)').toBeGreaterThan(0);
    expect(total.comFragmento).toBeGreaterThan(1000);
    // Estatística: parte dos fragmentos casa também peça a peça (o resto difere só em ruído topológico, ver kernel-harness-a2.mts).
    expect(total.estritos / total.itens).toBeGreaterThan(0.6);
    expect(total.tsPerdeuArea / total.itens, 'perdas de área do polygon-clipping do TS').toBeLessThan(0.01);
    console.log(`[A2] itens ${total.itens}, estritos ${total.estritos}, desvio ${total.desvio}`);
    expect(total.desvio).toBeLessThanOrEqual(1e-6);
  }, 600_000);

  it('retas puras sem ruído, e só arcos', () => {
    if (pula()) return;
    for (let semente = 100; semente < 103; semente++) {
      // (o caso de arcos é lento no polygon-clipping do TS: poucas sementes e paredes)
      compararProjeto(projetoDeEstresseA2(semente, { paredes: 60, pavimentos: 1, curvas: 0, ruido: false }), semente);
      compararProjeto(projetoDeEstresseA2(semente, { paredes: 12, pavimentos: 1, curvas: 1 }), semente);
    }
  }, 600_000);

  it('sintéticos de 10 e 20 pavimentos', () => {
    if (pula()) return;
    for (const n of [10, 20]) {
      const c = compararProjeto(syntheticProject(n), 0, false);
      expect(c.itens).toBeGreaterThan(32 * n);
    }
  });

  it('fixture do repositório (casa de 2 quartos)', () => {
    if (pula()) return;
    const p = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
    const c = compararProjeto(p, 0);
    expect(c.comFragmento).toBeGreaterThan(0);
  });

  it('propriedades: fragmentos de uma parede não se sobrepõem e a área do fragmento não passa da bruta', () => {
    if (pula()) return;
    for (let semente = 200; semente < 212; semente++) {
      const p = projetoDeEstresseA2(semente, { paredes: 40, pavimentos: 1 });
      const { cena, a1 } = cenaDe(p);
      try {
        const l = p.levels[0]!;
        const itens = decodificarA2(cena.consultar('itens_pintados', argumentosA2(p, l.id, a1, {})));
        for (const it of itens) {
          expect(areaDaForma(it.fragmento), `fragmento maior que o bruto (parede ${it.parede})`).toBeLessThanOrEqual(areaDaForma(it.bruto) + 1e-6);
        }
        // mesma prioridade e parede diferente: fragmentos disjuntos entre si não se sobrepõem em planta (união = soma das áreas)
        const emPlanta = itens.filter((i) => i.emPlanta);
        for (let i = 0; i < emPlanta.length; i++) {
          for (let j = i + 1; j < emPlanta.length; j++) {
            const a = emPlanta[i]!;
            const b = emPlanta[j]!;
            if (a.grupo !== b.grupo || a.parede === b.parede || a.prioridade !== b.prioridade) continue;
            expect(sobreposicao(a.fragmento, b.fragmento), `paredes ${a.parede} e ${b.parede}`).toBeLessThanOrEqual(1e-6);
          }
        }
      } finally {
        cena.destruir();
      }
    }
  });

  it('entradas inválidas viram falha leve, nunca panic', () => {
    if (pula()) return;
    const p = projetoDeEstresseA2(3, { paredes: 10, pavimentos: 1 });
    const { cena, a1 } = cenaDe(p);
    const base = argumentosA2(p, p.levels[0]!.id, a1, {});
    try {
      expect(() => cena.consultar('itens_pintados', [0xffffffff, 0.02, 0, 0, 0])).toThrow(ErroKernelLeve); // todos os níveis
      expect(() => cena.consultar('itens_pintados', [0, -1, 0, 0, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('itens_pintados', [0, 0.02, 2, 0, 0])).toThrow(ErroKernelLeve); // flag fora de 0/1
      expect(() => cena.consultar('itens_pintados', [0, 0.02, 1, Number.NaN, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('itens_pintados', [0, 0.02, 0, 0, 3, 1])).toThrow(ErroKernelLeve); // n_contorno não bate
      expect(() => cena.consultar('itens_pintados', [0, 0.02, 0, 0, 1, 0.5])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('itens_pintados', [0, 0.02])).toThrow(ErroKernelLeve);
      expect(cena.consultar('itens_pintados', base)['itens']!.length).toBeGreaterThan(0);
      // parede sem cota real
      cena.remover('paredes_z', [a1.secoes.paredes['id_num']![0]!]);
      expect(() => cena.consultar('itens_pintados', base)).toThrow(ErroKernelLeve);
      // faixas incoerentes com n_faixas
      const { cena: c2, a1: b2 } = cenaDe(projetoDeEstresseA2(5, { paredes: 10, pavimentos: 1 }));
      try {
        c2.definirSecao('faixas', { id_num: [], tipo_num: [], indice: [], lado: [], material_num: [], espessura: [], z0: [], z1: [] }, 0);
        const nFaixas = b2.secoes.tipos_parede['n_faixas']!.reduce((s, v) => s + v, 0);
        if (nFaixas > 0) expect(() => c2.consultar('itens_pintados', argumentosA2(p, p.levels[0]!.id, b2, {}))).toThrow(ErroKernelLeve);
      } finally {
        c2.destruir();
      }
    } finally {
      cena.destruir();
    }
  });

  it('sem vazamento de memória depois de destruir a cena', () => {
    if (pula()) return;
    const antes = ger!.instancia().exports.memoria_usada();
    compararProjeto(projetoDeEstresseA2(11, { paredes: 40, pavimentos: 2 }), 11);
    expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
  });
});

/** Área da interseção aproximada pela soma das áreas menos a união (ambas pelo `ops` do próprio motor TS). */
import { intersection } from '@hestia/geom';
function sobreposicao(a: Parameters<typeof areaDaForma>[0], b: Parameters<typeof areaDaForma>[0]): number {
  if (a.length === 0 || b.length === 0) return 0;
  return areaDaForma(intersection(a, b));
}
