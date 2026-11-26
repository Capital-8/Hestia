import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import { lerTuboMov, regrasDoTubo, tipoSemConexoes, type RegrasConexao, type TuboLido } from '@hestia/engine';
import { isComponent, type Component, type Id, type Project } from '@hestia/model';
import { CONFIG_ELETRODUTO, EletrodutoTool, opcoesEletroduto } from './eletrodutoTool.ts';
import { CONFIG_TUBO, opcoesTubo, TuboTool, type OpcoesTraco } from './tuboTool.ts';
import type { PontoTubo } from './tuboGeometria.ts';
import type { ToolEnv } from './types.ts';

/*
 * Trecho de tubo ou eletroduto como ALVO das ferramentas da aba Modificar (fase 4, ficha F6a): leitura do trecho sob o cursor, pegada
 * em planta, e a fábrica da ferramenta de traçado que grava rotas (prumada, joelhos, tubos curtos) com a MESMA conta do clique do Tubo.
 */

export type { TuboLido };

/** Trecho pronto para editar: a instância lida, as pontas no mundo (m) e a ferramenta que o traça. */
export interface TrechoAlvo {
  id: Id;
  tubo: TuboLido;
  a: [number, number, number];
  b: [number, number, number];
  ferramenta: 'tubo' | 'eletroduto';
}

/** Ferramenta de traçado do trecho (pelo domínio da ligação): eletroduto ou tubo. */
export function ferramentaDoTubo(t: TuboLido): 'tubo' | 'eletroduto' {
  return t.a.dominio === 'eletroduto' ? 'eletroduto' : 'tubo';
}

/** Trecho `id` do projeto, ou `null` se não é um trecho reto de tubo ou eletroduto. */
export function trechoDoProjeto(p: Project, id: Id): TrechoAlvo | null {
  const c = p.elements[id];
  const t = isComponent(c) ? lerTuboMov(p, c) : null;
  return t ? { id, tubo: t, a: [...t.a.posicaoMundo], b: [...t.b.posicaoMundo], ferramenta: ferramentaDoTubo(t) } : null;
}

/** Toda instância do nível que é trecho de tubo. */
export function trechosDoNivel(p: Project, levelId: Id): TrechoAlvo[] {
  const out: TrechoAlvo[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e) || e.levelId !== levelId) continue;
    const t = trechoDoProjeto(p, e.id);
    if (t) out.push(t);
  }
  return out;
}

/** Distância em planta do ponto `at` ao eixo do trecho e o ponto do eixo mais perto (m). Trecho vertical vira um ponto. */
export function pegadaDoEixo(t: TrechoAlvo, at: Vec2): { d: number; ponto: Vec2; s: number } {
  const A: Vec2 = { x: t.a[0], y: t.a[1] };
  const B: Vec2 = { x: t.b[0], y: t.b[1] };
  const ponto = closestOnSegment(at, A, B);
  const h = dist(A, B);
  return { d: dist(at, ponto), ponto, s: h < 1e-9 ? 0 : dist(A, ponto) / h };
}

/** Trecho de tubo cujo eixo está a até `tol` (m) de `at` em planta; o de cota mais perto de `z` vence se houver vários. */
export function trechoEm(p: Project, levelId: Id, at: Vec2, tol: number, zRef?: number): TrechoAlvo | null {
  let melhor: TrechoAlvo | null = null;
  let chave = Infinity;
  for (const t of trechosDoNivel(p, levelId)) {
    const g = pegadaDoEixo(t, at);
    if (g.d > tol) continue;
    const z = t.a[2] + (t.b[2] - t.a[2]) * g.s;
    const k = zRef === undefined ? g.d : Math.abs(z - zRef) * 1000 + g.d;
    if (k < chave) {
      melhor = t;
      chave = k;
    }
  }
  return melhor;
}

/** Regras de conexão do tipo do trecho (`null` no corrugado e em família sem tipo nem domínio). */
export function regrasDoTrecho(t: TuboLido): RegrasConexao | null {
  return regrasDoTubo(t.c.familyId, t.a.dominio);
}

/** O trecho é corrugado (sem conexões): muda de direção e de cota livremente. */
export const ehCorrugado = (t: TuboLido): boolean => tipoSemConexoes(t.c.familyId) !== undefined;

/** Ajustes de traçado correntes da ferramenta do domínio (o modo de cota é o preferido do usuário). */
export function opcoesDoDominio(f: 'tubo' | 'eletroduto'): OpcoesTraco {
  return f === 'eletroduto' ? opcoesEletroduto : opcoesTubo;
}

/**
 * Ferramenta de traçado para gravar rotas do trecho `c`: o mesmo motor do Tubo ou do Eletroduto, com a família e o DN do trecho (não os
 * ajustes da paleta). Ela só é usada por `gravarRota`; nunca é a ferramenta ativa.
 */
export function ferramentaDeRota(env: ToolEnv, c: Component, t: TuboLido): TuboTool {
  const f = ferramentaDoTubo(t);
  const base = f === 'eletroduto' ? CONFIG_ELETRODUTO : CONFIG_TUBO;
  const opcoes: OpcoesTraco = { dn: t.dn > 0 ? t.dn : opcoesDoDominio(f).dn, z: t.a.posicaoMundo[2], declividade: 0, modoCota: opcoesDoDominio(f).modoCota, familiaId: c.familyId };
  const cfg = { ...base, opcoes, familiaInicial: () => c.familyId, respeitaEntradas: true, avisosDepois: undefined };
  return f === 'eletroduto' ? new EletrodutoTool(env, cfg) : new TuboTool(env, cfg);
}

/** Ponto de traçado sobre a porta `ligacaoId` de `componentId`; com `direcao` (unitária, para fora da porta) a rota sai e chega de frente para ela. */
export function pontoDaPorta(xyz: readonly number[], componentId: Id, ligacaoId: string, direcao?: readonly number[]): PontoTubo {
  return { xyz: [xyz[0] ?? 0, xyz[1] ?? 0, xyz[2] ?? 0], alvo: { componentId, ligacaoId }, ...(direcao ? { direcao: [direcao[0] ?? 0, direcao[1] ?? 0, direcao[2] ?? 0] as [number, number, number] } : {}) };
}
