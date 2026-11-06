/**
 * Invariantes da saída do kernel Rust (`junction_nivel`) sobre os projetos de estresse da B1 (`projetoDeEstresseB1`, sementes 1 a 4, com e sem
 * anexos). NÃO compara com o TypeScript: cada invariante é checado sobre a própria saída do Rust, com as primitivas de polígono do motor.
 *  I1 contenção: cada parte da camada fica dentro da peça original (plana e na cota), com excesso de área <= 1e-6 + perímetro x 1e-6 / 2.
 *  I2 sem sobreposição: partes da mesma camada com cotas que se cruzam não se sobrepõem (interseção <= 1e-9 m²).
 *  I3 anéis válidos: nenhum anel repete vértice fora de sequência; furos ficam dentro do anel externo (ponto de teste no furo).
 *  I4 volume não negativo e cotas ordenadas: z1 >= z0 em toda parte, e as partes de uma camada não se invertem na cota.
 *  I5 conservação: por parte, área cortada (original menos o que as vencedoras tiram na faixa) + área da parte = área da original.
 * Só roda em `npm run test:wasm` (o config do kernel precisa incluir este arquivo). Sem skip e sem it.fails.
 */
import { readFileSync } from 'node:fs';
import { boxOf, boxesOverlap, difference, intersection, multiPoints, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { type Project } from '@hestia/model';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { winsOver, zOverlaps } from '../packages/engine/src/junctionPlanar.ts';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaA3 } from '../packages/engine/src/kernelA3.ts';
import { montarPerfisA3d } from '../packages/engine/src/kernelA3d.ts';
import { montarCenaB1 } from '../packages/engine/src/kernelB.ts';
import { argumentosB3, decodificarB3, montarCenaB3, type JuncaoB3, type ParteB3, type PecaB3 } from '../packages/engine/src/kernelB3.ts';
import { areaDaForma } from '../packages/engine/src/kernelComparaA2.ts';
import { perimetroDaForma } from '../packages/engine/src/kernelComparaA3c.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { projetoDeEstresseB1 } from '../scripts/kernel-b1-estresse.mts';

const SEMENTES = [1, 2, 3, 4];
const ANEXOS = [true, false];
const LIMITE_MAX_VIOLACOES = 60;

/** Tolerância de área de I1 e I5: 1e-6 m² + perímetro x 1e-6 / 2 (meio micrômetro de borda). */
const tolerancia = (perimetro: number): number => 1e-6 + (perimetro * 1e-6) / 2;

let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  const caminho = caminhoDoWasm();
  ger = await GerenciadorKernelV2.dosBytes(readFileSync(caminho));
});

/** Mesma cena da B3 (`kernel-b3.wasm.test.ts`): seções da fatia A e da B, cotas por camada e a variante da junção. */
const cenaDe = (p: Project) => {
  const a1 = montarCenaA1(p, true);
  const a3 = montarCenaA3(p, a1);
  const perfis = montarPerfisA3d(p, a1, true);
  const b = montarCenaB1(p, a1.materialDe);
  const b3 = montarCenaB3(p, a1, {});
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
  return { cena, b };
};

/** Uma parte de camada (ou faixa de parede) com a peça original que a contém. */
interface Item {
  nivel: string;
  elemento: string;
  camada: string;
  origem: PecaB3;
  zOrigem: readonly [number, number];
  partes: ParteB3[];
  /** Todas as peças do nível (candidatas a vencedoras, para I5). */
  pecas: PecaB3[];
}

interface Caso {
  cena: CenaV2;
  itens: Item[];
  semOrigem: number;
}

const casos = new Map<string, Caso>();
const chave = (semente: number, anexos: boolean): string => `${semente}/${anexos}`;

/** Monta (uma vez por semente e anexos) a cena e lê `junction_nivel` de todos os níveis do projeto. */
function casoDe(semente: number, anexos: boolean): Caso {
  const k = chave(semente, anexos);
  const existente = casos.get(k);
  if (existente) return existente;
  const p = projetoDeEstresseB1(semente, { paredesB2: true, anexos });
  const { cena, b } = cenaDe(p);
  const caso: Caso = { cena, itens: [], semOrigem: 0 };
  casos.set(k, caso);
  for (const l of p.levels) {
    const j: JuncaoB3 = decodificarB3(cena.consultar('junction_nivel', argumentosB3(p, l.id, b)));
    const r = itensDe(j, l.id);
    caso.itens.push(...r.itens);
    caso.semOrigem += r.semOrigem;
  }
  return caso;
}

function itensDe(j: JuncaoB3, nivel: string): { itens: Item[]; semOrigem: number } {
  const pecas = j.cortadores.flatMap((c) => c.pecas);
  const achar = (tipo: number, dono: number, camada: number, banda: number | null): PecaB3 | undefined =>
    pecas.find(
      (pc) =>
        pc.meta !== null &&
        !pc.externa &&
        pc.meta.tipo === tipo &&
        pc.meta.dono === dono &&
        pc.meta.camada === camada &&
        (pc.meta.banda ?? null) === banda &&
        pc.poligono.length > 0 &&
        pc.faixa !== null &&
        pc.faixa[1] - pc.faixa[0] > 1e-9,
    );
  const itens: Item[] = [];
  let semOrigem = 0;
  for (const e of j.elementos) {
    for (const c of e.camadas) {
      const origem = achar(e.tipo, e.dono, c.camada, null);
      if (!origem) {
        semOrigem++;
        continue;
      }
      itens.push({ nivel, elemento: `${e.tipo === 1 ? 'piso' : 'laje'} ${e.dono}`, camada: `${c.camada}`, origem, zOrigem: origem.faixa!, partes: c.partes, pecas });
    }
  }
  for (const w of j.paredes) {
    for (const f of w.faixas) {
      const origem = achar(0, w.parede, f.camada, f.banda);
      if (!origem) {
        semOrigem++;
        continue;
      }
      itens.push({ nivel, elemento: `parede ${w.parede}`, camada: `${f.camada} (banda ${f.banda})`, origem, zOrigem: origem.faixa!, partes: f.partes, pecas });
    }
  }
  return { itens, semOrigem };
}

const rotuloDe = (semente: number, anexos: boolean, it: Item, parte?: number): string =>
  `semente ${semente}, anexos ${anexos}, nível ${it.nivel}, elemento ${it.elemento}, camada ${it.camada}${parte === undefined ? '' : `, parte ${parte}`}`;

const fmt = (x: number): string => x.toExponential(3);

/** Ponto dentro de anel (ray casting). */
function dentroDoAnel(q: Vec2, anel: Ring): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const a = anel[i]!;
    const b = anel[j]!;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

/** Um ponto no interior do furo: o baricentro de três vértices seguidos que caia dentro dele. */
function pontoDoFuro(furo: Ring): Vec2 | null {
  const n = furo.length;
  for (let i = 0; i < n; i++) {
    const a = furo[i]!;
    const b = furo[(i + 1) % n]!;
    const c = furo[(i + 2) % n]!;
    const q = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    if (dentroDoAnel(q, furo)) return q;
  }
  return null;
}

/** Vértice repetido fora de sequência (repetições seguidas, incluindo o fechamento, são aresta de comprimento zero e não contam). */
function verticeRepetido(anel: Ring): boolean {
  const c: Vec2[] = [];
  for (const q of anel) {
    const u = c[c.length - 1];
    if (!u || Math.hypot(q.x - u.x, q.y - u.y) > 1e-12) c.push(q);
  }
  while (c.length > 1 && Math.hypot(c[0]!.x - c[c.length - 1]!.x, c[0]!.y - c[c.length - 1]!.y) <= 1e-12) c.pop();
  const chaves = new Set(c.map((q) => `${q.x.toFixed(9)},${q.y.toFixed(9)}`));
  return chaves.size !== c.length;
}

const sobreposicaoZ = (a: readonly [number, number], b: readonly [number, number]): number => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);

function violacoesI1(s: number, a: boolean, itens: Item[]): string[] {
  const v: string[] = [];
  for (const it of itens) {
    const orig = it.origem.poligono;
    const tol = tolerancia(perimetroDaForma(orig));
    it.partes.forEach((pt, i) => {
      if (pt.poligono.length === 0) return;
      const fora = areaDaForma(pt.poligono) - areaDaForma(intersection(pt.poligono, orig));
      if (fora > tol) v.push(`${rotuloDe(s, a, it, i)}: excesso de área fora da original ${fmt(fora)} m² (limite ${fmt(tol)})`);
      if (pt.z0 < it.zOrigem[0] - 1e-6 || pt.z1 > it.zOrigem[1] + 1e-6)
        v.push(`${rotuloDe(s, a, it, i)}: cota [${pt.z0}, ${pt.z1}] fora da faixa da original [${it.zOrigem[0]}, ${it.zOrigem[1]}]`);
    });
  }
  return v;
}

function violacoesI2(s: number, a: boolean, itens: Item[]): string[] {
  const v: string[] = [];
  for (const it of itens) {
    for (let i = 0; i < it.partes.length; i++) {
      for (let j = i + 1; j < it.partes.length; j++) {
        const pi = it.partes[i]!;
        const pj = it.partes[j]!;
        if (sobreposicaoZ([pi.z0, pi.z1], [pj.z0, pj.z1]) <= 1e-9) continue;
        if (pi.poligono.length === 0 || pj.poligono.length === 0) continue;
        const sobre = areaDaForma(intersection(pi.poligono, pj.poligono));
        if (sobre > 1e-9) v.push(`${rotuloDe(s, a, it)} partes ${i} e ${j}: sobreposição de ${fmt(sobre)} m² na mesma faixa de cota`);
      }
    }
  }
  return v;
}

function violacoesI3(s: number, a: boolean, itens: Item[]): string[] {
  const v: string[] = [];
  for (const it of itens) {
    it.partes.forEach((pt, i) => {
      pt.poligono.forEach((poly, q) => {
        poly.forEach((anel, k) => {
          if (anel.length < 3) v.push(`${rotuloDe(s, a, it, i)} polígono ${q} anel ${k}: anel com ${anel.length} vértices`);
          else if (verticeRepetido(anel)) v.push(`${rotuloDe(s, a, it, i)} polígono ${q} anel ${k}: vértice repetido fora de sequência (anel toca a si mesmo)`);
        });
        const [externo, ...furos] = poly;
        if (!externo) return;
        furos.forEach((furo, k) => {
          const ponto = pontoDoFuro(furo);
          if (ponto && !dentroDoAnel(ponto, externo))
            v.push(`${rotuloDe(s, a, it, i)} polígono ${q} furo ${k}: ponto (${fmt(ponto.x)}, ${fmt(ponto.y)}) do furo fora do anel externo`);
        });
      });
    });
  }
  return v;
}

function violacoesI4(s: number, a: boolean, itens: Item[]): string[] {
  const v: string[] = [];
  for (const it of itens) {
    it.partes.forEach((pt, i) => {
      if (!(pt.z1 >= pt.z0)) v.push(`${rotuloDe(s, a, it, i)}: z1 ${pt.z1} < z0 ${pt.z0}`);
      if (pt.poligono.length > 0) {
        const area = areaDaForma(pt.poligono);
        if (area < -1e-12) v.push(`${rotuloDe(s, a, it, i)}: área negativa ${fmt(area)}`);
      }
      if (i > 0 && pt.z0 < it.partes[i - 1]!.z1 - 1e-9)
        v.push(`${rotuloDe(s, a, it, i)}: cota z0 ${pt.z0} anterior à z1 ${it.partes[i - 1]!.z1} da parte ${i - 1}`);
    });
  }
  return v;
}

/** Vencedoras de uma origem, pela mesma regra de dono, tipo e explícita da B3 (`winsOver`, a regra do motor). */
function vencedoras(origem: PecaB3, pecas: PecaB3[]): PecaB3[] {
  const caixa = origem.poligono.length ? boxOf(multiPoints(origem.poligono)) : null;
  const m = (q: PecaB3) => ({ kind: (['wall', 'floor', 'slab'] as const)[q.meta!.tipo]!, priority: q.meta!.prioridade, core: q.meta!.nucleo, ...(q.meta!.explicita ? { explicit: true } : {}) });
  return pecas.filter((pc) => {
    if (pc === origem || !caixa || pc.meta === null || pc.poligono.length === 0 || origem.meta === null || origem.faixa === null || pc.faixa === null) return false;
    if (!boxesOverlap(caixa, boxOf(multiPoints(pc.poligono))) || !zOverlaps({ z0: origem.faixa[0], z1: origem.faixa[1] }, { z0: pc.faixa[0], z1: pc.faixa[1] })) return false;
    if (pc.externa || origem.externa) {
      if (!(pc.externa !== origem.externa && (pc.meta.tipo === 0) !== (origem.meta.tipo === 0))) return false;
    } else if ((pc.meta.tipo === origem.meta.tipo && pc.meta.dono === origem.meta.dono) || (pc.meta.tipo === 0 && origem.meta.tipo === 0)) return false;
    return winsOver(m(pc), m(origem)) === true;
  });
}

/**
 * I5 por faixa: a parte é dividida nas cotas em que as vencedoras começam ou param; em cada sub-faixa, a área cortada da original
 * (a original menos o que sobra depois das vencedoras ativas) mais a área da parte tem de dar a área da original. Peça inclinada
 * (laje com caimento) fica fora: a faixa dela é envelope, não cota constante (a mesma restrição da B3).
 */
function violacoesI5(s: number, a: boolean, itens: Item[]): { v: string[]; conferidas: number; puladas: number } {
  const v: string[] = [];
  let conferidas = 0;
  let puladas = 0;
  for (const it of itens) {
    if (it.origem.meta!.tipo === 2 && !it.origem.plana) {
      puladas++;
      continue;
    }
    conferidas++;
    const orig = it.origem.poligono;
    const areaA = areaDaForma(orig);
    const tol = tolerancia(perimetroDaForma(orig));
    const venc = vencedoras(it.origem, it.pecas).filter((w) => w.plana || w.meta!.tipo !== 2);
    it.partes.forEach((pt, i) => {
      const cotas = [pt.z0, pt.z1, ...venc.flatMap((w) => [w.faixa![0], w.faixa![1]])].filter((z) => z >= pt.z0 && z <= pt.z1);
      const limites = [...new Set(cotas)].sort((x, y) => x - y);
      for (let k = 0; k + 1 < limites.length; k++) {
        const z0 = limites[k]!;
        const z1 = limites[k + 1]!;
        if (z1 - z0 <= 1e-6) continue;
        const meio = (z0 + z1) / 2;
        const ativas = venc.filter((w) => w.faixa![0] < meio && w.faixa![1] > meio).map((w) => w.poligono);
        const restante = ativas.length === 0 || orig.length === 0 ? orig : difference(orig, ...ativas);
        const cortada = areaA - areaDaForma(restante);
        const erro = Math.abs(cortada + areaDaForma(pt.poligono) - areaA);
        if (erro > tol)
          v.push(`${rotuloDe(s, a, it, i)} faixa [${fmt(z0)}, ${fmt(z1)}]: cortada ${fmt(cortada)} + parte ${fmt(areaDaForma(pt.poligono))} != original ${fmt(areaA)} (erro ${fmt(erro)}, limite ${fmt(tol)})`);
      }
    });
  }
  return { v, conferidas, puladas };
}

const relatar = (titulo: string, v: string[]): void => {
  if (v.length > 0) console.log(`[invariante ${titulo}] ${v.length} violações:\n` + v.slice(0, LIMITE_MAX_VIOLACOES).join('\n'));
};

const mensagem = (v: string[]): string => `${v.length} violações${v.length ? ': ' + v.slice(0, LIMITE_MAX_VIOLACOES).join(' | ') : ''}`;

describe('invariantes da saída Rust (junction_nivel): sementes 1 a 4, anexos true e false', () => {
  for (const semente of SEMENTES) {
    for (const anexos of ANEXOS) {
      describe(`semente ${semente}, anexos ${anexos}`, () => {
        afterAll(() => {
          const k = chave(semente, anexos);
          const c = casos.get(k);
          if (c) {
            c.cena.destruir();
            casos.delete(k);
          }
        });

        it(`I1 contenção: cada parte fica dentro da peça original (semente ${semente}, anexos ${anexos})`, () => {
          const { itens, semOrigem } = casoDe(semente, anexos);
          const v = violacoesI1(semente, anexos, itens);
          relatar('I1', v);
          console.log(`[I1 semente ${semente} anexos ${anexos}] ${itens.length} camadas/faixas conferidas, ${semOrigem} sem peça original`);
          expect(itens.length, 'camadas conferidas').toBeGreaterThan(0);
          expect(v.length, mensagem(v)).toBe(0);
        }, 180_000);

        it(`I2 sem sobreposição: partes da mesma camada e faixa de cota não se sobrepõem (semente ${semente}, anexos ${anexos})`, () => {
          const { itens } = casoDe(semente, anexos);
          const v = violacoesI2(semente, anexos, itens);
          relatar('I2', v);
          expect(itens.length, 'camadas conferidas').toBeGreaterThan(0);
          expect(v.length, mensagem(v)).toBe(0);
        }, 180_000);

        it(`I3 anéis válidos: sem vértice repetido fora de sequência e furos dentro do anel externo (semente ${semente}, anexos ${anexos})`, () => {
          const { itens } = casoDe(semente, anexos);
          const v = violacoesI3(semente, anexos, itens);
          relatar('I3', v);
          expect(itens.length, 'camadas conferidas').toBeGreaterThan(0);
          expect(v.length, mensagem(v)).toBe(0);
        }, 180_000);

        it(`I4 volume não negativo e cotas ordenadas (semente ${semente}, anexos ${anexos})`, () => {
          const { itens } = casoDe(semente, anexos);
          const v = violacoesI4(semente, anexos, itens);
          relatar('I4', v);
          expect(itens.length, 'camadas conferidas').toBeGreaterThan(0);
          expect(v.length, mensagem(v)).toBe(0);
        }, 180_000);

        it(`I5 conservação: área cortada mais área das partes = área da original, por faixa (semente ${semente}, anexos ${anexos})`, () => {
          const { itens } = casoDe(semente, anexos);
          const { v, conferidas, puladas } = violacoesI5(semente, anexos, itens);
          relatar('I5', v);
          console.log(`[I5 semente ${semente} anexos ${anexos}] ${conferidas} camadas conferidas, ${puladas} de laje inclinada fora (faixa envelope)`);
          expect(conferidas, 'camadas conferidas').toBeGreaterThan(0);
          expect(v.length, mensagem(v)).toBe(0);
        }, 180_000);
      });
    }
  }
});
