/**
 * Equivalência da sub-etapa A3b (decisão 0047 §7): `retornos_geom` do Rust x extração do motor TypeScript
 * (`packages/engine/src/kernelA3.ts`: `insertMode` e `insertReturns` de `wrap.ts` e `makeReturnClipper` de `clipReturn.ts`
 * sobre o pintado em planta do grupo), por pavimento e retorno a retorno. Roda só em `npm run test:wasm`. Identidade por
 * igualdade exata, formas a 1 µm e 1e-6 m² (região quando a booleana diverge por ruído topológico); nunca se afrouxa.
 */
import { existsSync, readFileSync } from 'node:fs';
import { difference, intersection, type MultiPolygon } from '@hestia/geom';
import { migrateProject, type Project } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { argumentosA2, decodificarA2 } from '../packages/engine/src/kernelA2.ts';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { argumentosA3, argumentosA3b, decodificarA3a, decodificarA3b, montarCenaA3, referenciaA3b } from '../packages/engine/src/kernelA3.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { areaDaForma } from '../scripts/kernel-harness-a2.mts';
import { compararA3b } from '../scripts/kernel-harness-a3.mts';
import { casosDeLimiarA3b, projetoDeEstresseA3a } from '../scripts/kernel-a3a-estresse.mts';

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
  retornos: number;
  porModo: [number, number, number, number];
  recortados: number;
  formas: number;
  estritas: number;
  desvio: number;
  fiapos: number;
  fiaposRust: number;
}
const zero = (): Cobertura => ({ retornos: 0, porModo: [0, 0, 0, 0], recortados: 0, formas: 0, estritas: 0, desvio: 0, fiapos: 0, fiaposRust: 0 });
const soma = (a: Cobertura, b: Cobertura): void => {
  a.retornos += b.retornos;
  b.porModo.forEach((x, i) => (a.porModo[i] = a.porModo[i]! + x));
  a.recortados += b.recortados;
  a.formas += b.formas;
  a.estritas += b.estritas;
  a.desvio = Math.max(a.desvio, b.desvio);
  a.fiapos += b.fiapos;
  a.fiaposRust += b.fiaposRust;
};

function compararProjeto(p: Project): Cobertura {
  const { cena, a1, a3 } = cenaDe(p);
  const cov = zero();
  try {
    for (const l of p.levels) {
      const ref = referenciaA3b(p, l.id, a1, a3);
      const rust = decodificarA3b(cena.consultar('retornos_geom', argumentosA3b(p, l.id, a1)));
      const cmp = compararA3b(ref, rust);
      expect(cmp.divergencias, `${l.id}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
      soma(cov, { retornos: cmp.retornos, porModo: cmp.porModo, recortados: cmp.recortados, formas: cmp.formas, estritas: cmp.estritas, desvio: cmp.desvioMaximo, fiapos: cmp.fiapos, fiaposRust: cmp.fiaposRust });
    }
  } finally {
    cena.destruir();
  }
  return cov;
}

describe.skipIf(!bytes)('A3b: retornos_geom do Rust x motor TypeScript', () => {
  const pula = (): boolean => ger === null;

  it('projetos de estresse (várias sementes): identidade exata, formas a 1 µm e 1e-6 m², com cobertura dos modos', () => {
    if (pula()) return;
    const total = zero();
    for (let semente = 1; semente <= 12; semente++) soma(total, compararProjeto(projetoDeEstresseA3a(semente, { paredes: 30, pavimentos: 2 })));
    expect(total.retornos, 'retornos comparados').toBeGreaterThan(500);
    expect(total.porModo[1], 'modo exterior').toBeGreaterThan(20);
    expect(total.porModo[2], 'modo interior').toBeGreaterThan(20);
    expect(total.porModo[3], 'modo both').toBeGreaterThan(100);
    expect(total.recortados, 'retornos recortados por parede vizinha').toBeGreaterThan(0);
    console.log(`[A3b] retornos ${total.retornos} (exterior ${total.porModo[1]}, interior ${total.porModo[2]}, both ${total.porModo[3]}), recortados ${total.recortados}, formas estritas ${total.estritas}/${total.formas}, desvio ${total.desvio}, fiapos ${total.fiapos} (${((100 * total.fiapos) / (total.retornos + total.fiapos)).toFixed(1)}%)`);
    // Fiapos (retorno presente só de um lado, área <= 1e-6 m²): medido 146 de 722 retornos (20,2%) no estresse das sementes 1..12;
    // o limite 25% dá margem pequena e pega uma mudança que faça o Rust deixar de devolver retornos de verdade.
    expect(total.fiaposRust, 'fiapos só do Rust: o Rust não inventa retornos').toBe(0);
    expect(total.fiapos / (total.retornos + total.fiapos), 'fração de fiapos').toBeLessThanOrEqual(0.25);
  }, 120_000);

  it('só retas, e só arcos', () => {
    if (pula()) return;
    let arcos = 0;
    for (let semente = 100; semente < 104; semente++) {
      compararProjeto(projetoDeEstresseA3a(semente, { paredes: 40, pavimentos: 1, curvas: 0, ruido: false }));
      arcos += compararProjeto(projetoDeEstresseA3a(semente, { paredes: 20, pavimentos: 1, curvas: 1 })).retornos;
    }
    expect(arcos, 'retornos em parede curva').toBeGreaterThan(20);
  });

  it('casos de limiar: cada lado do limiar bate com o motor TypeScript', () => {
    if (pula()) return;
    const casos = casosDeLimiarA3b();
    expect(casos.length).toBeGreaterThanOrEqual(4);
    for (const c of casos) {
      const cov = compararProjeto(c.projeto);
      expect(cov.fiaposRust, `${c.limiar} · ${c.lado}`).toBe(0);
    }
  });

  it('sintéticos de 10 e 20 pavimentos', () => {
    if (pula()) return;
    for (const n of [10, 20]) compararProjeto(syntheticProject(n));
  });

  it('fixture do repositório (casa de 2 quartos)', () => {
    if (pula()) return;
    const p = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
    compararProjeto(p);
  });

  it('propriedades: retorno na vizinhança do vão, recorte dentro do retorno e fora das paredes vizinhas', () => {
    if (pula()) return;
    let verificados = 0;
    for (let semente = 300; semente < 306; semente++) {
      const p = projetoDeEstresseA3a(semente, { paredes: 24, pavimentos: 1 });
      const { cena, a1 } = cenaDe(p);
      try {
        const l = p.levels[0]!;
        const vaos = new Map(decodificarA3a(cena.consultar('aberturas_geom', argumentosA3(a1, l.id))).map((g) => [g.id, g] as const));
        const itens = decodificarA2(cena.consultar('itens_pintados', argumentosA2(p, l.id, a1)));
        const retornos = decodificarA3b(cena.consultar('retornos_geom', argumentosA3b(p, l.id, a1)));
        for (const r of retornos) {
          const g = vaos.get(r.abertura)!;
          // vizinhança do vão: ao longo de u até meia largura do vão + 0,25 m; através, até meia espessura + 0,6 m (a faixa de
          // uma parede curva e as bordas laterais de 0,2 m)
          for (const pol of r.bruto) {
            for (const anel of pol) {
              for (const q of anel) {
                const dx = q.x - g.centro.x;
                const dy = q.y - g.centro.y;
                expect(Math.abs(dx * g.u.x + dy * g.u.y)).toBeLessThanOrEqual(g.vaoLargura / 2 + 0.25);
                expect(Math.abs(dx * g.n.x + dy * g.n.y)).toBeLessThanOrEqual(g.espessura / 2 + 0.6);
              }
            }
          }
          // o recorte só tira: está dentro do retorno
          if (r.recorte.length > 0 && r.bruto.length > 0) expect(areaDaForma(difference(r.recorte, r.bruto))).toBeLessThanOrEqual(1e-6);
          // e não invade o pintado das outras paredes do grupo (em planta)
          const vizinhos: MultiPolygon[] = itens.filter((it) => it.grupo === r.grupo && it.parede !== r.parede && it.emPlanta && it.fragmento.length > 0).map((it) => it.fragmento);
          for (const v of vizinhos) if (r.recorte.length > 0) expect(areaDaForma(intersection(r.recorte, v))).toBeLessThanOrEqual(1e-6);
          verificados++;
        }
      } finally {
        cena.destruir();
      }
    }
    expect(verificados).toBeGreaterThan(50);
  });

  it('upsert e remoção na cena viva seguem o projeto', () => {
    if (pula()) return;
    const p = projetoDeEstresseA3a(5, { paredes: 20, pavimentos: 1 });
    const { cena, a1, a3 } = cenaDe(p);
    try {
      const l = p.levels[0]!;
      const args = argumentosA3b(p, l.id, a1);
      const antes = decodificarA3b(cena.consultar('retornos_geom', args));
      expect(antes.length).toBeGreaterThan(5);
      const ab = antes[0]!.abertura;
      cena.remover('aberturas', [ab]);
      const depois = decodificarA3b(cena.consultar('retornos_geom', args));
      expect(depois.some((r) => r.abertura === ab)).toBe(false);
      expect(depois.length).toBeLessThan(antes.length);
      const c = a3.secoes.aberturas;
      const i = c['id_num']!.indexOf(ab);
      cena.upsert('aberturas', Object.fromEntries(Object.entries(c).map(([k, v]) => [k, [v[i]!]])), 1);
      expect(decodificarA3b(cena.consultar('retornos_geom', args)).length).toBe(antes.length);
    } finally {
      cena.destruir();
    }
  });

  it('entradas inválidas viram falha leve, nunca panic', () => {
    if (pula()) return;
    const p = projetoDeEstresseA3a(3, { paredes: 10, pavimentos: 1 });
    const { cena, a1, a3 } = cenaDe(p);
    try {
      expect(() => cena.consultar('retornos_geom', [0xffffffff, 0.02, 0, 0, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('retornos_geom', [0, 0.02, 0, 0])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('retornos_geom', [0, -1, 0, 0, 0])).toThrow(ErroKernelLeve);
      const t = a3.secoes.tipos_abertura;
      const n = a3.nLinhas.tipos_abertura;
      expect(() => cena.definirSecao('tipos_abertura', { ...t, fechamento: t['fechamento']!.map(() => 5) }, n)).toThrow(ErroKernelLeve);
      expect(() => cena.definirSecao('tipos_abertura', { ...t, estilo_batente: t['estilo_batente']!.map(() => 4) }, n)).toThrow(ErroKernelLeve);
      expect(() => cena.definirSecao('tipos_abertura', { ...t, modo_prof: t['modo_prof']!.map(() => 3) }, n)).toThrow(ErroKernelLeve);
      expect(() => cena.definirSecao('tipos_abertura', { ...t, larg_batente: t['larg_batente']!.map(() => Number.NaN) }, n)).toThrow(ErroKernelLeve);
      const w = a1.secoes.tipos_parede;
      expect(() => cena.definirSecao('tipos_parede', { ...w, wrap_inserts: w['wrap_inserts']!.map(() => 4) }, a1.nLinhas.tipos_parede)).toThrow(ErroKernelLeve);
      cena.definirSecao('tipos_abertura', Object.fromEntries(Object.keys(t).map((k) => [k, []])), 0);
      expect(() => cena.consultar('retornos_geom', argumentosA3b(p, p.levels[0]!.id, a1))).toThrow(ErroKernelLeve);
    } finally {
      cena.destruir();
    }
  });

  it('sem vazamento de memória depois de destruir a cena', () => {
    if (pula()) return;
    const antes = ger!.instancia().exports.memoria_usada();
    compararProjeto(projetoDeEstresseA3a(11, { paredes: 40, pavimentos: 2 }));
    expect(ger!.instancia().exports.memoria_usada()).toBe(antes);
  });
});
