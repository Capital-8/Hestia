import { outline, type OPt, type OpeningShape } from '@hestia/model';
import type { FerragemAviso, OpeningPart, PartBox } from './openingModelTypes.ts';
import { anelDaPeca, cruzamentos, dentroDoAnel, fatiaEm, folgaAteAlguma, type Anel } from './openingFerragemGeom.ts';
import { macanetaNaFolha } from './openingModelFerragemMacaneta.ts';

/*
 * Dobradiças e maçaneta em vão com forma (docs/estudo-esquadrias/42). Contrato: a ferragem fica DENTRO do contorno, ENCOSTADA na folha
 * (e a dobradiça também no batente), no trecho em que a aresta de articulação da folha existe, e nunca solta. Esta colocação substitui
 * o deslocamento "o mínimo em z" do doc 37, que mantinha a ferragem dentro do contorno mas podia soltá-la da folha.
 *
 * Dobradiça (por folha, `hinge-<folha>-<k>`):
 * 1. Fase 1, EIXO VERTICAL: o eixo é o da posição original (o pivô da folha). Vale a altura `z` em que a aresta da folha do lado do eixo
 *    cai dentro da largura da dobradiça, em toda a janela de +-meia altura dela. É o caso das ombreiras retas (arcos, empena).
 * 2. Fase 2, ACOMPANHA A ARESTA: onde a aresta é inclinada ou curva (trapézio, polígono, círculo, ogival agudo), a dobradiça fica
 *    centrada na aresta da folha na própria altura (o ponto SOBRE a folha), desde que a aresta varie até 4 cm na janela dela.
 * Nas duas fases a folha precisa ter 10 cm de largura na altura da dobradiça, a caixa fica dentro do contorno, encosta na folha (<= 1 mm)
 * e no batente (<= 3 cm de alcance; a folga restante é fechada esticando a caixa em t, como cinta). Uma folga em s (a dobradiça da porta de
 * vidro nasce na face da parede) é fechada deslocando a caixa em s até a face da folha.
 * Alturas: o trecho válido perde 3 cm em cada ponta; se as alturas originais cabem nele ficam como estão; senão distribuem-se de forma regular
 * entre a de baixo (a original, quando cabe) e a de cima (a mais alta que cabe), com espaçamento >= 2 x altura da dobradiça. Se o trecho
 * não comporta todas, o número cai (`FerragemAviso`); sem trecho nenhum, nenhuma dobradiça e o aviso diz `colocado: 0`.
 */

const PASSO = 0.005;
const TOL = 1e-3;
const FOLGA_PONTA = 0.03;
const LARGURA_MIN = 0.1;
const DESVIO_MAX = 0.04;
const ALCANCE_BATENTE = 0.03;
const QUADRO = new Set(['jamb', 'head', 'mullion', 'transom']);

interface Folha {
  /** Peças `leaf` (anéis e caixas): é nelas que a dobradiça encosta. */
  pecas: OpeningPart[];
}

const centro = (b: PartBox): number => (b.t0 + b.t1) / 2;
const chaveDaDobradica = (id: string): string | undefined => /^hinge-(.+)-\d+$/.exec(id)?.[1];

/** Folhas por chave do id (`leaf-<chave>` e as quatro barras `leaf-<chave>-left|right|top|bottom`). */
function folhasPorChave(parts: readonly OpeningPart[]): Map<string, Folha> {
  const out = new Map<string, Folha>();
  for (const p of parts) {
    if (p.role !== 'leaf' || p.dashed) continue;
    const m = /^leaf-(.+?)(?:-(?:left|right|top|bottom))?$/.exec(p.id);
    if (!m) continue;
    const f = out.get(m[1]!) ?? { pecas: [] };
    f.pecas.push(p);
    out.set(m[1]!, f);
  }
  return out;
}

interface Trecho {
  fase: 1 | 2;
  lo: number;
  hi: number;
}

interface Ctx {
  bruto: Anel;
  folha: Folha;
  quadro: readonly OpeningPart[];
  box0: PartBox;
  ds: number;
  lado: -1 | 1;
  tAx: number;
  hx: number;
  hz: number;
}

/** Caixa da dobradiça centrada em (t, z), com o deslocamento em s. */
const caixaEm = (c: Ctx, t: number, z: number): PartBox => ({ ...c.box0, t0: t - c.hx, t1: t + c.hx, z0: z - c.hz, z1: z + c.hz, s0: c.box0.s0 + c.ds, s1: c.box0.s1 + c.ds });

const caixaServe = (c: Ctx, b: PartBox): boolean =>
  ([[b.t0, b.z0], [b.t1, b.z0], [b.t1, b.z1], [b.t0, b.z1]] as OPt[]).every(([x, z]) => dentroDoAnel(c.bruto, x, z, TOL)) &&
  folgaAteAlguma(b, c.folha.pecas) <= TOL &&
  (c.quadro.length === 0 || folgaAteAlguma(b, c.quadro) <= ALCANCE_BATENTE);

/**
 * Caixa da dobradiça em (t, z) que serve (dentro do contorno, encostada na folha e no batente), ou `null`. Sem batente (porta de vidro) a
 * borda da folha pode estar sobre o contorno: o centro entra para a folha, de 2,5 em 2,5 mm até 3 cm (a aresta inclinada da folha encosta no contorno), até a caixa caber.
 */
function caixaValida(c: Ctx, t: number, z: number): PartBox | null {
  for (let k = 0; k <= 12; k++) {
    const b = caixaEm(c, t - c.lado * k * 0.0025, z);
    if (caixaServe(c, b)) return b;
  }
  return null;
}

/** Melhor trecho (maior corrida de alturas válidas, já sem as pontas) de cada fase; `null` quando não há altura válida. */
function trechos(c: Ctx): Trecho[] {
  const aneis = c.folha.pecas.map(anelDaPeca);
  const zs = aneis.flatMap((a) => a.map((p) => p[1]));
  const zMin = Math.min(...zs);
  const n = Math.max(0, Math.floor((Math.max(...zs) - zMin) / PASSO));
  const te: number[] = [];
  const largo: boolean[] = [];
  for (let i = 0; i <= n; i++) {
    const f = fatiaEm(aneis, zMin + i * PASSO);
    te.push(f ? (c.lado < 0 ? f.min : f.max) : NaN);
    largo.push(f !== null && f.max - f.min >= LARGURA_MIN);
  }
  const W = Math.round(c.hz / PASSO);
  const out: Trecho[] = [];
  for (const fase of [1, 2] as const) {
    const melhor: { v: Trecho | null } = { v: null };
    let ini = -1;
    const fecha = (fim: number): void => {
      if (ini < 0) return;
      const lo = zMin + ini * PASSO + FOLGA_PONTA;
      const hi = zMin + fim * PASSO - FOLGA_PONTA;
      if (hi >= lo && (!melhor.v || hi - lo > melhor.v.hi - melhor.v.lo)) melhor.v = { fase, lo, hi };
      ini = -1;
    };
    for (let i = 0; i <= n; i++) {
      let ok = i - W >= 0 && i + W <= n;
      for (let k = i - W; ok && k <= i + W; k++) {
        const t = te[k]!;
        ok = largo[k]! && Math.abs(t - (fase === 1 ? c.tAx : te[i]!)) <= (fase === 1 ? c.hx : DESVIO_MAX);
      }
      if (ok) ok = caixaValida(c, fase === 1 ? c.tAx : te[i]!, zMin + i * PASSO) !== null;
      if (ok && ini < 0) ini = i;
      if (!ok) fecha(i - 1);
    }
    fecha(n);
    if (melhor.v) out.push(melhor.v);
  }
  return out;
}

const capacidade = (t: Trecho | undefined, n: number, esp: number): number => (!t ? 0 : Math.min(n, Math.floor((t.hi - t.lo) / esp + 1e-9) + 1));

/** Aproxima a caixa do batente (cinta em t) quando sobra mais de 1 mm entre eles: vale a linha da altura da caixa em que o batente chega mais perto. */
function ligaAoBatente(c: Ctx, b: PartBox): PartBox {
  if (c.quadro.length === 0 || folgaAteAlguma(b, c.quadro) <= TOL) return b;
  let melhor = Infinity;
  let t0 = b.t0;
  let t1 = b.t1;
  for (let z = b.z0; z <= b.z1 + 1e-9; z += PASSO) {
    for (const q of c.quadro) {
      const xs = cruzamentos(anelDaPeca(q), z).sort((x, y) => x - y);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const [lo, hi] = [xs[k]!, xs[k + 1]!];
        if (hi < b.t0 && b.t0 - hi < melhor) [melhor, t0, t1] = [b.t0 - hi, hi - TOL, b.t1];
        else if (lo > b.t1 && lo - b.t1 < melhor) [melhor, t0, t1] = [lo - b.t1, b.t0, lo + TOL];
      }
    }
  }
  return { ...b, t0, t1 };
}

interface Resultado {
  novas: OpeningPart[];
  aviso?: FerragemAviso;
}

/** Dobradiças de uma folha recolocadas; as originais do grupo saem e entram `colocado` peças com os mesmos ids (`hinge-<folha>-0..`). */
function dobradicasDaFolha(chave: string, hs: OpeningPart[], folha: Folha, bruto: Anel, quadro: readonly OpeningPart[]): Resultado {
  const b0 = hs[0]!.box;
  const aneis = folha.pecas.map(anelDaPeca);
  const tFolha = aneis.flatMap((a) => a.map((p) => p[0]));
  const lado = centro(b0) < (Math.min(...tFolha) + Math.max(...tFolha)) / 2 ? -1 : 1;
  const s0 = Math.min(...folha.pecas.map((p) => p.box.s0));
  const s1 = Math.max(...folha.pecas.map((p) => p.box.s1));
  const folgaS = Math.max(0, b0.s0 - s1, s0 - b0.s1);
  const ds = folgaS > TOL / 2 ? (b0.s0 > s1 ? -(folgaS + 0.002) : folgaS + 0.002) : 0;
  const c: Ctx = { bruto, folha, quadro, box0: b0, ds, lado, tAx: centro(b0), hx: (b0.t1 - b0.t0) / 2, hz: (b0.z1 - b0.z0) / 2 };
  const n = hs.length;
  const esp = 2 * (b0.z1 - b0.z0);
  const nominais = hs.map((h) => (h.box.z0 + h.box.z1) / 2).sort((x, y) => x - y);
  const todos = trechos(c);
  const f1 = todos.find((t) => t.fase === 1);
  const f2 = todos.find((t) => t.fase === 2);
  const cabeNominal = f1 !== undefined && nominais.every((z) => z >= f1.lo - 1e-9 && z <= f1.hi + 1e-9);
  const cap1 = capacidade(f1, n, esp);
  const cap2 = capacidade(f2, n, esp);
  const fase1 = cabeNominal || cap1 >= n || cap1 >= cap2;
  const tr = fase1 ? f1 : f2;
  const m = cabeNominal ? n : fase1 ? cap1 : cap2;
  const aviso: FerragemAviso | undefined = m < n ? { tipo: 'hinge', folha: chave, pedido: n, colocado: m } : undefined;
  if (!tr || m === 0) return { novas: [], aviso: aviso ?? { tipo: 'hinge', folha: chave, pedido: n, colocado: 0 } };
  let zs: number[];
  if (cabeNominal) zs = nominais;
  else {
    const cabe = Math.min(tr.hi, nominais[nominais.length - 1]!) - Math.max(tr.lo, nominais[0]!) >= (m - 1) * esp - 1e-9;
    const lo = cabe ? Math.max(tr.lo, nominais[0]!) : tr.lo;
    const hi = cabe ? Math.min(tr.hi, nominais[nominais.length - 1]!) : tr.hi;
    zs = m === 1 ? [Math.min(tr.hi, Math.max(tr.lo, nominais[Math.floor((n - 1) / 2)]!))] : Array.from({ length: m }, (_, j) => lo + (j * (hi - lo)) / (m - 1));
  }
  const novas = zs.map((z, k): OpeningPart => {
    const f = fatiaEm(aneis, z);
    const t = tr.fase === 1 || !f ? c.tAx : lado < 0 ? f.min : f.max;
    const box = ligaAoBatente(c, caixaValida(c, t, z) ?? caixaEm(c, t, z));
    return { ...hs[0]!, id: `hinge-${chave}-${k}`, box };
  });
  return { novas, ...(aviso ? { aviso } : {}) };
}

/** Peças de enquadramento (batente, divisores) em que a dobradiça se prende: as que estão dentro do contorno (um batente que o recuo recusou fica retangular, fora dele, e não conta). */
const ehQuadro = (p: OpeningPart, bruto: Anel): boolean => p.material === 'frame' && QUADRO.has(p.role) && anelDaPeca(p).every(([x, z]) => dentroDoAnel(bruto, x, z, 2 * TOL));

/**
 * Dobradiças e maçanetas do modelo com forma, recolocadas dentro do contorno e presas à folha. Devolve o MESMO vetor (e sem avisos)
 * quando o modelo não tem ferragem.
 */
export function ferragensNoContorno(parts: readonly OpeningPart[], shape: OpeningShape): { parts: OpeningPart[]; avisos: FerragemAviso[] } {
  const hs = parts.filter((p) => p.role === 'hinge' && !p.profile && chaveDaDobradica(p.id) !== undefined);
  const hands = parts.filter((p) => p.role === 'handle');
  if (hs.length === 0 && hands.length === 0) return { parts: [...parts], avisos: [] };
  const bruto = outline(shape);
  const folhas = folhasPorChave(parts);
  const quadro = parts.filter((p) => ehQuadro(p, bruto));
  const troca = new Map<OpeningPart, OpeningPart[]>();
  const avisos: FerragemAviso[] = [];
  const porChave = new Map<string, OpeningPart[]>();
  for (const h of hs) porChave.set(chaveDaDobradica(h.id)!, [...(porChave.get(chaveDaDobradica(h.id)!) ?? []), h]);
  for (const [chave, grupo] of porChave) {
    const folha = folhas.get(chave);
    if (!folha) continue;
    const r = dobradicasDaFolha(chave, grupo.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), folha, bruto, quadro);
    grupo.forEach((h, k) => troca.set(h, k === 0 ? r.novas : []));
    if (r.aviso) avisos.push(r.aviso);
  }
  const rodape = macanetaNaFolha(parts, hands, bruto);
  for (const [p, novas] of rodape.troca) troca.set(p, novas);
  avisos.push(...rodape.avisos);
  return { parts: parts.flatMap((p) => troca.get(p) ?? [p]), avisos };
}
