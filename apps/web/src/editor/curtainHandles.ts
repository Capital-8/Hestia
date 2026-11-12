// Alças das linhas internas da parede cortina (decisão 0056, §10 fase 2): geração a partir da grade resolvida, arraste com
// encaixe na grade do projeto e limite entre as linhas vizinhas, e o desenho do cadeado de travar. Função pura: não toca no
// canvas nem no estado do editor (a ligação ao canvas fica para depois, no molde de sectionHandles.ts).
import { refGerada, type Command, type Id, type LineRef, type ParedeResolvida } from '@hestia/model';

/** Eixo da grade (U ao longo da parede, V na altura). O tipo de `curtainGrade.ts` não é exportado pelo pacote. */
type Eixo = 'u' | 'v';

/** Parte da grade resolvida que as alças usam (a mesma que `resolverParede` devolve). */
export type GradeAlca = Pick<ParedeResolvida, 'L' | 'H' | 'u' | 'v' | 'geradasU' | 'geradasV'>;

/** Distância mínima (m) entre duas linhas do mesmo eixo quando o projeto não tem passo de grade. */
export const GAP_MINIMO = 0.001;

/** Alça de uma linha interna: posição atual, limites do arraste (vizinhas) e a referência gravável para os comandos. */
export interface AlcaDeLinha {
  /** Chave estável (para listas): id da linha extra ou eixo e posição na lista de geradas. */
  chave: string;
  wallId: Id;
  eixo: Eixo;
  /** Índice final entre as linhas do eixo (1..n-1, em ordem crescente). */
  indice: number;
  /** Referência da linha na forma que os comandos da fase 2 recebem (§4.3). */
  line: LineRef;
  /** Posição atual (m), a partir do início (U) ou da base (V). */
  pos: number;
  /** Posição da linha vizinha anterior (ou 0, o início do vão). */
  anterior: number;
  /** Posição da linha vizinha seguinte (ou o comprimento do vão). */
  proxima: number;
  /** Linha travada (cadeado fechado). Travar não impede o arraste; só muda o que acontece ao mudar L ou H. */
  travada: boolean;
}

/** Resultado de um arraste: nova posição e o comando `moveGridLine` (null quando nada muda). */
export interface ResultadoArraste {
  pos: number;
  comando: Command | null;
}

/** Arredonda para a grade de 1 µm (a precisão das quantidades, §5.7). */
const arredondar = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Referência gravável de uma linha da grade final: extra pelo id, gerada pelo índice (como a sobrescrita a grava). */
function referenciaDaLinha(linha: GradeAlca['u'][number], eixo: Eixo, A: number, geradas: number[]): LineRef {
  if (linha.added !== undefined) return { added: linha.added };
  return refGerada(eixo, linha.gerada as number, A, geradas);
}

/**
 * Alças de todas as linhas internas da parede, nos dois eixos (U primeiro). As bordas não têm alça: a grade final já
 * traz só as linhas dentro do vão (§5.1). Cada alça carrega os limites do arraste, pelas vizinhas do mesmo eixo.
 */
export function alcasDeLinhas(wallId: Id, g: GradeAlca): AlcaDeLinha[] {
  const alcas: AlcaDeLinha[] = [];
  for (const eixo of ['u', 'v'] as const) {
    const A = eixo === 'u' ? g.L : g.H;
    const linhas = eixo === 'u' ? g.u : g.v;
    const geradas = eixo === 'u' ? g.geradasU : g.geradasV;
    linhas.forEach((linha, k) => {
      const chave = linha.added !== undefined ? `a:${linha.added}` : `${eixo}:${linha.gerada as number}`;
      alcas.push({
        chave,
        wallId,
        eixo,
        indice: linha.indice,
        line: referenciaDaLinha(linha, eixo, A, geradas),
        pos: linha.pos,
        anterior: k === 0 ? 0 : (linhas[k - 1] as (typeof linhas)[number]).pos,
        proxima: k === linhas.length - 1 ? A : (linhas[k + 1] as (typeof linhas)[number]).pos,
        travada: linha.locked === true,
      });
    });
  }
  return alcas;
}

/**
 * Encaixa uma posição na grade do projeto. A grade é medida a partir da origem do eixo (`origem`, em metros no mundo,
 * que quem chama informa: a coordenada do início da parede no eixo). Passo 0 ou ausente: sem encaixe.
 */
export function encaixarNaGrade(pos: number, passo: number, origem = 0): number {
  if (!(passo > 0)) return pos;
  return arredondar(Math.round((pos + origem) / passo) * passo - origem);
}

/**
 * Resultado do arraste de uma alça até `posicao`: encaixa na grade do projeto e prende entre as vizinhas, com folga de um
 * passo (ou `GAP_MINIMO` sem passo). Se não cabe nenhuma posição entre as vizinhas, ou a posição final é a atual, o
 * comando é null e a posição é a atual.
 */
export function resultadoArraste(alca: AlcaDeLinha, posicao: number, passo = 0, origem = 0): ResultadoArraste {
  const folga = passo > 0 ? passo : GAP_MINIMO;
  const minimo = alca.anterior + folga;
  const maximo = alca.proxima - folga;
  if (minimo > maximo) return { pos: alca.pos, comando: null };
  const pos = arredondar(Math.min(maximo, Math.max(minimo, encaixarNaGrade(posicao, passo, origem))));
  if (Math.abs(pos - alca.pos) < 1e-6) return { pos: alca.pos, comando: null };
  return { pos, comando: { type: 'moveGridLine', wallId: alca.wallId, line: alca.line, pos } };
}

/** Caminhos SVG do cadeado (viewBox 16 × 16): corpo fixo; arco fechado quando travada, aberto quando não. */
export const CADEADO_VIEWBOX = '0 0 16 16';

export function iconeCadeado(travada: boolean): { corpo: string; arco: string } {
  return {
    corpo: 'M4 7H12V14H4Z',
    arco: travada ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0V7' : 'M5.5 7V5a2.5 2.5 0 0 1 5 0',
  };
}
