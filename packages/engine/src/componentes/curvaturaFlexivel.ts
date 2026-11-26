import { isComponent, type Component, type Familia, type Id, type Project } from '@hestia/model';
import { resolverComponente } from './instancia.ts';
import { ligacaoNoMundo, type LigacaoNoMundo } from './ligacoesEncaixe.ts';
import { resolverFamilia } from './resolver.ts';
import { tipoDaFamiliaDeTubo, type TipoTubulacao } from './tiposTubulacao.ts';

/*
 * Curvatura do eletroduto CORRUGADO (fase 4, ficha F2). O trecho flexível não tem curva nem luva: o canto entre dois trechos retos é um
 * arco de raio R (o raio mínimo de curvatura do tipo, CONFERIR) tangente aos dois. Para um canto de desvio θ (0° = em linha reta) o
 * arco consome `R · tan(θ / 2)` de CADA trecho (a tangente); os dois cantos de um mesmo trecho não podem se sobrepor, então
 * tangente do início + tangente do fim ≤ comprimento do trecho. Esta é a única regra: não há ângulo máximo escolhido, só a geometria
 * (o desvio perto de 180° pede tangente enorme e por isso nunca cabe). Unidades: mm, graus; vetores de direção unitários.
 */

/** Desvio (graus) acima do qual o cálculo satura (a tangente tenderia ao infinito: o canto nunca cabe). */
const DESVIO_MAXIMO = 179;
/** Folga (mm) ao comparar o comprimento do trecho com as tangentes (erro de arredondamento das ligações). */
export const FOLGA_CURVATURA = 0.5;

type V3 = readonly [number, number, number];

/** Tipo de tubulação sem conexões (corrugado) da família `familyId`, ou `undefined`. */
export function tipoSemConexoes(familyId: string): TipoTubulacao | undefined {
  const t = tipoDaFamiliaDeTubo(familyId);
  return t?.semConexoes === true ? t : undefined;
}

/** Diâmetro externo (mm) do trecho: o parâmetro `De` da família na bitola `dn`; sem ele, o próprio DN. */
export function diametroExternoDoTrecho(familia: Familia, dn: number): number {
  const de = resolverFamilia(familia, { valores: { DN: dn, L: 1000 } }).env.De;
  return typeof de === 'number' && de > 0 ? de : dn;
}

/** Raio mínimo (mm) da bitola `dn` do tipo: `porBitola` se houver, senão fator × diâmetro externo. `null` se o tipo não declara raio. */
export function raioMinimoMm(tipo: TipoTubulacao, familia: Familia, dn: number): number | null {
  const r = tipo.raioMinimoCurvatura;
  if (!r) return null;
  return r.porBitola?.[dn] ?? r.fatorDiametroExterno * diametroExternoDoTrecho(familia, dn);
}

/** Desvio (graus, 0 a 180) entre dois sentidos de percurso. */
export function desvioEntre(u: V3, v: V3): number {
  const nu = Math.hypot(...u);
  const nv = Math.hypot(...v);
  if (nu < 1e-12 || nv < 1e-12) return 0;
  const c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** Tangente (mm) de um canto de desvio `desvio` (graus) com raio `raio` (mm): R·tan(θ/2); 0 em linha reta (menos de 0,5°). */
export function tangenteDoCanto(raio: number, desvio: number): number {
  if (desvio < 0.5) return 0;
  return raio * Math.tan((Math.min(desvio, DESVIO_MAXIMO) * Math.PI) / 360);
}

/** Ligação de `c` já no mundo, por id. */
function ligacaoDe(p: Project, c: Component, id: string): LigacaoNoMundo | null {
  const l = (resolverComponente(p, c).ligacoes ?? []).find((x) => x.id === id);
  return l ? ligacaoNoMundo(l, c) : null;
}

/** Dados de um trecho flexível do projeto: comprimento (mm), raio mínimo (mm), as duas ligações no mundo e o tipo. */
export interface TrechoFlexivel {
  c: Component;
  comprimento: number;
  raio: number;
  inicio: LigacaoNoMundo;
  fim: LigacaoNoMundo;
}

/** Trecho flexível do projeto (família de tipo `semConexoes`, duas ligações, DN conhecido); `null` se `c` não é. */
export function trechoFlexivel(p: Project, c: Component): TrechoFlexivel | null {
  const tipo = tipoSemConexoes(c.familyId);
  const familia = p.componentFamilies?.[c.familyId];
  const dn = typeof c.values?.DN === 'number' ? c.values.DN : null;
  if (!tipo || !familia || dn === null) return null;
  const ligs = [...(resolverComponente(p, c).ligacoes ?? [])].sort((a, b) => a.posicao[2] - b.posicao[2]);
  const i = ligs[0];
  const f = ligs[ligs.length - 1];
  const raio = raioMinimoMm(tipo, familia, dn);
  if (ligs.length < 2 || !i || !f || raio === null) return null;
  const a = ligacaoNoMundo(i, c);
  const b = ligacaoNoMundo(f, c);
  const comprimento = Math.hypot(b.posicaoMundo[0] - a.posicaoMundo[0], b.posicaoMundo[1] - a.posicaoMundo[1], b.posicaoMundo[2] - a.posicaoMundo[2]) * 1000;
  return { c, comprimento, raio, inicio: a, fim: b };
}

/**
 * Desvio (graus) do canto de uma ponta flexível `lig` ligada a `outra` (outro trecho, caixa ou dispositivo). Reto = a direção para
 * fora de uma é o oposto da outra; o desvio é o ângulo entre a direção para fora de `lig` e a oposta da de `outra`.
 */
export function desvioDaLigacao(lig: LigacaoNoMundo, outra: LigacaoNoMundo): number {
  return desvioEntre(lig.direcaoMundo, [-outra.direcaoMundo[0], -outra.direcaoMundo[1], -outra.direcaoMundo[2]]);
}

/** Tangente (mm) que a conexão gravada da ponta `lig` de `t` já consome do trecho (0 se a ponta está aberta ou o outro lado não existe). */
export function tangenteGravada(p: Project, t: TrechoFlexivel, lig: LigacaoNoMundo): number {
  const cx = t.c.ligacoes?.[lig.id];
  const outro = cx ? p.elements[cx.componenteId] : undefined;
  if (!cx || !isComponent(outro)) return 0;
  const alvo = ligacaoDe(p, outro, cx.ligacaoId);
  return alvo ? tangenteDoCanto(t.raio, desvioDaLigacao(lig, alvo)) : 0;
}

/** Problema de curvatura de um trecho: comprimento que as tangentes pedem e o que ele tem (mm). */
export interface CurvaturaFechada {
  elementId: Id;
  necessario: number;
  disponivel: number;
}

/** Trechos flexíveis do projeto cujos cantos não cabem no próprio comprimento (raio mínimo). Função pura; nunca lança. */
export function curvaturasFechadas(p: Project): CurvaturaFechada[] {
  const out: CurvaturaFechada[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e)) continue;
    const t = trechoFlexivel(p, e);
    if (!t) continue;
    const necessario = tangenteGravada(p, t, t.inicio) + tangenteGravada(p, t, t.fim);
    if (necessario > t.comprimento + FOLGA_CURVATURA) out.push({ elementId: e.id, necessario, disponivel: t.comprimento });
  }
  return out;
}

/** Direção (unitária, para fora) da ligação `ligacaoId` da instância `componentId` no mundo, ou `null`. */
export function direcaoDaLigacao(p: Project, componentId: Id, ligacaoId: string): LigacaoNoMundo | null {
  const c = p.elements[componentId];
  return isComponent(c) ? ligacaoDe(p, c, ligacaoId) : null;
}
