import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { faixaVisivel, type LinhaVistas } from '../../editor/sheetInsertSources.ts';

/** Valores antes da primeira medição (SSR e o quadro inicial). A altura real vem do CSS e é medida. */
const LINHA_PADRAO = 28;
const ALTURA_PADRAO = 300;

interface Props {
  linhas: readonly LinhaVistas[];
  marcadas: ReadonlySet<string>;
  onToggle: (key: string, on: boolean) => void;
  /** Nome acessível da lista. */
  label: string;
}

/**
 * Lista rolável das vistas com caixas de seleção. Só as linhas da faixa visível entram no DOM (a janela de rolagem
 * ajusta), então abrir com centenas de vistas é imediato. A altura da linha vem do CSS em `em` e é medida no DOM, então
 * uma fonte maior não deixa linhas sobrepostas.
 */
export function InsertViewsList({ linhas, marcadas, onToggle, label }: Props): ReactElement {
  const caixa = useRef<HTMLDivElement>(null);
  const primeiraNaFaixa = useRef<HTMLDivElement>(null);
  const [rolagem, setRolagem] = useState(0);
  const [altura, setAltura] = useState(ALTURA_PADRAO);
  const [linhaPx, setLinhaPx] = useState(LINHA_PADRAO);

  const medir = (): void => {
    const el = caixa.current;
    if (el && el.clientHeight > 0) setAltura(el.clientHeight);
    const h = primeiraNaFaixa.current?.getBoundingClientRect().height ?? 0;
    if (h > 0 && Math.abs(h - linhaPx) > 0.5) setLinhaPx(h);
  };
  // Mede a cada quadro (a faixa muda com a rolagem) e na troca de tamanho da janela ou da fonte.
  const medirRef = useRef(medir);
  medirRef.current = medir;
  useEffect(() => {
    medirRef.current();
  });
  useEffect(() => {
    const aoMudar = (): void => medirRef.current();
    window.addEventListener('resize', aoMudar);
    return () => window.removeEventListener('resize', aoMudar);
  }, []);

  const { primeira, ultima } = faixaVisivel(linhas.length, linhaPx, rolagem, altura);
  const itens: ReactNode[] = [];
  for (let i = primeira; i <= ultima; i++) {
    const linha = linhas[i]!;
    const ref = i === primeira ? primeiraNaFaixa : undefined;
    const top = i * linhaPx;
    if (linha.kind === 'grupo') {
      itens.push(
        <div key={`grupo:${linha.titulo}`} ref={ref} className="ins-row ins-grupo" style={{ top }}>
          {linha.titulo}
        </div>,
      );
      continue;
    }
    const { key, label: nome } = linha.fonte;
    itens.push(
      <div key={key} ref={ref} className="ins-row" style={{ top }}>
        <label className="ins-item">
          <input type="checkbox" checked={marcadas.has(key)} onChange={(e) => onToggle(key, e.target.checked)} />
          <span className="ins-name" title={nome}>
            {nome}
          </span>
        </label>
      </div>,
    );
  }

  return (
    <div ref={caixa} className="ins-list" role="group" aria-label={label} onScroll={(e) => setRolagem(e.currentTarget.scrollTop)}>
      <div className="ins-list-body" style={{ height: linhas.length * linhaPx }}>
        {itens}
      </div>
    </div>
  );
}
