import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactElement } from 'react';
import { isComponent, type Id, type Project } from '@hestia/model';
import { editor, useProjectVersion } from '../../editor/controller.ts';
import { useUi, type ViewKind } from '../../editor/state.ts';
import { aplicarValorDeParametro } from '../componentPropAcoes.ts';
import { limitesParametroComponente } from './gizmoComponenteOps.ts';

export type AlcaDimGizmo = 'dim_L' | 'dim_A' | 'dim_P';
export type ParamDimGizmo = 'L' | 'A' | 'P';

export interface GizmoInput3DAbrirArgs {
  id: Id;
  alca: AlcaDimGizmo;
  valorAtualMm?: number;
  ndc: { x: number; y: number };
}

export interface GizmoInput3DHandle {
  abrir: (args: GizmoInput3DAbrirArgs, rect: { width: number; height: number }) => void;
  /** Fecha aplicando (quando no mesmo contexto); devolve true se estava aberto e consumiu o clique. */
  fecharSeAberto: () => boolean;
}

interface EdicaoGizmo {
  id: Id;
  param: ParamDimGizmo;
  left: number;
  top: number;
  value: string;
  inicialMm?: number;
  abertura: number;
  view: ViewKind;
  projeto: Project;
}

function paramDaAlca(alca: AlcaDimGizmo): ParamDimGizmo {
  if (alca === 'dim_L') return 'L';
  if (alca === 'dim_A') return 'A';
  return 'P';
}

function formatarMm(valorMm: number | undefined): string {
  if (valorMm === undefined || !Number.isFinite(valorMm)) return '';
  return String(Math.round(valorMm * 100) / 100);
}

/**
 * Input flutuante no espaço de tela (posicionado pela projeção NDC da alça) para editar L, A ou P em mm
 * ao clicar sem arrastar em uma alça dimensional do gizmo 3D. Enter aplica em 1 passo de desfazer; Esc cancela.
 */
export const GizmoInput3D = forwardRef<GizmoInput3DHandle>(function GizmoInput3D(_props, ref): ReactElement | null {
  const [edicao, setEdicao] = useState<EdicaoGizmo | null>(null);
  const edicaoRef = useRef<EdicaoGizmo | null>(null);
  edicaoRef.current = edicao;
  const inputRef = useRef<HTMLInputElement>(null);
  const aberturas = useRef(0);

  const view = useUi((s) => s.view);
  useProjectVersion();
  const projeto = editor.project;

  const fechar = useCallback((aplicar: boolean): void => {
    const d = edicaoRef.current;
    if (!d) return;
    if (aplicar) {
      const bruto = Number(d.value.trim().replace(',', '.'));
      if (Number.isFinite(bruto) && bruto > 0 && isComponent(editor.project.elements[d.id])) {
        const { min, max } = limitesParametroComponente(editor.project, d.id, d.param);
        let mm = bruto;
        if (min !== undefined) mm = Math.max(min, mm);
        if (max !== undefined) mm = Math.min(max, mm);
        if (mm !== d.inicialMm) {
          const res = aplicarValorDeParametro(editor.store, [d.id], d.param, mm);
          if (!res.ok) {
            useUi.setState({ status: res.erro });
          } else {
            useUi.setState((s) => ({ status: `${d.param} = ${mm} mm`, previewTick: s.previewTick + 1 }));
          }
        }
      }
    }
    setEdicao(null);
  }, []);

  useImperativeHandle(ref, () => ({
    abrir: (args, rect) => {
      aberturas.current += 1;
      const rawLeft = ((args.ndc.x + 1) / 2) * rect.width;
      const rawTop = ((1 - args.ndc.y) / 2) * rect.height;
      const left = Math.min(Math.max(rawLeft, 56), Math.max(56, rect.width - 56));
      const top = Math.min(Math.max(rawTop, 24), Math.max(24, rect.height - 24));
      setEdicao({
        id: args.id,
        param: paramDaAlca(args.alca),
        left,
        top,
        value: formatarMm(args.valorAtualMm),
        inicialMm: args.valorAtualMm,
        abertura: aberturas.current,
        view: useUi.getState().view,
        projeto: editor.project,
      });
    },
    fecharSeAberto: () => {
      const d = edicaoRef.current;
      if (!d) return false;
      const mesmoContexto = useUi.getState().view === d.view && editor.project === d.projeto && isComponent(editor.project.elements[d.id]);
      fechar(mesmoContexto);
      return mesmoContexto;
    },
  }));

  const abertura = edicao?.abertura;
  useEffect(() => {
    if (abertura === undefined) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [abertura]);

  useEffect(() => {
    const d = edicaoRef.current;
    if (!d) return;
    if (view !== '3d' || projeto !== d.projeto || !isComponent(projeto.elements[d.id])) {
      fechar(false);
    }
  }, [view, projeto, fechar]);

  if (!edicao) return null;

  return (
    <div
      className="level-dim-edit"
      style={{ left: edicao.left, top: edicao.top, fontSize: 13 }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <span>{edicao.param}</span>
      <input
        ref={inputRef}
        autoFocus
        style={{ width: 68, fontSize: 13 }}
        value={edicao.value}
        onChange={(e) => setEdicao({ ...edicao, value: e.target.value })}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            fechar(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            fechar(false);
          }
        }}
      />
      <span>mm</span>
    </div>
  );
});
