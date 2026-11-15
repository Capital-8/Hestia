import { useMemo, type ReactElement } from 'react';
import { servicoTerreno } from '@hestia/engine';
import { cotaExibida, TERRENO_LIMITES, type Command, type Project, type Terrain } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { abrirImportTerreno } from '../editor/terrenoImport.ts';
import { useUi } from '../editor/state.ts';
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
 * material e cor, mais as leituras calculadas pelo kernel e os botões "Editar terreno" e "Importar…". O terreno NÃO é de família: sem tipo.
 */
export function TerrainProperties({ terrains }: { terrains: Terrain[] }): ReactElement {
  const { t } = useT();
  const p = useProject();
  const kernel = useKernelTerreno();
  const levelId = useUi((s) => s.levelId);
  const ids = terrains.map((x) => x.id);
  const patch = (campos: PatchTerreno): void =>
    aplicarEmTodos(ids, t('ui_tn_p_rotulo_undo'), (id) => ({ type: 'updateTerrain', id, patch: campos }));
  const nome = comum(terrains, (x) => x.name);
  const nivel = comum(terrains, (x) => x.levelId);
  const intervalo = comum(terrains, (x) => x.intervaloCurvas);
  const mestra = comum(terrains, (x) => x.mestraCada);
  const base = comum(terrains, (x) => x.espessuraBase);
  const existente = comum(terrains, (x) => x.mostrarExistente);
  const material = comum(terrains, (x) => x.materialId ?? '');
  const cor = comum(terrains, (x) => x.color ?? '');
  const leituras = useMemo(() => terrains.map((x) => leiturasDoTerreno(p, x, servicoTerreno())), [p, terrains, kernel]);
  return (
    <>
      <Group title={t('prc_pgrp_identity')} stateKey="terreno-id">
        <Row label={t('ui_tn_p_nome')} htmlFor="p-tn-nome"><TextField id="p-tn-nome" value={nome.value} mixed={nome.mixed} onCommit={(v) => v.trim() !== '' && patch({ name: v.trim() })} /></Row>
        <Row label={t('prc_fld_level')} htmlFor="p-tn-nivel">
          <select id="p-tn-nivel" className="select" value={nivel.mixed ? '' : nivel.value} onChange={(e) => e.target.value !== '' && patch({ levelId: e.target.value })}>
            {nivel.mixed ? <option value="">{t('prc_opt_varied')}</option> : null}
            {p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Row>
      </Group>
      <Group title={t('ui_tn_g_curvas')} stateKey="terreno-curvas">
        <Row label={t('ui_tn_p_intervalo')} htmlFor="p-tn-intervalo"><NumField id="p-tn-intervalo" quantity="length" min={TERRENO_LIMITES.intervaloMin} value={intervalo.value} mixed={intervalo.mixed} onCommit={(v) => patch({ intervaloCurvas: v })} /></Row>
        <Row label={t('ui_tn_p_mestra')} htmlFor="p-tn-mestra"><NumField id="p-tn-mestra" decimals={0} min={1} max={TERRENO_LIMITES.mestraMax} value={mestra.value} mixed={mestra.mixed} onCommit={(v) => patch({ mestraCada: Math.round(v) })} /></Row>
        <Row label={t('ui_tn_p_base')} htmlFor="p-tn-base"><NumField id="p-tn-base" quantity="length" min={TERRENO_LIMITES.espessuraMin} max={TERRENO_LIMITES.espessuraMax} value={base.value} mixed={base.mixed} onCommit={(v) => patch({ espessuraBase: v })} /></Row>
        <Row label={t('ui_tn_p_existente')} htmlFor="p-tn-existente"><Check id="p-tn-existente" checked={existente.value} mixed={existente.mixed} onChange={(v) => patch({ mostrarExistente: v })} /></Row>
      </Group>
      <Group title={t('ui_tn_g_aparencia')} stateKey="terreno-aparencia">
        <MaterialRow id="p-tn-material" value={material.value === '' ? undefined : material.value} mixed={material.mixed} onChange={(v) => patch({ materialId: v })} />
        <CorRow id="p-tn-cor" value={cor.mixed || cor.value === '' ? undefined : cor.value} padrao={COR_PADRAO} onChange={(v) => patch({ color: v })} />
      </Group>
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
