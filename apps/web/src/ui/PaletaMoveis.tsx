import { useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import type { Familia } from '@hestia/model';
import { create } from 'zustand';
import { useProject } from '../editor/controller.ts';
import { useT, type Dict } from '../editor/i18n.ts';
import { tm } from './moveisTextos.ts';
import { miniaturaDaFamilia, type RetanguloMiniatura } from './familia/familiaMiniatura.ts';
import { ABAS_PALETA, filtrarItensDaPaleta, montarItensDaPaleta, type CategoriaPaleta, type ItemPaleta } from './paletaMoveis.ts';
import {
  cancelarInsercaoBloco,
  confirmarInsercaoBloco,
  iniciarInsercaoBloco,
  useInsercaoBloco,
} from './viewport/inserirBloco.ts';
import './paletaMoveis.css';

/*
 * Paleta de móveis (F3-biblioteca): janela flutuante aberta pelo botão "Biblioteca" da faixa.
 * Ao clicar ou arrastar um cartão para a planta ou 3D, o módulo real entra em inserção ao vivo
 * com encaixe magnético em paredes e vizinhos (R gira 90°, Alt solta encaixe, Esc cancela).
 */

interface PaletaState {
  aberta: boolean;
  abrir: () => void;
  fechar: () => void;
  alternar: () => void;
}

export const usePaletaMoveis = create<PaletaState>((set) => ({
  aberta: false,
  abrir: () => set({ aberta: true }),
  fechar: () => set({ aberta: false }),
  alternar: () => set((s) => ({ aberta: !s.aberta })),
}));

/** Janela flutuante com posição inicial à esquerda do canvas. */
const POSICAO_INICIAL = { x: 24, y: 116 };

const CHAVE_ABA: Record<string, keyof Dict> = {
  todas: 'mov_cat_todas',
  marcenaria: 'mov_cat_marcenaria',
  mobiliario: 'mov_cat_mobiliario',
  loucas: 'mov_cat_loucas',
  equipamento: 'mov_cat_equipamento',
  generico: 'mov_cat_generico',
};

/** Rótulo da aba no idioma ativo; a categoria sem chave cai no rótulo PT da lista. */
const rotuloDaAba = (id: string, rotulo: string): string => {
  const chave = CHAVE_ABA[id];
  return chave ? tm(chave) : rotulo;
};

function corDoRetangulo(r: RetanguloMiniatura): string {
  if (r.vazio) return 'var(--fam-fundo)';
  if (r.papel === 'porta' || r.papel === 'frente_gaveta') return 'var(--fam-porta)';
  if (r.papel === 'tampo') return 'var(--fam-tampo)';
  if (r.papel === 'fundo' || r.papel === 'generica') return 'var(--fam-fundo)';
  return 'var(--fam-corpo)';
}

function Miniatura({ familia }: { familia: Familia }): ReactElement {
  const miniatura = miniaturaDaFamilia(familia, 120, 64);
  return (
    <svg viewBox={`0 0 ${miniatura.largura} ${miniatura.altura}`} role="img" aria-label={tm('mov_miniatura_de', { nome: familia.nome })}>
      {miniatura.retangulos.map((r, i) => (
        <rect key={`${r.papel}-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={corDoRetangulo(r)} fillOpacity={r.vazio ? 0.28 : 0.92} stroke="var(--line-strong)" strokeWidth={0.5} />
      ))}
    </svg>
  );
}

interface CartaoProps {
  item: ItemPaleta;
  ativa: boolean;
}

function CartaoMovel({ item, ativa }: CartaoProps): ReactElement {
  const { familia, doProjeto } = item;

  const iniciarGestoCartao = (e: RPointerEvent<HTMLButtonElement>): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    const inicioX = e.clientX;
    const inicioY = e.clientY;
    let arrastando = false;

    const aoMover = (ev: PointerEvent): void => {
      if (!arrastando && Math.hypot(ev.clientX - inicioX, ev.clientY - inicioY) > 6) {
        arrastando = true;
        iniciarInsercaoBloco(familia.id, 'arrasto');
      }
    };

    const encerrar = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', aoMover, true);
      window.removeEventListener('pointerup', encerrar, true);
      window.removeEventListener('pointercancel', cancelarGesto, true);
      if (!arrastando) {
        iniciarInsercaoBloco(familia.id, 'clique');
        return;
      }
      const alvo = document.elementFromPoint(ev.clientX, ev.clientY);
      const sobreCanvas = Boolean(alvo?.closest('.canvas-wrap'));
      if (sobreCanvas && useInsercaoBloco.getState().ativo?.ultimoPonto) {
        confirmarInsercaoBloco(ev.shiftKey);
      } else {
        cancelarInsercaoBloco();
      }
    };

    const cancelarGesto = (): void => {
      window.removeEventListener('pointermove', aoMover, true);
      window.removeEventListener('pointerup', encerrar, true);
      window.removeEventListener('pointercancel', cancelarGesto, true);
      if (arrastando) cancelarInsercaoBloco();
    };

    window.addEventListener('pointermove', aoMover, true);
    window.addEventListener('pointerup', encerrar, true);
    window.addEventListener('pointercancel', cancelarGesto, true);
  };

  return (
    <button
      type="button"
      className={`pal-movel${doProjeto ? ' do-projeto' : ''}${ativa ? ' ativa' : ''}`}
      onPointerDown={iniciarGestoCartao}
      title={tm('mov_cartao_dica', { nome: familia.nome })}
    >
      {doProjeto && <span className="pal-selo">{tm('mov_no_projeto')}</span>}
      <Miniatura familia={familia} />
      <span className="pal-nome">{familia.nome}</span>
    </button>
  );
}

export function PaletaMoveis(): ReactElement | null {
  const aberta = usePaletaMoveis((s) => s.aberta);
  const fechar = usePaletaMoveis((s) => s.fechar);
  const ativoId = useInsercaoBloco((s) => s.ativo?.familiaId ?? null);
  const p = useProject();
  const [categoria, setCategoria] = useState<CategoriaPaleta>('todas');
  const [busca, setBusca] = useState('');
  const [posicao, setPosicao] = useState(POSICAO_INICIAL);
  const arrasteJanela = useRef<{ dx: number; dy: number } | null>(null);
  useT();

  const itens = useMemo(() => montarItensDaPaleta(p), [p]);
  const filtrados = useMemo(() => filtrarItensDaPaleta(itens, categoria, busca), [itens, categoria, busca]);

  const iniciarJanela = (e: RPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    // Botões da barra de título (fechar) recebem o clique: sem isto a captura do ponteiro para arrastar a janela o engole.
    if ((e.target as HTMLElement).closest('button')) return;
    arrasteJanela.current = { dx: e.clientX - posicao.x, dy: e.clientY - posicao.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moverJanela = (e: RPointerEvent<HTMLDivElement>): void => {
    const inicio = arrasteJanela.current;
    if (!inicio) return;
    setPosicao({ x: Math.max(0, e.clientX - inicio.dx), y: Math.max(0, e.clientY - inicio.dy) });
  };
  const soltarJanela = (e: RPointerEvent<HTMLDivElement>): void => {
    arrasteJanela.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  if (!aberta) return null;

  return (
    <div className="pal-janela" role="dialog" aria-label={tm('mov_biblioteca_titulo')} style={{ left: posicao.x, top: posicao.y }}>
      <div className="pal-titulo" onPointerDown={iniciarJanela} onPointerMove={moverJanela} onPointerUp={soltarJanela} onPointerCancel={soltarJanela}>
        <span>{tm('mov_biblioteca')}</span>
        <button type="button" className="pal-fechar" aria-label={tm('mov_fechar_biblioteca')} onClick={fechar}>×</button>
      </div>
      <div className="pal-corpo">
        <input
          className="pal-busca"
          type="search"
          value={busca}
          placeholder={tm('mov_busca_dica')}
          aria-label={tm('mov_busca_movel')}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="pal-abas" role="tablist" aria-label={tm('mov_categorias')}>
          {ABAS_PALETA.map((aba) => (
            <button
              key={aba.id}
              type="button"
              role="tab"
              aria-selected={categoria === aba.id}
              className={categoria === aba.id ? 'sel' : ''}
              onClick={() => setCategoria(aba.id)}
            >
              {aba.id === 'meus' ? tm('mov_no_projeto') : rotuloDaAba(aba.id, aba.rotulo)}
            </button>
          ))}
        </div>
        <div className="pal-grade">
          {filtrados.length === 0 ? (
            <div className="pal-vazio">{tm('mov_movel_nao_encontrado')}</div>
          ) : (
            filtrados.map((item) => <CartaoMovel key={item.familia.id} item={item} ativa={ativoId === item.familia.id} />)
          )}
        </div>
      </div>
    </div>
  );
}
