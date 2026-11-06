/**
 * Máquina de estados pura da sessão de render de imagem.
 *
 * fluxo: ocioso → (renderizar) → renderizando → concluido → (baixar) → baixado no diálogo;
 * `erro` e `cancelado` são estados terminais alternativos. "Salvar" nunca inicia o render:
 * o render só começa pelo evento 'iniciar' (ação "Renderizar"), e "Baixar" só existe em `concluido`.
 * Sem React aqui: o hook e o diálogo consomem `transicionar` e os seletores abaixo.
 */

export type EstadoSessao =
  | { tipo: 'ocioso' }
  | { tipo: 'renderizando'; concluidos: number; total: number; mensagem: string }
  | { tipo: 'concluido'; imagem: Blob | null }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'cancelado' };

export type EventoSessao =
  | { tipo: 'iniciar'; total: number }
  | { tipo: 'tile'; concluidos: number; total: number }
  /** Modo pt: andamento por amostra (`feitas` de `total`). Mesma regra de `tile`: não regride. */
  | { tipo: 'amostra'; feitas: number; total: number }
  | { tipo: 'concluir'; imagem: Blob }
  | { tipo: 'falhar'; mensagem: string }
  | { tipo: 'cancelar' }
  | { tipo: 'reiniciar' };

const ESTADO_OCIOSO: EstadoSessao = { tipo: 'ocioso' };

/** Estados a partir dos quais um novo render pode começar. */
function permiteIniciar(estado: EstadoSessao): boolean {
  return estado.tipo === 'ocioso' || estado.tipo === 'concluido' || estado.tipo === 'erro' || estado.tipo === 'cancelado';
}

function totalValido(total: number): number {
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
}

/**
 * Aplica um evento ao estado. Eventos inválidos para o estado atual devolvem o próprio estado.
 * Em 'tile' e 'amostra', `concluidos` nunca diminui e nunca passa de `total`.
 */
export function transicionar(estado: EstadoSessao, evento: EventoSessao): EstadoSessao {
  switch (evento.tipo) {
    case 'iniciar':
      if (!permiteIniciar(estado)) return estado;
      return { tipo: 'renderizando', concluidos: 0, total: totalValido(evento.total), mensagem: 'Preparando o render' };

    case 'tile':
    case 'amostra': {
      if (estado.tipo !== 'renderizando') return estado;
      const total = totalValido(evento.total);
      const feitos = evento.tipo === 'tile' ? evento.concluidos : evento.feitas;
      const concluidos = Math.min(Math.max(feitos, estado.concluidos), total);
      if (concluidos === estado.concluidos && total === estado.total) return estado;
      return { ...estado, concluidos, total };
    }

    case 'concluir':
      if (estado.tipo !== 'renderizando') return estado;
      return { tipo: 'concluido', imagem: evento.imagem };

    case 'falhar':
      if (estado.tipo !== 'renderizando') return estado;
      return { tipo: 'erro', mensagem: evento.mensagem };

    case 'cancelar':
      if (estado.tipo !== 'renderizando') return estado;
      return { tipo: 'cancelado' };

    case 'reiniciar':
      return ESTADO_OCIOSO;
  }
}

/** Progresso real de 0 a 1 só durante o render; `null` nos demais estados (sem progresso inventado). */
export function fracaoProgresso(estado: EstadoSessao): number | null {
  if (estado.tipo !== 'renderizando') return null;
  if (estado.total === 0) return 0;
  return estado.concluidos / estado.total;
}

/** "Baixar" só vale quando há imagem pronta no estado concluído. */
export function podeBaixar(estado: EstadoSessao): boolean {
  return estado.tipo === 'concluido' && estado.imagem != null;
}

/** "Renderizar" vale fora de um render em andamento. */
export function podeRenderizar(estado: EstadoSessao): boolean {
  return estado.tipo === 'ocioso' || estado.tipo === 'concluido' || estado.tipo === 'erro' || estado.tipo === 'cancelado';
}
