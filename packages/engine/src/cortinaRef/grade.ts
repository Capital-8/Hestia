/**
 * Referência TS da grade da parede cortina (decisão 0056, §5.1, §5.2 e §4.3/§4.4): linhas de cada eixo nos quatro modos,
 * fusão da sobra minúscula, `offset`, células; e (fase 2) linhas extras (`addedLines`), linhas travadas e com posição
 * própria (`lineOverrides`), e o remapeamento das sobrescritas. Ângulo só 0 (ENTRADA para outro valor). Usada SÓ pela
 * paridade com o Rust.
 */
import {
  CURTAIN_MIN_REMAINDER, EPS_CMP, ID_AUSENTE, LIMITES, TOL_SOLDA, at, erroEntrada, erroLimite,
  type AddedGridLine, type CortinaEntrada, type GridAxisSpec, type LineOverride,
} from './tipos.ts';
import { ESTADO, orfa, remapearCelulas, remapearLinha, remapearSegmentos, resultado, type Remap } from './remap.ts';
import { aplicarRemocoes, type Remocao } from './segmentos.ts';

/** Aviso de eixo (informativo). `pos` é a posição (m) a partir do início/base. */
export interface AvisoEixo {
  codigo: 'sobra-fundida' | 'posicao-fora';
  /** sobra-fundida: largura da célula resultante; posicao-fora: a posição ignorada (m, já com o offset). */
  medido: number;
  /** sobra-fundida: 1,5 × lado nominal; posicao-fora: o comprimento do eixo. */
  limite: number;
  pos: number;
  /** sobra-fundida: índice da célula fundida no eixo (0 = primeira); posicao-fora: ordem da posição manual. */
  indice: number;
}

export interface EixoResolvido {
  /** Comprimento do eixo (L em U, H em V). */
  comprimento: number;
  /** Linhas internas, crescentes, em (0, comprimento). O índice de linha da grade é a posição nesta lista + 1. */
  linhas: number[];
  /** Bordas e linhas: [0, ...linhas, comprimento]. */
  bordas: number[];
  /** Número de células do eixo. */
  n: number;
  avisos: AvisoEixo[];
}

/** De onde vem cada linha da grade final (alinhado a `linhas`). */
export interface OrigemLinha {
  origem: 'gerada' | 'extra';
  /** Extra: id da `AddedGridLine`. */
  id?: string;
  /** Gerada: índice (1..n-1) na grade gerada, antes de extras e sobrescritas. */
  indiceGerado?: number;
  /** `locked` da linha (mantém a posição absoluta ao mudar o eixo). */
  travada: boolean;
  /** Montante desta linha: string = tipo, null = sem montante, undefined = o do papel. */
  mullionTypeId?: string | null;
}

/** Eixo com as linhas extras e sobrescritas aplicadas. `gerado` é a grade só do tipo + instância `grid`. */
export interface EixoCompleto extends EixoResolvido {
  origens: OrigemLinha[];
  gerado: EixoResolvido;
}

/** Eixo efetivo = `{ ...tipo, ...instância }` campo a campo; campo `undefined` da instância herda do tipo. */
export function eixoEfetivo(tipo: GridAxisSpec, inst?: Partial<GridAxisSpec>): GridAxisSpec {
  const out: Record<string, unknown> = { ...tipo };
  if (inst) for (const [k, v] of Object.entries(inst)) if (v !== undefined) out[k] = v;
  return out as unknown as GridAxisSpec;
}

/**
 * Posição atual (m) de uma linha gravada: `locked` = a posição absoluta; senão a fração `pos/L0` acompanha o eixo.
 * Sem `L0` (não gravado), a posição é absoluta.
 */
export function posicaoGravada(pos: number, locked: boolean, L0: number | undefined, A: number): number {
  if (locked || L0 === undefined || !(L0 > 0)) return pos;
  return (pos * A) / L0;
}

function dentro(p: number, A: number): boolean {
  return p > TOL_SOLDA && p < A - TOL_SOLDA;
}

/** Linhas internas de um eixo de comprimento `A` pelo tipo (sem extras). Ver §5.1. Lança `ENTRADA: ...` se inconsistente. */
export function linhasDoEixo(A: number, spec: GridAxisSpec): EixoResolvido {
  if (!(A > 0) || !Number.isFinite(A)) throw erroEntrada(`comprimento do eixo inválido (${A})`);
  if ((spec.angle ?? 0) !== 0) throw erroEntrada('angulo diferente de 0 não é suportado antes da fase 7');
  const o = spec.offset ?? 0;
  if (!Number.isFinite(o)) throw erroEntrada('offset inválido');
  const r = spec.minRemainder ?? CURTAIN_MIN_REMAINDER;
  if (!(r >= 0) || !Number.isFinite(r)) throw erroEntrada('minRemainder inválido');

  const avisos: AvisoEixo[] = [];
  let bruto: number[] = [];
  /** Lado nominal da célula (para o aviso de sobra fundida); 0 = sem nominal (manual). */
  let nominal = 0;
  /** Funde as pontas? fixedDistance sempre; fixedNumber/maxDistance só com offset diferente de 0; manual nunca. */
  let fundir = o !== 0 && spec.mode !== 'manual'; // manual: as linhas são do usuário, nunca se funde sobra

  switch (spec.mode) {
    case 'fixedNumber':
    case 'maxDistance': {
      let n: number;
      if (spec.mode === 'fixedNumber') {
        const c = spec.count;
        if (c === undefined || !Number.isInteger(c) || c < 1) throw erroEntrada('fixedNumber exige count inteiro >= 1');
        n = c;
        nominal = A / n;
      } else {
        const d = spec.distance;
        if (d === undefined || !(d > 0) || !Number.isFinite(d)) throw erroEntrada('maxDistance exige distance > 0');
        n = Math.max(1, Math.ceil(A / d - EPS_CMP));
        nominal = d;
      }
      // Padrão de n células iguais; com offset ele se desloca inteiro (as linhas k = 0 e k = n entram ou saem).
      for (let k = 0; k <= n; k++) bruto.push((A * k) / n + o);
      break;
    }
    case 'fixedDistance': {
      const d = spec.distance;
      if (d === undefined || !(d > 0) || !Number.isFinite(d)) throw erroEntrada('fixedDistance exige distance > 0');
      nominal = d;
      fundir = true;
      const m = Math.floor(A / d + EPS_CMP);
      if (m === 0) break; // eixo menor que d: uma célula só, o offset não tem célula cheia para deslocar
      const R = Math.max(0, A - m * d);
      const justify = spec.justify ?? 'start';
      const p0 = justify === 'start' ? 0 : justify === 'end' ? R : R / 2;
      // Padrão periódico p0 + k·d, deslocado de o; guarda os que caem em (0, A).
      const kmin = Math.floor((0 - p0 - o) / d) - 1;
      const kmax = Math.ceil((A - p0 - o) / d) + 1;
      for (let k = kmin; k <= kmax; k++) bruto.push(p0 + k * d + o);
      break;
    }
    case 'manual': {
      const pos = spec.positions;
      if (!pos) throw erroEntrada('manual exige positions');
      const ancora = spec.anchor ?? 'start';
      pos.forEach((p, ordem) => {
        if (!Number.isFinite(p)) throw erroEntrada('posição manual inválida');
        const q = (ancora === 'start' ? p : A - p) + o;
        if (!dentro(q, A)) avisos.push({ codigo: 'posicao-fora', medido: q, limite: A, pos: q, indice: ordem });
        else bruto.push(q);
      });
      break;
    }
    default:
      throw erroEntrada(`modo de grade desconhecido (${String((spec as { mode: unknown }).mode)})`);
  }

  // Filtra o que caiu no vão, ordena e solda (a primeira das duas linhas próximas vale).
  bruto = bruto.filter((p) => dentro(p, A)).sort((a, b) => a - b);
  const linhas: number[] = [];
  for (const p of bruto) if (linhas.length === 0 || p - at(linhas, linhas.length - 1) >= TOL_SOLDA) linhas.push(p);

  if (fundir && linhas.length > 0) {
    const avisar = (pos: number, largura: number, indice: number): void => {
      if (nominal > 0 && largura > 1.5 * nominal + EPS_CMP) avisos.push({ codigo: 'sobra-fundida', medido: largura, limite: 1.5 * nominal, pos, indice });
    };
    if (at(linhas, 0) < r - EPS_CMP) {
      const sumiu = linhas.shift() as number;
      avisar(sumiu, linhas[0] ?? A, 0);
    }
    if (linhas.length > 0 && A - at(linhas, linhas.length - 1) < r - EPS_CMP) {
      const sumiu = linhas.pop() as number;
      avisar(sumiu, A - (linhas[linhas.length - 1] ?? 0), linhas.length);
    }
  }

  return { comprimento: A, linhas, bordas: [0, ...linhas, A], n: linhas.length + 1, avisos };
}

interface ItemLinha {
  pos: number;
  origem: 'gerada' | 'extra';
  id?: string;
  genIdx?: number;
  travada: boolean;
  mullionTypeId?: string | null;
}

/**
 * Resolve um eixo com as linhas extras e as sobrescritas de linha (ADR §4.3 e §4.4). Sobrescritas de linha gerada são
 * remapeadas pela grade gerada; duas na mesma linha: vence a mais perto. Linhas a até 1e-6 uma da outra viram uma (vale a
 * extra). Linha que sai do vão (por sobrescrita ou extra) some com aviso `posicao-fora`.
 * Devolve o resultado do remapeamento de cada sobrescrita deste eixo, por `ordem` (o campo `b` é o eixo: 0 U, 1 V).
 */
export function resolverEixo(
  A: number,
  spec: GridAxisSpec,
  eixo: 'u' | 'v',
  adicionadas: readonly AddedGridLine[],
  sobrescritas: ReadonlyArray<{ ordem: number; override: LineOverride }>,
): { eixo: EixoCompleto; remap: Map<number, Remap> } {
  const gen = linhasDoEixo(A, spec);
  const avisos = [...gen.avisos];
  const code = eixo === 'u' ? 0 : 1;
  const remap = new Map<number, Remap>();
  const doEixo = adicionadas.filter((a) => a.axis === eixo);
  const extraDoEixo = new Set(doEixo.map((a) => a.id));

  // Sobrescritas de linha gerada (remapeadas) e de linha extra (só montante; posição é ENTRADA).
  const disputa = new Map<number, Array<{ ordem: number; ov: LineOverride; r: Remap; d: number }>>();
  const ovExtra = new Map<string, { ordem: number; ov: LineOverride }>();
  for (const { ordem, override: ov } of sobrescritas) {
    const ln = ov.line;
    if ('added' in ln) {
      if (!extraDoEixo.has(ln.added)) continue;
      if (ov.pos !== undefined) throw erroEntrada(`linha extra ${ln.added}: pos só vale em linha gerada`);
      if (ovExtra.has(ln.added)) {
        remap.set(ordem, { ...orfa(ESTADO.fusao, 0, 0, 0), b: code });
        continue;
      }
      ovExtra.set(ln.added, { ordem, ov });
      continue;
    }
    if (ln.axis !== eixo) continue;
    if (ln.index <= 0 || ln.index >= ln.n) {
      // Sobrescrita de linha de borda não tem campo no ADR (o montante da borda vem do tipo): sai órfã.
      remap.set(ordem, { ...orfa(ESTADO.fora, 0, 0, 0), b: code });
      continue;
    }
    const r = remapearLinha(ln, gen);
    if (r.estado !== ESTADO.adotada) {
      remap.set(ordem, { ...r, b: code });
      continue;
    }
    const d = Math.abs(ln.pos * A - at(gen.linhas, r.a - 1));
    const lista = disputa.get(r.a);
    const item = { ordem, ov, r, d };
    if (lista) lista.push(item);
    else disputa.set(r.a, [item]);
  }
  const aplicada = new Map<number, LineOverride>();
  const pendentesGen: Array<{ ordem: number; genIdx: number; r: Remap }> = [];
  for (const [genIdx, lista] of disputa) {
    let vence = lista[0] as (typeof lista)[number];
    for (const c of lista) if (c.d < vence.d) vence = c;
    aplicada.set(genIdx, vence.ov);
    pendentesGen.push({ ordem: vence.ordem, genIdx, r: vence.r });
    for (const c of lista) {
      if (c !== vence) remap.set(c.ordem, { ...c.r, estado: ESTADO.fusao, a: ID_AUSENTE, b: code });
    }
  }

  // Itens: linhas geradas (com a sobrescrita vencedora) e extras (com a posição gravada).
  const itens: ItemLinha[] = gen.linhas.map((p, k) => {
    const ov = aplicada.get(k + 1);
    const item: ItemLinha = { pos: p, origem: 'gerada', genIdx: k + 1, travada: false };
    if (ov) {
      item.travada = ov.locked ?? false;
      if (ov.pos !== undefined) item.pos = posicaoGravada(ov.pos, item.travada, ov.comprimentoGravado, A);
      if (ov.mullionTypeId !== undefined) item.mullionTypeId = ov.mullionTypeId;
    }
    return item;
  });
  for (const ad of doEixo) {
    const ov = ovExtra.get(ad.id);
    const item: ItemLinha = {
      pos: posicaoGravada(ad.pos, ad.locked ?? false, ad.comprimentoGravado, A),
      origem: 'extra', id: ad.id, travada: ad.locked ?? false,
    };
    const mt = ov && ov.ov.mullionTypeId !== undefined ? ov.ov.mullionTypeId : ad.mullionTypeId;
    if (mt !== undefined) item.mullionTypeId = mt;
    itens.push(item);
  }

  const dentroDoVao: ItemLinha[] = [];
  for (const it of itens) {
    if (dentro(it.pos, A)) dentroDoVao.push(it);
    else avisos.push({ codigo: 'posicao-fora', medido: it.pos, limite: A, pos: it.pos, indice: 0 });
  }

  // Ordena e solda (1e-6): entre uma gerada e uma extra, vale a extra; entre iguais, a primeira.
  dentroDoVao.sort((x, y) => x.pos - y.pos);
  const fin: ItemLinha[] = [];
  const perdidas = new Set<number>();
  for (const it of dentroDoVao) {
    const ultimo = fin[fin.length - 1];
    if (ultimo && it.pos - ultimo.pos < TOL_SOLDA) {
      if (it.origem === 'extra' && ultimo.origem === 'gerada') {
        fin[fin.length - 1] = it;
        if (ultimo.genIdx !== undefined) perdidas.add(ultimo.genIdx);
      } else if (it.genIdx !== undefined) {
        perdidas.add(it.genIdx);
      }
      continue;
    }
    fin.push(it);
  }
  if (fin.length > LIMITES.linhasPorEixo) throw erroLimite(`mais de ${LIMITES.linhasPorEixo} linhas num eixo`);

  const linhas = fin.map((it) => it.pos);
  const origens: OrigemLinha[] = fin.map((it) => {
    const o: OrigemLinha = { origem: it.origem, travada: it.travada };
    if (it.id !== undefined) o.id = it.id;
    if (it.genIdx !== undefined) o.indiceGerado = it.genIdx;
    if (it.mullionTypeId !== undefined) o.mullionTypeId = it.mullionTypeId;
    return o;
  });

  // Resultados finais: a linha gerada alvo (ou órfã por fusão/fora), e a extra pelo id.
  for (const p of pendentesGen) {
    const idx = fin.findIndex((it) => it.genIdx === p.genIdx);
    if (idx >= 0) {
      remap.set(p.ordem, resultado(ESTADO.adotada, p.r.regra, idx + 1, code, at(linhas, idx) / A, 0, at(linhas, idx), 0));
    } else {
      remap.set(p.ordem, { ...p.r, estado: perdidas.has(p.genIdx) ? ESTADO.fusao : ESTADO.fora, a: ID_AUSENTE, b: code });
    }
  }
  for (const [id, { ordem }] of ovExtra) {
    const idx = fin.findIndex((it) => it.id === id);
    remap.set(ordem, idx >= 0
      ? resultado(ESTADO.adotada, 1, idx + 1, code, at(linhas, idx) / A, 0, at(linhas, idx), 0)
      : { ...orfa(ESTADO.fora, 0, 0, 0), b: code });
  }

  return {
    eixo: { comprimento: A, linhas, bordas: [0, ...linhas, A], n: linhas.length + 1, avisos, origens, gerado: gen },
    remap,
  };
}

export interface Celula {
  /** Coluna (U), 0 = a primeira a partir do início. */
  i: number;
  /** Fileira (V), 0 = a de baixo. */
  j: number;
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

export interface GradeResolvida {
  L: number;
  H: number;
  u: EixoCompleto;
  v: EixoCompleto;
  nu: number;
  nv: number;
  /** Ordem de saída: coluna i primeiro, depois fileira j (i-major). */
  celulas: Celula[];
  eixoU: GridAxisSpec;
  eixoV: GridAxisSpec;
  /** Resultado do remapeamento de cada sobrescrita, na ordem da instância (`cells`, `lineOverrides`, `removedSegments`). */
  remap: { celulas: Remap[]; linhas: Remap[]; segmentos: Remap[] };
  /** Regiões fundidas e segmentos sem montante (§5.2). */
  remocao: Remocao;
}

/**
 * Resolve a grade inteira com a instância: eixos (extras e sobrescritas de linha), células, remapeamento das sobrescritas
 * de célula e de segmento, remoções e regiões. Lança `ENTRADA` ou `LIMITE` quando a entrada é inconsistente.
 */
export function resolverGrade(e: CortinaEntrada): GradeResolvida {
  const inst = e.instancia ?? {};
  const added = inst.addedLines ?? [];
  const lo = inst.lineOverrides ?? [];
  const rs = inst.removedSegments ?? [];
  const cells = inst.cells ?? [];
  if (added.length > LIMITES.addedLines) throw erroLimite(`mais de ${LIMITES.addedLines} linhas extras`);
  if (lo.length > LIMITES.lineOverrides) throw erroLimite(`mais de ${LIMITES.lineOverrides} sobrescritas de linha`);
  if (rs.length > LIMITES.removedSegments) throw erroLimite(`mais de ${LIMITES.removedSegments} segmentos removidos`);
  if (cells.length > LIMITES.cells) throw erroLimite(`mais de ${LIMITES.cells} sobrescritas de célula`);
  const ids = new Set<string>();
  for (const a of added) {
    if (ids.has(a.id)) throw erroEntrada(`id de linha extra repetido (${a.id})`);
    ids.add(a.id);
  }
  for (const c of cells) {
    if (c.override.kind !== 'panel') throw erroEntrada('porta ou janela na célula é da fase 5 (fora da fase 2)');
  }

  const eixoU = eixoEfetivo(e.tipo.u, inst.grid?.u);
  const eixoV = eixoEfetivo(e.tipo.v, inst.grid?.v);
  const sob = lo.map((override, ordem) => ({ ordem, override }));
  const U = resolverEixo(e.L, eixoU, 'u', added, sob);
  const V = resolverEixo(e.H, eixoV, 'v', added, sob);
  const nu = U.eixo.n;
  const nv = V.eixo.n;
  if (nu * nv > LIMITES.celulas) throw erroLimite(`mais de ${LIMITES.celulas} células`);

  const celulas: Celula[] = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      celulas.push({ i, j, s0: at(U.eixo.bordas, i), s1: at(U.eixo.bordas, i + 1), z0: at(V.eixo.bordas, j), z1: at(V.eixo.bordas, j + 1) });
    }
  }
  const linhasRemap: Remap[] = lo.map((_, ordem) => U.remap.get(ordem) ?? V.remap.get(ordem) ?? { ...orfa(ESTADO.fora, 0, 0, 0), b: ID_AUSENTE });

  const g: GradeResolvida = {
    L: e.L, H: e.H, u: U.eixo, v: V.eixo, nu, nv, celulas, eixoU, eixoV,
    remap: { celulas: [], linhas: linhasRemap, segmentos: [] },
    remocao: aplicarRemocoes({ nu, nv }, []),
  };
  g.remap.celulas = remapearCelulas(cells.map((c) => c.key), g);
  g.remap.segmentos = remapearSegmentos(rs, g);
  const lista = g.remap.segmentos.flatMap((r, ordem) => (r.estado === ESTADO.adotada ? [{ ordem, a: r.a, b: r.b }] : []));
  g.remocao = aplicarRemocoes(g, lista);

  // Duas sobrescritas de célula numa mesma região (fusão por remoção de segmento): vence a de menor distância ao centro.
  const regiaoPorCanon = new Map(g.remocao.regioes.map((r) => [r.canon, r]));
  const porRegiao = new Map<number, number[]>();
  g.remap.celulas.forEach((r, ordem) => {
    if (r.estado !== ESTADO.adotada) return;
    const canon = at(g.remocao.regiaoDeCelula, r.a * nv + r.b);
    const l = porRegiao.get(canon);
    if (l) l.push(ordem);
    else porRegiao.set(canon, [ordem]);
  });
  for (const [canon, ordens] of porRegiao) {
    if (ordens.length < 2) continue;
    const reg = regiaoPorCanon.get(canon);
    if (!reg) continue;
    const cx = (at(U.eixo.bordas, reg.i0) + at(U.eixo.bordas, reg.i1 + 1)) / 2;
    const cz = (at(V.eixo.bordas, reg.j0) + at(V.eixo.bordas, reg.j1 + 1)) / 2;
    const dist = (ordem: number): number => {
      const r = g.remap.celulas[ordem] as Remap;
      return Math.hypot(r.px - cx, r.pz - cz);
    };
    let vence = ordens[0] as number;
    for (const o of ordens) if (dist(o) < dist(vence)) vence = o;
    for (const o of ordens) {
      if (o === vence) continue;
      const r = g.remap.celulas[o] as Remap;
      g.remap.celulas[o] = { ...r, estado: ESTADO.fusao, a: ID_AUSENTE, b: ID_AUSENTE };
    }
  }
  return g;
}
