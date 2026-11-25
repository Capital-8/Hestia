import type { Vec2 } from '@hestia/geom';
import { comprimentoDoSegmento, encaixarLigacoes, ligacaoNoMundo, resolverComponente, resolverFamilia, type LigacaoNoMundo, type LigacaoResolvida, type PontoSegmento, type RegrasConexao } from '@hestia/engine';
import { formatQuantity, isComponent, unitsOf, type Familia, type Id, type Project } from '@hestia/model';
import type { PreviewItem } from './types.ts';

/* Apoio do traçado de tubulação (extraído do `tuboTool.ts` na ficha C3, para a ferramenta Eletroduto reaproveitar o motor sem duplicar). */

/** As duas pontas do tubo: a ligação do início (menor z local) e a do fim (maior z local). */
export interface PontasDoTubo {
  inicio: LigacaoResolvida;
  fim: LigacaoResolvida;
}

/** Contexto da ferramenta: a família do tubo e as pontas dela. */
export interface ContextoTraco {
  familia: Familia;
  pontas: PontasDoTubo;
}

/** Verdadeiro se o projeto tem alguma família de conexão (não o tubo) das regras. */
export function temConexoes(p: Project, r: RegrasConexao): boolean {
  return Object.entries(r).some(([k, id]) => k !== 'tubo' && id !== '' && p.componentFamilies?.[id] !== undefined);
}

/** Ligação aberta de uma instância do projeto, já no mundo. */
export interface LigacaoAberta {
  componentId: Id;
  lig: LigacaoNoMundo;
}

/** Pontas da família para o DN pedido (resolve com `L` de 1 m só para achar as posições); null se não tem duas ligações. */
export function pontasDoTubo(familia: Familia, dn: number): PontasDoTubo | null {
  const ligs = [...resolverFamilia(familia, { valores: { DN: dn, L: 1000 } }).ligacoes ?? []].sort((a, b) => a.posicao[2] - b.posicao[2]);
  const inicio = ligs[0];
  const fim = ligs[ligs.length - 1];
  return ligs.length >= 2 && inicio && fim ? { inicio, fim } : null;
}

/** Ligações abertas por projeto (N4): o mouse pedia a lista a cada movimento; o projeto novo a cada comando invalida sozinho. */
const ABERTAS = new WeakMap<Project, LigacaoAberta[]>();

/** Ligações abertas (sem conexão) de todas as instâncias do projeto, no mundo. */
export function ligacoesAbertas(p: Project): LigacaoAberta[] {
  const guardada = ABERTAS.get(p);
  if (guardada) return guardada;
  const saida: LigacaoAberta[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e) || !p.componentFamilies?.[e.familyId]?.ligacoes?.length) continue;
    for (const lig of resolverComponente(p, e).ligacoes ?? []) {
      if (e.ligacoes?.[lig.id] === undefined) saida.push({ componentId: e.id, lig: ligacaoNoMundo(lig, e) });
    }
  }
  ABERTAS.set(p, saida);
  return saida;
}

/**
 * Ligação aberta mais próxima de `(x, y)` que casa com a ponta do tubo (domínio, seção, DN e fluxo, por `encaixarLigacoes`).
 * Em planta o z do cursor é desconhecido: a distância usa o z da própria candidata. A direção do tubo ainda não existe (depende
 * do outro ponto), então a ponta é posta de frente para a candidata; `bitolaLivre` (há redução no projeto) ignora o DN.
 */
export function ligacaoProxima(x: number, y: number, ponta: LigacaoResolvida, abertas: LigacaoAberta[], tolerancia: number, bitolaLivre = false, zRef?: number): LigacaoAberta | null {
  let melhor: LigacaoAberta | null = null;
  let melhorD = Infinity;
  // Empate em planta (topo e base de um dispositivo ficam no mesmo ponto): vale a de cota mais perto de `zRef` (a altura do ponto na ferramenta).
  const dz = (c: LigacaoAberta): number => (zRef === undefined ? 0 : Math.abs(c.lig.posicaoMundo[2] - zRef));
  for (const c of abertas) {
    const alvo: LigacaoNoMundo = { ...ponta, ...(bitolaLivre ? { diametro: c.lig.diametro } : {}), posicaoMundo: [x, y, c.lig.posicaoMundo[2]], direcaoMundo: [-c.lig.direcaoMundo[0], -c.lig.direcaoMundo[1], -c.lig.direcaoMundo[2]] };
    const r = encaixarLigacoes(alvo, [c.lig], tolerancia);
    if (r === null) continue;
    const d = Math.hypot(r.deslocamento[0], r.deslocamento[1], r.deslocamento[2]);
    if (d < melhorD - 1e-9 || (Math.abs(d - melhorD) <= 1e-9 && melhor !== null && dz(c) < dz(melhor))) {
      melhor = c;
      melhorD = d;
    }
  }
  return melhor;
}

/** Fantasma do trecho: faixa de largura DN, eixo tracejado e o comprimento. */
export function fantasmaDoTrecho(p: Project, dn: number, a: PontoSegmento, b: PontoSegmento): PreviewItem[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const h = Math.hypot(dx, dy);
  const A: Vec2 = { x: a[0], y: a[1] };
  const B: Vec2 = { x: b[0], y: b[1] };
  const itens: PreviewItem[] = [{ kind: 'line', a: A, b: B, dashed: true }];
  if (h > 1e-9) {
    const m = dn / 2000;
    const nx = (-dy / h) * m;
    const ny = (dx / h) * m;
    itens.push({ kind: 'polygon', ring: [{ x: A.x + nx, y: A.y + ny }, { x: B.x + nx, y: B.y + ny }, { x: B.x - nx, y: B.y - ny }, { x: A.x - nx, y: A.y - ny }], dashed: true });
  }
  itens.push({ kind: 'label', at: { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, text: formatQuantity(unitsOf(p), 'length', comprimentoDoSegmento(a, b)) });
  return itens;
}
