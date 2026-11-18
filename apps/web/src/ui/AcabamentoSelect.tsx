import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { ACABAMENTOS_MOVEIS } from '@hestia/model';
import { useT } from '../editor/i18n.ts';
import { nomeDoAcabamento, tm } from './moveisTextos.ts';
import './acabamentoSelect.css';

interface Props {
  id: string;
  /** Rótulo acessível (o mesmo texto da linha). */
  rotulo: string;
  /** Acabamento atual: `''` é o padrão do móvel. */
  valor: string;
  /** Os móveis selecionados têm valores diferentes. */
  misto: boolean;
  onEscolher: (acabamentoId: string) => void;
}

interface Item {
  id: string;
  nome: string;
  cor: string | null;
}

/**
 * Seletor de acabamento em lista própria (portal): botão + `role=listbox`. Fica aberto até a pessoa escolher, apertar Esc ou
 * clicar fora, mesmo que o painel re-renderize ou o foco saia do botão (a lista nativa fechava a cada re-render).
 * Teclado: setas, Home/End, Enter/Espaço escolhem, Esc fecha sem alterar, Tab fecha.
 */
export function AcabamentoSelect({ id, rotulo, valor, misto, onEscolher }: Props): ReactElement {
  const { lang } = useT();
  // Lista derivada do catálogo e do idioma: mesma identidade entre re-renders do painel.
  const itens = useMemo<Item[]>(() => [
    { id: '', nome: tm('mov_padrao_movel'), cor: null },
    ...ACABAMENTOS_MOVEIS.map((a) => ({ id: a.id, nome: nomeDoAcabamento(a.id, a.nome), cor: a.cor })),
  ], [lang]); // eslint-disable-line react-hooks/exhaustive-deps -- `tm` lê o idioma do store
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const atual = misto ? null : itens.find((i) => i.id === valor) ?? null;

  const abrir = (): void => {
    const r = botao.current?.getBoundingClientRect();
    if (!r) return;
    const abaixo = window.innerHeight - r.bottom - 8;
    const sobe = abaixo < 180 && r.top > abaixo;
    const altura = Math.max(120, Math.min(320, sobe ? r.top - 8 : abaixo));
    setPos({ left: r.left, width: Math.max(r.width, 200), maxHeight: altura, ...(sobe ? { bottom: window.innerHeight - r.top + 2 } : { top: r.bottom + 2 }) });
    const i = itens.findIndex((x) => x.id === valor);
    setAtivo(misto || i < 0 ? 0 : i);
    setAberto(true);
  };
  const fechar = useCallback((devolveFoco: boolean): void => {
    setAberto(false);
    if (devolveFoco) botao.current?.focus();
  }, []);
  const escolher = (i: number): void => {
    const item = itens[i];
    if (item === undefined) return;
    fechar(true);
    if (misto || item.id !== valor) onEscolher(item.id);
  };

  // Fecha ao clicar fora, ao rolar fora da lista ou ao redimensionar; a perda de foco NÃO fecha.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent): void => {
      const alvo = e.target as Node | null;
      if (lista.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      fechar(false);
    };
    const rolou = (e: Event): void => { if (!lista.current?.contains(e.target as Node | null)) fechar(false); };
    const fim = (): void => fechar(false);
    window.addEventListener('pointerdown', fora, true);
    window.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', fim);
    return () => {
      window.removeEventListener('pointerdown', fora, true);
      window.removeEventListener('scroll', rolou, true);
      window.removeEventListener('resize', fim);
    };
  }, [aberto, fechar]);

  // Teclado no documento enquanto aberta: continua valendo se o foco sair do botão.
  const estado = useRef({ ativo, n: itens.length });
  estado.current = { ativo, n: itens.length };
  const escolherRef = useRef(escolher);
  escolherRef.current = escolher;
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent): void => {
      const { ativo: a, n } = estado.current;
      const consome = (): void => { e.preventDefault(); e.stopPropagation(); };
      switch (e.key) {
        case 'ArrowDown': consome(); setAtivo((a + 1) % n); return;
        case 'ArrowUp': consome(); setAtivo((a - 1 + n) % n); return;
        case 'Home': consome(); setAtivo(0); return;
        case 'End': consome(); setAtivo(n - 1); return;
        case 'Enter':
        case ' ': consome(); escolherRef.current(a); return;
        case 'Escape': consome(); fechar(true); return;
        case 'Tab': fechar(false); return;
        default:
      }
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [aberto, fechar]);

  // Mantém o item ativo visível.
  useEffect(() => {
    if (aberto) lista.current?.querySelector<HTMLElement>('[data-ativo="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [aberto, ativo]);

  const idLista = `${id}-lista`;
  return (
    <>
      <button
        ref={botao}
        id={id}
        type="button"
        className="select acab-sel-btn"
        aria-label={rotulo}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? idLista : undefined}
        onClick={() => (aberto ? fechar(false) : abrir())}
        onKeyDown={(e) => {
          if (!aberto && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); abrir(); }
        }}
      >
        <span className="acab-sel-amostra" style={atual?.cor ? { background: atual.cor } : undefined} aria-hidden="true" />
        <span className="acab-sel-nome">{misto ? tm('mov_variados') : atual?.nome ?? valor}</span>
        <span className="acab-sel-seta" aria-hidden="true">▾</span>
      </button>
      {aberto && createPortal(
        <div ref={lista} id={idLista} className="acab-sel-lista" role="listbox" aria-label={rotulo} style={pos} onPointerDown={(e) => e.stopPropagation()}>
          {itens.map((it, i) => (
            <div
              key={it.id}
              role="option"
              aria-selected={!misto && it.id === valor}
              data-ativo={i === ativo ? '1' : '0'}
              className={`acab-sel-item${i === ativo ? ' ativo' : ''}${!misto && it.id === valor ? ' atual' : ''}`}
              onPointerEnter={() => setAtivo(i)}
              onClick={() => escolher(i)}
            >
              <span className="acab-sel-amostra" style={it.cor ? { background: it.cor } : undefined} aria-hidden="true" />
              <span className="acab-sel-nome">{it.nome}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
