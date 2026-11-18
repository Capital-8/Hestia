/**
 * Gesto do botão do ponteiro na prancha, decidido antes de qualquer outra coisa. Espaço segurado e Alt fazem o pan do
 * conteúdo da vista sob o cursor (Espaço é o gesto principal: no Linux o gerenciador de janelas costuma tomar o Alt
 * para mover a janela). Fora de uma vista, Espaço e o botão do meio arrastam a câmera da folha. Com uma ferramenta de
 * prancha ativa (Alinhar ou Mover), o clique esquerdo é da ferramenta, exceto com Espaço, que continua sendo pan.
 *
 * - `camera`: arrasta a folha (zoom e pan da câmera, sem mudar seleção nem vistas).
 * - `conteudo`: arrasta o conteúdo da vista sob o cursor (`offset` da âncora).
 * - `ferramenta`: o clique vai para o Alinhar ou o Mover.
 * - `selecao`: seleção, alças, arraste e caixa, como sem nenhuma tecla.
 * - `nada`: outro botão (direito, por exemplo) não tem gesto aqui.
 */
export type GestoBotaoPrancha = 'camera' | 'conteudo' | 'ferramenta' | 'selecao' | 'nada';

export interface EntradaGestoBotao {
  /** `PointerEvent.button`: 0 esquerdo, 1 meio, 2 direito. */
  botao: number;
  /** Espaço segurado (o palco lê o mesmo estado que a planta e o 3D). */
  espaco: boolean;
  alt: boolean;
  /** O ponteiro está dentro da caixa de alguma vista da folha. */
  sobreVista: boolean;
  /** Uma alça da vista selecionada está sob o ponteiro (redimensionar tem precedência sobre o Alt). */
  alca: boolean;
  /** Alinhar ou Mover ativo: o clique esquerdo sem Espaço é da ferramenta. */
  ferramenta: boolean;
}

export function gestoDoBotaoNaPrancha(e: EntradaGestoBotao): GestoBotaoPrancha {
  if (e.botao === 1) return 'camera';
  if (e.botao !== 0) return 'nada';
  if (e.espaco) return e.sobreVista && !e.alca ? 'conteudo' : 'camera';
  if (e.ferramenta) return 'ferramenta';
  if (e.alt) {
    if (e.alca) return 'selecao';
    return e.sobreVista ? 'conteudo' : 'camera';
  }
  return 'selecao';
}
