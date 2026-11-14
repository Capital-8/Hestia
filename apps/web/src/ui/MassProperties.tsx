import { useState, type ReactElement } from 'react';
import type { Mass } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Check, NumField, Row, TextField } from './fields.tsx';
import { LevelField } from './LevelField.tsx';
import { alturaTotal, aplicarArranjo, aplicarTorcao, arranjoPadrao, editarMassas, torcaoTotalGraus, type ResultadoEdicao } from './massSecoesForm.ts';

type Patch = Partial<Omit<Mass, 'id' | 'kind' | 'order'>>;

/** Cor padrão do desenho da massa (a categoria 'mass' usa cinza azulado). */
const COR_PADRAO = '#b8c4d0';
const RAD_PARA_GRAUS = 180 / Math.PI;

/**
 * Propriedades da massa selecionada (ficha U1, A.6): nome, nível, deslocamento da base, altura total (só leitura),
 * interpolação, resolução, torção total, arranjo polar, cor e o botão "Editar seções…". Massa não tem tipo: o painel
 * não usa o cabeçalho de tipo. Toda edição passa pelos comandos do modelo (`updateMass`, `setMassSecoes`,
 * `setMassArranjo`), que recusam massa inválida: a mensagem do modelo aparece sob os campos e nada é gravado.
 * Com mais de uma massa, só os campos comuns (nível, base, interpolação, resolução, cor) aparecem.
 */
export function MassProperties({ massas }: { massas: Mass[] }): ReactElement {
  const { t, lang } = useT();
  const [erro, setErro] = useState<string | null>(null);
  const first = massas[0]!;
  const unica = massas.length === 1;
  const ids = massas.map((m) => m.id);
  const same = <K extends keyof Mass>(k: K): boolean => massas.every((m) => m[k] === first[k]);

  /** Roda uma edição; a recusa do modelo vira a mensagem do painel. */
  const rodar = (r: ResultadoEdicao): void => setErro(r.erro);
  const editar = (patch: Patch): void => rodar(editarMassas(editor.store, ids, patch, t('ui_ms_undo_edit'), lang));
  const arr = first.arranjo;
  const secoesHint = t('ui_ms_secoes_n', { n: first.secoes.length });

  return (
    <div className="props-ms">
      {unica && (
        <Row label={t('ui_ms_name')} htmlFor="ms-name">
          <TextField id="ms-name" value={first.name} onCommit={(v) => { if (v.trim() !== '') editar({ name: v.trim() }); }} />
        </Row>
      )}
      <LevelField ids={ids} />
      <Row label={t('ui_ms_base')} htmlFor="ms-base">
        <NumField id="ms-base" value={first.baseOffset} mixed={!same('baseOffset')} quantity="length" onCommit={(v) => editar({ baseOffset: v })} />
      </Row>
      {unica && (
        <Row label={t('ui_ms_height')} htmlFor="ms-height">
          <NumField id="ms-height" value={alturaTotal(first)} quantity="length" readOnly onCommit={() => undefined} />
        </Row>
      )}
      <Row label={t('ui_ms_interp')} htmlFor="ms-interp">
        <select id="ms-interp" className="select" value={same('interpolacao') ? first.interpolacao : ''} onChange={(e) => editar({ interpolacao: e.target.value === 'suave' ? 'suave' : 'linear' })}>
          {!same('interpolacao') && <option value="" disabled>—</option>}
          <option value="linear">{t('ui_ms_interp_linear')}</option>
          <option value="suave">{t('ui_ms_interp_suave')}</option>
        </select>
      </Row>
      <Row label={t('ui_ms_resolucao')} htmlFor="ms-res">
        <NumField id="ms-res" value={first.resolucao} mixed={!same('resolucao')} decimals={0} onCommit={(v) => editar({ resolucao: v })} />
      </Row>
      {unica && (
        <>
          <Row label={t('ui_ms_torcao')} htmlFor="ms-torcao">
            <NumField id="ms-torcao" value={torcaoTotalGraus(first.secoes) / RAD_PARA_GRAUS} quantity="angle" onCommit={(v) => rodar(aplicarTorcao(editor.store, first.id, v * RAD_PARA_GRAUS, t('ui_ms_undo_torcao'), lang))} />
          </Row>
          <Check id="ms-arr" checked={arr !== undefined} onChange={(on) => rodar(aplicarArranjo(editor.store, first.id, on ? arranjoPadrao(first) : null, t('ui_ms_undo_arranjo'), lang))}>{t('ui_ms_arranjo')}</Check>
          {arr && (
            <>
              <Row label={t('ui_ms_arr_copias')} htmlFor="ms-arr-n">
                <NumField id="ms-arr-n" value={arr.n} decimals={0} onCommit={(v) => rodar(aplicarArranjo(editor.store, first.id, { ...arr, n: v }, t('ui_ms_undo_arranjo'), lang))} />
              </Row>
              <Row label={t('ui_ms_arr_cx')} htmlFor="ms-arr-cx">
                <NumField id="ms-arr-cx" value={arr.cx} quantity="length" onCommit={(v) => rodar(aplicarArranjo(editor.store, first.id, { ...arr, cx: v }, t('ui_ms_undo_arranjo'), lang))} />
              </Row>
              <Row label={t('ui_ms_arr_cy')} htmlFor="ms-arr-cy">
                <NumField id="ms-arr-cy" value={arr.cy} quantity="length" onCommit={(v) => rodar(aplicarArranjo(editor.store, first.id, { ...arr, cy: v }, t('ui_ms_undo_arranjo'), lang))} />
              </Row>
              <Row label={t('ui_ms_arr_angulo')} htmlFor="ms-arr-ang">
                <NumField id="ms-arr-ang" value={arr.anguloTotal} quantity="angle" onCommit={(v) => rodar(aplicarArranjo(editor.store, first.id, { ...arr, anguloTotal: v }, t('ui_ms_undo_arranjo'), lang))} />
              </Row>
            </>
          )}
        </>
      )}
      <Row label={t('ui_ms_cor')} htmlFor="ms-cor">
        <input id="ms-cor" className="input" type="color" value={same('color') ? first.color ?? COR_PADRAO : COR_PADRAO} onChange={(e) => editar({ color: e.target.value })} />
      </Row>
      {unica && (
        <div className="prow">
          <span />
          <button type="button" id="ms-edit-secoes" className="chiplink" title={secoesHint} onClick={() => useUi.setState({ dialog: 'massSecoes', dialogArg: first.id })}>{t('ui_ms_editar_secoes')}</button>
        </div>
      )}
      {erro && <div className="vr-error" role="alert" id="ms-erro">{erro}</div>}
    </div>
  );
}
