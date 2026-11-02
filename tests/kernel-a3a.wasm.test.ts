/**
 * Equivalência da sub-etapa A3a (decisão 0047 §7): `aberturas_geom` do Rust x extração do motor TypeScript
 * (`packages/engine/src/kernelA3.ts`: `openingGeometry` de `resolve.ts` e `openingRect` de `openingCut.ts`), por pavimento e
 * abertura a abertura. Roda só em `npm run test:wasm` (vitest.wasm.config.ts); o CI aponta `KERNEL_WASM_PATH` para o
 * binário recém-compilado. Identidade por igualdade exata, números a 1 µm, área do furo a 1e-6 m²; nunca se afrouxa.
 */
import { existsSync, readFileSync } from 'node:fs';
import { migrateProject, type Project } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { argumentosA3, decodificarA3a, montarCenaA3, referenciaA3a, type AberturaA3 } from '../packages/engine/src/kernelA3.ts';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararA3 } from '../scripts/kernel-harness-a3.mts';
import { casosDeLimiarA3a, projetoDeEstresseA3a } from '../scripts/kernel-a3a-estresse.mts';

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

type CenaDoProjeto = { cena: CenaV2; a1: ReturnType<typeof montarCenaA1>; a3: ReturnType<typeof montarCenaA3> };

const cenaDe = (p: Project): CenaDoProjeto => {
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
  aberturas: number;
  arcos: number;
  janelas: number;
  flips: number;
  comPeitorilOverride: number;
  comAlturaOverride: number;
  comFolga: number;
  planos: Set<number>;
  folhas: Set<number>;
  desvio: number;
}
const zero = (): Cobertura => ({ aberturas: 0, arcos: 0, janelas: 0, flips: 0, comPeitorilOverride: 0, comAlturaOverride: 0, comFolga: 0, planos: new Set(), folhas: new Set(), desvio: 0 });
const soma = (a: Cobertura, b: Cobertura): void => {
  a.aberturas += b.aberturas;
  a.arcos += b.arcos;
  a.janelas += b.janelas;
  a.flips += b.flips;
  a.comPeitorilOverride += b.comPeitorilOverride;
  a.comAlturaOverride += b.comAlturaOverride;
  a.comFolga += b.comFolga;
  b.planos.forEach((x) => a.planos.add(x));
  b.folhas.forEach((x) => a.folhas.add(x));
  a.desvio = Math.max(a.desvio, b.desvio);
};

/** Compara todos os pavimentos e devolve estatísticas de cobertura. */
function compararProjeto(p: Project): Cobertura {
  const { cena, a1, a3 } = cenaDe(p);
  const cov = zero();
  try {
    for (const l of p.levels) {
      const ref = referenciaA3a(p, l.id, a1, a3);
      const rust = decodificarA3a(cena.consultar('aberturas_geom', argumentosA3(a1, l.id)));
      const cmp = compararA3(ref, rust);
      expect(cmp.divergencias, `${l.id}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
      cov.aberturas += cmp.aberturas;
      cov.arcos += cmp.arcos;
      cov.desvio = Math.max(cov.desvio, cmp.desvioMaximo);
      for (const g of ref) {
        cov.planos.add(g.plano);
        cov.folhas.add(g.folhas);
        if (g.janela) cov.janelas++;
        if (g.flipMao || g.flipFrente) cov.flips++;
      }
    }
    for (const o of Object.values(p.elements)) {
      if (o.kind !== 'door' && o.kind !== 'window') continue;
      if (o.sillOverride !== null && o.sillOverride !== undefined) cov.comPeitorilOverride++;
      if (typeof o.heightOverride === 'number') cov.comAlturaOverride++;
      const t = p.openingTypes[o.typeId];
      if (t?.roughOversize && (t.roughOversize.w !== 0 || t.roughOversize.h !== 0)) cov.comFolga++;
    }
  } finally {
    cena.destruir();
  }
  return cov;
}

describe.skipIf(!bytes)('A3a: aberturas_geom do Rust x motor TypeScript', () => {
  const pula = (): boolean => ger === null;

  it('projetos de estresse (várias sementes): identidade exata e números a 1 µm, com cobertura dos casos', () => {
    if (pula()) return;
    const total = zero();
    for (let semente = 1; semente <= 12; semente++) soma(total, compararProjeto(projetoDeEstresseA3a(semente, { paredes: 30, pavimentos: 2 })));
    expect(total.aberturas, 'aberturas comparadas').toBeGreaterThan(300);
    expect(total.arcos, 'aberturas em parede curva').toBeGreaterThan(20);
    expect(total.janelas).toBeGreaterThan(20);
    expect(total.flips).toBeGreaterThan(20);
    expect(total.comPeitorilOverride, 'peitoril por instância').toBeGreaterThan(20);
    expect(total.comAlturaOverride, 'altura por instância').toBeGreaterThan(20);
    expect(total.comFolga, 'tipos com folga do vão').toBeGreaterThan(0);
    expect(total.planos.size, 'famílias de planta').toBe(16);
    expect(total.folhas.size, 'contagens de folhas').toBe(5);
    console.log(`[A3a] aberturas ${total.aberturas}, em arco ${total.arcos}, desvio ${total.desvio}`);
    expect(total.desvio).toBeLessThanOrEqual(1e-6);
  }, 120_000);

  it('só retas, e só arcos', () => {
    if (pula()) return;
    for (let semente = 100; semente < 104; semente++) {
      const retas = compararProjeto(projetoDeEstresseA3a(semente, { paredes: 40, pavimentos: 1, curvas: 0, ruido: false }));
      expect(retas.arcos).toBe(0);
      const curvas = compararProjeto(projetoDeEstresseA3a(semente, { paredes: 20, pavimentos: 1, curvas: 1 }));
      expect(curvas.arcos).toBe(curvas.aberturas);
      expect(curvas.aberturas).toBeGreaterThan(0);
    }
  });

  it('casos de limiar: cada lado do limiar bate com o motor TypeScript', () => {
    if (pula()) return;
    const casos = casosDeLimiarA3a();
    expect(casos.length).toBeGreaterThanOrEqual(14);
    for (const c of casos) {
      const cov = compararProjeto(c.projeto);
      expect(cov.aberturas, `${c.limiar} · ${c.lado}`).toBe(1);
    }
  });

  it('sintéticos de 10 e 20 pavimentos', () => {
    if (pula()) return;
    for (const n of [10, 20]) {
      const c = compararProjeto(syntheticProject(n));
      expect(c.aberturas).toBe(n);
    }
  });

  it('fixture do repositório (casa de 2 quartos)', () => {
    if (pula()) return;
    const p = migrateProject(JSON.parse(readFileSync(new URL('../packages/engine/src/fixtures/casa-2-quartos.hestia.json', import.meta.url), 'utf8')));
    const c = compararProjeto(p);
    expect(c.aberturas).toBeGreaterThan(0);
  });

  it('propriedades: u e n ortonormais, furo centrado e com a área do vão, meia profundidade só em arco, invariância à translação', () => {
    if (pula()) return;
    for (let semente = 300; semente < 308; semente++) {
      const p = projetoDeEstresseA3a(semente, { paredes: 24, pavimentos: 1 });
      const { cena, a1 } = cenaDe(p);
      const dx = 123.456;
      const dy = -78.9;
      const deslocado: Project = { ...p, elements: Object.fromEntries(Object.entries(p.elements).map(([id, e]) => [id, e.kind === 'wall' ? { ...e, a: { x: e.a.x + dx, y: e.a.y + dy }, b: { x: e.b.x + dx, y: e.b.y + dy } } : e])) };
      const { cena: cenaD, a1: a1D } = cenaDe(deslocado);
      try {
        const l = p.levels[0]!;
        const itens = decodificarA3a(cena.consultar('aberturas_geom', argumentosA3(a1, l.id)));
        const itensD = decodificarA3a(cenaD.consultar('aberturas_geom', argumentosA3(a1D, l.id)));
        expect(itens.length).toBeGreaterThan(0);
        expect(itensD.length).toBe(itens.length);
        itens.forEach((g: AberturaA3, i) => {
          expect(Math.hypot(g.u.x, g.u.y)).toBeCloseTo(1, 12);
          expect(g.u.x * g.n.x + g.u.y * g.n.y).toBeCloseTo(0, 12);
          expect(g.vaoLargura).toBeGreaterThanOrEqual(g.largura - 1e-12);
          const ring = g.retangulo[0]![0]!;
          const cx = ring.reduce((s, q) => s + q.x, 0) / 4;
          const cy = ring.reduce((s, q) => s + q.y, 0) / 4;
          expect(Math.abs(cx - g.centro.x)).toBeLessThan(1e-9);
          expect(Math.abs(cy - g.centro.y)).toBeLessThan(1e-9);
          const meia = g.cutHalf ?? g.espessura / 2 + 0.02;
          const area = Math.hypot(ring[1]!.x - ring[0]!.x, ring[1]!.y - ring[0]!.y) * Math.hypot(ring[2]!.x - ring[1]!.x, ring[2]!.y - ring[1]!.y);
          expect(area).toBeCloseTo(g.vaoLargura * 2 * meia, 9);
          if (g.cutHalf !== undefined) expect(g.cutHalf).toBeGreaterThanOrEqual(g.espessura / 2 + 0.02 - 1e-12);
          // translação: o centro e o furo acompanham; o resto não muda (a 1e-9: o ponto de partida do arco muda de lugar)
          const d = itensD[i]!;
          expect(Math.abs(d.centro.x - dx - g.centro.x)).toBeLessThan(1e-9);
          expect(Math.abs(d.centro.y - dy - g.centro.y)).toBeLessThan(1e-9);
          expect(Math.abs(d.u.x - g.u.x) + Math.abs(d.u.y - g.u.y)).toBeLessThan(1e-9);
          expect(Math.abs(d.vaoAltura - g.vaoAltura)).toBeLessThan(1e-12);
          if (g.cutHalf !== undefined) expect(Math.abs(d.cutHalf! - g.cutHalf)).toBeLessThan(1e-9);
        });
      } finally {
        cena.destruir();
        cenaD.destruir();
      }
    }
  });

  it('upsert e remoção de aberturas na cena viva seguem o projeto', () => {
    if (pula()) return;
    const p = projetoDeEstresseA3a(5, { paredes: 20, pavimentos: 1 });
    const { cena, a1, a3 } = cenaDe(p);
    try {
      const l = p.levels[0]!;
      const antes = decodificarA3a(cena.consultar('aberturas_geom', argumentosA3(a1, l.id)));
      expect(antes.length).toBeGreaterThan(2);
      // remover duas aberturas
      cena.remover('aberturas', [antes[0]!.id, antes[1]!.id]);
      const depois = decodificarA3a(cena.consultar('aberturas_geom', argumentosA3(a1, l.id)));
      expect(depois.map((g) => g.id)).toEqual(antes.slice(2).map((g) => g.id));
      // reenviar a primeira por upsert (a coluna inteira, filtrando a linha) a devolve
      const c = a3.secoes.aberturas;
      const i = c['id_num']!.indexOf(antes[0]!.id);
      const linha = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, [v[i]!]]));
      cena.upsert('aberturas', linha, 1);
      const volta = decodificarA3a(cena.consultar('aberturas_geom', argumentosA3(a1, l.id)));
      expect(volta.length).toBe(depois.length + 1);
      expect(volta.find((g) => g.id === antes[0]!.id)).toEqual(antes[0]);
    } finally {
      cena.destruir();
    }
  });

  it('entradas inválidas viram falha leve, nunca panic', () => {
    if (pula()) return;
    const p = projetoDeEstresseA3a(3, { paredes: 10, pavimentos: 1 });
    const { cena, a1, a3 } = cenaDe(p);
    try {
      expect(() => cena.consultar('aberturas_geom', [0xffffffff])).toThrow(ErroKernelLeve); // todos os níveis
      expect(() => cena.consultar('aberturas_geom', [Number.NaN])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('aberturas_geom', [])).toThrow(ErroKernelLeve);
      expect(() => cena.consultar('aberturas_geom', [0, 1])).toThrow(ErroKernelLeve);
      expect(cena.consultar('aberturas_geom', [0])['ids']!.length).toBeGreaterThan(0);
      // enums fora do domínio e valores não finitos na seção
      const t = a3.secoes.tipos_abertura;
      expect(() => cena.definirSecao('tipos_abertura', { ...t, folhas: t['folhas']!.map(() => 5) }, a3.nLinhas.tipos_abertura)).toThrow(ErroKernelLeve);
      expect(() => cena.definirSecao('tipos_abertura', { ...t, plano: t['plano']!.map(() => 16) }, a3.nLinhas.tipos_abertura)).toThrow(ErroKernelLeve);
      expect(() => cena.definirSecao('tipos_abertura', { ...t, largura: t['largura']!.map(() => Number.NaN) }, a3.nLinhas.tipos_abertura)).toThrow(ErroKernelLeve);
      const o = a3.secoes.aberturas;
      expect(() => cena.definirSecao('aberturas', { ...o, kind: o['kind']!.map(() => 2) }, a3.nLinhas.aberturas)).toThrow(ErroKernelLeve);
      expect(() => cena.definirSecao('aberturas', { ...o, deslocamento: o['deslocamento']!.map(() => Number.POSITIVE_INFINITY) }, a3.nLinhas.aberturas)).toThrow(ErroKernelLeve);
      // tipo inexistente
      cena.definirSecao('tipos_abertura', { id_num: [], largura: [], altura: [], peitoril: [], folga_w: [], folga_h: [], folhas: [], plano: [] }, 0);
      expect(() => cena.consultar('aberturas_geom', argumentosA3(a1, p.levels[0]!.id))).toThrow(ErroKernelLeve);
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

