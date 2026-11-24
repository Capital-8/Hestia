/**
 * Trabalho por quadro FORA do desenho — WP-A1.
 *
 * A medição de órbita no WebKitGTK mostrou o gargalo fora da GPU: cada `pointermove` chamava `orbit()`/`pan()` e um
 * `useUi.setState({ previewTick + 1 })`, e cada `previewTick` re-renderizava React (abas, propriedades, cubo). Aqui
 * ficam as peças puras (sem DOM) usadas pela vista:
 *
 * - `criarCoalescedorDeDeltas`: acumula deslocamentos do ponteiro e aplica UMA vez por quadro;
 * - `criarPedidoDeQuadro`: adia o pedido de redesenho para o próximo quadro (para gestos que já aplicam geometria a
 *   cada evento, como o arrasto de componente);
 * - `memoizarVisibilidade`: reaproveita os conjuntos de ocultos/revelados quando nada que os define mudou.
 *
 * Os testes rodam em Node com um agendador injetado (`quadroRaf.test.ts`): nenhuma função daqui toca `window`.
 */

/** Agenda um retorno de chamada para o próximo quadro (na vista: `requestAnimationFrame`). */
export interface AgendadorDeQuadro {
  agendar(fn: () => void): number;
  cancelar(id: number): void;
}

/** Deslocamentos acumulados de um gesto de câmera (órbita ou pan). */
export interface CoalescedorDeDeltas {
  /** Soma o deslocamento e garante UM único quadro agendado, mesmo com vários eventos. */
  acumular(dx: number, dy: number): void;
  /** Roda no quadro agendado: aplica o acumulado. `false` quando não havia nada (não aplica nem repete o pedido). */
  quadro(): boolean;
  /** Fim do gesto: cancela o quadro pendente e aplica o que faltava (devolve o restante, ou null). */
  soltar(): { dx: number; dy: number } | null;
  /** Há quadro agendado? (diagnóstico e testes) */
  pendente(): boolean;
}

/**
 * Coalescedor de deslocamentos: `aplicar` recebe a soma dos `acumular` desde o último quadro (ou desde o último
 * `soltar`); `aoAplicar` é o pedido de redesenho, chamado uma vez por aplicação. Acumular zero pede quadro do mesmo
 * jeito (um evento de ponteiro com o mesmo ponto ainda é um quadro "sujo"), mas um quadro sem acumulado não faz nada.
 */
export function criarCoalescedorDeDeltas(
  aplicar: (dx: number, dy: number) => void,
  agendador: AgendadorDeQuadro,
  aoAplicar?: () => void,
): CoalescedorDeDeltas {
  let dx = 0;
  let dy = 0;
  let tem = false;
  let pedido: number | null = null;

  const drenar = (): { dx: number; dy: number } | null => {
    if (!tem) return null;
    const d = { dx, dy };
    dx = 0;
    dy = 0;
    tem = false;
    return d;
  };
  const aplicarAgora = (d: { dx: number; dy: number }): void => {
    aplicar(d.dx, d.dy);
    aoAplicar?.();
  };

  return {
    acumular(nx, ny) {
      dx += nx;
      dy += ny;
      tem = true;
      pedido ??= agendador.agendar(() => {
        pedido = null;
        const d = drenar();
        if (d) aplicarAgora(d);
      });
    },
    quadro() {
      const d = drenar();
      if (!d) return false;
      aplicarAgora(d);
      return true;
    },
    soltar() {
      if (pedido !== null) {
        agendador.cancelar(pedido);
        pedido = null;
      }
      const d = drenar();
      if (d) aplicarAgora(d);
      return d;
    },
    pendente: () => pedido !== null,
  };
}

/** Pedido de redesenho adiado: no máximo um `previewTick` por quadro, mesmo com vários eventos no mesmo quadro. */
export interface PedidoDeQuadro {
  pedir(): void;
  /** Cancela o pedido pendente; devolve `true` se havia um (e ele não vai mais rodar). */
  soltar(): boolean;
  pendente(): boolean;
}

/** Adia `aoDesenhar` para o próximo quadro. `pedir` repetido no mesmo quadro não agenda de novo. */
export function criarPedidoDeQuadro(agendador: AgendadorDeQuadro, aoDesenhar: () => void): PedidoDeQuadro {
  let pedido: number | null = null;
  return {
    pedir() {
      pedido ??= agendador.agendar(() => {
        pedido = null;
        aoDesenhar();
      });
    },
    soltar() {
      if (pedido === null) return false;
      agendador.cancelar(pedido);
      pedido = null;
      return true;
    },
    pendente: () => pedido !== null,
  };
}

/** Campos de `UiState` que `visibilityOf` lê além do projeto e do `viewTemp` da vista (ver `viewVisibility.ts`). */
export interface CamposDeVisibilidade {
  view: string;
  planKind?: string | null;
  levelId: string;
  areaPlanId?: string | null;
  sectionId?: string | null;
  sheetId?: string | null;
  planViewId?: string | null;
  faceView?: { elementId: string; face: string; layer: string | number } | null;
  /** Vista 3D salva ativa: muda o alvo da ocultação, a disciplina e os tons da 3D. */
  view3dViewId?: string | null;
  /** Disciplina de trabalho pessoal: manda na disciplina da vista, no meio-tom e nos bloqueados. */
  minhaDisciplina?: string | null;
  /** "Liberar edição": tira os bloqueados da disciplina. */
  liberarEdicao?: boolean;
}

/** Resumo estável dos campos de visibilidade: muda quando a vista (ou o que as anotações dela dependem) muda. */
export function resumoDeVisibilidade(f: CamposDeVisibilidade): string {
  const face = f.faceView ? `${f.faceView.elementId}:${f.faceView.face}:${f.faceView.layer}` : '';
  return [
    f.view,
    f.planKind ?? '',
    f.levelId,
    f.areaPlanId ?? '',
    f.sectionId ?? '',
    f.sheetId ?? '',
    f.planViewId ?? '',
    face,
    f.view3dViewId ?? '',
    f.minhaDisciplina ?? '',
    f.liberarEdicao ? '1' : '0',
  ].join('|');
}

/** Valor memoizado da visibilidade e a chave que o produziu. */
export interface MemoDeVisibilidade<T> {
  projeto: unknown;
  campos: string;
  temp: unknown;
  valor: T;
}

/**
 * Reaproveita `anterior` quando o projeto (identidade), os campos da vista e o objeto de `viewTemp` da vista são os
 * mesmos; senão recalcula. Identidades, não valores: o projeto é imutável por versão e o temporário é trocado por
 * cópia a cada comando (`setTemp`).
 */
export function memoizarVisibilidade<T>(
  anterior: MemoDeVisibilidade<T> | null,
  chave: { projeto: unknown; campos: string; temp: unknown },
  calcular: () => T,
): MemoDeVisibilidade<T> {
  if (anterior && anterior.projeto === chave.projeto && anterior.campos === chave.campos && anterior.temp === chave.temp) return anterior;
  return { ...chave, valor: calcular() };
}
