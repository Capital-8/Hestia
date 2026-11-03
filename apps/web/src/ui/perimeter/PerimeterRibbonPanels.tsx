import type { PerimeterModifyKind } from '@hestia/tools';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { SketchResult, SketchTarget } from '@hestia/geom';
import type { RibbonPanel } from '../ribbon/model.ts';
import { P_MEASURE, P_MODIFY, P_PROPS, P_SELECT } from '../ribbon/panelsShared.ts';
import { t, type Dict, useT } from '../../editor/i18n.ts';
import { finishTitle, perimeterTool } from './PerimeterStatus.ts';

/** Forma da galeria "Desenhar". `isNew` marca o que o programa ainda não tem (ponto azul no canto). */
export type PerimeterShape =
  | 'line' | 'rect' | 'poly-inscribed' | 'poly-circumscribed' | 'circle' | 'arc-3pt' | 'arc-center' | 'arc-tangent'
  | 'fillet' | 'ellipse' | 'pick-face' | 'by-perimeter' | 'pick-room';

/** Linha que o próximo clique desenha: linha de limite (padrão) ou seta de inclinação (só telhado). */
export type PerimeterLineKind = 'boundary' | 'slope';

interface ShapeDef {
  id: PerimeterShape;
  label: string;
  isNew: boolean;
  icon: ReactNode;
  /** Alvos que mostram a forma. Ausente = todos. */
  targets?: readonly SketchTarget[];
}

/** Chave do dicionário de cada forma da galeria. */
const SHAPE_KEY: Record<PerimeterShape, keyof Dict> = {
  line: 'pro_pm_shape_line',
  rect: 'pro_pm_shape_rect',
  'poly-inscribed': 'pro_pm_shape_poly_in',
  'poly-circumscribed': 'pro_pm_shape_poly_circ',
  circle: 'pro_pm_shape_circle',
  'arc-3pt': 'pro_pm_shape_arc3',
  'arc-center': 'pro_pm_shape_arc_center',
  'arc-tangent': 'pro_pm_shape_arc_tangent',
  fillet: 'pro_pm_shape_fillet',
  ellipse: 'pro_pm_shape_ellipse',
  'pick-face': 'pro_pm_shape_pick_face',
  'by-perimeter': 'pro_pm_shape_by_perimeter',
  'pick-room': 'pro_pm_shape_pick_room',
};

const cls = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(' ');

/** Ícone 32×32 no estilo da faixa: as cores vêm das classes `ic-*` de styles.css. */
function Ic({ size = 20, children }: { size?: number; children: ReactNode }): ReactElement {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {children}
    </svg>
  );
}

/** Galeria de formas, na ordem da proposta. Não há furo aqui: furo é uma ferramenta própria de cada elemento. */
export const PERIMETER_SHAPES: readonly ShapeDef[] = [
  {
    id: 'line', label: t('pt', SHAPE_KEY.line), isNew: false,
    icon: <><path className="ic-s1" d="M5 27L27 5" /><rect className="ic-bl" x="3" y="25" width="4" height="4" /><rect className="ic-bl" x="25" y="3" width="4" height="4" /></>,
  },
  { id: 'rect', label: t('pt', SHAPE_KEY.rect), isNew: false, icon: <path className="ic-s1" d="M4 8H28V24H4Z" /> },
  {
    id: 'poly-inscribed', label: t('pt', SHAPE_KEY['poly-inscribed']), isNew: true,
    icon: <><circle className="ic-ln" cx="16" cy="17" r="12" /><path className="ic-s1" d="M16 5L27.4 13.3L23 26.7H9L4.6 13.3Z" /></>,
  },
  {
    id: 'poly-circumscribed', label: t('pt', SHAPE_KEY['poly-circumscribed']), isNew: true,
    icon: <><circle className="ic-ln" cx="16" cy="17" r="9.7" /><path className="ic-s1" d="M16 4L28.5 13L23.8 27.5H8.2L3.5 13Z" /></>,
  },
  { id: 'circle', label: t('pt', SHAPE_KEY.circle), isNew: true, icon: <circle className="ic-s1" cx="16" cy="16" r="12" /> },
  {
    id: 'arc-3pt', label: t('pt', SHAPE_KEY['arc-3pt']), isNew: true,
    icon: <><path className="ic-s1" d="M4 24A14 14 0 0 1 28 24" /><rect className="ic-bl" x="2" y="22" width="4" height="4" /><rect className="ic-bl" x="26" y="22" width="4" height="4" /></>,
  },
  {
    id: 'arc-center', label: t('pt', SHAPE_KEY['arc-center']), isNew: true,
    icon: <><path className="ic-s1" d="M6 22A14 14 0 0 1 26 22" /><path className="ic-ln" d="M16 28L6 22M16 28L26 22" /></>,
  },
  { id: 'arc-tangent', label: t('pt', SHAPE_KEY['arc-tangent']), isNew: true, icon: <path className="ic-s1" d="M3 26H13A11 11 0 0 0 27 10" /> },
  { id: 'fillet', label: t('pt', SHAPE_KEY.fillet), isNew: true, icon: <path className="ic-s1" d="M5 28V14A9 9 0 0 1 14 5H28" /> },
  { id: 'ellipse', label: t('pt', SHAPE_KEY.ellipse), isNew: true, icon: <ellipse className="ic-s1" cx="16" cy="16" rx="13" ry="8" /> },
  {
    id: 'pick-face', label: t('pt', SHAPE_KEY['pick-face']), isNew: true,
    icon: <><path className="ic-ln" d="M4 8H28V24H4Z" /><path className="ic-s1" d="M4 8H28" /><path className="ic-ac" d="M20 14L28 28L24 22L18 24Z" /></>,
  },
  {
    id: 'by-perimeter', label: t('pt', SHAPE_KEY['by-perimeter']), isNew: true,
    icon: <><path className="ic-ln" d="M3 3H29V29H3Z" strokeDasharray="3 2" /><path className="ic-s1" d="M8 9H24V16H20V23H8Z" /></>,
  },
  {
    id: 'pick-room', label: t('pt', SHAPE_KEY['pick-room']), isNew: false, targets: ['ceiling'],
    icon: <><path className="ic-ln" d="M3 6H29V26H3Z" /><path className="ic-s1" d="M7 10H21V22H7Z" /><path className="ic-ac" d="M17 15L26 26L22 19L18 21Z" /></>,
  },
];

/** Formas da galeria para o alvo: as de `PERIMETER_SHAPES` que o alvo usa. */
export const perimeterShapesFor = (target: SketchTarget): readonly ShapeDef[] => PERIMETER_SHAPES.filter((s) => !s.targets || s.targets.includes(target));

export interface PerimeterRibbonProps {
  target: SketchTarget;
  /** Resultado da dedução do contorno; Concluir só habilita com `ok`. */
  result: SketchResult | null;
  lineKind: PerimeterLineKind;
  shape: PerimeterShape;
  /** Comando de Modificar ativo: com ele ligado nenhuma forma da galeria fica marcada. */
  modify?: PerimeterModifyKind | null;
  onLineKind: (kind: PerimeterLineKind) => void;
  onShape: (shape: PerimeterShape) => void;
  onFinish: () => void;
  onCancel: () => void;
}

/** Passo de rolagem da galeria (uma linha de 30 px, com folga). */
const STEP = 30;

/**
 * Painéis "Modo" (Concluir/Cancelar) e "Desenhar" (linha de limite, seta de inclinação só no telhado, e a galeria de
 * formas em caixa com rolagem). Vêm na aba contextual: ver `perimeterContextTab`.
 */
export function PerimeterRibbonPanels({ target, result, lineKind, shape, modify, onLineKind, onShape, onFinish, onCancel }: PerimeterRibbonProps): ReactElement {
  const { t, lang } = useT();
  const roof = target === 'roof';
  const kind: PerimeterLineKind = roof ? lineKind : 'boundary';
  const canFinish = result?.ok === true;
  const galRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const scroll = (dy: number): void => galRef.current?.scrollBy({ top: dy, behavior: 'smooth' });
  const galleryTitle = expanded ? t('pro_pm_gallery_collapse') : t('pro_pm_gallery_expand');

  return (
    <>
      <div className="rb-panel" role="group" aria-label={t('pro_pm_panel_mode')}>
        <div className="rb-cols">
          <button className="rb-btn rb-large" title={finishTitle(target, result, lang)} aria-label={t('pro_finish')} disabled={!canFinish} onClick={onFinish}>
            <Ic size={32}>
              <path d="M5 17L12.5 24.5L27 7" fill="none" style={{ stroke: 'var(--revit-green)' }} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
            </Ic>
            <span className="rb-lbl">{t('pro_finish')}</span>
          </button>
          <button className="rb-btn rb-large" title={t('pro_pm_cancel_title')} aria-label={t('stt_cancel')} onClick={onCancel}>
            <Ic size={32}>
              <path d="M7 7L25 25M25 7L7 25" fill="none" style={{ stroke: 'var(--danger)' }} strokeWidth={3.2} strokeLinecap="round" />
            </Ic>
            <span className="rb-lbl">{t('stt_cancel')}</span>
          </button>
        </div>
        <div className="rb-title">{t('pro_pm_panel_mode')}</div>
      </div>

      <div className="rb-panel" role="group" aria-label={t('pro_pm_panel_draw')}>
        <div className="rb-cols">
          <div className="rb-stack">
            <button className={cls('rb-btn rb-small', !modify && kind === 'boundary' && 'on')} title={t('pro_pm_line_boundary')} aria-label={t('pro_pm_line_boundary')} aria-pressed={!modify && kind === 'boundary'} onClick={() => onLineKind('boundary')}>
              <Ic size={16}>
                <path className="ic-s1" d="M4 8H28V24H4Z" />
                <path className="ic-ac" d="M4 8H28V24H4Z" strokeDasharray="3 2" />
              </Ic>
              <span className="rb-lbl">{t('pro_pm_line_boundary')}</span>
            </button>
            {roof && (
              <button className={cls('rb-btn rb-small', kind === 'slope' && 'on')} title={t('pro_pm_slope_arrow')} aria-label={t('pro_pm_slope_arrow')} aria-pressed={kind === 'slope'} onClick={() => onLineKind('slope')}>
                <Ic size={16}>
                  <path className="ic-s1" d="M4 24L28 8" />
                  <path className="ic-ac" d="M28 8L21 8M28 8L28 15" />
                </Ic>
                <span className="rb-lbl">{t('pro_pm_slope_arrow')}</span>
              </button>
            )}
          </div>
          <div className={cls('pm-galbox', expanded && 'pm-expanded')} role="group" aria-label={t('pro_pm_shapes_aria')}>
            <div className="pm-gal" ref={galRef}>
              {perimeterShapesFor(target).map((s) => (
                <button
                  key={s.id}
                  className={cls('pm-gi', s.isNew && 'new', !modify && shape === s.id && 'on')}
                  title={t(SHAPE_KEY[s.id])}
                  aria-label={t(SHAPE_KEY[s.id])}
                  aria-pressed={!modify && shape === s.id}
                  onClick={() => onShape(s.id)}
                >
                  <Ic>{s.icon}</Ic>
                </button>
              ))}
            </div>
            <div className="pm-gscroll">
              <button type="button" title={t('pro_pm_scroll_up')} aria-label={t('pro_pm_scroll_up')} onClick={() => scroll(-STEP)}>▴</button>
              <button type="button" title={t('pro_pm_scroll_down')} aria-label={t('pro_pm_scroll_down')} onClick={() => scroll(STEP)}>▾</button>
              <button
                type="button"
                title={galleryTitle}
                aria-label={galleryTitle}
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                ▿
              </button>
            </div>
          </div>
        </div>
        <div className="rb-title">{t('pro_pm_panel_draw')}</div>
      </div>
    </>
  );
}

/** Item da aba contextual: um painel de dados da faixa, ou o lugar dos painéis Modo e Desenhar (`PerimeterRibbonPanels`). */
export type PerimeterTabSlot = { kind: 'panel'; panel: RibbonPanel } | { kind: 'perimetro' };

/** Descrição da aba "Modificar | Criar perímetro …". `key` identifica o assunto, como em `contextTab`. */
export interface PerimeterContextTab {
  key: string;
  label: { pt: string; en: string };
  slots: PerimeterTabSlot[];
}

/**
 * Aba contextual do modo de perímetro. Reaproveita Selecionar, Propriedades, Modificar e Medir (panelsShared.ts) e põe
 * Modo e Desenhar no lugar do slot `perimetro`. O integrador desenha cada slot: `panel` com PanelView, `perimetro`
 * com PerimeterRibbonPanels.
 */
export function perimeterContextTab(target: SketchTarget): PerimeterContextTab {
  return {
    key: `perimeter:${target}`,
    label: { pt: `Modificar | ${perimeterTool(target, 'pt')}`, en: `Modify | ${perimeterTool(target, 'en')}` },
    slots: [
      { kind: 'panel', panel: P_SELECT },
      { kind: 'panel', panel: P_PROPS },
      { kind: 'panel', panel: P_MODIFY },
      { kind: 'panel', panel: P_MEASURE },
      { kind: 'perimetro' },
    ],
  };
}
