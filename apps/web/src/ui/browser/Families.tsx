import type { ReactElement, ReactNode } from 'react';
import { openingFamilies, openingFamilyOf, type OpeningType } from '@hestia/model';
import { DEFAULT_RAMP_OPTIONS } from '@hestia/tools';
import { useProject } from '../../editor/controller.ts';
import { cmpTexto, t, useT } from '../../editor/i18n.ts';
import type { Lang } from '../../editor/i18n/tipos.ts';
import { useUi } from '../../editor/state.ts';
import { TypeRow } from '../TypeRow.tsx';
import { FAMILY } from '../typeFamilies.ts';
import { Node } from './Tree.tsx';

/** Seção "Famílias": Categoria ▸ Família ▸ Tipo, em ordem alfabética como no Revit. */

/** Agrupa os tipos de abertura por família (um nó por família); dentro do grupo, ordena pelo código. */
function openingGroups(kind: 'door' | 'window', types: OpeningType[], lang: Lang = 'pt'): Array<{ id: string; name: string; types: OpeningType[] }> {
  const byCode = (tipo: OpeningType): string => tipo.code ?? tipo.name;
  const groups: Array<{ id: string; name: string; types: OpeningType[] }> = [];
  for (const f of openingFamilies(kind, lang)) {
    const items = types.filter((t) => openingFamilyOf(t, lang)?.id === f.id);
    if (items.length) groups.push({ id: f.id, name: f.name, types: items });
  }
  const orphans = types.filter((t) => !openingFamilyOf(t, lang));
  if (orphans.length) groups.push({ id: 'outros', name: t(lang, 'cvn_br_family_others'), types: orphans });
  for (const g of groups) g.types.sort((a, b) => cmpTexto(byCode(a), byCode(b), lang));
  return groups;
}

function Category({ id, name, open = false, children }: { id: string; name: string; open?: boolean; children: ReactNode }): ReactElement {
  return <Node id={`cat:${id}`} label={name} group open={open}>{children}</Node>;
}

export function FamiliesTree(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const o = useUi((s) => s.options);
  const set = (patch: Partial<typeof o>): void => useUi.setState((st) => ({ options: { ...st.options, ...patch } }));
  const dialog = (d: 'wallType' | 'floorType' | 'slabType' | 'ceilingType' | 'roofType' | 'stairType' | 'rampType' | 'openingType', id: string): void => useUi.setState({ dialog: d, dialogArg: id });
  const doors = Object.values(p.openingTypes).filter((t) => t.kind === 'door');
  const windows = Object.values(p.openingTypes).filter((t) => t.kind === 'window');

  const openings = (kind: 'door' | 'window', types: OpeningType[], activeId: string, key: 'doorTypeId' | 'windowTypeId'): ReactElement[] =>
    openingGroups(kind, types, lang).map((g) => (
      <Node key={g.id} id={`fam:${kind}:${g.id}`} label={g.name} group>
        {g.types.map((tipo) => (
          <TypeRow key={tipo.id} kind={kind} typeId={tipo.id} name={tipo.name} icon={kind} active={activeId === tipo.id} onUse={() => set({ [key]: tipo.id })} onEdit={() => dialog('openingType', tipo.id)} />
        ))}
      </Node>
    ));

  return (
    <Node id="g:families" label={t('families')} icon="layers" group open>
      <Category id="stair" name={t('cvn_br_cat_stairs')}>
        <Node id="fam:stair" label={FAMILY.stair} group>
          {Object.values(p.stairTypes).map((tipo) => (
            <TypeRow key={tipo.id} kind="stair" typeId={tipo.id} name={tipo.name} icon="stair" active={o.stair?.typeId === tipo.id} onUse={() => set({ stair: { ...o.stair, typeId: tipo.id } })} onEdit={() => dialog('stairType', tipo.id)} />
          ))}
        </Node>
      </Category>
      <Category id="ramp" name={t('cvn_br_cat_ramps')}>
        <Node id="fam:ramp" label={FAMILY.stair} group>
          {Object.values(p.rampTypes).map((tipo) => (
            <TypeRow key={tipo.id} kind="ramp" typeId={tipo.id} name={tipo.name} icon="ramp" active={o.ramp?.typeId === tipo.id} onUse={() => set({ ramp: { ...(o.ramp ?? DEFAULT_RAMP_OPTIONS), typeId: tipo.id } })} onEdit={() => dialog('rampType', tipo.id)} />
          ))}
        </Node>
      </Category>
      <Category id="ceiling" name={t('cvn_br_cat_ceilings')}>
        <Node id="fam:ceiling" label={FAMILY.ceiling} group>
          {Object.values(p.ceilingTypes).map((tipo) => (
            <TypeRow key={tipo.id} kind="ceiling" typeId={tipo.id} name={tipo.name} icon="ceiling" active={o.ceilingTypeId === tipo.id} onUse={() => set({ ceilingTypeId: tipo.id })} onEdit={() => dialog('ceilingType', tipo.id)} />
          ))}
        </Node>
      </Category>
      <Category id="window" name={t('cvn_br_cat_windows')}>{openings('window', windows, o.windowTypeId, 'windowTypeId')}</Category>
      <Category id="slab" name={t('cvn_br_cat_slabs')}>
        <Node id="fam:slab" label={FAMILY.slab} group>
          {Object.values(p.slabTypes).map((tipo) => (
            <TypeRow key={tipo.id} kind="slab" typeId={tipo.id} name={tipo.name} icon="slab" active={o.slabTypeId === tipo.id} onUse={() => set({ slabTypeId: tipo.id })} onEdit={() => dialog('slabType', tipo.id)} />
          ))}
        </Node>
      </Category>
      <Category id="wall" name={t('cvn_br_cat_walls')} open>
        <Node id="fam:wall" label={FAMILY.wall} group open>
          {Object.values(p.wallTypes).map((tipo) => (
            <TypeRow key={tipo.id} kind="wall" typeId={tipo.id} name={tipo.name} icon="wall" active={o.wallTypeId === tipo.id} onUse={() => set({ wallTypeId: tipo.id })} onEdit={() => dialog('wallType', tipo.id)} />
          ))}
        </Node>
      </Category>
      <Category id="floor" name={t('cvn_br_cat_floors')}>
        <Node id="fam:floor" label={FAMILY.floor} group>
          {Object.values(p.floorTypes).map((tipo) => (
            <TypeRow key={tipo.id} kind="floor" typeId={tipo.id} name={tipo.name} icon="floor" active={o.floorTypeId === tipo.id} onUse={() => set({ floorTypeId: tipo.id })} onEdit={() => dialog('floorType', tipo.id)} />
          ))}
        </Node>
      </Category>
      <Category id="door" name={t('cvn_br_cat_doors')}>{openings('door', doors, o.doorTypeId, 'doorTypeId')}</Category>
      <Category id="roof" name={t('cvn_br_cat_roofs')}>
        <Node id="fam:roof" label={FAMILY.roof} group>
          {Object.values(p.roofTypes).map((tipo) => (
            <TypeRow key={tipo.id} kind="roof" typeId={tipo.id} name={tipo.name} icon="roof" active={o.roofTypeId === tipo.id} onUse={() => set({ roofTypeId: tipo.id })} onEdit={() => dialog('roofType', tipo.id)} />
          ))}
        </Node>
      </Category>
    </Node>
  );
}
