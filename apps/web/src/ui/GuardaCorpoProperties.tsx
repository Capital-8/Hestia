import type { ReactElement } from 'react';
import { guardaCorpoMedidasParaAvisos, servicoGuardaCorpo } from '@hestia/engine';
import { guardaCorpoIssues, normaDe, type GuardaCorpo, type HospedeiroGC, type LadoGC, type LadoHospedado } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useI18n, useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Check, NumField, Row } from './fields.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { guardaCorpoOptions } from './typeOptions.ts';

type Patch = Partial<Omit<GuardaCorpo, 'id' | 'kind' | 'order'>>;

const LADOS: LadoGC[] = ['esquerdo', 'direito'];

/**
 * Propriedades do guarda-corpo selecionado (decisão 0055, Fase 6b): tipo, lados ligados por trecho, base, deslocamento,
 * altura, sentido, avisos de modelo e de norma, e a exclusão dos órfãos. Cada edição vale para todos os selecionados,
 * num único passo de desfazer.
 */
export function GuardaCorpoProperties({ railings }: { railings: GuardaCorpo[] }): ReactElement {
  const p = useProject();
  const { t } = useT();
  const lang = useI18n((s) => s.lang);
  const first = railings[0]!;
  const h: HospedeiroGC = first.hospedeiro;
  const tipo = p.tiposGuardaCorpo?.[first.typeId];
  const tipoMisto = new Set(railings.map((g) => g.typeId)).size > 1;
  const ids = new Set(railings.map((g) => g.id));
  const issues = guardaCorpoIssues(p, lang).filter((i) => i.elementId !== undefined && ids.has(i.elementId));
  // Avisos de norma que dependem da geometria (vao, altura real, corrimao): medidos pelo kernel (guarda_avisos); sem kernel pronto, so os de configuracao.
  const medidas = servicoGuardaCorpo().avisos(p) ?? [];
  const avisosGeometria = railings.flatMap((g) => {
    const tp = p.tiposGuardaCorpo?.[g.typeId];
    return tp ? guardaCorpoMedidasParaAvisos(medidas.filter((m) => m.guardaId === g.id), normaDe(p, g.sobrescritas?.normaId ? { normaId: g.sobrescritas.normaId } : tp), lang) : [];
  });
  const todosAvisos = [...issues.map((i) => ({ code: i.code, message: i.message, id: i.elementId })), ...avisosGeometria.map((i) => ({ code: i.code, message: i.message, id: i.guardaId }))];
  const orphanIds = railings.filter((g) => issues.some((i) => i.elementId === g.id && i.code === 'railing-host-missing')).map((g) => g.id);
  const hostedAll = railings.every((g) => g.hospedeiro.tipo !== 'manual');
  const hostLabel = h.tipo === 'manual' ? t('gc6b_host_manual') : h.tipo === 'escada' ? t('gc6b_host_stair') : t('gc6b_host_ramp');
  const ladoDe = (lado: LadoGC): LadoHospedado => (first.hospedeiro.tipo !== 'manual' ? first.hospedeiro.lados[lado] : { lance: false, patamar: false });

  /** Aplica um patch por guarda-corpo (a função devolve null quando o guarda-corpo fica como está). */
  const apply = (label: string, fn: (g: GuardaCorpo) => Patch | null): void => {
    const changes = railings.map((g) => [g.id, fn(g)] as const).filter((x): x is readonly [string, Patch] => x[1] !== null);
    if (changes.length === 0) return;
    editor.store.transaction(label, () => {
      for (const [id, patch] of changes) editor.store.exec({ type: 'updateGuardaCorpo', id, patch }, label);
    });
  };

  /** Liga ou desliga uma parte (lance ou patamar) de um lado do hospedeiro. */
  const setLado = (lado: LadoGC, parte: keyof LadoHospedado, value: boolean): void =>
    apply(t('gc6b_undo_edit'), (g) => {
      const hh = g.hospedeiro;
      if (hh.tipo === 'manual') return null;
      return { hospedeiro: { ...hh, lados: { ...hh.lados, [lado]: { ...hh.lados[lado], [parte]: value } } } };
    });

  return (
    <div className="props-gc">
      {/* Cabeçalho de tipo igual ao da parede: família no topo, "Editar" logo abaixo; o resto do painel vem depois. */}
      <TypeSelector
        triggerId="prop-gctype"
        label={t('gc6b_type')}
        categoryLabel={`${t('cvn_cat_railing')} (${railings.length})`}
        options={guardaCorpoOptions(p, t('cvn_cat_railing'))}
        selectedId={tipoMisto ? null : first.typeId}
        editDisabled={tipoMisto}
        onSelect={(id) => apply(t('gc6b_undo_edit'), () => ({ typeId: id }))}
        onEdit={() => useUi.setState({ dialog: 'guardaCorpoType', dialogArg: first.typeId })}
      />
      <Row label={t('gc6b_host')}>
        <span>{hostLabel}{railings.length > 1 ? ` · ${railings.length}` : ''}</span>
      </Row>
      {hostedAll && (
        <Row label={t('gc6b_sides')}>
          <table className="gc-lados" aria-label={t('gc6b_sides')}>
            <thead>
              <tr><th /><th>{t('gc6b_part_flight')}</th><th>{t('gc6b_part_landing')}</th></tr>
            </thead>
            <tbody>
              {LADOS.map((lado) => (
                <tr key={lado}>
                  <th scope="row">{lado === 'esquerdo' ? t('gc6b_side_left') : t('gc6b_side_right')}</th>
                  <td><Check id={`gc-${lado}-lance`} checked={ladoDe(lado).lance} onChange={(v) => setLado(lado, 'lance', v)} /></td>
                  <td><Check id={`gc-${lado}-patamar`} checked={ladoDe(lado).patamar} onChange={(v) => setLado(lado, 'patamar', v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Row>
      )}
      {hostedAll && (
        <Row label={t('gc6b_base')} htmlFor="gc-base">
          <select
            id="gc-base"
            className="select"
            value={first.hospedeiro.tipo !== 'manual' ? first.hospedeiro.posicaoBase : 'degrau'}
            onChange={(e) => apply(t('gc6b_undo_edit'), (g) => (g.hospedeiro.tipo === 'manual' ? null : { hospedeiro: { ...g.hospedeiro, posicaoBase: e.target.value === 'lateral' ? 'lateral' : 'degrau' } }))}
          >
            <option value="degrau">{t('gc6b_base_tread')}</option>
            <option value="lateral">{t('gc6b_base_side')}</option>
          </select>
        </Row>
      )}
      <Row label={t('gc6b_offset')} htmlFor="gc-offset">
        <NumField id="gc-offset" value={first.deslocamento} placeholder={tipo ? String(tipo.deslocamento) : undefined} unit="m" decimals={3} onCommit={(v) => apply(t('gc6b_undo_edit'), () => ({ deslocamento: v }))} onClear={() => apply(t('gc6b_undo_edit'), () => ({ deslocamento: null }))} />
      </Row>
      <Row label={t('gc6b_height')} htmlFor="gc-height">
        <NumField id="gc-height" value={first.altura} placeholder={tipo ? String(tipo.altura) : undefined} unit="m" min={0.01} onCommit={(v) => apply(t('gc6b_undo_edit'), () => ({ altura: v }))} onClear={() => apply(t('gc6b_undo_edit'), () => ({ altura: null }))} />
      </Row>
      <Check id="gc-invert" checked={first.inverter} onChange={(v) => apply(t('gc6b_undo_edit'), () => ({ inverter: v }))}>{t('gc6b_invert')}</Check>
      {h.tipo === 'manual' && <p className="hint">{t('gc6b_path_points', { n: h.caminho.length })}</p>}
      {orphanIds.length > 0 && (
        <>
          <p className="hint">{t('gc6b_host_missing')}</p>
          <button
            type="button"
            onClick={() => editor.store.transaction(t('gc6b_undo_delete'), () => { for (const id of orphanIds) editor.store.exec({ type: 'deleteGuardaCorpo', id }, t('gc6b_undo_delete')); })}
          >
            {t('gc6b_delete_orphans')}
          </button>
        </>
      )}
      <h3>{t('gc6b_issues')}</h3>
      {todosAvisos.length === 0 ? <p className="hint">{t('gc6b_no_issues')}</p> : (
        <ul className="gc-issues">
          {todosAvisos.map((i, k) => (
            <li key={`${i.code}-${k}`}>
              <button type="button" className="link" onClick={() => useUi.setState({ selection: i.id ? [i.id] : [] })}>{i.message}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
