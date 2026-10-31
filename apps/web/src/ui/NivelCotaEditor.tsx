import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactElement } from 'react';
import type { DimensionHit } from '@hestia/render';
import type { Project } from '@hestia/model';
import { editor, useProjectVersion } from '../editor/controller.ts';
import { moveLevel } from '../editor/levelActions.ts';
import { useUi, type ViewKind } from '../editor/state.ts';

/** Contexto em que a cota foi aberta: a vista, o nível ativo e o documento. */
export interface ContextoCota {
  view: ViewKind;
  levelId: string;
  /** Identidade do projeto: a referência do documento aberto (os ids de nível se repetem entre projetos). */
  projeto: Project;
}

/** Lê o contexto atual do editor (para comparar com o da abertura). */
export function contextoAtualCota(): ContextoCota {
  const ui = useUi.getState();
  return { view: ui.view, levelId: ui.levelId, projeto: editor.project };
}

/**
 * Decisão ao fechar a edição: só aplica quando ela ainda pertence ao contexto em que abriu. Se a vista, o nível
 * ativo ou o projeto mudaram, a cota é descartada sem `upsertLevel` (o projeto novo pode ter o mesmo `lv_0`).
 */
export function decidirFechamentoCota(aberto: ContextoCota, atual: ContextoCota): 'aplicar' | 'cancelar' {
  const mesmoContexto = aberto.view === atual.view && aberto.levelId === atual.levelId && aberto.projeto === atual.projeto;
  return mesmoContexto ? 'aplicar' : 'cancelar';
}

/** Cota aberta para edição no 3D: posição no canvas (px) e o intervalo. */
interface Edicao {
  left: number;
  top: number;
  value: string;
  levelId: string;
  neighborId: string;
  side: 'below' | 'above';
  /** Contador da abertura: o efeito de foco roda a cada abertura, mesmo repetindo a mesma cota. */
  abertura: number;
  /** Contexto da abertura: se ele mudar, a edição é cancelada sem aplicar. */
  contexto: ContextoCota;
}

/** O que a vista chama para abrir/fechar o editor da cota. */
export interface NivelCotaEditorHandle {
  abrir: (hit: DimensionHit, rect: { width: number; height: number }) => void;
  /** Fecha aplicando, se estiver aberto; devolve true se havia um editor aberto no contexto atual (o clique é consumido). */
  fecharSeAberto: () => boolean;
}

/**
 * Editor da cota entre os eixos das bolhas: um input **no lugar** da etiqueta no 3D. Enquanto o input está aberto a
 * etiqueta 3D (sprite) fica escondida, para não aparecerem dois elementos sobrepostos. Editar a cota move o nível
 * **selecionado** (o vizinho fica fixo). Enter aplica, Esc cancela; clicar fora também aplica (a vista chama
 * `fecharSeAberto` no `pointerdown`). Trocar de vista, de nível ou de projeto cancela a edição sem aplicar.
 */
export const NivelCotaEditor = forwardRef<NivelCotaEditorHandle>(function NivelCotaEditor(_props, ref): ReactElement | null {
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const edicaoRef = useRef<Edicao | null>(null);
  edicaoRef.current = edicao;
  // Etiqueta 3D escondida pelo editor aberto (o sprite continua no grupo; só a visibilidade muda).
  const etiquetaRef = useRef<DimensionHit['label'] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const aberturas = useRef(0);
  // Contexto reativo: vista, nível ativo e versão do projeto (a referência do documento muda ao abrir/editar).
  const view = useUi((s) => s.view);
  const levelId = useUi((s) => s.levelId);
  useProjectVersion();
  const projeto = editor.project;

  /** Devolve a etiqueta 3D à cena (se ela ainda existir) e esquece a referência. */
  const mostrarEtiqueta = useCallback((): void => {
    const label = etiquetaRef.current;
    etiquetaRef.current = null;
    if (label) label.visible = true;
  }, []);

  const fechar = useCallback((aplicar: boolean): void => {
    const d = edicaoRef.current;
    if (!d) return;
    if (aplicar) {
      const valor = Number(d.value.replace(',', '.'));
      const sel = editor.project.levels.find((l) => l.id === d.levelId);
      const viz = editor.project.levels.find((l) => l.id === d.neighborId);
      if (sel && viz && Number.isFinite(valor) && valor > 0.01) {
        // O nível selecionado é o que se move; o vizinho fica fixo (a cota é a distância entre os eixos).
        const elevacao = d.side === 'below' ? viz.elevation + valor : viz.elevation - valor;
        const r = moveLevel(editor.store, sel.id, elevacao);
        if (r.ok) useUi.setState({ status: r.message });
      }
    }
    setEdicao(null);
    // A etiqueta volta ao 3D: o input sai de cena no mesmo quadro.
    mostrarEtiqueta();
  }, [mostrarEtiqueta]);

  useImperativeHandle(ref, () => ({
    abrir: (hit, rect) => {
      // Uma cota por vez: se outra estava aberta, a etiqueta dela volta antes.
      mostrarEtiqueta();
      // A etiqueta 3D sai de cena: o input ocupa exatamente o lugar dela (um elemento só na tela).
      hit.label.visible = false;
      etiquetaRef.current = hit.label;
      aberturas.current += 1;
      setEdicao({
        left: ((hit.ndc.x + 1) / 2) * rect.width,
        top: ((1 - hit.ndc.y) / 2) * rect.height,
        // units-ok: valor da cota no editor 3D (m)
        value: hit.value.toFixed(2).replace('.', ','),
        levelId: hit.levelId,
        neighborId: hit.neighborId,
        side: hit.side,
        abertura: aberturas.current,
        contexto: contextoAtualCota(),
      });
    },
    fecharSeAberto: () => {
      const d = edicaoRef.current;
      if (!d) return false;
      // Fora do contexto da abertura, fecha sem aplicar e não consome o clique: ele segue para a vista de agora.
      const aplicar = decidirFechamentoCota(d.contexto, contextoAtualCota()) === 'aplicar';
      fechar(aplicar);
      return aplicar;
    },
  }));

  // O `autoFocus` pode se perder com o pointer capture do canvas (o foco padrão do clique vem depois do handler):
  // reforça o foco (e a seleção) no quadro seguinte a cada abertura.
  const abertura = edicao?.abertura;
  useEffect(() => {
    if (abertura === undefined) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [abertura]);

  // Trocar de vista (prancha inclusive), de nível ou de projeto cancela a edição sem aplicar. Sem isto, o primeiro
  // clique depois da troca seria consumido por `fecharSeAberto` e poderia gravar a elevação no projeto novo.
  useEffect(() => {
    const d = edicaoRef.current;
    if (!d) return;
    if (decidirFechamentoCota(d.contexto, { view, levelId, projeto }) === 'cancelar') fechar(false);
  }, [view, levelId, projeto, fechar]);

  // Se o componente sair da tela com a cota aberta, a etiqueta não pode ficar escondida para sempre.
  useEffect(() => () => {
    const label = etiquetaRef.current;
    etiquetaRef.current = null;
    if (label) label.visible = true;
  }, []);

  if (!edicao) return null;
  return (
    <div
      className="level-dim-edit"
      style={{ left: edicao.left, top: edicao.top, fontSize: 14 }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        autoFocus
        style={{ width: 90, fontSize: 14 }}
        value={edicao.value}
        onChange={(e) => setEdicao({ ...edicao, value: e.target.value })}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            fechar(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            fechar(false);
          }
        }}
      />
      <span>m</span>
    </div>
  );
});
