import { useEffect, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/*
 * Popover do editor de peças: abre ancorado num botão, por cima de tudo (portal), fecha com Esc ou clique fora. Posiciona
 * sozinho para não sair da janela, já que o navegador fica num dock estreito.
 */

interface Props {
  ancora: DOMRect;
  titulo: string;
  children: ReactNode;
  onFechar: () => void;
}

const LARGURA = 300;

export function PopoverPeca({ ancora, titulo, children, onFechar }: Props): ReactElement {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  const esquerda = Math.max(8, Math.min(ancora.left, window.innerWidth - LARGURA - 8));
  const topo = Math.max(8, Math.min(ancora.bottom + 2, window.innerHeight - 280));
  return createPortal(
    <>
      <div className="fam-pop-fundo" onPointerDown={onFechar} />
      <div className="fam-pop" role="dialog" aria-label={titulo} style={{ left: esquerda, top: topo, width: LARGURA }}>
        <div className="fam-pop-titulo">
          <span>{titulo}</span>
          <button type="button" className="fam-pop-fechar" aria-label="Fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="fam-pop-corpo">{children}</div>
      </div>
    </>,
    document.body,
  );
}
