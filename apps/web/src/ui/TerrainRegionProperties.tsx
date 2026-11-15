import { useMemo, type ReactElement } from 'react';
import { servicoTerreno } from '@hestia/engine';
import { cotaDoProjeto, cotaExibida, isTerrain, TERRENO_LIMITES, type Command, type PapelRegiaoTerreno, type Project, type TerrainRegion } from '@hestia/model';
import { useProject } from '../editor/controller.ts';
import { useT, type Dict } from '../editor/i18n.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { leiturasDaRegiao, fracaoParaPercentual, percentualParaFracao, type LeiturasRegiao } from './terrainPropsModel.ts';
import { aplicarEmTodos, comum, CorRow, Leitura, MaterialRow, useKernelTerreno } from './terrainPanelParts.tsx';
import { grausParaRad, radParaGraus } from './dialogs/localizacaoForm.ts';

type PatchRegiao = Extract<Command, { type: 'updateTerrainRegion' }>['patch'];

const PAPEIS: ReadonlyArray<{ value: PapelRegiaoTerreno; chave: keyof Dict }> = [
  { value: 'subdivisao', chave: 'ui_tn_r_papel_subdivisao' },
  { value: 'plataforma', chave: 'ui_tn_r_papel_plataforma' },
  { value: 'nivelada', chave: 'ui_tn_r_papel_nivelada' },
];

/** Cor com que a região é desenhada quando não tem `color` (a mesma do desenho em planta). */
export const corPadraoDaRegiao = (papel: PapelRegiaoTerreno): string => (papel === 'subdivisao' ? '#9bb08a' : papel === 'plataforma' ? '#b0a58f' : '#c4a77d');

/** Os campos de plano (cota, inclinação, direção) só existem na plataforma e na nivelada: a subdivisão os esconde. */
export const temPlano = (r: Pick<TerrainRegion, 'papel'>): boolean => r.papel !== 'subdivisao';

/** Leituras calculadas de UMA região (área e volumes). Valores do kernel: sem ele, "—". */
export function RegiaoLeituras({ leituras }: { leituras: LeiturasRegiao }): ReactElement {
  const { t } = useT();
  const fmt = useFormat();
  return (
    <>
      <Leitura label={t('ui_tn_p_area_planta')} valor={leituras.areaPlanta === null ? null : fmt('area', leituras.areaPlanta)} />
      <Leitura label={t('ui_tn_r_area_superficie')} valor={leituras.areaSuperficie === null ? null : fmt('area', leituras.areaSuperficie)} />
      <Leitura label={t('ui_tn_p_corte')} valor={leituras.volumeCorte === null ? null : fmt('volume', leituras.volumeCorte)} />
      <Leitura label={t('ui_tn_p_aterro')} valor={leituras.volumeAterro === null ? null : fmt('volume', leituras.volumeAterro)} />
    </>
  );
}

/**
 * Propriedades da região de terreno (A.3 e A.6): nome, terreno, papel, plano (cota, inclinação, direção de subida: escondido na subdivisão),
 * taludes de corte e aterro, área permeável, material e cor, mais as leituras de área e volumes. A região NÃO é de família: sem tipo.
 * A cota é a EXIBIDA (`cotaExibida`); o valor digitado passa por `cotaDoProjeto`.
 */
export function TerrainRegionProperties({ regions }: { regions: TerrainRegion[] }): ReactElement {
  const { t } = useT();
  const p: Project = useProject();
  const kernel = useKernelTerreno();
  const ids = regions.map((r) => r.id);
  const idsPlano = regions.filter(temPlano).map((r) => r.id);
  const patch = (campos: PatchRegiao, alvo: readonly string[] = ids): void =>
    aplicarEmTodos(alvo, t('ui_tn_r_rotulo_undo'), (id) => ({ type: 'updateTerrainRegion', id, patch: campos }));
  const nome = comum(regions, (r) => r.name);
  const papel = comum(regions, (r) => r.papel);
  const terreno = comum(regions, (r) => r.terrenoId);
  const plano = regions.filter(temPlano);
  const cota = comum(plano.length > 0 ? plano : regions, (r) => r.cota);
  const incl = comum(plano.length > 0 ? plano : regions, (r) => r.inclinacao);
  const dir = comum(plano.length > 0 ? plano : regions, (r) => r.direcao);
  const corte = comum(regions, (r) => r.taludeCorte);
  const aterro = comum(regions, (r) => r.taludeAterro);
  const perm = comum(regions, (r) => r.permeavel);
  const material = comum(regions, (r) => r.materialId ?? '');
  const cor = comum(regions, (r) => r.color ?? '');
  const leituras = useMemo(() => (void kernel, regions.map((r) => leiturasDaRegiao(p, r, servicoTerreno()))), [p, regions, kernel]);
  const nomeDoTerreno = (id: string): string => {
    const e = p.elements[id];
    return isTerrain(e) ? e.name : id;
  };
  return (
    <>
      <Group title={t('prc_pgrp_identity')} stateKey="regiao-id">
        <Row label={t('ui_tn_p_nome')} htmlFor="p-rg-nome"><TextField id="p-rg-nome" value={nome.value} mixed={nome.mixed} onCommit={(v) => v.trim() !== '' && patch({ name: v.trim() })} /></Row>
        <Row label={t('ui_tn_r_terreno')} readOnly><span className="val">{terreno.mixed ? t('prc_opt_varied') : nomeDoTerreno(terreno.value)}</span></Row>
        <Row label={t('ui_tn_r_papel')} htmlFor="p-rg-papel">
          <select id="p-rg-papel" className="select" value={papel.mixed ? '' : papel.value} onChange={(e) => e.target.value !== '' && patch({ papel: e.target.value as PapelRegiaoTerreno })}>
            {papel.mixed ? <option value="">{t('prc_opt_varied')}</option> : null}
            {PAPEIS.map((o) => <option key={o.value} value={o.value}>{t(o.chave)}</option>)}
          </select>
        </Row>
      </Group>
      {plano.length > 0 ? (
        <Group title={t('ui_tn_g_plano')} stateKey="regiao-plano">
          <Row label={t('ui_tn_r_cota')} htmlFor="p-rg-cota"><NumField id="p-rg-cota" quantity="length" value={cotaExibida(p, cota.value)} mixed={cota.mixed} onCommit={(v) => patch({ cota: cotaDoProjeto(p, v) }, idsPlano)} /></Row>
          <Row label={t('ui_tn_r_inclinacao')} htmlFor="p-rg-incl"><NumField id="p-rg-incl" suffix="%" decimals={2} min={0} max={TERRENO_LIMITES.inclinacaoMax * 100} value={fracaoParaPercentual(incl.value)} mixed={incl.mixed} onCommit={(v) => patch({ inclinacao: percentualParaFracao(v) }, idsPlano)} /></Row>
          <Row label={t('ui_tn_r_direcao')} htmlFor="p-rg-dir"><NumField id="p-rg-dir" suffix="°" decimals={2} value={radParaGraus(dir.value)} mixed={dir.mixed} onCommit={(v) => patch({ direcao: grausParaRad(v) }, idsPlano)} /></Row>
        </Group>
      ) : null}
      <Group title={t('ui_tn_g_taludes')} stateKey="regiao-taludes">
        <Row label={t('ui_tn_r_talude_corte')} htmlFor="p-rg-tcorte"><NumField id="p-rg-tcorte" suffix=":1" decimals={2} min={0} max={TERRENO_LIMITES.taludeMax} value={corte.value} mixed={corte.mixed} onCommit={(v) => patch({ taludeCorte: v })} /></Row>
        <Row label={t('ui_tn_r_talude_aterro')} htmlFor="p-rg-taterro"><NumField id="p-rg-taterro" suffix=":1" decimals={2} min={0} max={TERRENO_LIMITES.taludeMax} value={aterro.value} mixed={aterro.mixed} onCommit={(v) => patch({ taludeAterro: v })} /></Row>
      </Group>
      <Group title={t('ui_tn_g_aparencia')} stateKey="regiao-aparencia">
        <Row label={t('ui_tn_r_permeavel')} htmlFor="p-rg-perm"><Check id="p-rg-perm" checked={perm.value} mixed={perm.mixed} onChange={(v) => patch({ permeavel: v })} /></Row>
        <MaterialRow id="p-rg-material" value={material.value === '' ? undefined : material.value} mixed={material.mixed} onChange={(v) => patch({ materialId: v })} />
        <CorRow id="p-rg-cor" value={cor.mixed || cor.value === '' ? undefined : cor.value} padrao={corPadraoDaRegiao(papel.mixed ? 'subdivisao' : papel.value)} onChange={(v) => patch({ color: v })} />
      </Group>
      {regions.map((r, i) => (
        <Group key={r.id} title={regions.length === 1 ? t('ui_tn_g_leituras') : `${t('ui_tn_g_leituras')}: ${r.name}`} stateKey="regiao-leituras">
          <RegiaoLeituras leituras={leituras[i]!} />
        </Group>
      ))}
    </>
  );
}
