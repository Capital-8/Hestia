/**
 * Subelementos da parede cortina (decisão 0056, fase 2; §4.3, §4.4 e §10): a lista de linhas de grade, segmentos e células de UMA cortina, na forma
 * das referências do modelo (`LineRef`, `SegmentRef`, `CellKey`), para o Tab percorrer; o subelemento sob um ponto (clique); e a geometria do destaque
 * (planta e 3D). TS puro sobre a grade que o kernel devolve (consulta 100): nada aqui calcula grade, só a lê e a traduz.
 *
 * Convenções (as do modelo, `curtainRemap.ts`): a linha gerada tem `index` = posição entre as GERADAS (1 a ng), `n` = ng + 1 e `pos` = posição/comprimento
 * do eixo; a linha extra é `{ added: id }`; as bordas são `index` 0 e `n`. `CellKey.nu`/`nv` contam todas as células (extras incluídas).
 *
 * Ordem do Tab (`proximoSubelemento`): parede, depois as linhas internas (U antes de V), os segmentos (todos, removidos inclusive, por linha e por k)
 * e as células, e volta à parede. A célula com esquadria (porta ou janela) tem, logo depois dela, a parada `opening` (esquadria). Clique
 * (`subelementoEmPonto`): primeiro a linha mais perto (dentro da tolerância), depois a célula que contém o ponto, que vira a esquadria se ela tem
 * uma (`subelementoDaCelula`). Segmento não é alvo de clique: só se chega a ele pelo Tab.
 */
import { isCurtainType, isWall, resolverParede, wallLength, type CellKey, type CurtainSpec, type Id, type LineOverride, type LineRef, type Project, type SegmentRef, type SubelementoCortina, type Wall } from '@hestia/model';
import { servicoCortina } from './kernelCortinaServico.ts';
import { zDaCortina } from './cortinaProjeto.ts';
import { ORIGEM_LINHA } from './kernelCortinaTabelas.ts';
import type { GradeCortina, LinhaGradeCortina, SegmentoCortina } from './kernelCortinaConsultas.ts';

/** Altura do corte da planta sobre o nível (m), a mesma da planta das cortinas. */
export const ALTURA_CORTE_CORTINA = 1.2;

/** Ponto no plano (m). */
export interface PontoCortina {
  x: number;
  y: number;
}

/** Geometria de um subelemento, em metros, na convenção do kernel (s ao longo da parede a partir de `a`; z a partir da base). */
export type GeoSubelementoCortina =
  | { kind: 'line'; axis: 'u' | 'v'; pos: number }
  | { kind: 'segment'; axis: 'u' | 'v'; pos: number; de: number; ate: number }
  | { kind: 'cell'; s0: number; s1: number; z0: number; z1: number };

export interface ItemSubelementoCortina {
  sub: SubelementoCortina;
  geo: GeoSubelementoCortina;
  /** Segmento removido pela grade (o montante saiu; o trecho continua selecionável para restaurar). */
  removido: boolean;
}

/** Subelementos de uma parede cortina, com a geometria da parede (eixo a→b, L, altura H, base z e profundidade do sistema). */
export interface ParedeSubelementos {
  wallId: Id;
  a: PontoCortina;
  b: PontoCortina;
  L: number;
  H: number;
  zBase: number;
  profundidade: number;
  itens: ItemSubelementoCortina[];
}

/** Linha extra da cortina com a posição já efetiva (a sobrescrita, se houver), para casar com a linha que o kernel devolve. */
export interface ExtraEfetiva {
  id: Id;
  axis: 'u' | 'v';
  pos: number;
}

export interface ContextoParede {
  wallId: Id;
  a: PontoCortina;
  b: PontoCortina;
  L: number;
  H: number;
  zBase: number;
  profundidade: number;
  extras: readonly ExtraEfetiva[];
  /** Células (i, j) que têm porta ou janela (sobrescrita `opening`, já na grade de hoje). Cada uma ganha uma parada extra, logo depois da célula. */
  esquadrias?: ReadonlyArray<{ i: number; j: number }>;
}

/**
 * Geometria do subelemento de esquadria. Hoje é o retângulo da região da célula (a mesma da célula); quando o kernel der o vão virtual (consulta 107),
 * é aqui que ele entra, no lugar do retângulo. Planta e 3D leem a geometria do item, então a troca não mexe nelas.
 */
export function geometriaDaEsquadria(celula: GeoSubelementoCortina & { kind: 'cell' }): GeoSubelementoCortina {
  return { kind: 'cell', s0: celula.s0, s1: celula.s1, z0: celula.z0, z1: celula.z1 };
}

// ───────────── referências ─────────────

/** Duas linhas são a mesma? Extra pelo id; gerada pelo eixo e pelo índice. */
export function mesmaLinha(a: LineRef, b: LineRef): boolean {
  if ('added' in a) return 'added' in b && a.added === b.added;
  if ('added' in b) return false;
  return a.axis === b.axis && a.index === b.index;
}

/** Mesmo subelemento (mesma parede, mesmo tipo e mesma referência). `null` = a própria parede. */
export function mesmoSubelemento(a: SubelementoCortina | null, b: SubelementoCortina | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.wallId !== b.wallId) return false;
  if (a.kind === 'line') return b.kind === 'line' && mesmaLinha(a.line, b.line);
  if (a.kind === 'segment') return b.kind === 'segment' && mesmaLinha(a.segment.line, b.segment.line) && a.segment.k === b.segment.k;
  // Célula e esquadria da mesma célula são subelementos diferentes (o Tab para em cada uma).
  return (a.kind === 'cell' || a.kind === 'opening') && b.kind === a.kind && a.cell.i === b.cell.i && a.cell.j === b.cell.j;
}

/** Item da lista que corresponde ao subelemento dado (ou `undefined`). */
export function itemDoSubelemento(parede: ParedeSubelementos, sub: SubelementoCortina | null): ItemSubelementoCortina | undefined {
  if (sub === null) return undefined;
  return parede.itens.find((it) => mesmoSubelemento(it.sub, sub));
}

// ───────────── lista (a partir da grade do kernel) ─────────────

/**
 * Traduz a grade de UMA cortina (consulta 100) para as referências do modelo. Puro: a grade e o contexto entram prontos.
 * Linha de grade sem extra correspondente (dado inconsistente) fica fora da lista; o Tab não quebra.
 */
export function montarParedeSubelementos(g: GradeCortina, ctx: ContextoParede): ParedeSubelementos {
  const { wallId, L, H } = ctx;
  const comprimento = { u: L, v: H };
  const porEixo = (eixo: 'u' | 'v'): LinhaGradeCortina[] => g.linhas.filter((l) => l.eixo === eixo).sort((x, y) => x.indice - y.indice);
  const linhas = { u: porEixo('u'), v: porEixo('v') };
  // Cortes do kernel (contam as extras): nº de colunas e de fileiras, e o nº de linhas geradas (sem as extras), que é o do modelo.
  const nKernel = { u: linhas.u.length + 1, v: linhas.v.length + 1 };
  const ng = {
    u: linhas.u.filter((l) => l.origem !== ORIGEM_LINHA.extra).length,
    v: linhas.v.filter((l) => l.origem !== ORIGEM_LINHA.extra).length,
  };
  const itens: ItemSubelementoCortina[] = [];
  const refDe = new Map<string, { ref: LineRef; pos: number }>();
  const usados = new Set<Id>();

  for (const eixo of ['u', 'v'] as const) {
    let geradas = 0;
    for (const l of linhas[eixo]) {
      let ref: LineRef;
      if (l.origem === ORIGEM_LINHA.extra) {
        const cand = ctx.extras.filter((e) => e.axis === eixo && !usados.has(e.id));
        if (cand.length === 0) continue;
        const melhor = cand.reduce((m, e) => (Math.abs(e.pos - l.pos) < Math.abs(m.pos - l.pos) ? e : m));
        usados.add(melhor.id);
        ref = { added: melhor.id };
      } else {
        geradas += 1;
        ref = { axis: eixo, index: geradas, pos: l.pos / comprimento[eixo], n: ng[eixo] + 1 };
      }
      refDe.set(`${eixo}:${l.indice}`, { ref, pos: l.pos });
      itens.push({ sub: { wallId, kind: 'line', line: ref }, geo: { kind: 'line', axis: eixo, pos: l.pos }, removido: false });
    }
  }

  // Segmentos: o índice global da linha é U = 0..nu (0 e nu são as bordas) e V = nu+1..nu+1+nv (nu+1 é a base).
  const contagem = new Map<number, number>();
  for (const s of g.segmentos) contagem.set(s.linha, (contagem.get(s.linha) ?? 0) + 1);
  const ordenados: SegmentoCortina[] = [...g.segmentos].sort((x, y) => x.linha - y.linha || x.k - y.k);
  for (const s of ordenados) {
    const dado = segmentoDaLinha(s, nKernel, ng, comprimento, refDe);
    if (!dado) continue;
    const { eixo, ref, pos } = dado;
    // O segmento corre ao longo da própria linha: a vertical (eixo U) mede-se em altura (H), a horizontal (eixo V), em comprimento (L).
    const aoLongo = eixo === 'u' ? H : L;
    const segment: SegmentRef = { line: ref, k: s.k, nk: contagem.get(s.linha) ?? 1, mid: (s.de + s.ate) / 2 / aoLongo };
    itens.push({ sub: { wallId, kind: 'segment', segment }, geo: { kind: 'segment', axis: eixo, pos, de: s.de, ate: s.ate }, removido: s.removido });
  }

  // Células: a grade já traz a célula cheia (sem descontar montantes), em metros. Célula com esquadria ganha a parada da esquadria logo depois.
  const comEsquadria = new Set((ctx.esquadrias ?? []).map((e) => `${e.i},${e.j}`));
  for (const c of g.celulas) {
    const cell: CellKey = {
      i: c.i,
      j: c.j,
      s: L > 0 ? (c.s0 + c.s1) / 2 / L : 0,
      z: H > 0 ? (c.z0 + c.z1) / 2 / H : 0,
      nu: nKernel.u,
      nv: nKernel.v,
    };
    const geo = { kind: 'cell' as const, s0: c.s0, s1: c.s1, z0: c.z0, z1: c.z1 };
    itens.push({ sub: { wallId, kind: 'cell', cell }, geo, removido: false });
    if (comEsquadria.has(`${c.i},${c.j}`)) itens.push({ sub: { wallId, kind: 'opening', cell }, geo: geometriaDaEsquadria(geo), removido: false });
  }

  return { wallId, a: ctx.a, b: ctx.b, L, H, zBase: ctx.zBase, profundidade: ctx.profundidade, itens };
}

/** Eixo, referência e posição de um segmento a partir do índice global da linha; `null` se a linha não está na grade. */
function segmentoDaLinha(
  s: SegmentoCortina,
  nKernel: { u: number; v: number },
  ng: { u: number; v: number },
  comprimento: { u: number; v: number },
  refDe: ReadonlyMap<string, { ref: LineRef; pos: number }>,
): { eixo: 'u' | 'v'; ref: LineRef; pos: number } | null {
  const eixo: 'u' | 'v' = s.linha <= nKernel.u ? 'u' : 'v';
  const idx = eixo === 'u' ? s.linha : s.linha - (nKernel.u + 1);
  const n = nKernel[eixo];
  if (idx === 0 || idx === n) {
    const fim = idx === n;
    return { eixo, ref: { axis: eixo, index: fim ? ng[eixo] + 1 : 0, pos: fim ? 1 : 0, n: ng[eixo] + 1 }, pos: fim ? comprimento[eixo] : 0 };
  }
  const achado = refDe.get(`${eixo}:${idx}`);
  return achado ? { eixo, ref: achado.ref, pos: achado.pos } : null;
}

// ───────────── navegação (Tab) e clique ─────────────

/**
 * Próximo subelemento no ciclo parede → itens → parede. `atual` null é a própria parede. Sem itens, o ciclo é só a parede (devolve `null`).
 * `atual` que não está na lista (sumiu) é tratado como a parede.
 */
export function proximoSubelemento(parede: ParedeSubelementos, atual: SubelementoCortina | null, reverso = false): SubelementoCortina | null {
  const itens = parede.itens;
  if (itens.length === 0) return null;
  const total = itens.length + 1;
  const idx = atual === null ? -1 : itens.findIndex((it) => mesmoSubelemento(it.sub, atual));
  const pos = idx + 1;
  const prox = (pos + (reverso ? total - 1 : 1)) % total;
  return prox === 0 ? null : itens[prox - 1]!.sub;
}

/**
 * Subelemento sob um ponto (s = distância ao longo da parede a partir de `a`; z = altura absoluta). Linha mais perto dentro de `tol`; senão a célula
 * que contém o ponto; senão `null` (a parede). Segmento não entra (só pelo Tab).
 */
export function subelementoEmPonto(parede: ParedeSubelementos, s: number, z: number, tol: number): SubelementoCortina | null {
  let melhor: SubelementoCortina | null = null;
  let dm = Number.POSITIVE_INFINITY;
  const zr = z - parede.zBase;
  for (const it of parede.itens) {
    if (it.geo.kind !== 'line') continue;
    const d = Math.abs((it.geo.axis === 'u' ? s : zr) - it.geo.pos);
    if (d <= tol && d < dm) {
      dm = d;
      melhor = it.sub;
    }
  }
  if (melhor) return melhor;
  for (const it of parede.itens) {
    const g = it.geo;
    if (it.sub.kind === 'cell' && g.kind === 'cell' && s >= g.s0 && s <= g.s1 && zr >= g.z0 && zr <= g.z1) return subelementoDaCelula(parede, it.sub.cell.i, it.sub.cell.j);
  }
  return null;
}

/**
 * Subelemento de UMA célula (i, j) da parede: a esquadria, se a célula tem porta ou janela; senão a própria célula; `null` se a célula não está na lista.
 * É o que o clique (planta e 3D) usa depois de achar a célula sob o ponto: célula com esquadria seleciona a esquadria, não a célula.
 */
export function subelementoDaCelula(parede: ParedeSubelementos, i: number, j: number): SubelementoCortina | null {
  const doMesmo = (it: ItemSubelementoCortina): boolean => (it.sub.kind === 'cell' || it.sub.kind === 'opening') && it.sub.cell.i === i && it.sub.cell.j === j;
  const esquadria = parede.itens.find((it) => it.sub.kind === 'opening' && doMesmo(it));
  if (esquadria) return esquadria.sub;
  return parede.itens.find((it) => it.sub.kind === 'cell' && doMesmo(it))?.sub ?? null;
}

// ───────────── geometria do destaque ─────────────

/** Ponto do plano (m) a `s` ao longo da parede e `n` para fora do eixo (lado +). */
function pontoPlano(p: ParedeSubelementos, s: number, n: number): PontoCortina {
  const ux = p.L > 0 ? (p.b.x - p.a.x) / p.L : 0;
  const uy = p.L > 0 ? (p.b.y - p.a.y) / p.L : 0;
  return { x: p.a.x + ux * s - uy * n, y: p.a.y + uy * s + ux * n };
}

/**
 * Traços do destaque em PLANTA, em metros: aberto (linha ou trecho de montante, atravessando a profundidade) ou fechado (faixa ou célula). Linha
 * horizontal (eixo V) e segmento horizontal ocupam a faixa do trecho; o montante aparece como traço, que é o que a planta mostra dele.
 */
export function tracosDoSubelementoPlanta(parede: ParedeSubelementos, item: ItemSubelementoCortina): Array<{ pts: PontoCortina[]; fechado: boolean }> {
  const h = parede.profundidade / 2;
  const g = item.geo;
  const faixa = (s0: number, s1: number): PontoCortina[] => [pontoPlano(parede, s0, -h), pontoPlano(parede, s1, -h), pontoPlano(parede, s1, h), pontoPlano(parede, s0, h)];
  if (g.kind === 'line' || g.kind === 'segment') {
    if (g.axis === 'u') return [{ pts: [pontoPlano(parede, g.pos, -h), pontoPlano(parede, g.pos, h)], fechado: false }];
    return g.kind === 'line' ? [{ pts: faixa(0, parede.L), fechado: true }] : [{ pts: faixa(g.de, g.ate), fechado: true }];
  }
  return [{ pts: faixa(g.s0, g.s1), fechado: true }];
}

/** Ponto 3D (m): `s` e `n` no plano da parede, `z` a partir da base. */
function ponto3(p: ParedeSubelementos, s: number, n: number, z: number): { x: number; y: number; z: number } {
  const q = pontoPlano(p, s, n);
  return { x: q.x, y: q.y, z: p.zBase + z };
}

/**
 * Traços do destaque em 3D, em segmentos de reta (dois pontos). Linha e trecho de montante são verticais (eixo U) ou horizontais (eixo V) no plano
 * central do sistema; célula é a caixa do painel (as duas faces e as arestas que as ligam).
 */
export function segmentosDoSubelemento3d(parede: ParedeSubelementos, item: ItemSubelementoCortina): Array<[{ x: number; y: number; z: number }, { x: number; y: number; z: number }]> {
  const g = item.geo;
  if (g.kind === 'line') {
    return g.axis === 'u' ? [[ponto3(parede, g.pos, 0, 0), ponto3(parede, g.pos, 0, parede.H)]] : [[ponto3(parede, 0, 0, g.pos), ponto3(parede, parede.L, 0, g.pos)]];
  }
  if (g.kind === 'segment') {
    return g.axis === 'u' ? [[ponto3(parede, g.pos, 0, g.de), ponto3(parede, g.pos, 0, g.ate)]] : [[ponto3(parede, g.de, 0, g.pos), ponto3(parede, g.ate, 0, g.pos)]];
  }
  const h = parede.profundidade / 2;
  const { s0, s1, z0, z1 } = g;
  const out: Array<[{ x: number; y: number; z: number }, { x: number; y: number; z: number }]> = [];
  for (const n of [-h, h]) {
    const c = [ponto3(parede, s0, n, z0), ponto3(parede, s1, n, z0), ponto3(parede, s1, n, z1), ponto3(parede, s0, n, z1)];
    for (let k = 0; k < 4; k++) out.push([c[k]!, c[(k + 1) % 4]!]);
  }
  for (const [s, z] of [[s0, z0], [s1, z0], [s1, z1], [s0, z1]] as const) out.push([ponto3(parede, s, -h, z), ponto3(parede, s, h, z)]);
  return out;
}

// ───────────── ligação ao kernel e ao projeto ─────────────

/** Extras da cortina com a posição efetiva (sobrescrita, se houver). Primeira ocorrência de cada id vale, como no modelo. */
function extrasEfetivas(inst: Wall['curtain']): ExtraEfetiva[] {
  const sobre = new Map<Id, LineOverride>();
  for (const ov of inst?.lineOverrides ?? []) if ('added' in ov.line && !sobre.has(ov.line.added)) sobre.set(ov.line.added, ov);
  const vistos = new Set<Id>();
  const out: ExtraEfetiva[] = [];
  for (const ex of inst?.addedLines ?? []) {
    if ((ex.axis !== 'u' && ex.axis !== 'v') || vistos.has(ex.id)) continue;
    vistos.add(ex.id);
    out.push({ id: ex.id, axis: ex.axis, pos: sobre.get(ex.id)?.pos ?? ex.pos });
  }
  return out;
}

/**
 * Subelementos de uma parede cortina, lidos da grade do kernel. `null` = não é cortina, o kernel não está pronto, ou a cortina não saiu na grade
 * (arco, tipo inválido). Sem kernel o Tab não tem o que percorrer; a planta e a 3D também não destacam nada.
 */
export function subelementosDaCortina(p: Project, wallId: Id): ParedeSubelementos | null {
  const w = p.elements[wallId];
  if (!isWall(w) || !isCurtainType(p.wallTypes[w.typeId])) return null;
  const tipo = p.wallTypes[w.typeId] as { curtain: CurtainSpec };
  const s = servicoCortina();
  if (!s.pronto()) return null;
  const g = s.grade(p, w.levelId)?.get(wallId);
  const z = zDaCortina(p, w);
  if (!g || !z) return null;
  return montarParedeSubelementos(g, {
    wallId,
    a: { x: w.a.x, y: w.a.y },
    b: { x: w.b.x, y: w.b.y },
    L: wallLength(w),
    H: z.height,
    zBase: z.z0,
    profundidade: tipo.curtain.depth,
    extras: extrasEfetivas(w.curtain),
    esquadrias: esquadriasDaCortina(p, w),
  });
}

/**
 * Células da cortina que têm porta ou janela, na grade de hoje. A esquadria vale para a REGIÃO inteira (uma célula canônica, §5.2): toda célula
 * da região conta, não só a canônica que guarda a chave.
 */
function esquadriasDaCortina(p: Project, w: Wall): Array<{ i: number; j: number }> {
  const r = resolverParede(p, w);
  if (!r) return [];
  const regioes = new Set<number>();
  for (const c of r.celulas) if (c.override.kind === 'opening') regioes.add(r.canon[c.key.i * r.nv + c.key.j]!);
  const out: Array<{ i: number; j: number }> = [];
  for (let i = 0; i < r.nu; i++) for (let j = 0; j < r.nv; j++) if (regioes.has(r.canon[i * r.nv + j]!)) out.push({ i, j });
  return out;
}

/** Cota de corte da planta de cortinas do nível (m, absoluta): a mesma do desenho. */
export function cotaDeCorteCortina(p: Project, levelId: Id): number {
  const nivel = p.levels.find((l) => l.id === levelId);
  return (nivel?.elevation ?? 0) + ALTURA_CORTE_CORTINA;
}

/**
 * Subelemento da cortina `wallId` sob um ponto do projeto: `ponto.z` é a altura absoluta (na planta, a do corte; na 3D, a da superfície
 * atingida). `tol` é a tolerância da linha (m). `null` se nada foi atingido ou se a parede não tem subelementos.
 */
export function subelementoDaCortinaEm(p: Project, wallId: Id, ponto: { x: number; y: number; z: number }, tol: number): SubelementoCortina | null {
  const par = subelementosDaCortina(p, wallId);
  return par ? subelementoEmPonto(par, sNaParede(par, ponto.x, ponto.y), ponto.z, tol) : null;
}

/** Distância (m) de `a` até a projeção do ponto (x, y) sobre o eixo da parede: a coordenada `s` que a grade usa. */
export function sNaParede(parede: ParedeSubelementos, x: number, y: number): number {
  const L = parede.L > 0 ? parede.L : 1;
  return ((x - parede.a.x) * (parede.b.x - parede.a.x) + (y - parede.a.y) * (parede.b.y - parede.a.y)) / L;
}
