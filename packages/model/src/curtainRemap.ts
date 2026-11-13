// Remapeamento das sobrescritas da parede cortina (decisão 0056, §4.4). Implementação própria e pequena do modelo, para
// conferir depois com a referência de engine/cortinaRef/remap.ts (esta não a espera nem a copia).
// Regras (§4.4), em duas dimensões para célula e em uma para linha e segmento:
//  1. mesma topologia (nu e nv gravados = atuais): vale o índice, se o centro novo está a até 0,5 do gravado;
//  2. senão vale a posição: o ponto (s·L, z·H) gravado cai na célula que o contém (na fronteira, a de menor índice);
//  3. fusão: duas sobrescritas na mesma região: vence a de menor distância entre o ponto e o centro; a outra é órfã;
//  4. fora de todas as células: a vizinha (até uma célula) se não estiver ocupada; senão órfã;
//  5. órfã: sai da geometria e do aviso `cortina-override-orfao`; a próxima normalização a descarta;
//  6. a normalização regrava as chaves (índice e posição novos), no mesmo passo de desfazer da edição.
// Decisões desta implementação (ver também curtainGrade.ts):
//  (a) linha gerada: `{axis, index: g+1, pos: base/A, n: ng+1}`, com `ng` = nº de geradas; extras não contam;
//  (b) segmento: `nk` = nº de segmentos do eixo perpendicular na grade final; `mid` = centro normalizado do segmento;
//  (c) a grade só se lê; a resolução nunca grava no modelo (só `normalizarParede` grava).

import { wallHeight, wallLength } from './queries.ts';
import { t } from './i18n.ts';
import { unitsOf } from './units.ts';
import { formatQuantity } from './unitsFormat.ts';
import type { ValidationIssue } from './validate.ts';
import { isWall, type Id, type Project, type Wall } from './types.ts';
import type { AddedGridLine, CellOverrideEntry, CurtainInstance, LineOverride, LineRef, SegmentRef } from './wallCurtainTypes.ts';
import { TOL_SOLDA, type Eixo } from './curtainGrade.ts';
import { resolverParede } from './curtainResolver.ts';

export * from './curtainResolver.ts';

/**
 * Regrava as chaves e as referências da parede (§4.4, passo 6) e descarta as órfãs, no mesmo passo de desfazer da
 * edição que a chamou. Não mexe em geometria nem em listas que a parede não tem. Devolve o nº de órfãs descartadas.
 */
export function normalizarParede(p: Project, id: Id): number {
  const w = p.elements[id];
  if (!isWall(w) || !w.curtain) return 0;
  const res = resolverParede(p, w);
  if (!res) return 0;
  const antes = w.curtain;
  const novo: CurtainInstance = { ...antes };
  if (antes.cells !== undefined) novo.cells = res.celulas;
  if (antes.lineOverrides !== undefined) novo.lineOverrides = res.linhas;
  if (antes.removedSegments !== undefined) novo.removedSegments = res.segmentos;
  if (JSON.stringify(novo) !== JSON.stringify(antes)) w.curtain = novo;
  return res.orfas.length;
}

/** Comprimento e altura de cada parede cortina (antes de um comando que muda a geometria). */
export function dimensoesCortinas(p: Project): Map<Id, { L: number; H: number }> {
  const m = new Map<Id, { L: number; H: number }>();
  for (const e of Object.values(p.elements)) if (isWall(e) && e.curtain) m.set(e.id, { L: wallLength(e), H: wallHeight(p, e) });
  return m;
}

/**
 * Depois de um comando que mudou L ou H de uma parede cortina (aparar, estender, esticar, altura, nível): as linhas
 * extras e as sobrescritas de linha sem `locked` acompanham a fração da posição (§4.3), e as chaves são remapeadas.
 */
export function ajustarCortinasAlteradas(p: Project, antes: Map<Id, { L: number; H: number }>): void {
  for (const [id, d0] of antes) {
    const w = p.elements[id];
    if (!isWall(w) || !w.curtain) continue;
    const L = wallLength(w);
    const H = wallHeight(p, w);
    const fU = Math.abs(L - d0.L) > 1e-9 && d0.L > 0 ? L / d0.L : 1;
    const fV = Math.abs(H - d0.H) > 1e-9 && d0.H > 0 ? H / d0.H : 1;
    if (fU === 1 && fV === 1) continue;
    escalarLinhas(w, { u: fU, v: fV });
    normalizarParede(p, id);
  }
}

function escalarLinhas(w: Wall, f: Record<Eixo, number>): void {
  const inst = w.curtain as CurtainInstance;
  const eixoDeExtra = new Map<Id, Eixo>((inst.addedLines ?? []).map((l): [Id, Eixo] => [l.id, l.axis]));
  if (inst.addedLines) {
    inst.addedLines = inst.addedLines.map((l) => (l.locked ? l : { ...l, pos: l.pos * f[l.axis] }));
  }
  if (inst.lineOverrides) {
    inst.lineOverrides = inst.lineOverrides.map((ov) => {
      if (ov.locked || ov.pos === undefined) return ov;
      const eixo = 'added' in ov.line ? eixoDeExtra.get(ov.line.added) : ov.line.axis;
      return eixo === undefined ? ov : { ...ov, pos: ov.pos * f[eixo] };
    });
  }
}

/**
 * Divide a instância da parede cortina no corte [lo, hi] (§4.9, splitWall): a parte da esquerda fica com [0, lo] e a da
 * direita com [hi, L]. Linhas U e segmentos de linha U são repartidos pela posição; linhas V e segmentos de linha V ficam
 * nas duas partes (estes são repartidos pelo centro). Células vão pelo centro. Chaves saem com `nu = nv = 0` (topologia
 * desconhecida), para que a normalização das partes as remapeie pela posição (passo 2). Null se não há cortina.
 */
export function partirInstanciaCortina(p: Project, w: Wall, lo: number, hi: number): { esq: CurtainInstance; dir: CurtainInstance } | null {
  const res = resolverParede(p, w);
  if (!res) return null;
  const inst: CurtainInstance = w.curtain ?? {};
  const L1 = lo;
  const L2 = res.L - hi;
  const off = (lado: 'esq' | 'dir'): number => (lado === 'esq' ? 0 : hi);
  const comp = (lado: 'esq' | 'dir'): number => (lado === 'esq' ? L1 : L2);
  /** Lado do ponto `x` (m) entre o corte e a gap; null se cai dentro da faixa removida. */
  const ladoDe = (x: number): 'esq' | 'dir' | null => (x < lo - TOL_SOLDA ? 'esq' : x > hi + TOL_SOLDA ? 'dir' : null);
  const eixoDeExtra = new Map<Id, Eixo>((inst.addedLines ?? []).map((l): [Id, Eixo] => [l.id, l.axis]));

  /** Campos que valem para as duas partes (tipo da grade e painel padrão). A hospedagem não passa: cada parte fica independente. */
  const comum = (): CurtainInstance => {
    const out: CurtainInstance = {};
    if (inst.grid !== undefined) out.grid = inst.grid;
    if (inst.defaultPanelTypeId !== undefined) out.defaultPanelTypeId = inst.defaultPanelTypeId;
    return out;
  };
  const esq = comum();
  const dir = comum();
  /** Posição atual (m) de uma linha na grade resolvida: a sobrescrita já foi aplicada. */
  const posAtual = (eixo: Eixo, line: LineRef): number | undefined => {
    const lista = eixo === 'u' ? res.u : res.v;
    if ('added' in line) return lista.find((l) => l.added === line.added)?.pos;
    const gerada = (eixo === 'u' ? res.geradasU : res.geradasV)[line.index - 1];
    return lista.find((l) => l.gerada === line.index - 1)?.pos ?? gerada;
  };
  const extrasEsq: AddedGridLine[] = [];
  const extrasDir: AddedGridLine[] = [];
  for (const ex of inst.addedLines ?? []) {
    if (ex.axis === 'v') {
      extrasEsq.push(ex);
      extrasDir.push(ex);
      continue;
    }
    const lado = ladoDe(posAtual(ex.axis, { added: ex.id }) ?? ex.pos);
    if (lado === 'esq') extrasEsq.push(ex);
    if (lado === 'dir') extrasDir.push({ ...ex, pos: ex.pos - hi });
  }
  // Linha U (vertical, no eixo s): repartida pela posição atual. Linha V: fica nas duas partes com a mesma referência.
  const ovEsq: LineOverride[] = [];
  const ovDir: LineOverride[] = [];
  // Lê as sobrescritas JÁ remapeadas (res.linhas): a identidade g = index − 1 só vale na referência normalizada.
  for (const ov of res.linhas) {
    const eixo: Eixo | undefined = 'added' in ov.line ? eixoDeExtra.get(ov.line.added) : ov.line.axis;
    if (eixo === 'v') {
      ovEsq.push(ov);
      ovDir.push(ov);
      continue;
    }
    if (eixo === undefined) continue;
    const pAtual = posAtual(eixo, ov.line);
    const lado = pAtual === undefined ? null : ladoDe(pAtual);
    if (lado === null) continue;
    const cada = (lad: 'esq' | 'dir'): LineOverride => {
      const linha: LineRef = 'added' in ov.line ? ov.line : { axis: 'u', index: ov.line.index, pos: ((posAtual('u', ov.line) ?? 0) - off(lad)) / comp(lad), n: 0 };
      return { ...ov, line: linha, pos: ov.pos === undefined ? undefined : ov.pos - off(lad) };
    };
    if (lado === 'esq') ovEsq.push(cada('esq'));
    else ovDir.push(cada('dir'));
  }
  const segEsq: SegmentRef[] = [];
  const segDir: SegmentRef[] = [];
  for (const sg of res.segmentos) {
    const eixo: Eixo | undefined = 'added' in sg.line ? eixoDeExtra.get(sg.line.added) : sg.line.axis;
    if (eixo === undefined) continue;
    if (eixo === 'v') {
      // Segmento de linha V corre em s: repartido pelo centro (sg.mid normalizado por L).
      const cm = sg.mid * res.L;
      const lado = ladoDe(cm);
      if (lado === 'esq') segEsq.push({ ...sg, k: 0, nk: 0, mid: cm / L1 });
      if (lado === 'dir') segDir.push({ ...sg, k: 0, nk: 0, mid: (cm - hi) / L2 });
      continue;
    }
    // Segmento de linha U corre em z: a linha decide o lado; k e mid (de z) continuam valendo.
    const pAtual = posAtual('u', sg.line);
    const lado = pAtual === undefined ? null : ladoDe(pAtual);
    if (lado === null) continue;
    const linha: LineRef = 'added' in sg.line ? sg.line : { axis: 'u', index: sg.line.index, pos: ((posAtual('u', sg.line) ?? 0) - off(lado)) / comp(lado), n: 0 };
    if (lado === 'esq') segEsq.push({ ...sg, line: linha });
    else segDir.push({ ...sg, line: linha });
  }
  const celEsq: CellOverrideEntry[] = [];
  const celDir: CellOverrideEntry[] = [];
  for (const e of res.celulas) {
    const cm = e.key.s * res.L;
    const lado = ladoDe(cm);
    if (lado === 'esq') celEsq.push({ ...e, key: { ...e.key, s: cm / L1, nu: 0, nv: 0 } });
    if (lado === 'dir') celDir.push({ ...e, key: { ...e.key, s: (cm - hi) / L2, nu: 0, nv: 0 } });
  }
  if (inst.addedLines !== undefined) {
    esq.addedLines = extrasEsq;
    dir.addedLines = extrasDir;
  }
  if (inst.lineOverrides !== undefined) {
    esq.lineOverrides = ovEsq;
    dir.lineOverrides = ovDir;
  }
  if (inst.removedSegments !== undefined) {
    esq.removedSegments = segEsq;
    dir.removedSegments = segDir;
  }
  if (inst.cells !== undefined) {
    esq.cells = celEsq;
    dir.cells = celDir;
  }
  return { esq, dir };
}

/** Problemas de projeto: sobrescritas órfãs de qualquer parede cortina (`cortina-override-orfao`, aviso). */
export function curtainOrphanIssues(p: Project): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isWall(e) || !e.curtain) continue;
    const res = resolverParede(p, e);
    if (!res) continue;
    for (const o of res.orfas) {
      out.push({
        severity: 'warning',
        code: 'cortina-override-orfao',
        message: t('pt', 'md_ct_orphan_override', { x: formatQuantity(unitsOf(p), 'length', o.x, { unit: 'm', withUnit: false, decimals: 2 }), z: formatQuantity(unitsOf(p), 'length', o.z, { unit: 'm', withUnit: false, decimals: 2 }) }),
        elementId: e.id,
      });
    }
  }
  return out;
}
