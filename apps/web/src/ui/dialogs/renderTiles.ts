/**
 * Geometria pura dos tiles do render GPU (sem React e sem DOM).
 *
 * Coordenadas do serviço: x, y, w, h em pixels da imagem final (largura x altura pedidas no render).
 * O serviço é determinístico: a grade tem lado `TAMANHO_TILE_SERVICO` e os tiles saem na ordem de
 * `tilesDaImagem`, a mesma de `ordenar_tiles_espiral` (crates/render-engine/src/tiles.rs). Os
 * concluídos trazem a geometria real reportada pelo serviço; os pendentes são o plano calculado
 * nessa mesma ordem (sem previsão por tamanho medido).
 */
import type { TileJobNativo } from '../../editor/render/nativeClient.ts';

/** Lado do tile do serviço (contrato: docs/handoff/render-engine/CONTRATO.md, seção "Tiles"). */
export const TAMANHO_TILE_SERVICO = 256;

/** Tempo máximo de um tile em 'buscando' antes de virar 'falhou'. */
export const LIMITE_BUSCA_TILE_MS = 30_000;

export interface RetanguloPct {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TilePosicionado extends RetanguloPct {
  i: number;
}

export interface PosicionamentoTiles {
  concluidos: TilePosicionado[];
  pendentes: TilePosicionado[];
  /** Índice do próximo tile (o destaque), ou null se não há mais nada a renderizar. */
  destaque: number | null;
  /**
   * true quando o plano calculado não confere com `total` (número de tiles diferente). Nesse caso
   * só os concluídos são devolvidos, sem pendentes inventados.
   */
  divergente: boolean;
}

export interface TileGeometria {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Lista completa dos tiles de uma imagem `largura` x `altura` com lado `lado`, na ordem do serviço:
 * ordenada pela distância do centro do tile ao centro da imagem, com desempate por y e depois x.
 *
 * Chave: com dx = 2*x + w - largura e dy = 2*y + h - altura (o dobro das diferenças dos centros,
 * em inteiros), a chave é (dx*dx + dy*dy, y, x). Isso é a mesma ordem da versão Rust exata, sem
 * arredondamento. O piloto TS usava Math.hypot em ponto flutuante; a ordem é igual em aritmética
 * exata, mas empates podem sair trocados por arredondamento. Por isso a chave inteira é usada aqui.
 * Exige inteiros seguros (Number.isSafeInteger), que é o caso de qualquer imagem real.
 */
export function tilesDaImagem(
  largura: number,
  altura: number,
  lado: number = TAMANHO_TILE_SERVICO,
): TileGeometria[] {
  if (!(largura > 0) || !(altura > 0) || !(lado > 0)) {
    throw new Error('largura, altura e lado devem ser maiores que zero');
  }
  if (!Number.isSafeInteger(largura) || !Number.isSafeInteger(altura) || !Number.isSafeInteger(lado)) {
    throw new Error('largura, altura e lado devem ser inteiros');
  }
  const colunas = Math.ceil(largura / lado);
  const linhas = Math.ceil(altura / lado);
  const tiles: Array<TileGeometria & { d2: number }> = [];
  for (let linha = 0; linha < linhas; linha++) {
    const y = linha * lado;
    const h = Math.min(lado, altura - y);
    for (let coluna = 0; coluna < colunas; coluna++) {
      const x = coluna * lado;
      const w = Math.min(lado, largura - x);
      const dx = 2 * x + w - largura;
      const dy = 2 * y + h - altura;
      const d2 = dx * dx + dy * dy;
      if (!Number.isSafeInteger(d2)) {
        throw new Error('dimensões grandes demais para ordenar os tiles com precisão');
      }
      tiles.push({ x, y, w, h, d2 });
    }
  }
  tiles.sort((a, b) => a.d2 - b.d2 || a.y - b.y || a.x - b.x);
  return tiles.map(({ x, y, w, h }) => ({ x, y, w, h }));
}

/** Índice do próximo tile a renderizar: `concluidosCount` quando ainda falta algum, senão null. */
export function proximoTileIndice(concluidosCount: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  const feitos = Math.max(0, Math.floor(concluidosCount));
  return feitos < Math.floor(total) ? feitos : null;
}

/**
 * Posições em porcentagem da área da imagem. Concluídos usam a geometria reportada pelo serviço;
 * pendentes são `tilesDaImagem(largura, altura)[k]` para k de `concluidos.length` até `total - 1`.
 * `total` 0 ou dimensões inválidas (não inteiros positivos) devolvem tudo vazio. Se o plano
 * calculado tem tamanho diferente de `total`, devolve só os concluídos com `divergente: true`.
 */
export function posicionarTiles(
  largura: number,
  altura: number,
  concluidos: ReadonlyArray<TileJobNativo>,
  total: number,
): PosicionamentoTiles {
  const vazio: PosicionamentoTiles = { concluidos: [], pendentes: [], destaque: null, divergente: false };
  if (!Number.isFinite(total) || total <= 0) return vazio;
  if (!Number.isSafeInteger(largura) || !Number.isSafeInteger(altura) || largura <= 0 || altura <= 0) {
    return vazio;
  }
  const n = Math.floor(total);

  const pct = (x: number, y: number, w: number, h: number): RetanguloPct => ({
    left: (x / largura) * 100,
    top: (y / altura) * 100,
    width: (w / largura) * 100,
    height: (h / altura) * 100,
  });

  const feitos: TilePosicionado[] = concluidos.map((t) => ({ i: t.i, ...pct(t.x, t.y, t.w, t.h) }));

  const plano = tilesDaImagem(largura, altura);
  if (plano.length !== n) {
    return { concluidos: feitos, pendentes: [], destaque: null, divergente: true };
  }

  const pendentes: TilePosicionado[] = [];
  for (let k = concluidos.length; k < n; k++) {
    const t = plano[k]!;
    pendentes.push({ i: k, ...pct(t.x, t.y, t.w, t.h) });
  }

  return {
    concluidos: feitos,
    pendentes,
    destaque: proximoTileIndice(concluidos.length, n),
    divergente: false,
  };
}

/**
 * Índices dos tiles concluídos pelo serviço que ainda não são conhecidos (sem repetição, na ordem
 * em que chegaram). Tile já conhecido nunca é buscado de novo.
 */
export function tilesParaBuscar(
  conhecidos: ReadonlySet<number>,
  status: { tiles?: { concluidos: ReadonlyArray<TileJobNativo> } },
): number[] {
  const vistos = new Set<number>();
  const novos: number[] = [];
  for (const t of status.tiles?.concluidos ?? []) {
    if (conhecidos.has(t.i) || vistos.has(t.i)) continue;
    vistos.add(t.i);
    novos.push(t.i);
  }
  return novos;
}

/**
 * Tiles em busca há mais de `limiteMs` (estritamente maior) em relação a `agora`. `buscasDesde`
 * guarda o instante em que cada tile entrou em 'buscando'. O relógio é passado pelo chamador.
 */
export function tilesExpirados(
  buscasDesde: ReadonlyMap<number, number>,
  agora: number,
  limiteMs: number = LIMITE_BUSCA_TILE_MS,
): number[] {
  const expirados: number[] = [];
  for (const [i, desde] of buscasDesde) {
    if (agora - desde > limiteMs) expirados.push(i);
  }
  return expirados;
}

/**
 * Semáforo simples: no máximo `limite` tarefas em andamento; as demais esperam na fila (FIFO).
 * Uma tarefa que lança ou rejeita libera a vaga e rejeita só a própria promessa.
 */
export function criarLimitadorConcorrencia(limite: number): <T>(tarefa: () => Promise<T>) => Promise<T> {
  const maximo = Math.max(1, Math.floor(limite));
  let emUso = 0;
  const fila: Array<() => void> = [];
  const liberar = (): void => {
    emUso--;
    const proxima = fila.shift();
    if (proxima) proxima();
  };
  return <T>(tarefa: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolver, rejeitar) => {
      const executar = (): void => {
        emUso++;
        Promise.resolve()
          .then(tarefa)
          .then(resolver, rejeitar)
          .finally(liberar);
      };
      if (emUso < maximo) executar();
      else fila.push(executar);
    });
}
