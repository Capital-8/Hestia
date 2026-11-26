import { isComponent, type Component, type Familia, type Id, type Project } from '@hestia/model';
import { resolverComponente } from './instancia.ts';
import { ligacaoNoMundo, type LigacaoNoMundo } from './ligacoesEncaixe.ts';
import { categoriaDaFamilia } from './categoriaPeca.ts';
import { tipoSemConexoes } from './curvaturaFlexivel.ts';

/*
 * Leitura da rede para o movimento com as peças ligadas (fase 4, ficha F4). Funções puras sobre o projeto, em metros. Três classes de
 * componente: `tubo` (trecho reto de duas ligações no eixo Z local, família sem categoria de conexão), `peca` (conexão de alguma regra
 * de tipo de tubulação: joelho, tê, luva, redução, tampão) e `terminal` (caixa, tomada, quadro, equipamento: o resto).
 */

export type V3 = [number, number, number];
export type Classe = 'tubo' | 'peca' | 'terminal';

/** Tubo lido no mundo: as duas pontas (início = menor z local), o DN (mm, 0 se a família não tem) e o intervalo de `L` (mm). */
export interface TuboLido {
  c: Component;
  familia: Familia;
  a: LigacaoNoMundo;
  b: LigacaoNoMundo;
  idA: string;
  idB: string;
  dn: number;
  lMin: number;
  lMax: number | undefined;
  /** Eletroduto corrugado (tipo sem conexões): muda de direção e de cota livremente. */
  flexivel: boolean;
}

export const subV = (u: readonly number[], v: readonly number[]): V3 => [(u[0] ?? 0) - (v[0] ?? 0), (u[1] ?? 0) - (v[1] ?? 0), (u[2] ?? 0) - (v[2] ?? 0)];
export const somaV = (u: readonly number[], v: readonly number[], k = 1): V3 => [(u[0] ?? 0) + k * (v[0] ?? 0), (u[1] ?? 0) + k * (v[1] ?? 0), (u[2] ?? 0) + k * (v[2] ?? 0)];
export const normaV = (u: readonly number[]): number => Math.hypot(u[0] ?? 0, u[1] ?? 0, u[2] ?? 0);
export const dotV = (u: readonly number[], v: readonly number[]): number => (u[0] ?? 0) * (v[0] ?? 0) + (u[1] ?? 0) * (v[1] ?? 0) + (u[2] ?? 0) * (v[2] ?? 0);
export function unitarioV(u: readonly number[]): V3 {
  const n = normaV(u);
  return n < 1e-12 ? [0, 0, 0] : [(u[0] ?? 0) / n, (u[1] ?? 0) / n, (u[2] ?? 0) / n];
}

const EPS = 1e-6;

/** Tubo da instância `c`; `null` se não é um trecho reto de duas ligações em Z (curvas, caixas e conexões não são). */
export function lerTuboMov(p: Project, c: Component): TuboLido | null {
  const familia = p.componentFamilies?.[c.familyId];
  if (!familia || categoriaDaFamilia(c.familyId) !== null) return null;
  const L = familia.parametros.find((q) => q.id === 'L');
  if (!L) return null;
  const ligs = [...(resolverComponente(p, c).ligacoes ?? [])].sort((x, y) => x.posicao[2] - y.posicao[2]);
  const i = ligs[0];
  const f = ligs[ligs.length - 1];
  if (ligs.length !== 2 || !i || !f) return null;
  const noEixo = [i, f].every((l) => Math.abs(l.posicao[0]) < EPS && Math.abs(l.posicao[1]) < EPS && Math.abs(l.direcao[0]) < EPS && Math.abs(l.direcao[1]) < EPS);
  if (!noEixo || Math.abs(i.posicao[2]) > EPS || i.direcao[2] > -0.999 || f.direcao[2] < 0.999) return null;
  const dn = typeof c.values?.DN === 'number' ? c.values.DN : 0;
  return { c, familia, a: ligacaoNoMundo(i, c), b: ligacaoNoMundo(f, c), idA: i.id, idB: f.id, dn, lMin: L.min ?? 0, lMax: L.max, flexivel: tipoSemConexoes(c.familyId) !== undefined };
}

/** Classe do componente na rede. */
export function classeDe(p: Project, c: Component): Classe {
  if (categoriaDaFamilia(c.familyId) !== null) return 'peca';
  return lerTuboMov(p, c) ? 'tubo' : 'terminal';
}

/** Ligações resolvidas de `c`, já no mundo, na ordem da família. */
export function portasNoMundo(p: Project, c: Component): LigacaoNoMundo[] {
  return (resolverComponente(p, c).ligacoes ?? []).map((l) => ligacaoNoMundo(l, c));
}

/**
 * Centro do nó da peça (m): onde os eixos dos tubos se cruzam. É a origem da família, exceto na luva de duas bocas, cuja origem fica
 * numa boca e cujo centro é o ponto médio das duas (mesma regra de `posicionarConexao`).
 */
export function centroDaPeca(p: Project, c: Component): V3 {
  const portas = portasNoMundo(p, c);
  const [x, y] = portas;
  if (categoriaDaFamilia(c.familyId)?.categoria === 'luva' && portas.length === 2 && x && y) return [(x.posicaoMundo[0] + y.posicaoMundo[0]) / 2, (x.posicaoMundo[1] + y.posicaoMundo[1]) / 2, (x.posicaoMundo[2] + y.posicaoMundo[2]) / 2];
  return [c.x, c.y, c.z];
}

/** Vizinho da ligação `ligacaoId` de `c` e a ligação dele; `undefined` se está aberta. */
export function vizinhoDe(p: Project, c: Component, ligacaoId: string): { comp: Component; ligacaoId: string } | undefined {
  const cx = c.ligacoes?.[ligacaoId];
  const o = cx ? p.elements[cx.componenteId] : undefined;
  return cx && isComponent(o) ? { comp: o, ligacaoId: cx.ligacaoId } : undefined;
}

/** Chave estável de uma ponta de ligação, para o conjunto de ligações cortadas. */
export const chaveLigacao = (id: Id, ligacaoId: string): string => `${id}\n${ligacaoId}`;

/** Ids dos componentes a até `profundidade` ligações dos `ids` (inclusive eles). */
export function vizinhanca(p: Project, ids: Iterable<Id>, profundidade: number): Set<Id> {
  const vistos = new Set<Id>(ids);
  let borda = [...vistos];
  for (let n = 0; n < profundidade && borda.length > 0; n++) {
    const proxima: Id[] = [];
    for (const id of borda) {
      const c = p.elements[id];
      if (!isComponent(c)) continue;
      for (const cx of Object.values(c.ligacoes ?? {})) {
        if (!vistos.has(cx.componenteId) && isComponent(p.elements[cx.componenteId])) {
          vistos.add(cx.componenteId);
          proxima.push(cx.componenteId);
        }
      }
    }
    borda = proxima;
  }
  return vistos;
}
