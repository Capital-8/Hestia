/**
 * Adaptador do terreno para o kernel Rust (PLANO do terreno, A.4 e A.5; seções 160 a 164, a 165 de sondas é escrita pelo serviço). NÃO calcula geometria:
 * só serializa o `Project` em seções e guarda os mapas de números internos para decodificar as consultas. O envio por diferença de linhas fica em
 * `kernelTerrenoEnvio.ts`; o serviço, em `kernelTerrenoServico.ts`.
 *
 * Numeração. `terreno_num` e `regiao_num` são internados por id do elemento e se mantêm entre montagens quando se passa a cena anterior (`anterior`):
 * os novos ganham o próximo número. O `id_num` de linhas e vértices é POSICIONAL dentro do terreno (`terreno_num * PASSO_ID_TERRENO + posição`), porque
 * o Rust percorre os vértices por `id_num` crescente e a ordem canônica de A.4 manda: pontos soltos, vértices de cada curva, vértices de cada quebra
 * (e por último a borda). Assim mover um ponto muda só a linha dele, e editar um terreno não toca nos números dos outros.
 *
 * Assinatura. Cada terreno tem uma assinatura da geometria das fontes (A.8 item 4): nome, cor, material, rótulos, pontos cotados e `mostrarExistente`
 * não entram, então mudar qualquer um deles não muda nada do que vai ao kernel. A assinatura da proposta soma a das regiões do terreno.
 */
import { isTerrain, isTerrainRegion, TERRENO_LIMITES, type Id, type Project, type Terrain, type TerrainRegion } from '@hestia/model';

export * from './kernelTerrenoEnvio.ts';

/** `ID_AUSENTE` do esquema: ponto solto (sem linha) e região "sem região". */
export const ID_AUSENTE_TN = 0xffffffff;
/** Quantos `id_num` cada terreno reserva para as suas linhas e vértices (acima de `TERRENO_LIMITES.vertices`). */
export const PASSO_ID_TERRENO = 262_144;
/** Quantos `id_num` cada região reserva para os seus pontos (acima de `TERRENO_LIMITES.regiaoPontos`). */
export const PASSO_ID_REGIAO = 1024;
/** Maior `terreno_num` que cabe em `u32` com o passo acima. */
export const MAX_TERRENO_NUM = Math.floor((ID_AUSENTE_TN - 1) / PASSO_ID_TERRENO) - 1;
/** Maior `regiao_num` que cabe em `u32` com o passo acima. */
export const MAX_REGIAO_NUM = Math.floor((ID_AUSENTE_TN - 1) / PASSO_ID_REGIAO) - 1;

export const LINHA_TN = { curva: 0, quebra: 1, borda: 2 } as const;
export const PAPEL_REGIAO_TN = { subdivisao: 0, plataforma: 1, nivelada: 2 } as const;
/** Código de `terreno_avisos` (igual a `terreno_tipos.rs`). */
export const AVISO_TN = { cotasDiferentes: 1, linhaCruza: 2, regioesSobrepostas: 3, precisaoReduzida: 4, semTriangulos: 5, regiaoFora: 6, taludeNaoAlcanca: 7 } as const;

export const NOMES_SECOES_TN = ['terrenos', 'terreno_linhas', 'terreno_vertices', 'terreno_regioes', 'terreno_regiao_pontos'] as const;
export type NomeSecaoTN = (typeof NOMES_SECOES_TN)[number];
export type ColunasTN = Record<string, number[]>;

/** Colunas na ordem do contrato (`crates/geom-wasm/schema/cena-v11.json`); o teste do wasm confere contra o Rust real. */
export const COLUNAS_TN: Record<NomeSecaoTN, readonly string[]> = {
  terrenos: ['id_num', 'nivel_num', 'espessura_base', 'intervalo', 'mestra_cada'],
  terreno_linhas: ['id_num', 'terreno_num', 'tipo', 'fechada'],
  terreno_vertices: ['id_num', 'terreno_num', 'linha_num', 'ordem', 'x', 'y', 'z'],
  terreno_regioes: ['id_num', 'terreno_num', 'ordem', 'papel', 'cota', 'inclinacao', 'direcao', 'ref_x', 'ref_y', 'talude_corte', 'talude_aterro'],
  terreno_regiao_pontos: ['id_num', 'regiao_num', 'ordem', 'x', 'y'],
};

/** Número interno por chave (id do elemento), estável entre montagens quando se reaproveita o mapa anterior. */
export interface InternadorTN {
  mapa: Map<Id, number>;
  proximo: number;
}

export interface AssinaturaTN {
  /** Geometria das fontes (seções 160 a 162 do terreno). */
  existente: string;
  /** Existente mais as regiões do terreno (seções 163 e 164). */
  proposta: string;
}

export interface CenaTN {
  secoes: Record<NomeSecaoTN, ColunasTN>;
  nLinhas: Record<NomeSecaoTN, number>;
  /** Texto de cada linha por `id_num`, para o envio por diferença (`kernelTerrenoEnvio.ts`). */
  texto: Record<NomeSecaoTN, Map<number, string>>;
  terrenos: InternadorTN;
  regioes: InternadorTN;
  /** id do terreno -> `terreno_num`. */
  terrenoDe: Map<Id, number>;
  /** id da região -> `regiao_num`. */
  regiaoDe: Map<Id, number>;
  /** id do nível -> `nivel_num` (índice em `p.levels`). */
  nivelDe: Map<Id, number>;
  assinaturas: Map<Id, AssinaturaTN>;
  /** Terrenos e regiões que ficaram de fora: nível inexistente, número ou tamanho acima do que o contrato comporta, terreno da região ausente. */
  ignorados: Id[];
}

const novoInternador = (): InternadorTN => ({ mapa: new Map(), proximo: 1 });

/** Hash de 53 bits (cyrb53) do texto, em hexadecimal, mais o comprimento. Só serve de assinatura de cache; o envio compara as linhas de verdade. */
export function assinaturaDeTexto(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)}:${s.length}`;
}

/** Número de vértices que o terreno manda ao kernel (pontos, curvas, quebras e borda). */
export function verticesDoTerreno(t: Terrain): number {
  return t.pontos.length / 3 + t.curvas.reduce((s, c) => s + c.xy.length / 2, 0) + t.quebras.reduce((s, q) => s + q.xyz.length / 3, 0) + (t.borda ? t.borda.length / 2 : 0);
}

/** Média aritmética dos vértices do contorno (A.4 regra 6): o ponto de referência do plano da região. */
export function referenciaDaRegiao(r: Pick<TerrainRegion, 'contorno'>): { x: number; y: number } {
  const n = r.contorno.length || 1;
  return { x: r.contorno.reduce((s, q) => s + q.x, 0) / n, y: r.contorno.reduce((s, q) => s + q.y, 0) / n };
}

export interface OpcoesCenaTN {
  /** Cena anterior: terrenos e regiões que já existiam mantêm o número. */
  anterior?: CenaTN | null;
}

const ordenar = <T extends { order: number; id: string }>(v: T[]): T[] => v.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Projeto -> seções 160 a 164. Veja o comentário do arquivo. */
export function montarCenaTerreno(p: Project, opcoes: OpcoesCenaTN = {}): CenaTN {
  const nivelDe = new Map<Id, number>(p.levels.map((l, i) => [l.id, i] as const));
  const secoes = Object.fromEntries(NOMES_SECOES_TN.map((n) => [n, Object.fromEntries(COLUNAS_TN[n].map((c) => [c, [] as number[]]))])) as Record<NomeSecaoTN, ColunasTN>;
  const ant = opcoes.anterior;
  const terrenos: InternadorTN = ant ? { mapa: new Map(ant.terrenos.mapa), proximo: ant.terrenos.proximo } : novoInternador();
  const regioes: InternadorTN = ant ? { mapa: new Map(ant.regioes.mapa), proximo: ant.regioes.proximo } : novoInternador();
  const interna = (i: InternadorTN, id: Id, maximo: number): number | null => {
    let n = i.mapa.get(id);
    if (n === undefined) {
      if (i.proximo > maximo) return null;
      n = i.proximo++;
      i.mapa.set(id, n);
    }
    return n > maximo ? null : n;
  };
  const push = (secao: NomeSecaoTN, v: number[]): void => {
    const cols = COLUNAS_TN[secao];
    for (let k = 0; k < cols.length; k++) secoes[secao][cols[k]!]!.push(v[k]!);
  };

  const terrenoDe = new Map<Id, number>();
  const regiaoDe = new Map<Id, number>();
  const assinaturas = new Map<Id, AssinaturaTN>();
  const ignorados: Id[] = [];
  const elementos = Object.values(p.elements);

  for (const t of ordenar(elementos.filter(isTerrain))) {
    const nivel = nivelDe.get(t.levelId);
    const num = nivel === undefined || verticesDoTerreno(t) + t.curvas.length + t.quebras.length + 1 >= PASSO_ID_TERRENO ? null : interna(terrenos, t.id, MAX_TERRENO_NUM);
    if (num === null || nivel === undefined) {
      ignorados.push(t.id);
      continue;
    }
    terrenoDe.set(t.id, num);
    push('terrenos', [num, nivel, t.espessuraBase, t.intervaloCurvas, t.mestraCada]);
    const base = num * PASSO_ID_TERRENO;
    let vertice = 0;
    let linha = 0;
    const ponto = (linhaNum: number, ordem: number, x: number, y: number, z: number): void => push('terreno_vertices', [base + vertice++, num, linhaNum, ordem, x, y, z]);
    for (let k = 0; k + 2 < t.pontos.length; k += 3) ponto(ID_AUSENTE_TN, k / 3, t.pontos[k]!, t.pontos[k + 1]!, t.pontos[k + 2]!);
    const novaLinha = (tipo: number, fechada: boolean): number => {
      const id = base + linha++;
      push('terreno_linhas', [id, num, tipo, fechada ? 1 : 0]);
      return id;
    };
    for (const c of t.curvas) {
      const id = novaLinha(LINHA_TN.curva, c.fechada);
      for (let k = 0; k + 1 < c.xy.length; k += 2) ponto(id, k / 2, c.xy[k]!, c.xy[k + 1]!, c.z);
    }
    for (const q of t.quebras) {
      const id = novaLinha(LINHA_TN.quebra, false);
      for (let k = 0; k + 2 < q.xyz.length; k += 3) ponto(id, k / 3, q.xyz[k]!, q.xyz[k + 1]!, q.xyz[k + 2]!);
    }
    if (t.borda) {
      const id = novaLinha(LINHA_TN.borda, true);
      for (let k = 0; k + 1 < t.borda.length; k += 2) ponto(id, k / 2, t.borda[k]!, t.borda[k + 1]!, 0);
    }
    const existente = assinaturaDeTexto(JSON.stringify([nivel, t.espessuraBase, t.intervaloCurvas, t.mestraCada, t.pontos, t.curvas, t.quebras, t.borda ?? null]));
    assinaturas.set(t.id, { existente, proposta: existente });
  }

  const regs = ordenar(elementos.filter(isTerrainRegion));
  const porTerreno = new Map<Id, string[]>();
  for (const r of regs) {
    const terrenoNum = terrenoDe.get(r.terrenoId);
    const n = r.contorno.length;
    const num = terrenoNum === undefined || n < 3 || n > TERRENO_LIMITES.regiaoPontos ? null : interna(regioes, r.id, MAX_REGIAO_NUM);
    if (num === null || terrenoNum === undefined) {
      ignorados.push(r.id);
      continue;
    }
    regiaoDe.set(r.id, num);
    const ref = referenciaDaRegiao(r);
    const linhaReg = [num, terrenoNum, r.order, PAPEL_REGIAO_TN[r.papel], r.cota, r.inclinacao, r.direcao, ref.x, ref.y, r.taludeCorte, r.taludeAterro];
    push('terreno_regioes', linhaReg);
    r.contorno.forEach((q, k) => push('terreno_regiao_pontos', [num * PASSO_ID_REGIAO + k, num, k, q.x, q.y]));
    const lista = porTerreno.get(r.terrenoId) ?? [];
    lista.push(JSON.stringify([num, linhaReg, r.contorno.map((q) => [q.x, q.y])]));
    porTerreno.set(r.terrenoId, lista);
  }
  for (const [id, lista] of porTerreno) {
    const a = assinaturas.get(id)!;
    assinaturas.set(id, { existente: a.existente, proposta: assinaturaDeTexto(a.existente + lista.join('|')) });
  }

  const nLinhas = Object.fromEntries(NOMES_SECOES_TN.map((n) => [n, secoes[n]['id_num']!.length])) as Record<NomeSecaoTN, number>;
  const texto = Object.fromEntries(
    NOMES_SECOES_TN.map((n) => {
      const nomes = COLUNAS_TN[n];
      const m = new Map<number, string>();
      for (let i = 0; i < nLinhas[n]; i++) m.set(secoes[n]['id_num']![i]!, nomes.map((c) => String(secoes[n][c]![i]!)).join('|'));
      return [n, m];
    }),
  ) as Record<NomeSecaoTN, Map<number, string>>;
  return { secoes, nLinhas, texto, terrenos, regioes, terrenoDe, regiaoDe, nivelDe, assinaturas, ignorados };
}
