import { useMemo, useRef, useState, type DragEvent as RDragEvent, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import type { Familia, Id } from '@hestia/model';
import { create } from 'zustand';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { TIPO_DRAG_FAMILIA } from '../editor/soltarFamilia.ts';
import { aplicarEscolhaDeFamilia } from './ComponentOptionsBar.tsx';
import { miniaturaDaFamilia, type RetanguloMiniatura } from './familia/familiaMiniatura.ts';
import { ABAS_PALETA, filtrarItensDaPaleta, montarItensDaPaleta, type CategoriaPaleta, type ItemPaleta } from './paletaMoveis.ts';
import './paletaMoveis.css';

/*
 * Paleta de móveis (F3-biblioteca): janela flutuante aberta pelo botão "Biblioteca" da faixa. O cartão pode ser arrastado
 * para a planta/3D (o canvas cria o componente) ou clicado, o que escolhe a família na ferramenta Componente e a ativa.
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
    <svg viewBox={`0 0 ${miniatura.largura} ${miniatura.altura}`} role="img" aria-label={`Miniatura de ${familia.nome}`}>
      {miniatura.retangulos.map((r, i) => (
        <rect key={`${r.papel}-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={corDoRetangulo(r)} fillOpacity={r.vazio ? 0.28 : 0.92} stroke="var(--line-strong)" strokeWidth={0.5} />
      ))}
    </svg>
  );
}

interface CartaoProps {
  item: ItemPaleta;
  aoEscolher: (id: Id) => void;
}

function CartaoMovel({ item, aoEscolher }: CartaoProps): ReactElement {
  const { familia, doProjeto } = item;
  const arrastar = (e: RDragEvent<HTMLButtonElement>): void => {
    e.dataTransfer.setData(TIPO_DRAG_FAMILIA, familia.id);
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <button
      type="button"
      className={`pal-movel${doProjeto ? ' do-projeto' : ''}`}
      draggable
      onDragStart={arrastar}
      onClick={() => aoEscolher(familia.id)}
      title={`${familia.nome} — arraste para a planta/3D ou clique para usar a ferramenta Componente`}
    >
      {doProjeto && <span className="pal-selo">No projeto</span>}
      <Miniatura familia={familia} />
      <span className="pal-nome">{familia.nome}</span>
    </button>
  );
}

export function PaletaMoveis(): ReactElement | null {
  const aberta = usePaletaMoveis((s) => s.aberta);
  const fechar = usePaletaMoveis((s) => s.fechar);
  const p = useProject();
  const [categoria, setCategoria] = useState<CategoriaPaleta>('todas');
  const [busca, setBusca] = useState('');
  const [posicao, setPosicao] = useState(POSICAO_INICIAL);
  const arrasteJanela = useRef<{ dx: number; dy: number } | null>(null);

  const itens = useMemo(() => montarItensDaPaleta(p), [p]);
  const filtrados = useMemo(() => filtrarItensDaPaleta(itens, categoria, busca), [itens, categoria, busca]);

  const escolher = (id: Id): void => {
    const escolha = aplicarEscolhaDeFamilia(editor.store, id);
    if (!escolha) {
      useUi.setState({ status: 'Família de componente não encontrada.' });
      return;
    }
    useUi.setState((s) => ({
      options: { ...s.options, ...escolha.opcoes },
      status: `${escolha.familia.nome}: clique na planta ou no 3D para inserir.`,
    }));
    editor.setTool('component');
  };

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
    <div className="pal-janela" role="dialog" aria-label="Biblioteca de móveis" style={{ left: posicao.x, top: posicao.y }}>
      <div className="pal-titulo" onPointerDown={iniciarJanela} onPointerMove={moverJanela} onPointerUp={soltarJanela} onPointerCancel={soltarJanela}>
        <span>Biblioteca</span>
        <button type="button" className="pal-fechar" aria-label="Fechar a biblioteca" onClick={fechar}>×</button>
      </div>
      <div className="pal-corpo">
        <input
          className="pal-busca"
          type="search"
          value={busca}
          placeholder="Buscar por nome ou descrição"
          aria-label="Buscar móveis"
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="pal-abas" role="tablist" aria-label="Categorias">
          {ABAS_PALETA.map((aba) => (
            <button
              key={aba.id}
              type="button"
              role="tab"
              aria-selected={categoria === aba.id}
              className={categoria === aba.id ? 'sel' : ''}
              onClick={() => setCategoria(aba.id)}
            >
              {aba.id === 'meus' ? 'No projeto' : aba.rotulo}
            </button>
          ))}
        </div>
        <div className="pal-grade">
          {filtrados.length === 0 ? (
            <div className="pal-vazio">Nenhum móvel encontrado.</div>
          ) : (
            filtrados.map((item) => <CartaoMovel key={item.familia.id} item={item} aoEscolher={escolher} />)
          )}
        </div>
      </div>
    </div>
  );
}
