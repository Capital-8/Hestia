import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import type { Familia } from '@hestia/model';
import { create } from 'zustand';
import { useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { useT, type Dict } from '../editor/i18n.ts';
import { useFamilia } from './familia/familiaStore.ts';
import { tm } from './moveisTextos.ts';
import { Icon } from './Icon.tsx';
import { miniaturaDaFamilia, type RetanguloMiniatura } from './familia/familiaMiniatura.ts';
import { ehFamiliaMep, silhuetaMep } from './miniaturaMep.ts';
import { ABAS_PALETA, filtrarItensDaPaleta, montarItensDaPaleta, type CategoriaPaleta, type ItemPaleta } from './paletaMoveis.ts';
import {
  cancelarInsercaoBloco,
  confirmarInsercaoBloco,
  iniciarInsercaoBloco,
  useInsercaoBloco,
} from './viewport/inserirBloco.ts';
import './paletaMoveis.css';

/** Emblema de cada grupo de sistema na aba da paleta (16 px, à esquerda do rótulo). */
const ICONE_GRUPO_ABA: Partial<Record<string, string>> = {
  'grupo:hidraulica': 'mepAguaFria',
  'grupo:eletrico': 'mepEletrico',
  'grupo:hvac': 'mepHvac',
  'grupo:estrutura': 'mepEstrutura',
};

/*
 * Paleta de móveis (F3-biblioteca): janela flutuante aberta pelo botão "Biblioteca" da faixa.
 * Ao clicar ou arrastar um cartão para a planta ou 3D, o módulo real entra em inserção ao vivo
 * com encaixe magnético em paredes e vizinhos (R gira 90°, Alt solta encaixe, Esc cancela).
 */

interface PaletaState {
  aberta: boolean;
  /** Aba a mostrar ao abrir pela faixa (ex.: o grupo Hidráulica); `null` mantém a que a pessoa deixou. */
  abaPedida: { aba: CategoriaPaleta; n: number } | null;
  /** Abre a paleta já na aba pedida (botões das abas Sistemas, Aço e Estrutura). */
  abrirEm: (aba: CategoriaPaleta) => void;
  abrir: () => void;
  fechar: () => void;
  alternar: () => void;
}

export const usePaletaMoveis = create<PaletaState>((set) => ({
  aberta: false,
  abaPedida: null,
  abrirEm: (aba) => set((s) => ({ aberta: true, abaPedida: { aba, n: (s.abaPedida?.n ?? 0) + 1 } })),
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
  // Famílias MEP guardam a geometria em corpos: a silhueta real (ficha B7) substitui o retângulo de peças.
  const silhueta = ehFamiliaMep(familia) ? silhuetaMep(familia, 120, 64) : null;
  if (silhueta !== null) {
    return (
      <svg viewBox={`0 0 ${silhueta.largura} ${silhueta.altura}`} role="img" aria-label={tm('mov_miniatura_de', { nome: familia.nome })}>
        {silhueta.triangulos.map((t, i) => (
          <path key={i} d={t.d} fill={t.cor} stroke={t.cor} strokeWidth={0.35} strokeLinejoin="round" />
        ))}
        <path d={silhueta.arestas} fill="none" stroke="var(--line-strong)" strokeWidth={0.6} strokeLinecap="round" />
      </svg>
    );
  }
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
  const abaPedida = usePaletaMoveis((s) => s.abaPedida);
  const [categoria, setCategoria] = useState<CategoriaPaleta>(abaPedida?.aba ?? 'todas');
  // Cada pedido da faixa (mesmo repetido) leva a paleta à aba pedida; escolher uma aba à mão volta a mandar.
  useEffect(() => {
    if (abaPedida !== null) setCategoria(abaPedida.aba);
  }, [abaPedida]);
  const [busca, setBusca] = useState('');
  const [posicao, setPosicao] = useState(POSICAO_INICIAL);
  const arrasteJanela = useRef<{ dx: number; dy: number } | null>(null);
  const { t } = useT();

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
        <button type="button" className="pal-importar" data-testid="pal-importar" title={t('fur_import_sub')} onClick={() => useUi.setState({ dialog: 'importFurniture', dialogArg: null })}>
          {t('fur_import_title')}
        </button>
        <button type="button" className="pal-importar pal-criar" data-testid="pal-criar-modelo" title={t('fam_criar_modelo_dica')} onClick={() => useFamilia.getState().abrir()}>
          {t('fam_criar_modelo')}
        </button>
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
              {ICONE_GRUPO_ABA[aba.id] && (
                <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 4 }} aria-hidden="true">
                  <Icon name={ICONE_GRUPO_ABA[aba.id] ?? ''} size={16} />
                </span>
              )}
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
