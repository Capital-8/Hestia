import { useMemo, type ReactElement } from 'react';
import { servicoTerreno } from '@hestia/engine';
import { cotaExibida, dimensionStyleOf, defaultTerrainTextFamilyIdOf, defaultTerrainTypeIdOf, terrainTextFamiliesOf, terrainTypesOf, tipoDoTerreno, TERRENO_LIMITES, type Command, type Project, type Terrain } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { abrirImportTerreno } from '../editor/terrenoImport.ts';
import { useUi } from '../editor/state.ts';
import { TypeSelector } from './TypeSelector.tsx';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { editarTerreno } from './terrainActions.ts';
import { leiturasDoTerreno, type LeiturasTerreno } from './terrainPropsModel.ts';
import { aplicarEmTodos, comum, CorRow, Leitura, MaterialRow, useKernelTerreno } from './terrainPanelParts.tsx';

/** Cor com que o terreno é desenhado quando não tem `color` (a mesma do desenho em planta). */
const COR_PADRAO = '#8a6a3a';

type PatchTerreno = Extract<Command, { type: 'updateTerrain' }>['patch'];

/** Leituras calculadas de UM terreno (vértices, área em planta, cota mínima e máxima, volumes). Valores do kernel: sem ele, "—". */
export function TerrainLeituras({ p, leituras }: { p: Project; leituras: LeiturasTerreno }): ReactElement {
  const { t } = useT();
  const fmt = useFormat();
  const cota = (z: number | null): string | null => (z === null ? null : fmt('length', cotaExibida(p, z)));
  return (
    <>
      <Leitura label={t('ui_tn_p_vertices')} valor={String(leituras.vertices)} />
      <Leitura label={t('ui_tn_p_area_planta')} valor={leituras.areaPlanta === null ? null : fmt('area', leituras.areaPlanta)} />
      <Leitura label={t('ui_tn_p_cota_min')} valor={cota(leituras.zMin)} />
      <Leitura label={t('ui_tn_p_cota_max')} valor={cota(leituras.zMax)} />
      <Leitura label={t('ui_tn_p_corte')} valor={leituras.volumeCorte === null ? null : fmt('volume', leituras.volumeCorte)} />
      <Leitura label={t('ui_tn_p_aterro')} valor={leituras.volumeAterro === null ? null : fmt('volume', leituras.volumeAterro)} />
    </>
  );
}

/**
 * Propriedades do terreno (A.3 e A.6): nome, nível, curvas de nível (intervalo, mestra a cada N, espessura da base, mostrar o existente),
 * material e cor, mais as leituras calculadas pelo kernel e os botões "Editar terreno" e "Importar…". Os textos do terreno (rótulo de curva e cota de ponto) têm família, com `TypeSelector` e "Editar tipo".
 */
export function TerrainProperties({ terrains }: { terrains: Terrain[] }): ReactElement {
  const { t } = useT();
  const p = useProject();
  const kernel = useKernelTerreno();
  const levelId = useUi((s) => s.levelId);
  const ids = terrains.map((x) => x.id);
  const patch = (campos: PatchTerreno): void =>
    aplicarEmTodos(ids, t('ui_tn_p_editar'), (id) => ({ type: 'updateTerrain', id, patch: campos }));
  const nome = comum(terrains, (x) => x.name);
  const nivel = comum(terrains, (x) => x.levelId);
  const intervalo = comum(terrains, (x) => x.intervaloCurvas);
  const mestra = comum(terrains, (x) => x.mestraCada);
  const base = comum(terrains, (x) => x.espessuraBase);
  const existente = comum(terrains, (x) => x.mostrarExistente);
  const material = comum(terrains, (x) => x.materialId ?? '');
  const cor = comum(terrains, (x) => x.color ?? '');
  const famRotulo = comum(terrains, (x) => x.rotuloFamilyId ?? defaultTerrainTextFamilyIdOf(p.settings, 'contour'));
  const famCotado = comum(terrains, (x) => x.cotadoFamilyId ?? defaultTerrainTextFamilyIdOf(p.settings, 'spot'));
  const tipoIds = comum(terrains, (x) => (tipoDoTerreno(p.settings, x) ? x.tipoId! : ''));
  const comTipo = !tipoIds.mixed && tipoIds.value !== '';
  const algumTipo = terrains.some((x) => tipoDoTerreno(p.settings, x));
  const assunto = { kind: 'dimension' as const, style: dimensionStyleOf(p.settings) };
  const opcoes = (kind: 'contour' | 'spot') => terrainTextFamiliesOf(p.settings, kind).map((f) => ({ id: f.id, name: f.name, code: '', family: t(kind === 'contour' ? 'ui_fam_family_contour' : 'ui_fam_family_spot'), subject: assunto }));
  const leituras = useMemo(() => (void kernel, terrains.map((x) => leiturasDoTerreno(p, x, servicoTerreno()))), [p, terrains, kernel]);
  return (
    <>
      <Group title={t('ui_tn_tipo_grupo')} stateKey="terreno-tipo">
        <TypeSelector
          triggerId="prop-tn-tipo"
          label={t('ui_tn_tipo_seletor')}
          categoryLabel={t('ui_tn_tipo_seletor')}
          options={terrainTypesOf(p.settings).map((x) => ({ id: x.id, name: x.name, code: '', family: t('ui_tn_tipo_familia'), subject: assunto }))}
          selectedId={comTipo ? tipoIds.value : null}
          editDisabled={tipoIds.mixed}
          onSelect={(id) => patch({ tipoId: id })}
          onEdit={() => useUi.setState({ dialog: 'terrainTypes', dialogArg: comTipo ? tipoIds.value : defaultTerrainTypeIdOf(p.settings) })}
        />
        {algumTipo ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 8px' }}>
            <span className="hint" style={{ flex: 1 }}>{t('ui_tn_tipo_gerido')}</span>
            <button type="button" className="btn small" title={t('ui_tn_tipo_nenhum')} onClick={() => patch({ tipoId: null })}>{t('ui_tn_p_nenhum')}</button>
          </div>
        ) : null}
      </Group>
      <Group title={t('prc_pgrp_identity')} stateKey="terreno-id">
        <Row label={t('ui_tn_p_nome')} htmlFor="p-tn-nome"><TextField id="p-tn-nome" value={nome.value} mixed={nome.mixed} onCommit={(v) => v.trim() !== '' && patch({ name: v.trim() })} /></Row>
        <Row label={t('prc_fld_level')} htmlFor="p-tn-nivel">
          <select id="p-tn-nivel" className="select" value={nivel.mixed ? '' : nivel.value} onChange={(e) => e.target.value !== '' && patch({ levelId: e.target.value })}>
            {nivel.mixed ? <option value="">{t('prc_opt_varied')}</option> : null}
            {p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Row>
      </Group>
      {algumTipo ? null : (
      <Group title={t('ui_fam_prop_contour')} stateKey="terreno-fam-rotulo">
        <TypeSelector
          triggerId="prop-tn-rotulofamily"
          label={t('ui_fam_family_contour')}
          categoryLabel={t('ui_fam_family_contour')}
          options={opcoes('contour')}
          selectedId={famRotulo.mixed ? null : famRotulo.value}
          editDisabled={famRotulo.mixed}
          onSelect={(id) => patch({ rotuloFamilyId: id })}
          onEdit={() => useUi.setState({ dialog: 'terrainContourFamilies', dialogArg: famRotulo.value })}
        />
      </Group>
      )}
      <Group title={t('ui_fam_prop_spot')} stateKey="terreno-fam-cotado">
        <TypeSelector
          triggerId="prop-tn-cotadofamily"
          label={t('ui_fam_family_spot')}
          categoryLabel={t('ui_fam_family_spot')}
          options={opcoes('spot')}
          selectedId={famCotado.mixed ? null : famCotado.value}
          editDisabled={famCotado.mixed}
          onSelect={(id) => patch({ cotadoFamilyId: id })}
          onEdit={() => useUi.setState({ dialog: 'terrainSpotFamilies', dialogArg: famCotado.value })}
        />
      </Group>
      <Group title={t('ui_tn_g_curvas')} stateKey="terreno-curvas">
        {algumTipo ? null : <Row label={t('ui_tn_p_intervalo')} htmlFor="p-tn-intervalo"><NumField id="p-tn-intervalo" quantity="length" min={TERRENO_LIMITES.intervaloMin} value={intervalo.value} mixed={intervalo.mixed} onCommit={(v) => patch({ intervaloCurvas: v })} /></Row>}
        {algumTipo ? null : <Row label={t('ui_tn_p_mestra')} htmlFor="p-tn-mestra"><NumField id="p-tn-mestra" decimals={0} min={1} max={TERRENO_LIMITES.mestraMax} value={mestra.value} mixed={mestra.mixed} onCommit={(v) => patch({ mestraCada: Math.round(v) })} /></Row>}
        <Row label={t('ui_tn_p_base')} htmlFor="p-tn-base"><NumField id="p-tn-base" quantity="length" min={TERRENO_LIMITES.espessuraMin} max={TERRENO_LIMITES.espessuraMax} value={base.value} mixed={base.mixed} onCommit={(v) => patch({ espessuraBase: v })} /></Row>
        <Row label={t('ui_tn_p_existente')} htmlFor="p-tn-existente"><Check id="p-tn-existente" checked={existente.value} mixed={existente.mixed} onChange={(v) => patch({ mostrarExistente: v })} /></Row>
      </Group>
      {algumTipo ? null : (
      <Group title={t('ui_tn_g_aparencia')} stateKey="terreno-aparencia">
        <MaterialRow id="p-tn-material" value={material.value === '' ? undefined : material.value} mixed={material.mixed} onChange={(v) => patch({ materialId: v })} />
        <CorRow id="p-tn-cor" value={cor.mixed || cor.value === '' ? undefined : cor.value} padrao={COR_PADRAO} onChange={(v) => patch({ color: v })} />
      </Group>
      )}
      {terrains.map((x, i) => (
        <Group key={x.id} title={terrains.length === 1 ? t('ui_tn_g_leituras') : `${t('ui_tn_g_leituras')}: ${x.name}`} stateKey="terreno-leituras">
          <TerrainLeituras p={p} leituras={leituras[i]!} />
        </Group>
      ))}
      <div className="prow-actions" style={{ display: 'flex', gap: 6, padding: '6px 8px' }}>
        <button type="button" className="btn small" onClick={() => editarTerreno(p, ids, levelId, (id) => editor.setTool(id))}>{t('ui_tn_p_editar')}</button>
        <button type="button" className="btn small" onClick={abrirImportTerreno}>{t('ui_tn_p_importar')}</button>
      </div>
    </>
  );
}
