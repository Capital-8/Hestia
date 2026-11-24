import { tentar, type CotaFamilia, type DetalheFamilia, type Eixo, type Familia, type Valor } from '@hestia/model';
import { projetarCorposPlanta } from './projecaoCorposPlanta.ts';
import { cortarCorpos, projetarCorposElevacao } from './cortarCorpos.ts';
import { resolverFamilia } from './resolver.ts';
import type { PecaResolvida } from './pecas.ts';
import type { PlanoSimbolo } from '@hestia/model';
import type { SimboloResolvido } from './corposTipos.ts';

/*
 * Detalhamento da família (ficha D4, CONTRATO §5): `detalharFamilia` devolve a geometria 2D de um `DetalheFamilia` (laços do
 * corte ou silhueta, contornos das peças, símbolos selecionados) e as cotas resolvidas. Tudo em METROS no plano da vista;
 * os textos da família são em mm. Vista: `planta` olha ao longo de z (plano xy), `elevacao` e `corte` olham ao longo de
 * `plano.eixo` (padrão y): eixo y → plano xz, eixo x → plano yz, eixo z → plano xy. `plano.sentido = -1` espelha o eixo
 * horizontal (olhar pelo outro lado). Corte sem `plano`: eixo y no meio da profundidade (P/2).
 * COTA: mede a distância entre duas referências ao longo do eixo do plano de referência (plano-plano exige o mesmo eixo) ou,
 * sem plano, do eixo dominante do segmento. Cota dirigida mostra o valor do PARÂMETRO; o medido sai em `medidoMm`. Texto:
 * `cota.texto` (fórmula) ou o valor em mm com 0 casas. ALTURA DO TEXTO: 2,5 mm de papel × escala (1:20 → 50 mm de modelo).
 * Nunca lança por entrada do usuário: problema vira diagnóstico e a cota (ou o detalhe) sai sem aquele item.
 */

export const ALTURA_TEXTO_PAPEL_MM = 2.5;

export interface DiagnosticoDetalhe {
  mensagem: string;
  /** `detalhe:<id>` ou `detalhe:<id>.cota:<id>`. */
  onde: string;
}

export interface CotaResolvida {
  id: string;
  /** Pontos medidos (m, no plano da vista) e a linha de cota deslocada (m). */
  de: [number, number];
  ate: [number, number];
  linha: { de: [number, number]; ate: [number, number] };
  eixo: Eixo;
  /** Valor mostrado (mm): o do parâmetro na cota dirigida, senão o medido. */
  valorMm: number;
  medidoMm: number;
  texto: string;
  parametro: string | null;
  /** Altura do texto no modelo (m): 2,5 mm de papel × escala. */
  alturaTexto: number;
}

export interface DetalheResolvido {
  id: string;
  nome: string;
  vista: DetalheFamilia['vista'];
  escala: number;
  /** Eixo ao longo do qual se olha. */
  eixoVista: Eixo;
  /** Laços/contornos fechados em pares (u, v) planos, em m. `cortados`: seção do corte; `contornos`: silhueta e peças. */
  cortados: number[][];
  contornos: number[][];
  simbolos: SimboloResolvido[];
  cotas: CotaResolvida[];
  alturaTexto: number;
  diagnosticos: DiagnosticoDetalhe[];
}

export const alturaTextoDoModelo = (escala: number): number => (ALTURA_TEXTO_PAPEL_MM * escala) / 1000;

type P3 = [number, number, number];
const EIXOS_DA_VISTA: Readonly<Record<Eixo, [Eixo, Eixo]>> = { z: ['x', 'y'], y: ['x', 'z'], x: ['y', 'z'] };
const PLANO_DA_VISTA: Readonly<Record<Eixo, PlanoSimbolo>> = { z: 'xy', y: 'xz', x: 'yz' };
const INDICE: Readonly<Record<Eixo, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 };
const arredondar = (v: number): number => Math.round(v * 1e6) / 1e6;
const formatarMm = (v: number): string => String(Math.round(v));

/** Referência resolvida: coordenadas conhecidas por eixo (m); plano só conhece o seu eixo. */
interface Ref {
  conhecido: Partial<Record<Eixo, number>>;
  eixoDoPlano: Eixo | null;
}

function numeroMm(expr: string, env: Readonly<Record<string, Valor>>): number | null {
  const r = tentar(expr, env);
  return r.ok && typeof r.valor === 'number' && Number.isFinite(r.valor) ? r.valor : null;
}

function projetar(p: P3, eixo: Eixo, espelha: boolean): [number, number] {
  const [a, b] = EIXOS_DA_VISTA[eixo];
  const u = p[INDICE[a]];
  return [arredondar(espelha ? -u : u), arredondar(p[INDICE[b]])];
}

function laco3dPara2d(laco: number[], eixo: Eixo, espelha: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i + 2 < laco.length; i += 3) out.push(...projetar([laco[i] ?? 0, laco[i + 1] ?? 0, laco[i + 2] ?? 0], eixo, espelha));
  return out;
}

/** Retângulo (u, v) da caixa da peça no plano da vista; `null` se o corte não a atravessa. */
function retanguloDaPeca(q: PecaResolvida, eixo: Eixo, espelha: boolean, posicaoCorteM: number | null): number[] | null {
  const [o, e] = [q.origem, q.extensao];
  const k = INDICE[eixo];
  if (posicaoCorteM !== null && !(o[k] <= posicaoCorteM && posicaoCorteM <= o[k] + e[k])) return null;
  const [a, b] = EIXOS_DA_VISTA[eixo];
  const [ia, ib] = [INDICE[a], INDICE[b]];
  const pts: [number, number][] = [[o[ia], o[ib]], [o[ia] + e[ia], o[ib]], [o[ia] + e[ia], o[ib] + e[ib]], [o[ia], o[ib] + e[ib]]];
  return pts.flatMap(([u, v]) => [arredondar(espelha ? -u : u), arredondar(v)]);
}

export function detalharFamilia(familia: Familia, tipo: string | undefined, valores: Readonly<Record<string, Valor>>, detalheId: string): DetalheResolvido | null {
  const detalhe = (Array.isArray(familia.detalhes) ? familia.detalhes : []).find((d) => d?.id === detalheId);
  if (detalhe === undefined) return null;
  const diagnosticos: DiagnosticoDetalhe[] = [];
  const onde = `detalhe:${detalhe.id}`;
  const escala = typeof detalhe.escala === 'number' && detalhe.escala > 0 ? detalhe.escala : 1;
  if (escala !== detalhe.escala) diagnosticos.push({ mensagem: 'escala inválida; usando 1:1', onde });
  const base = { id: detalhe.id, nome: detalhe.nome, vista: detalhe.vista, escala, alturaTexto: alturaTextoDoModelo(escala), diagnosticos };
  try {
    const res = resolverFamilia(familia, { ...(tipo !== undefined ? { tipoId: tipo } : {}), valores });
    const env = res.env;
    const eixo: Eixo = detalhe.vista === 'planta' ? 'z' : (detalhe.plano?.eixo ?? 'y');
    const espelha = detalhe.plano?.sentido === -1;
    const posicao = posicaoDoCorte(detalhe, env, eixo, diagnosticos, onde);

    const cortados: number[][] = [];
    const contornos: number[][] = [];
    const corpos = res.corpos ?? [];
    if (detalhe.vista === 'corte' && posicao !== null) {
      const normal: P3 = eixo === 'x' ? [1, 0, 0] : eixo === 'y' ? [0, 1, 0] : [0, 0, 1];
      const origem: P3 = [normal[0] * posicao, normal[1] * posicao, normal[2] * posicao];
      for (const lacos of cortarCorpos(corpos, { origem, normal }).cortado) for (const l of lacos) cortados.push(laco3dPara2d(l, eixo, espelha));
    } else if (eixo === 'z') {
      for (const c of projetarCorposPlanta(corpos, 'medium')) contornos.push(c);
    } else {
      for (const c of projetarCorposElevacao(corpos, eixo)) contornos.push(c);
    }
    for (const q of res.pecas) {
      const r = retanguloDaPeca(q, eixo, espelha, detalhe.vista === 'corte' ? posicao : null);
      if (r !== null) (detalhe.vista === 'corte' ? cortados : contornos).push(r);
    }
    if (espelha && detalhe.vista !== 'corte') for (const c of contornos) for (let i = 0; i < c.length; i += 2) c[i] = -(c[i] ?? 0);

    const simbolos = escolherSimbolos(detalhe, res.simbolos ?? [], eixo, diagnosticos, onde);
    const cotas: CotaResolvida[] = [];
    for (const c of detalhe.cotas ?? []) {
      const r = resolverCota(c, { familia, env, ligacoes: res.ligacoes ?? [], eixo, espelha, escala }, diagnosticos, `${onde}.cota:${c?.id}`);
      if (r !== null) cotas.push(r);
    }
    return { ...base, eixoVista: eixo, cortados, contornos, simbolos, cotas };
  } catch (e) {
    diagnosticos.push({ mensagem: `detalhe malformado: ${(e as Error).message}`, onde });
    return { ...base, eixoVista: 'y', cortados: [], contornos: [], simbolos: [], cotas: [] };
  }
}

function posicaoDoCorte(d: DetalheFamilia, env: Readonly<Record<string, Valor>>, eixo: Eixo, diag: DiagnosticoDetalhe[], onde: string): number | null {
  if (d.vista !== 'corte') return null;
  if (d.plano === undefined) {
    const dim = env[eixo === 'x' ? 'L' : eixo === 'y' ? 'P' : 'A'];
    return typeof dim === 'number' ? dim / 2000 : 0;
  }
  const mm = numeroMm(d.plano.posicao, env);
  if (mm === null) {
    diag.push({ mensagem: 'a posição do plano de corte não resolve para um número', onde: `${onde}.plano.posicao` });
    return null;
  }
  return mm / 1000;
}

function escolherSimbolos(d: DetalheFamilia, todos: SimboloResolvido[], eixo: Eixo, diag: DiagnosticoDetalhe[], onde: string): SimboloResolvido[] {
  const out: SimboloResolvido[] = [];
  for (const id of d.simbolos ?? []) {
    const s = todos.find((x) => x.id === id);
    if (s === undefined) continue; // sumiu por `quando` falso ou erro (já diagnosticado na resolução)
    if (s.plano !== PLANO_DA_VISTA[eixo]) {
      diag.push({ mensagem: `o símbolo “${id}” é do plano ${s.plano} e a vista pede ${PLANO_DA_VISTA[eixo]}`, onde: `${onde}.simbolos` });
      continue;
    }
    out.push(s);
  }
  return out;
}

interface ContextoCota {
  familia: Familia;
  env: Readonly<Record<string, Valor>>;
  ligacoes: { id: string; posicao: [number, number, number] }[];
  eixo: Eixo;
  espelha: boolean;
  escala: number;
}

function resolverRef(r: CotaFamilia['de'], ctx: ContextoCota, diag: DiagnosticoDetalhe[], onde: string): Ref | null {
  if (r?.tipo === 'plano') {
    const p = ctx.familia.planos.find((q) => q.id === r.id);
    const v = ctx.env[r.id];
    if (p === undefined || typeof v !== 'number') {
      diag.push({ mensagem: `o plano “${r.id}” não resolve`, onde });
      return null;
    }
    return { conhecido: { [p.eixo]: v / 1000 }, eixoDoPlano: p.eixo };
  }
  if (r?.tipo === 'ligacao') {
    const l = ctx.ligacoes.find((q) => q.id === r.id);
    if (l === undefined) {
      diag.push({ mensagem: `a ligação “${r.id}” não existe ou não está ativa neste tipo`, onde });
      return null;
    }
    return { conhecido: { x: l.posicao[0], y: l.posicao[1], z: l.posicao[2] }, eixoDoPlano: null };
  }
  if (r?.tipo === 'ponto') {
    const c = r.ponto.map((e) => numeroMm(e, ctx.env));
    if (c.includes(null)) {
      diag.push({ mensagem: 'uma coordenada do ponto não resolve para número', onde });
      return null;
    }
    const [x, y, z] = c as [number, number, number];
    return { conhecido: { x: x / 1000, y: y / 1000, z: z / 1000 }, eixoDoPlano: null };
  }
  diag.push({ mensagem: 'referência de cota inválida', onde });
  return null;
}

/** Eixo da medida: o do plano de referência, ou o dominante do segmento (empate: x, y, z). */
function eixoDaMedida(a: Ref, b: Ref, diag: DiagnosticoDetalhe[], onde: string): Eixo | null {
  if (a.eixoDoPlano !== null && b.eixoDoPlano !== null && a.eixoDoPlano !== b.eixoDoPlano) {
    diag.push({ mensagem: 'cota entre planos de eixos diferentes não tem direção de medida', onde });
    return null;
  }
  const plano = a.eixoDoPlano ?? b.eixoDoPlano;
  if (plano !== null) return plano;
  let melhor: Eixo = 'x';
  let maior = -1;
  for (const e of ['x', 'y', 'z'] as const) {
    const d = Math.abs((b.conhecido[e] ?? 0) - (a.conhecido[e] ?? 0));
    if (d > maior + 1e-12) { maior = d; melhor = e; }
  }
  return melhor;
}

function resolverCota(c: CotaFamilia, ctx: ContextoCota, diag: DiagnosticoDetalhe[], onde: string): CotaResolvida | null {
  const a = resolverRef(c.de, ctx, diag, `${onde}.de`);
  const b = resolverRef(c.ate, ctx, diag, `${onde}.ate`);
  if (a === null || b === null) return null;
  const medida = eixoDaMedida(a, b, diag, onde);
  if (medida === null) return null;
  const [h, v] = EIXOS_DA_VISTA[ctx.eixo];
  if (medida !== h && medida !== v) {
    diag.push({ mensagem: `a cota mede ao longo de ${medida}, que não está no plano desta vista`, onde });
    return null;
  }
  const cruzado: Eixo = medida === h ? v : h;
  const valA = a.conhecido[medida] ?? 0;
  const valB = b.conhecido[medida] ?? 0;
  const cruz = a.conhecido[cruzado] ?? b.conhecido[cruzado] ?? 0;
  let desloc = 0;
  if (c.deslocamento !== undefined) {
    const mm = numeroMm(c.deslocamento, ctx.env);
    if (mm === null) {
      diag.push({ mensagem: 'o deslocamento não resolve para número', onde: `${onde}.deslocamento` });
      return null;
    }
    desloc = mm / 1000;
  }
  const ponto = (m: number, cr: number): [number, number] => {
    const p: P3 = [0, 0, 0];
    p[INDICE[medida]] = m;
    p[INDICE[cruzado]] = cr;
    return projetar(p, ctx.eixo, ctx.espelha);
  };
  const medidoMm = Math.round(Math.abs(valB - valA) * 1e6) / 1e3;
  const dirigido = typeof c.parametro === 'string' ? ctx.env[c.parametro] : undefined;
  const valorMm = typeof dirigido === 'number' ? dirigido : medidoMm;
  let texto = formatarMm(valorMm);
  if (c.texto !== undefined) {
    const r = tentar(c.texto, ctx.env);
    if (r.ok) texto = typeof r.valor === 'number' ? formatarMm(r.valor) : String(r.valor);
    else diag.push({ mensagem: `texto da cota: ${r.erro.message}`, onde: `${onde}.texto` });
  }
  return {
    id: c.id,
    de: ponto(valA, cruz),
    ate: ponto(valB, cruz),
    linha: { de: ponto(valA, cruz + desloc), ate: ponto(valB, cruz + desloc) },
    eixo: medida,
    valorMm,
    medidoMm,
    texto,
    parametro: c.parametro ?? null,
    alturaTexto: alturaTextoDoModelo(ctx.escala),
  };
}
