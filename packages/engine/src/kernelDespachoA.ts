/**
 * Peças da fatia A do despacho (decisão 0047 §12): tipos da cena viva, a cena sincronizada e a leitura das mensagens do comparador. Fica fora de
 * `kernelDespacho.ts` para o arquivo caber no limite de linhas e não misturar o caminho da fatia A com o da fatia B (`kernelDespachoB.ts`).
 */
import { fonteDeSecoes, type CenaV2, type GerenciadorKernelV2 } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import type { CenaA1 } from './kernelA1.ts';
import type { CenaA3 } from './kernelA3.ts';
import type { CenaA3d } from './kernelA3d.ts';
import type { PlanResolveOptions } from './resolve.ts';

export const LIMITE_MENSAGEM = 400;

export type Secoes = ReturnType<Parameters<typeof fonteDeSecoes>[0]>;

/** Uma cena viva no kernel, para uma variante de cota (`flatAttach` ou não). */
export interface EntradaCena {
  ger: GerenciadorKernelV2;
  cena: CenaV2 | null;
  fonte: ReturnType<typeof fonteDeSecoes>;
  secoes: Secoes;
  a1: CenaA1;
  a3: CenaA3;
  /** O projeto cujas seções estão no Rust; `null` quando o envio falhou no meio (a próxima chamada reenvia tudo). */
  projeto: Project | null;
}

/** Nível ou abertura que a cena não contém (parede sem tipo, abertura sem tipo): a consulta não cobre, vale o TS. */
export class NaoCoberto extends Error {}

export const textoDoErro = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').trim().slice(0, LIMITE_MENSAGEM);

/** A chave das opções de planta de uma consulta (mudam o resultado, então entram no memo). */
export function chaveDasOpcoes(levelId: Id, o: PlanResolveOptions): string {
  const lista = (s: ReadonlySet<Id> | undefined): string => (s ? [...s].sort().join(',') : '*');
  return `${o.flatAttach === true ? 1 : 0}|${levelId}|${o.cutZ ?? '-'}|${lista(o.outlineWalls)}|${o.planOpenings ? lista(o.planOpenings) : '*'}`;
}

/** Id do projeto (parede) citado por uma mensagem do comparador, e o campo. */
export function interpretarMensagem(m: string, a1: CenaA1): { parede: Id | null; campo: string } {
  const doNumero = new Map<number, Id>([...a1.idDe].map(([id, n]) => [n, id] as const));
  const achado = /parede (\d+)\b(?!\s*\()/.exec(m) ?? /\(id (\d+)/.exec(m) ?? /\(grupo \d+, parede (\d+)/.exec(m);
  const parede = achado ? (doNumero.get(Number(achado[1])) ?? null) : null;
  const depois = m.includes('): ') ? m.slice(m.indexOf('): ') + 3) : m.includes(': ') ? m.slice(m.indexOf(': ') + 2) : m;
  const campo = /^([A-Za-zÀ-ú_]+(?: [a-zà-ú]+)?)/.exec(depois)?.[1] ?? depois.slice(0, 30);
  return { parede, campo: campo.trim() };
}

/** As seções da cena da fatia A (paredes, aberturas e perfis) para `fonteDeSecoes`. */
export function secoesDe(a1: CenaA1, a3: CenaA3, perfis: CenaA3d): Secoes {
  const s = a1.secoes;
  const n = a1.nLinhas;
  return {
    paredes: { colunas: s.paredes, n: n.paredes },
    tipos_parede: { colunas: s.tipos_parede, n: n.tipos_parede },
    camadas: { colunas: s.camadas, n: n.camadas },
    faixas: { colunas: s.faixas, n: n.faixas },
    paredes_quadro: { colunas: s.paredes_quadro, n: n.paredes_quadro },
    paredes_z: { colunas: s.paredes_z, n: n.paredes_z },
    tipos_abertura: { colunas: a3.secoes.tipos_abertura, n: a3.nLinhas.tipos_abertura },
    aberturas: { colunas: a3.secoes.aberturas, n: a3.nLinhas.aberturas },
    perfis_z: { colunas: perfis.colunas, n: perfis.n },
  };
}
