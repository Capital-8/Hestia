import type { ResolvedLevel } from '@hestia/engine';
import type { Id } from '@hestia/model';
import { useUi } from '../editor/state.ts';
import { criarFonteNiveisWorker } from './montagem3dNiveis.ts';
import { agendarPadrao, Montagem3dProgressiva, type CenaMontagem } from './montagem3dProgressiva.ts';
import { publicarProgresso3d, type PreparoSelecao } from './progresso3d.ts';

/** Cena da vista 3D: o contrato da montagem mais o enquadramento inicial (`ModelScene`). */
export interface CenaVista3d extends CenaMontagem {
  fit(): void;
  /** Prepara a seleção (estruturas de picking) em fatias de `orcamentoMs`; devolve o andamento. Opcional: sem ela não há fase de preparo. */
  prepararSelecao?(orcamentoMs: number): PreparoSelecao;
}

/** Orçamento de cada fatia do preparo da seleção (ms): bem abaixo de um quadro, para a tela seguir respondendo. */
export const ORCAMENTO_PREPARO_MS = 8;

/**
 * Montagem da vista 3D do canvas: a interface redesenha a cada fatia, e a primeira vez que o modelo fica pronto a câmera
 * enquadra tudo (uma vez por sessão, como antes: `seen3d`). O enquadramento espera a última fatia, para não pular enquanto
 * os níveis chegam.
 *
 * Os níveis são resolvidos no worker (ver `montagem3dNiveis.ts`); sem `Worker` (ou se ele falhar), a montagem cai nas
 * fatias síncronas de antes, com o mesmo resultado.
 */
export function criarMontagemVista3d(
  cena: CenaVista3d,
  resolver: (id: Id) => ResolvedLevel,
  pronto?: (id: Id) => ResolvedLevel | null,
): Montagem3dProgressiva {
  // Preparo da seleção em segundo plano: a barra só some quando ele termina. Uma nova atualização invalida o preparo em curso.
  let preparoGeracao = 0;
  const preparar = (): void => {
    const geracao = ++preparoGeracao;
    if (!cena.prepararSelecao) {
      publicarProgresso3d(montagem.total, montagem.total);
      return;
    }
    const passo = (): void => {
      if (geracao !== preparoGeracao) return;
      const andamento = cena.prepararSelecao!(ORCAMENTO_PREPARO_MS);
      const fim = andamento.feitas >= andamento.total;
      publicarProgresso3d(montagem.total, montagem.total, { fracao: fim ? 1 : montagem.fracao(andamento), fase: 'selecao' });
      if (!fim) agendarPadrao(passo);
    };
    publicarProgresso3d(montagem.total, montagem.total, { fracao: montagem.fracao({ feitas: 0, total: 1 }), fase: 'selecao' });
    agendarPadrao(passo);
  };
  const montagem: Montagem3dProgressiva = new Montagem3dProgressiva({
    cena,
    fonte: { resolver, pronto },
    aoAtualizar: () => {
      // Barra de progresso (ver `Progresso3D`): pavimentos ponderados pelo trabalho; some quando a seleção também está pronta.
      if (montagem.montados >= montagem.total) preparar();
      else {
        preparoGeracao++;
        publicarProgresso3d(montagem.montados, montagem.total, { fracao: montagem.fracao(null), fase: 'montagem' });
      }
      useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
    },
    aoConcluir: () => {
      preparar();
      // Montagem adiantada em segundo plano, com a planta na tela: o enquadramento fica para a primeira vez que a aba 3D aparece.
      if (useUi.getState().seen3d || useUi.getState().view !== '3d') return;
      cena.fit();
      useUi.setState({ seen3d: true });
    },
    worker: criarFonteNiveisWorker(),
  });
  return montagem;
}
