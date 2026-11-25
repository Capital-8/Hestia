import { useRef, useState, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import { useUi } from '../../editor/state.ts';
import { CircuitosPainel } from '../circuitos/CircuitosPainel.tsx';
import '../circuitos/circuitos.css';

/*
 * Painel Circuitos (ficha C4; ficha C8b, defeito J): janela FLUTUANTE e não modal, como a Biblioteca. Antes era um diálogo modal
 * largo que cobria a metade direita da planta. Agora abre ancorada à direita, com largura reduzida, e a planta segue clicável: a
 * seleção feita antes de "Atribuir selecionados" vale. A barra de título arrasta a janela; o botão de recolher deixa só a barra.
 * Texto fixo em português, como os painéis MEP.
 */

/** Largura e posição iniciais: à direita, abaixo da faixa. */
const LARGURA = 340;
const TOPO_INICIAL = 150;
const MARGEM_DIREITA = 16;
/** Largura na tela: a inicial, sem passar da largura do celular (16 px de margem de cada lado). */
const LARGURA_UTIL = `min(${LARGURA}px, calc(100vw - 32px))`;

export function CircuitosDialog(): ReactElement {
  const close = (): void => useUi.setState({ dialog: null });
  const [recolhida, setRecolhida] = useState(false);
  // Posição só depois de arrastar; antes, a janela fica ancorada à direita (não cobre a planta por padrão).
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(null);
  const arraste = useRef<{ dx: number; dy: number } | null>(null);

  const iniciar = (e: RPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    // Botões da barra (recolher, fechar) recebem o clique: sem isto a captura do ponteiro engole o clique.
    if ((e.target as HTMLElement).closest('button')) return;
    const r = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!r) return;
    arraste.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    setPosicao({ x: r.left, y: r.top });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const mover = (e: RPointerEvent<HTMLDivElement>): void => {
    const inicio = arraste.current;
    if (!inicio) return;
    setPosicao({ x: Math.max(0, e.clientX - inicio.dx), y: Math.max(0, e.clientY - inicio.dy) });
  };
  const soltar = (e: RPointerEvent<HTMLDivElement>): void => {
    arraste.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const estilo = posicao
    ? { left: posicao.x, top: posicao.y, width: LARGURA_UTIL }
    : { right: MARGEM_DIREITA, top: TOPO_INICIAL, width: LARGURA_UTIL };

  return (
    <div
      className={`circ-janela${recolhida ? ' recolhida' : ''}`}
      role="dialog"
      aria-label="Circuitos elétricos"
      style={estilo}
      onKeyDown={(e) => {
        // Esc fecha a janela quando o foco está nela; fora dela, Esc segue para as ferramentas da planta.
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="circ-janela-titulo" onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
        <strong>Circuitos elétricos</strong>
        <span style={{ flex: 1 }} />
        <button type="button" className="ibtn" aria-expanded={!recolhida} aria-label={recolhida ? 'Expandir painel Circuitos' : 'Recolher painel Circuitos'} onClick={() => setRecolhida((v) => !v)}>
          {recolhida ? '▸' : '▾'}
        </button>
        <button type="button" className="ibtn" aria-label="Fechar painel Circuitos" onClick={close}>×</button>
      </div>
      {recolhida ? null : (
        <div className="circ-janela-corpo">
          <p className="circ-dica">Os valores de potência são seus: o programa não aplica norma aqui.</p>
          <CircuitosPainel />
        </div>
      )}
    </div>
  );
}
