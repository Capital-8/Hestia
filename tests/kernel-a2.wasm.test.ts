/**
 * Equivalência da sub-etapa A2 (decisão 0047): `itens_pintados` do Rust x extração do motor TypeScript
 * (`packages/engine/src/kernelA2.ts`: `buildItems` e `paint` de `resolve.ts`), por pavimento e item a item.
 * Roda só em `npm run test:wasm` (vitest.wasm.config.ts); o CI aponta `KERNEL_WASM_PATH` para o binário recém-compilado.
 * Identidade por igualdade exata, área do fragmento a 1e-6 m², coordenadas a 1 µm; nunca se afrouxa.
 * Os estresses vão uma semente por teste (cada `it` fica bem abaixo de 30 s, para o worker do vitest não estourar o RPC);
 * os helpers estão em kernel-a2.wasm.helpers.ts e as retas/arcos puros, em kernel-a2-retas.wasm.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { migrateProject } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { argumentosA2, decodificarA2 } from '../packages/engine/src/kernelA2.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { projetoDeEstresseA2 } from '../scripts/kernel-a2-estresse.mts';
import { areaDaForma, cenaDe, compararProjeto, soma, sobreposicao, zero } from './kernel-a2.wasm.helpers.ts';

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

/** Acumulador dos estresses (um teste por semente soma aqui; o teste agregado confere o total). Ordem sequencial dentro do arquivo. */
const total = zero();
const SEMENTES_ESTRESSE = [1, 2, 3, 4, 5, 6, 7, 8];

describe.skipIf(!bytes)('A2: itens_pintados do Rust x motor TypeScript', () => {
  const pula = (): boolean => ger === null;

  for (const semente of SEMENTES_ESTRESSE) {
    it(`projetos de estresse, semente ${semente}: identidade exata, área a 1e-6 e coordenadas a 1 µm`, () => {
      if (pula()) return;
      soma(total, compararProjeto(ger!, projetoDeEstresseA2(semente, { paredes: 30, pavimentos: 2 }), semente));
    });
  }

  it('projetos de estresse (agregado das sementes 1 a 8): cobertura dos casos e desvio máximo', () => {
    if (pula()) return;
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
  });

  it('sintéticos de 10 e 20 pavimentos', () => {
    if (pula()) return;
    for (const n of [10, 20]) {
      const c = compararProjeto(ger!, syntheticProject(n), 0, false);
      expect(c.itens).toBeGreaterThan(32 * n);
    }
  });

  it('fixture do repositório (casa de 2 quartos)', () => {
    if (pula()) return;
    const p = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
    const c = compararProjeto(ger!, p, 0);
    expect(c.comFragmento).toBeGreaterThan(0);
  });

  it('propriedades: fragmentos de uma parede não se sobrepõem e a área do fragmento não passa da bruta', () => {
    if (pula()) return;
    for (let semente = 200; semente < 212; semente++) {
      const p = projetoDeEstresseA2(semente, { paredes: 40, pavimentos: 1 });
      const { cena, a1 } = cenaDe(ger!, p);
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
    const { cena, a1 } = cenaDe(ger!, p);
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
      const { cena: c2, a1: b2 } = cenaDe(ger!, projetoDeEstresseA2(5, { paredes: 10, pavimentos: 1 }));
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
    compararProjeto(ger!, projetoDeEstresseA2(11, { paredes: 40, pavimentos: 2 }), 11);
    expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
  });
});
