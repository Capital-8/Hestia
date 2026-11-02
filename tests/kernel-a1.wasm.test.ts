/**
 * Equivalência da sub-etapa A1 (decisão 0047): `quadros_e_juncoes` do Rust x extração do motor TypeScript
 * (`packages/engine/src/kernelA1.ts`), por pavimento, em projetos de estresse e nos fixtures do repositório.
 * Roda só em `npm run test:wasm` (vitest.wasm.config.ts); o CI aponta `KERNEL_WASM_PATH` para o binário recém-compilado.
 * Tolerância de 1 µm nas coordenadas e igualdade exata da topologia; nunca se afrouxa.
 */
import { existsSync, readFileSync } from 'node:fs';
import { migrateProject, type Project } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { montarCenaA1, referenciaA1, type SaidaA1 } from '../packages/engine/src/kernelA1.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararA1 } from '../scripts/kernel-harness-a1.mts';
import { casosDeLimiar, projetoDeEstresse } from '../scripts/kernel-a1-estresse.mts';

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
      paredes_quadro: { colunas: s.paredes_quadro, n: n.paredes_quadro },
    })),
  );
  return { cena, a1 };
};

/** Compara todos os pavimentos e devolve estatísticas de cobertura. */
function compararProjeto(p: Project): { cortes: number[]; estados: number[]; cordas: number; arcos: number; grupos: number; paredes: number; desvio: number } {
  const { cena, a1 } = cenaDe(p);
  const tol = p.settings?.joinTolerance ?? 0.02;
  const cov = { cortes: [0, 0, 0, 0], estados: [0, 0, 0, 0, 0], cordas: 0, arcos: 0, grupos: 0, paredes: 0, desvio: 0 };
  try {
    p.levels.forEach((l, nivel) => {
      const ref = referenciaA1(p, l.id, a1);
      const rust = cena.consultar('quadros_e_juncoes', [nivel, tol]);
      const cmp = compararA1(ref, rust);
      expect(cmp.divergencias, `${l.id}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
      cov.desvio = Math.max(cov.desvio, cmp.desvioMaximo);
      for (let i = 0; i < ref.pontas_cab.length; i += 3) cov.cortes[ref.pontas_cab[i]!]!++;
      for (let i = 0; i < ref.estado_pontas.length; i += 4) cov.estados[ref.estado_pontas[i]!]!++;
      cov.cordas += ref.cordas.length / 5;
      for (let i = 0; i < ref.arco.length; i += 8) cov.arcos += ref.arco[i]!;
      cov.grupos += new Set(ref.grupos).size;
      cov.paredes += ref.ids.length;
    });
  } finally {
    cena.destruir();
  }
  return cov;
}

describe.skipIf(!bytes)('A1: quadros_e_juncoes do Rust x motor TypeScript', () => {
  const pula = (): boolean => ger === null;

  it('projetos de estresse (várias sementes): topologia exata e coordenadas a 1 µm, com cobertura de todos os tipos de corte', () => {
    if (pula()) return;
    const total = { cortes: [0, 0, 0, 0], estados: [0, 0, 0, 0, 0], cordas: 0, arcos: 0, grupos: 0, paredes: 0, desvio: 0 };
    for (let semente = 1; semente <= 40; semente++) {
      const c = compararProjeto(projetoDeEstresse(semente, { paredes: 40, pavimentos: 2 }));
      c.cortes.forEach((v, i) => (total.cortes[i]! += v));
      c.estados.forEach((v, i) => (total.estados[i]! += v));
      total.cordas += c.cordas;
      total.arcos += c.arcos;
      total.grupos += c.grupos;
      total.paredes += c.paredes;
      total.desvio = Math.max(total.desvio, c.desvio);
    }
    // Sem cobertura o teste seria vazio: todos os tipos de corte e de estado precisam ter aparecido.
    expect(total.cortes.every((v) => v > 0), `cortes reto/esquadria/degraus/plano: ${total.cortes}`).toBe(true);
    expect(total.estados.every((v) => v > 0), `estados livre/proibida/par/nó/tee: ${total.estados}`).toBe(true);
    expect(total.arcos).toBeGreaterThan(0);
    expect(total.cordas).toBeGreaterThan(0);
    expect(total.grupos).toBeGreaterThan(40);
    expect(total.desvio).toBeLessThanOrEqual(1e-6);
  });

  it('sem ruído e sem arcos (retas puras), e só com arcos', () => {
    if (pula()) return;
    for (let semente = 100; semente < 110; semente++) {
      compararProjeto(projetoDeEstresse(semente, { paredes: 60, pavimentos: 1, curvas: 0, ruido: false }));
      compararProjeto(projetoDeEstresse(semente, { paredes: 30, pavimentos: 1, curvas: 1 }));
    }
  });

  it('sintéticos de 10 e 20 pavimentos', () => {
    if (pula()) return;
    for (const n of [10, 20]) {
      const c = compararProjeto(syntheticProject(n));
      expect(c.paredes).toBe(32 * n);
    }
  });

  it('fixture do repositório (casa de 2 quartos)', () => {
    if (pula()) return;
    const p = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
    const c = compararProjeto(p);
    expect(c.paredes).toBeGreaterThan(0);
  });

  it('upsert e remoção de linhas refletem na consulta (a cena do Rust é cache do projeto)', () => {
    if (pula()) return;
    const p = projetoDeEstresse(7, { paredes: 20, pavimentos: 1 });
    const { cena, a1 } = cenaDe(p);
    try {
      const antes = cena.consultar('quadros_e_juncoes', [0, 0.02])['ids']!.length;
      const primeiro = a1.secoes.paredes['id_num']![0]!;
      cena.remover('paredes', [primeiro]);
      cena.remover('paredes_quadro', [primeiro]);
      expect(cena.consultar('quadros_e_juncoes', [0, 0.02])['ids']!.length).toBe(antes - 1);
    } finally {
      cena.destruir();
    }
  });

  it('entradas inválidas viram falha leve, nunca panic', () => {
    if (pula()) return;
    const p = projetoDeEstresse(3, { paredes: 10, pavimentos: 1 });
    const { cena, a1 } = cenaDe(p);
    try {
      expect(() => cena.consultar('quadros_e_juncoes', [0xffffffff, 0.02])).toThrow(ErroKernelLeve); // todos os níveis
      expect(() => cena.consultar('quadros_e_juncoes', [0, -1])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('quadros_e_juncoes', [0.5, 0.02])).toThrow(ErroKernelLeve);
      // parede sem linha em paredes_quadro
      cena.remover('paredes_quadro', [a1.secoes.paredes['id_num']![0]!]);
      expect(() => cena.consultar('quadros_e_juncoes', [0, 0.02])).toThrow(ErroKernelLeve);
      // enum fora do domínio
      const ruim = { ...a1.secoes.paredes_quadro, linha_loc: a1.secoes.paredes_quadro['linha_loc']!.map(() => 9) };
      expect(() => cena.definirSecao('paredes_quadro', ruim, a1.nLinhas.paredes_quadro)).toThrow(ErroKernelLeve);
      // tipo inexistente
      cena.definirSecao('tipos_parede', { id_num: [], n_camadas: [] }, 0);
      expect(() => cena.consultar('quadros_e_juncoes', [0, 0.02])).toThrow(ErroKernelLeve);
    } finally {
      cena.destruir();
    }
  });

  it('sem vazamento de memória depois de destruir a cena', () => {
    if (pula()) return;
    const antes = ger!.instancia().exports.memoria_usada();
    compararProjeto(projetoDeEstresse(11, { paredes: 40, pavimentos: 2 }));
    expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
  });
});

/**
 * Duas saídas do TypeScript diferem em alguma topologia ou coordenada. Comparação exata de propósito: é só um teste de
 * que o caso enxerga a variável. No clamp de 0,01 m a função é contínua na fronteira, então a diferença entre os lados é
 * a própria margem (~3e-7 m); quem prova a sensibilidade ali é a mutação contra o Rust, não esta checagem.
 */
const saidasDiferem = (x: SaidaA1, y: SaidaA1): boolean =>
  (Object.keys(x) as Array<keyof SaidaA1>).some((k) => {
    const a = x[k];
    const b = y[k];
    if (a.length !== b.length) return true;
    return a.some((v, i) => {
      const w = b[i]!;
      if (Number.isNaN(v) || Number.isNaN(w)) return Number.isNaN(v) !== Number.isNaN(w);
      return v !== w;
    });
  });

describe('A1: cada limiar de decisão muda a saída do motor TypeScript entre os dois lados', () => {
  // Sem wasm: prova que os casos discriminam. Se o caso de um limiar não mudar nada, a mutação dele seria invisível.
  const porLimiar = new Map<string, Partial<Record<'abaixo' | 'acima', Project>>>();
  for (const c of casosDeLimiar()) porLimiar.set(c.limiar, { ...porLimiar.get(c.limiar), [c.lado]: c.projeto });
  for (const [limiar, lados] of porLimiar) {
    it(limiar, () => {
      const ref = (p: Project): SaidaA1 => referenciaA1(p, 'lv_0', montarCenaA1(p));
      expect(lados.abaixo && lados.acima).toBeTruthy();
      expect(saidasDiferem(ref(lados.abaixo!), ref(lados.acima!))).toBe(true);
    });
  }
});

describe.skipIf(!bytes)('A1: limiares de decisão, nos dois lados de cada um (margem de 1e-6 relativo)', () => {
  for (const c of casosDeLimiar()) {
    it(`${c.limiar} · ${c.lado} do valor ${c.valor}`, () => {
      if (ger === null) return;
      compararProjeto(c.projeto);
    });
  }
});
