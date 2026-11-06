/**
 * Hook que executa UM job de render nativo e expõe o estado da sessão.
 *
 * A regra de transição vive em `renderSessao.ts`; aqui ficam só o polling, o download e o
 * cancelamento. `aplicarStatus` é puro (testável sem React) e o hook só o conecta ao estado.
 * Sem serviço, nada cai para CPU: a falha aparece como `erro` com mensagem.
 *
 * Tiles: a cada status com `tiles`, os tiles novos são buscados (PNG real, no máximo
 * LIMITE_BUSCA_TILES ao mesmo tempo) sem bloquear o polling. Falha de busca vira `situacao: 'falhou'`
 * e não derruba o render. Ao sair da sessão (concluído, cancelado, erro ou reiniciar) as referências
 * dos Blobs são soltas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelarJobNativo,
  criarJobComCache,
  resultadoJobNativo,
  statusJobNativo,
  tileNativo,
  type StatusJobNativo,
} from '../../editor/render/nativeClient.ts';
import {
  fracaoProgresso,
  podeBaixar,
  transicionar,
  type EstadoSessao,
  type EventoSessao,
} from './renderSessao.ts';
import { criarLimitadorConcorrencia, tilesExpirados, tilesParaBuscar } from './renderTiles.ts';

export interface ParamsRender {
  hstr: Uint8Array;
  largura: number;
  altura: number;
  exposicao?: number;
}

/** Situação de um tile concluído pelo serviço: buscando o PNG, já pronto, ou falha ao buscar. */
export type SituacaoTile = 'buscando' | 'pronto' | 'falhou';

export interface TileSessao {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  imagem: Blob | null;
  situacao: SituacaoTile;
}

export interface TilesSessao {
  total: number;
  largura: number;
  altura: number;
  concluidos: TileSessao[];
}

export interface RenderSession {
  estado: EstadoSessao;
  /** Tiles do job GPU; `null` sem tiles (serviço antigo, fase prévia) ou fora de um render. */
  tiles: TilesSessao | null;
  iniciar(params: ParamsRender): Promise<void>;
  cancelar(): void;
  baixar(nomeArquivo: string): void;
  reiniciar(): void;
  fracao: number | null;
}

const INTERVALO_POLLING_MS = 250;
const LIMITE_BUSCA_TILES = 4;
const MENSAGEM_SERVICO_PAROU = 'O serviço de render nativo parou de responder.';
const MENSAGEM_SEM_RESULTADO = 'O render terminou, mas o serviço não devolveu a imagem.';

/**
 * Aplica um status do job ao estado. Erro e cancelamento são terminais; `pronto` não entra aqui
 * (a imagem precisa ser baixada, o que o hook faz). Serviço antigo, sem `tiles`, não avança o
 * progresso: o estado continua `renderizando` sem fração inventada.
 */
export function aplicarStatus(estado: EstadoSessao, status: StatusJobNativo): EstadoSessao {
  if (status.erro) return transicionar(estado, { tipo: 'falhar', mensagem: status.erro });
  if (status.cancelado) return transicionar(estado, { tipo: 'cancelar' });
  if (!status.tiles) return estado;
  return transicionar(estado, {
    tipo: 'tile',
    concluidos: status.tiles.concluidos.length,
    total: status.tiles.total,
  });
}

function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error && erro.message ? erro.message : 'Falha no render nativo.';
}

export interface OpcoesRenderSession {
  /** Relógio em ms (padrão Date.now), lido uma vez na montagem. Injetável para testar o timeout de tile. */
  agora?: () => number;
}

export function useRenderSession(opcoes: OpcoesRenderSession = {}): RenderSession {
  const relogioRef = useRef<() => number>(opcoes.agora ?? Date.now);
  const [estado, setEstado] = useState<EstadoSessao>({ tipo: 'ocioso' });
  // Espelho síncrono do estado: o polling assíncrono lê o valor atual sem depender de re-render.
  const estadoRef = useRef<EstadoSessao>({ tipo: 'ocioso' });
  const jobIdRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tiles, setTiles] = useState<TilesSessao | null>(null);
  const tilesRef = useRef<TilesSessao | null>(null);

  const atualizar = useCallback((proximo: (atual: EstadoSessao) => EstadoSessao) => {
    const novo = proximo(estadoRef.current);
    estadoRef.current = novo;
    setEstado(novo);
  }, []);

  const despachar = useCallback(
    (evento: EventoSessao) => atualizar((atual) => transicionar(atual, evento)),
    [atualizar],
  );

  const publicarTiles = useCallback((proximo: TilesSessao | null) => {
    tilesRef.current = proximo;
    setTiles(proximo);
  }, []);

  /** Para o polling e solta a referência do job (não mexe no estado). */
  const pararPolling = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  const finalizar = useCallback(() => {
    pararPolling();
    jobIdRef.current = null;
    publicarTiles(null);
  }, [pararPolling, publicarTiles]);

  // Desmontagem: nenhum polling fica vivo e os Blobs de tiles são soltos.
  useEffect(
    () => () => {
      pararPolling();
      tilesRef.current = null;
    },
    [pararPolling],
  );

  const iniciar = useCallback(
    async (params: ParamsRender): Promise<void> => {
      // Uma sessão por vez: transicionar ignora 'iniciar' fora dos estados permitidos.
      const proximo = transicionar(estadoRef.current, { tipo: 'iniciar', total: 0 });
      if (proximo === estadoRef.current) return;
      if (controllerRef.current !== null) return;

      const controller = new AbortController();
      controllerRef.current = controller;
      const sinal = controller.signal;
      atualizar(() => proximo);
      // Limite de buscas de tile por sessão: o polling não espera por elas.
      const limitarBusca = criarLimitadorConcorrencia(LIMITE_BUSCA_TILES);
      // Instante em que cada tile entrou em 'buscando' (para o timeout de LIMITE_BUSCA_TILE_MS).
      const inicioBusca = new Map<number, number>();

      let id: string;
      try {
        id = await criarJobComCache(params.hstr, {
          largura: params.largura,
          altura: params.altura,
          exposicao: params.exposicao,
          sinal,
        });
      } catch (erro) {
        if (sinal.aborted) return;
        finalizar();
        despachar({ tipo: 'falhar', mensagem: mensagemDeErro(erro) });
        return;
      }
      if (sinal.aborted) {
        // Desmontado ou reiniciado durante a criação: não deixa o job órfão no serviço.
        void cancelarJobNativo(id).catch(() => {
          // serviço indisponível: nada a cancelar
        });
        return;
      }
      jobIdRef.current = id;

      const buscarTile = async (i: number): Promise<void> => {
        if (sinal.aborted) return;
        let imagem: Blob | null;
        try {
          imagem = await tileNativo(id, i, sinal);
        } catch {
          // Falha visível no diálogo (tile marcado); o render segue.
          imagem = null;
        }
        if (sinal.aborted) return;
        // Já expirou (marcado como falha por tempo) ou nunca foi registrado: resultado tardio ignorado.
        if (!inicioBusca.delete(i)) return;
        const atual = tilesRef.current;
        if (!atual) return;
        publicarTiles({
          ...atual,
          concluidos: atual.concluidos.map((t): TileSessao =>
            t.i === i ? { ...t, imagem, situacao: imagem ? 'pronto' : 'falhou' } : t,
          ),
        });
      };

      const registrarTiles = (relatorio: NonNullable<StatusJobNativo['tiles']>): void => {
        const base: TilesSessao = tilesRef.current ?? {
          total: 0,
          largura: params.largura,
          altura: params.altura,
          concluidos: [],
        };
        const novos = tilesParaBuscar(new Set(base.concluidos.map((t) => t.i)), { tiles: relatorio });
        const geometria = new Map(relatorio.concluidos.map((t) => [t.i, t] as const));
        const adicionados: TileSessao[] = [];
        for (const i of novos) {
          const g = geometria.get(i);
          if (!g) continue;
          adicionados.push({ i, x: g.x, y: g.y, w: g.w, h: g.h, imagem: null, situacao: 'buscando' });
          inicioBusca.set(i, relogioRef.current());
        }
        publicarTiles({
          ...base,
          total: relatorio.total,
          concluidos: [...base.concluidos, ...adicionados].sort((a, b) => a.i - b.i),
        });
        for (const i of novos) void limitarBusca(() => buscarTile(i));
      };

      const tick = async (): Promise<void> => {
        if (sinal.aborted) return;
        let status: StatusJobNativo | null;
        try {
          status = await statusJobNativo(id, sinal);
        } catch (erro) {
          if (sinal.aborted) return;
          finalizar();
          despachar({ tipo: 'falhar', mensagem: mensagemDeErro(erro) });
          return;
        }
        if (sinal.aborted) return;

        if (status === null) {
          finalizar();
          despachar({ tipo: 'falhar', mensagem: MENSAGEM_SERVICO_PAROU });
          return;
        }

        if (!status.erro && !status.cancelado && status.pronto) {
          let imagem: Blob | null;
          try {
            imagem = await resultadoJobNativo(id, sinal);
          } catch (erro) {
            if (sinal.aborted) return;
            finalizar();
            despachar({ tipo: 'falhar', mensagem: mensagemDeErro(erro) });
            return;
          }
          if (sinal.aborted) return;
          finalizar();
          if (imagem === null) {
            despachar({ tipo: 'falhar', mensagem: MENSAGEM_SEM_RESULTADO });
          } else {
            despachar({ tipo: 'concluir', imagem });
          }
          return;
        }

        atualizar((atual) => aplicarStatus(atual, status));
        if (status.erro || status.cancelado) {
          finalizar();
          return;
        }
        // Tile preso em 'buscando' por mais de LIMITE_BUSCA_TILE_MS vira 'falhou'; o render segue.
        const expirados = tilesExpirados(inicioBusca, relogioRef.current());
        if (expirados.length > 0) {
          for (const i of expirados) inicioBusca.delete(i);
          const atualTiles = tilesRef.current;
          if (atualTiles) {
            publicarTiles({
              ...atualTiles,
              concluidos: atualTiles.concluidos.map((t): TileSessao =>
                expirados.includes(t.i) && t.situacao === 'buscando'
                  ? { ...t, imagem: null, situacao: 'falhou' }
                  : t,
              ),
            });
          }
        }
        if (status.tiles) registrarTiles(status.tiles);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void tick();
        }, INTERVALO_POLLING_MS);
      };

      void tick();
    },
    [atualizar, despachar, finalizar, publicarTiles],
  );

  const cancelar = useCallback((): void => {
    const id = jobIdRef.current;
    finalizar();
    if (id !== null) {
      void cancelarJobNativo(id).catch(() => {
        // Falha de rede ao cancelar é ignorada: o estado local já vira cancelado.
      });
    }
    despachar({ tipo: 'cancelar' });
  }, [despachar, finalizar]);

  const baixar = useCallback((nomeArquivo: string): void => {
    const atual = estadoRef.current;
    if (!podeBaixar(atual) || atual.tipo !== 'concluido' || atual.imagem === null) return;
    const url = URL.createObjectURL(atual.imagem);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoga depois do clique: revogar na mesma tarefa pode cancelar o download em alguns navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const reiniciar = useCallback((): void => {
    const id = jobIdRef.current;
    finalizar();
    if (id !== null) {
      void cancelarJobNativo(id).catch(() => {
        // serviço indisponível: nada a cancelar
      });
    }
    despachar({ tipo: 'reiniciar' });
  }, [despachar, finalizar]);

  return {
    estado,
    tiles,
    iniciar,
    cancelar,
    baixar,
    reiniciar,
    fracao: fracaoProgresso(estado),
  };
}
