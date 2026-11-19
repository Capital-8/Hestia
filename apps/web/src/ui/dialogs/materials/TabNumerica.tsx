import type { ReactElement } from 'react';
import type { Material, MaterialFisico, MaterialTermico } from '@hestia/model';
import { useT, type Dict } from '../../../editor/i18n.ts';
import { NumField } from '../../fields.tsx';
import type { Editar } from './materialsLogic.ts';

/** Campos numéricos de um bloco (`fisico` ou `termico`): chave do dicionário por campo. Só dados, sem cálculo. */
type Bloco = 'fisico' | 'termico';
type Rotulo = keyof Dict;
const FISICO: ReadonlyArray<readonly [keyof MaterialFisico, Rotulo]> = [
  ['densidade', 'dlt_mat_phys_density'],
  ['resistenciaCompressao', 'dlt_mat_phys_comp'],
  ['resistenciaTracao', 'dlt_mat_phys_tension'],
  ['moduloElasticidade', 'dlt_mat_phys_elastic'],
  ['condutividade', 'dlt_mat_phys_conduct'],
  ['dilatacao', 'dlt_mat_phys_expansion'],
];
const TERMICO: ReadonlyArray<readonly [keyof MaterialTermico, Rotulo]> = [
  ['condutividadeTermica', 'dlt_mat_therm_conduct'],
  ['calorEspecifico', 'dlt_mat_therm_specific'],
  ['densidade', 'dlt_mat_therm_density'],
  ['emissividade', 'dlt_mat_therm_emiss'],
  ['porosidade', 'dlt_mat_therm_porosity'],
  ['permeabilidade', 'dlt_mat_therm_perm'],
];

/** Formulário numérico de um bloco: campo vazio grava `undefined` (não informado). */
function FormNumerico({ bloco, campos, m, editar }: { bloco: Bloco; campos: ReadonlyArray<readonly [string, Rotulo]>; m: Material; editar: Editar }): ReactElement {
  const { t } = useT();
  const dados = (m[bloco] ?? {}) as Record<string, number | undefined>;
  return (
    <>
      {campos.map(([chave, rotulo]) => (
        <div className="field-row" key={chave}>
          <label htmlFor={`mat-${bloco}-${chave}`}>{t(rotulo)}</label>
          <NumField
            id={`mat-${bloco}-${chave}`}
            value={dados[chave] ?? null}
            decimals={3}
            placeholder={t('dlt_mat_not_informed')}
            onCommit={(v) => editar(bloco, [chave], v, true)}
            onClear={() => editar(bloco, [chave], undefined, true)}
          />
        </div>
      ))}
    </>
  );
}

/** Aba Físico: dados mecânicos e de massa do material (bloco `fisico`). Só dados, para uso futuro. */
export function TabFisico({ m, editar }: { m: Material; editar: Editar }): ReactElement {
  return <FormNumerico bloco="fisico" campos={FISICO} m={m} editar={editar} />;
}

/** Aba Térmico: dados térmicos do material (bloco `termico`). Só dados; o cálculo térmico vem em etapa futura. */
export function TabTermico({ m, editar }: { m: Material; editar: Editar }): ReactElement {
  return <FormNumerico bloco="termico" campos={TERMICO} m={m} editar={editar} />;
}
