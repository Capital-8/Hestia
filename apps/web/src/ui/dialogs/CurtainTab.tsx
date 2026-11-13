import { useState, type ReactElement } from 'react';
import {
  CURTAIN_MIN_CELL,
  CURTAIN_MIN_REMAINDER,
  curtainPanelTypesOf,
  curtainWallTypes,
  mullionTypesOf,
  type CurtainMullions,
  type CurtainPanelKind,
  type CurtainPanelType,
  type CurtainSpec,
  type GridAxisSpec,
  type GridJustify,
  type GridLayoutMode,
  type Project,
} from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { NumField, Row, TextField } from '../fields.tsx';
import type { PT_PAREDE_CORTINA } from '../../editor/i18n/areas/parede-cortina-1.ts';

type Chave = keyof typeof PT_PAREDE_CORTINA;

export const MODOS: GridLayoutMode[] = ['fixedNumber', 'fixedDistance', 'maxDistance', 'manual'];
export const MODO_CHAVE: Record<GridLayoutMode, Chave> = {
  fixedNumber: 'pct_mode_fixed_number',
  fixedDistance: 'pct_mode_fixed_distance',
  maxDistance: 'pct_mode_max_distance',
  manual: 'pct_mode_manual',
};
export const JUSTIFICA: GridJustify[] = ['start', 'center', 'end'];
export const JUSTIFICA_CHAVE: Record<GridJustify, Chave> ={ start: 'pct_justify_start', center: 'pct_justify_center', end: 'pct_justify_end' };
const PAINEIS_TIPO: CurtainPanelKind[] = ['glass', 'solid', 'empty'];
const PAINEL_CHAVE: Record<CurtainPanelKind, Chave> = { glass: 'pct_panel_glass', solid: 'pct_panel_solid', empty: 'pct_panel_empty' };

/** Papéis de montante do sistema, na ordem da tela. O canto só vale entre duas cortinas em ângulo (decisão 0056, §4.2). */
const PAPEIS: Array<{ campo: Exclude<keyof CurtainMullions, 'joinPriority'>; chave: Chave }> = [
  { campo: 'interiorVertical', chave: 'pct_mullion_int_v' },
  { campo: 'interiorHorizontal', chave: 'pct_mullion_int_h' },
  { campo: 'borderStart', chave: 'pct_mullion_border_start' },
  { campo: 'borderEnd', chave: 'pct_mullion_border_end' },
  { campo: 'borderBottom', chave: 'pct_mullion_border_bottom' },
  { campo: 'borderTop', chave: 'pct_mullion_border_top' },
  { campo: 'corner', chave: 'pct_mullion_corner' },
];

/** Troca o modo da grade e preenche só o que o novo modo exige (o resto da grade fica). */
export function trocarModoEixo(e: GridAxisSpec, modo: GridLayoutMode): GridAxisSpec {
  const base: GridAxisSpec = { mode: modo, offset: e.offset, angle: e.angle };
  if (modo === 'fixedNumber') return { ...base, count: e.count ?? 3 };
  if (modo === 'fixedDistance') return { ...base, distance: e.distance ?? 1.2, justify: e.justify ?? 'start' };
  if (modo === 'maxDistance') return { ...base, distance: e.distance ?? 1.2 };
  return { ...base, positions: e.positions ?? [], anchor: e.anchor ?? 'start' };
}

/** Lê "2; 10" (ou "2,5; 10") como posições em metros. Valores que não são número ficam de fora e a validação aponta. */
export function lerPosicoes(texto: string): number[] {
  return texto
    .split(';')
    .map((s) => s.trim().replace(',', '.'))
    .filter((s) => s !== '')
    .map((s) => Number(s))
    .filter((v) => Number.isFinite(v));
}

interface AbaCortinaProps {
  curtain: CurtainSpec;
  project: Project;
  onChange: (curtain: CurtainSpec) => void;
}

/** Aba "Cortina" do tipo de parede (decisão 0056, §4.2 e fase 1): grade U e V, montantes, painéis, sistema e predefinições. */
export function AbaCortina({ curtain, project, onChange }: AbaCortinaProps): ReactElement {
  const { t, lang } = useT();
  const [predefinida, setPredefinida] = useState(() => curtainWallTypes(lang)[0]!.id);
  const predefinicoes = curtainWallTypes(lang);
  const mullions = Object.values(mullionTypesOf(project));
  const paineis = Object.values(curtainPanelTypesOf(project));
  const set = (patch: Partial<CurtainSpec>): void => onChange({ ...curtain, ...patch });

  return (
    <div>
      <Row label={t('pct_preset')} htmlFor="ct-preset">
        <div style={{ display: 'flex', gap: 6 }}>
          <select id="ct-preset" className="select" value={predefinida} onChange={(e) => setPredefinida(e.target.value)}>
            {predefinicoes.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button type="button" className="btn small" onClick={() => {
            const escolhida = predefinicoes.find((w) => w.id === predefinida);
            if (escolhida?.curtain) onChange(structuredClone(escolhida.curtain));
          }}>{t('pct_preset_apply')}</button>
        </div>
      </Row>

      <h3 className="wsched-h">{t('pct_grid_u')}</h3>
      <Eixo prefixo="ct-u" eixo={curtain.u} onChange={(u) => set({ u })} />
      <h3 className="wsched-h">{t('pct_grid_v')}</h3>
      <Eixo prefixo="ct-v" eixo={curtain.v} onChange={(v) => set({ v })} />

      <h3 className="wsched-h">{t('pct_mullions')}</h3>
      <p className="hint">{t('pct_shared_warn')}</p>
      {PAPEIS.map((x) => (
        <Row key={x.campo} label={t(x.chave)} htmlFor={`ct-m-${x.campo}`}>
          <select
            id={`ct-m-${x.campo}`}
            className="select"
            value={curtain.mullions[x.campo] ?? ''}
            onChange={(e) => set({ mullions: { ...curtain.mullions, [x.campo]: e.target.value || null } })}
          >
            <option value="">{x.campo === 'corner' ? t('pct_mullion_corner_fallback') : t('pct_none')}</option>
            {mullions.map((mt) => (
              <option key={mt.id} value={mt.id}>{mt.name}</option>
            ))}
          </select>
        </Row>
      ))}
      <Row label={t('pct_join')} htmlFor="ct-join">
        <select id="ct-join" className="select" value={curtain.mullions.joinPriority} onChange={(e) => set({ mullions: { ...curtain.mullions, joinPriority: e.target.value as 'vertical' | 'horizontal' } })}>
          <option value="vertical">{t('pct_join_vertical')}</option>
          <option value="horizontal">{t('pct_join_horizontal')}</option>
        </select>
      </Row>
      <p className="hint">{t('pct_join_hint')}</p>

      <h3 className="wsched-h">{t('pct_panels')}</h3>
      <Row label={t('pct_panel_default')} htmlFor="ct-painel">
        <select id="ct-painel" className="select" value={curtain.defaultPanelTypeId} onChange={(e) => set({ defaultPanelTypeId: e.target.value })}>
          {paineis.map((pn) => (
            <option key={pn.id} value={pn.id}>{pn.name}</option>
          ))}
        </select>
      </Row>
      <EditorPainel key={curtain.defaultPanelTypeId} painel={paineis.find((pn) => pn.id === curtain.defaultPanelTypeId)} materiais={project.materials} />

      <h3 className="wsched-h">{t('pct_system')}</h3>
      <Row label={t('pct_system_depth')} htmlFor="ct-prof">
        <NumField id="ct-prof" value={curtain.depth} quantity="smallLength" min={0.001} onCommit={(v) => set({ depth: v })} />
      </Row>
      <Row label={t('pct_min_remainder')} htmlFor="ct-resto">
        <NumField id="ct-resto" value={curtain.minRemainder ?? CURTAIN_MIN_REMAINDER} quantity="smallLength" min={0} onCommit={(v) => set({ minRemainder: v })} />
      </Row>
      <Row label={t('pct_min_cell')} htmlFor="ct-celula">
        <NumField id="ct-celula" value={curtain.minCell ?? CURTAIN_MIN_CELL} quantity="smallLength" min={0} onCommit={(v) => set({ minCell: v })} />
      </Row>
    </div>
  );
}

/** Um eixo da grade: modo e os campos que o modo pede (contagem, distância, justificação, posições, âncora) e o deslocamento. */
function Eixo({ prefixo, eixo, onChange }: { prefixo: string; eixo: GridAxisSpec; onChange: (e: GridAxisSpec) => void }): ReactElement {
  const { t } = useT();
  const set = (patch: Partial<GridAxisSpec>): void => onChange({ ...eixo, ...patch });
  return (
    <>
      <Row label={t('pct_mode')} htmlFor={`${prefixo}-modo`}>
        <select id={`${prefixo}-modo`} className="select" value={eixo.mode} onChange={(e) => onChange(trocarModoEixo(eixo, e.target.value as GridLayoutMode))}>
          {MODOS.map((m) => (
            <option key={m} value={m}>{t(MODO_CHAVE[m])}</option>
          ))}
        </select>
      </Row>
      {eixo.mode === 'fixedNumber' && (
        <Row label={t('pct_count')} htmlFor={`${prefixo}-n`}>
          <NumField id={`${prefixo}-n`} value={eixo.count ?? 1} decimals={0} min={1} onCommit={(v) => set({ count: Math.max(1, Math.round(v)) })} />
        </Row>
      )}
      {(eixo.mode === 'fixedDistance' || eixo.mode === 'maxDistance') && (
        <Row label={t('pct_distance')} htmlFor={`${prefixo}-d`}>
          <NumField id={`${prefixo}-d`} value={eixo.distance ?? 1.2} quantity="length" min={0.01} onCommit={(v) => set({ distance: v })} />
        </Row>
      )}
      {eixo.mode === 'fixedDistance' && (
        <Row label={t('pct_justify')} htmlFor={`${prefixo}-j`}>
          <select id={`${prefixo}-j`} className="select" value={eixo.justify ?? 'start'} onChange={(e) => set({ justify: e.target.value as GridJustify })}>
            {JUSTIFICA.map((j) => (
              <option key={j} value={j}>{t(JUSTIFICA_CHAVE[j])}</option>
            ))}
          </select>
        </Row>
      )}
      {eixo.mode === 'manual' && (
        <>
          <Row label={t('pct_positions')} htmlFor={`${prefixo}-pos`}>
            <TextField id={`${prefixo}-pos`} value={(eixo.positions ?? []).join('; ')} onCommit={(v) => set({ positions: lerPosicoes(v) })} />
          </Row>
          <Row label={t('pct_anchor')} htmlFor={`${prefixo}-anc`}>
            <select id={`${prefixo}-anc`} className="select" value={eixo.anchor ?? 'start'} onChange={(e) => set({ anchor: e.target.value as 'start' | 'end' })}>
              <option value="start">{t('pct_anchor_start')}</option>
              <option value="end">{t('pct_anchor_end')}</option>
            </select>
          </Row>
        </>
      )}
      <Row label={t('pct_offset')} htmlFor={`${prefixo}-off`}>
        <NumField id={`${prefixo}-off`} value={eixo.offset ?? 0} quantity="length" decimals={3} onCommit={(v) => set({ offset: v })} />
      </Row>
    </>
  );
}

/** Painel padrão do sistema: tipo (vidro, sólido, vazio), espessura e material. Grava o tipo do projeto na hora. */
function EditorPainel({ painel, materiais }: { painel: CurtainPanelType | undefined; materiais: Project['materials'] }): ReactElement | null {
  const { t } = useT();
  const [erro, setErro] = useState<string | null>(null);
  if (!painel) return null;
  const salvar = (novo: Partial<CurtainPanelType>): void => {
    try {
      editor.store.exec({ type: 'upsertCurtainPanelType', panelType: { ...painel, ...novo } }, 'undo_edit_wall_type');
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <Row label={t('pct_panel_kind')} htmlFor="ct-pn-tipo">
        <select id="ct-pn-tipo" className="select" value={painel.kind} onChange={(e) => salvar({ kind: e.target.value as CurtainPanelKind })}>
          {PAINEIS_TIPO.map((k) => (
            <option key={k} value={k}>{t(PAINEL_CHAVE[k])}</option>
          ))}
        </select>
      </Row>
      <Row label={t('pct_panel_thickness')} htmlFor="ct-pn-esp">
        <NumField id="ct-pn-esp" value={painel.thickness} quantity="smallLength" min={0} onCommit={(v) => salvar({ thickness: v })} />
      </Row>
      <Row label={t('pct_panel_material')} htmlFor="ct-pn-mat">
        <select id="ct-pn-mat" className="select" value={painel.materialId} onChange={(e) => salvar({ materialId: e.target.value })}>
          {Object.values(materiais).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </Row>
      {erro && <p className="hint" role="alert">{erro}</p>}
    </>
  );
}
