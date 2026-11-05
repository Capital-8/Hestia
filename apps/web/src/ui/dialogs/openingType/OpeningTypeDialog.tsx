import { useState, type ReactElement } from 'react';
import {
  coreSpan,
  isWall,
  newId,
  openingAngle2d,
  openingFamilyOf,
  openingFavorites,
  openingLineConvention,
  openingProfilesOf,
  unitsOf,
  type Id,
  type Opening,
  type OpeningType,
  type Project,
} from '@hestia/model';
import { openingChecks } from '@hestia/engine';
import { editor, useProject } from '../../../editor/controller.ts';
import { useUi } from '../../../editor/state.ts';
import { useT, type Lang } from '../../../editor/i18n.ts';
import { openingFamilyName } from '../../typeFamilies.ts';
import {
  applyFamily,
  applyVariant,
  bridgeDraft,
  familyOptionsFor,
  hasAuthoredComposition,
  leavesChoicesFor,
  leavesLabel,
  newOpeningTypeFromFamily,
  openingVariants,
  syncFamilyInComposition,
} from '../openingTypeForm.ts';
import { DialogXL } from './DialogXL.tsx';
import { OpeningTypeHeader } from './OpeningTypeHeader.tsx';
import { OpeningTypeLibrary } from './OpeningTypeLibrary.tsx';
import { OpeningTypePreview, type PreviewTab } from './OpeningTypePreview.tsx';
import { OpeningTypeSections } from './OpeningTypeSections.tsx';
import { componentToShow, rememberComponent, type OpeningComponentId } from './components.ts';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

/** Espessura do núcleo da parede que hospeda o tipo (DEC-1); sem parede, o núcleo usual de 0,14 m. */
function coreThicknessFor(p: Project, typeId: Id): number {
  const walls = Object.values(p.elements).filter(isWall);
  const hosts = new Set(
    Object.values(p.elements)
      .filter((e): e is Opening => (e.kind === 'door' || e.kind === 'window') && e.typeId === typeId)
      .map((e) => e.hostId),
  );
  const wall = walls.find((w) => hosts.has(w.id)) ?? walls[0];
  const type = wall ? p.wallTypes[wall.typeId] : undefined;
  if (!type) return 0.14;
  const core = coreSpan(type);
  return Math.max(0, core.to - core.from);
}

/** Contagem de tipos do projeto por família da categoria. */
function familyCounts(p: Project, kind: OpeningType['kind'], lang: Lang): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of Object.values(p.openingTypes)) {
    if (t.kind !== kind) continue;
    const id = openingFamilyOf(t, lang)?.id;
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/**
 * "Propriedades do tipo" da porta/janela no padrão da decisão 0034: biblioteca à esquerda, no centro a lista de
 * componentes (estilo ArchiCAD) com o painel do escolhido, e a prévia com verificações à direita. O cabeçalho troca família/tipo, duplica, renomeia e favorita.
 */
export function OpeningTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const p = useProject();
  const { t, lang } = useT();
  const src = p.openingTypes[typeId];
  const [d, setD] = useState<OpeningType | null>(src ? { ...src } : null);
  const [err, setErr] = useState('');
  const [current, setCurrent] = useState(typeId);
  const [libOpen, setLibOpen] = useState(true);
  const [tab, setTab] = useState<PreviewTab>('elevation');
  const [flipHand, setFlipHand] = useState(false);
  const [flipFacing, setFlipFacing] = useState(false);
  const [active, setActive] = useState<OpeningComponentId | undefined>(undefined);
  const [previewAngle, setPreviewAngle] = useState(() => (src ? openingAngle2d(src) : 90));
  if (current !== typeId) {
    setCurrent(typeId);
    setD(p.openingTypes[typeId] ? { ...p.openingTypes[typeId]! } : null);
    setErr('');
    setPreviewAngle(p.openingTypes[typeId] ? openingAngle2d(p.openingTypes[typeId]!) : 90);
    setFlipHand(false);
    setFlipFacing(false);
  }
  if (!d) return null;
  const used = Object.values(p.elements).filter((e) => (e.kind === 'door' || e.kind === 'window') && e.typeId === d.id).length;
  const families = familyOptionsFor(d.kind, lang);
  const family = openingFamilyOf(d, lang);
  // Folhas aceitas pela família escolhida; sem família válida (dado fora do contrato) mostra só a contagem atual.
  const leaves = family ? leavesChoicesFor(family, lang) : [{ value: d.leaves, label: leavesLabel(d.leaves, lang) }];
  const favorite = openingFavorites(p).includes(d.id);
  const counts = familyCounts(p, d.kind, lang);
  const variants = openingVariants(d.kind);
  const checks = openingChecks(d, coreThicknessFor(p, d.id), unitsOf(p));
  /** Grava pelo comando; a mensagem de erro do modelo aparece no diálogo, que continua aberto. */
  const run = (fn: () => void): boolean => {
    try {
      fn();
      setErr('');
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('dlo_err_generic'));
      return false;
    }
  };
  const apply = (): void => {
    run(() => editor.store.exec({ type: 'upsertOpeningType', openingType: d }, t('dlo_cmd_edit')));
  };
  const ok = (): void => {
    if (run(() => editor.store.exec({ type: 'upsertOpeningType', openingType: d }, t('dlo_cmd_edit')))) close();
  };
  const dup = (): void => {
    const copy = { ...d, id: newId('ot'), name: `${d.name} ${t('dlo_copy_suffix')}` };
    if (!run(() => editor.store.exec({ type: 'upsertOpeningType', openingType: copy }, t('dlo_cmd_duplicate')))) return;
    useUi.setState({ dialogArg: copy.id });
    setD(copy);
  };
  /** Tipo novo da família escolhida; passa a editar o tipo criado (no Revit: Duplicate → novo tipo). */
  const create = (): void => {
    const fam = family ?? families[0];
    if (!fam) return;
    const created = newOpeningTypeFromFamily(fam, lang);
    if (!run(() => editor.store.exec({ type: 'upsertOpeningType', openingType: created }, t('dlo_cmd_new')))) return;
    useUi.setState({ dialogArg: created.id });
    setD(created);
  };
  /**
   * Toda edição do rascunho passa pela ponte da composição: campos antigos (família, bandeira, medidas) regeneram a composição
   * derivada, e a editada nos módulos é preservada. Sem isso o modelo e a prévia seguiam a composição velha.
   */
  const change = (next: OpeningType): void => {
    const r = bridgeDraft(next, d, openingProfilesOf(p), lang);
    setD(r.type);
    setErr(r.error ?? '');
  };
  const changeFamily = (id: string): void => {
    const fam = families.find((f) => f.id === id);
    if (!fam) return;
    const next = applyFamily(d, fam);
    change(hasAuthoredComposition(d) ? syncFamilyInComposition(next, fam) : next);
  };
  const toggleFavorite = (): void => {
    run(() =>
      editor.store.exec(
        { type: 'toggleOpeningFavorite', id: d.id },
        favorite ? t('dlo_cmd_unfavorite') : t('dlo_cmd_favorite'),
      ),
    );
  };
  return (
    <DialogXL
      title={t('dlo_title')}
      sub={`${t(d.kind === 'door' ? 'dlo_kind_door' : 'dlo_kind_window')} · ${openingFamilyName(d)} · ${t('dlo_sub_used', { n: used })}`}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={create}>{t('dlo_btn_new')}</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('stt_cancel')}</button>
          <button className="btn" onClick={apply}>{t('stt_apply')}</button>
          <button className="btn primary" onClick={ok}>{t('stt_ok')}</button>
        </>
      }
    >
      <div className="op-dlg">
        <OpeningTypeHeader
          families={families}
          familyId={family?.id ?? null}
          types={Object.values(p.openingTypes).filter((t) => t.kind === d.kind)}
          currentId={d.id}
          nameFieldId="ot-name"
          favorite={favorite}
          onFamily={changeFamily}
          onType={(id) => useUi.setState({ dialogArg: id })}
          onDuplicate={dup}
          onFavorite={toggleFavorite}
          onBeforeRename={() => { rememberComponent('overview'); setActive('overview'); }}
        />
        <div className={`op-main${libOpen ? '' : ' lib-off'}`}>
          <OpeningTypeLibrary
            type={d}
            families={families}
            familyId={family?.id ?? null}
            counts={counts}
            variants={variants}
            open={libOpen}
            onToggle={() => setLibOpen((v) => !v)}
            onFamily={changeFamily}
            onVariant={(v) => change(applyVariant(d, v))}
          />
          <div className="op-center">
            <OpeningTypeSections d={d} onChange={change} family={family} leaves={leaves} materials={p.materials} active={componentToShow(d.kind, family?.id ?? null, active)} onActive={setActive} />
            {err ? <p className="error" role="alert">{err}</p> : null}
          </div>
          <OpeningTypePreview
            d={d}
            tab={tab}
            onTab={setTab}
            flipHand={flipHand}
            flipFacing={flipFacing}
            onFlipHand={() => setFlipHand((v) => !v)}
            onFlipFacing={() => setFlipFacing((v) => !v)}
            angle={previewAngle}
            onAngle={setPreviewAngle}
            checks={checks}
            openingLine={openingLineConvention(p)}
          />
        </div>
      </div>
    </DialogXL>
  );
}
