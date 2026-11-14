import { useState, type ReactElement } from 'react';
import type { ArranjoMassa, Mass, ProjectStore } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { useT, type Lang } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Check, NumField, Row, TextField } from './fields.tsx';
import { LevelField } from './LevelField.tsx';
import { alturaTotal, aplicarArranjo, aplicarTorcao, arranjoPadrao, editarMassas, torcaoTotalGraus, type ResultadoEdicao } from './massSecoesForm.ts';

/** Cor padrão do desenho da massa (a categoria 'mass' usa cinza azulado). */
const COR_PADRAO = '#b8c4d0';
const RAD_PARA_GRAUS = 180 / Math.PI;
const OK: ResultadoEdicao = { ok: true, erro: null };

/** Rótulos de desfazer das três famílias de edição do painel. */
export interface RotulosMassa {
  edit: string;
  torcao: string;
  arranjo: string;
}

/**
 * Ações do painel sobre as massas selecionadas (`massas` não vazio): cada uma devolve o resultado do comando do modelo
 * (recusa com a mensagem do modelo e nada gravado) e vale UM passo de desfazer. Separadas do JSX para o teste chamá-las.
 * Torção em radianos (o `NumField` de ângulo entrega SI) e arranjo só com uma massa.
 */
export function acoesDaMassa(store: ProjectStore, massas: readonly Mass[], r: RotulosMassa, lang: Lang): {
  nome: (v: string) => ResultadoEdicao;
  base: (v: number) => ResultadoEdicao;
  interpolacao: (v: string) => ResultadoEdicao;
  resolucao: (v: number) => ResultadoEdicao;
  cor: (v: string) => ResultadoEdicao;
  torcao: (rad: number) => ResultadoEdicao;
  arranjoLigado: (on: boolean) => ResultadoEdicao;
  arranjoCampo: (patch: Partial<ArranjoMassa>) => ResultadoEdicao;
} {
  const first = massas[0]!;
  const ids = massas.map((m) => m.id);
  const editar = (patch: Partial<Omit<Mass, 'id' | 'kind' | 'order'>>): ResultadoEdicao => editarMassas(store, ids, patch, r.edit, lang);
  return {
    nome: (v) => (v.trim() === '' ? OK : editar({ name: v.trim() })),
    base: (v) => editar({ baseOffset: v }),
    interpolacao: (v) => editar({ interpolacao: v === 'suave' ? 'suave' : 'linear' }),
    resolucao: (v) => editar({ resolucao: v }),
    cor: (v) => editar({ color: v }),
    torcao: (rad) => aplicarTorcao(store, first.id, rad * RAD_PARA_GRAUS, r.torcao, lang),
    arranjoLigado: (on) => aplicarArranjo(store, first.id, on ? arranjoPadrao(first) : null, r.arranjo, lang),
    arranjoCampo: (patch) => (first.arranjo ? aplicarArranjo(store, first.id, { ...first.arranjo, ...patch }, r.arranjo, lang) : OK),
  };
}

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
  // Recusa do modelo: remonta os campos para que voltem ao valor gravado (o campo guardaria o texto recusado).
  const [rev, setRev] = useState(0);
  const first = massas[0]!;
  const unica = massas.length === 1;
  const ids = massas.map((m) => m.id);
  const same = <K extends keyof Mass>(k: K): boolean => massas.every((m) => m[k] === first[k]);

  const ac = acoesDaMassa(editor.store, massas, { edit: t('ui_ms_undo_edit'), torcao: t('ui_ms_undo_torcao'), arranjo: t('ui_ms_undo_arranjo') }, lang);
  /** Roda uma edição; a recusa do modelo vira a mensagem do painel. */
  const rodar = (r: ResultadoEdicao): void => {
    setErro(r.erro);
    if (!r.ok) setRev((n) => n + 1);
  };
  const arr = first.arranjo;
  const secoesHint = t('ui_ms_secoes_n', { n: first.secoes.length });

  return (
    <div className="props-ms" key={rev}>
      {unica && (
        <Row label={t('ui_ms_name')} htmlFor="ms-name">
          <TextField id="ms-name" value={first.name} onCommit={(v) => rodar(ac.nome(v))} />
        </Row>
      )}
      <LevelField ids={ids} />
      <Row label={t('ui_ms_base')} htmlFor="ms-base">
        <NumField id="ms-base" value={first.baseOffset} mixed={!same('baseOffset')} quantity="length" onCommit={(v) => rodar(ac.base(v))} />
      </Row>
      {unica && (
        <Row label={t('ui_ms_height')} htmlFor="ms-height">
          <NumField id="ms-height" value={alturaTotal(first)} quantity="length" readOnly onCommit={() => undefined} />
        </Row>
      )}
      <Row label={t('ui_ms_interp')} htmlFor="ms-interp">
        <select id="ms-interp" className="select" value={same('interpolacao') ? first.interpolacao : ''} onChange={(e) => rodar(ac.interpolacao(e.target.value))}>
          {!same('interpolacao') && <option value="" disabled>—</option>}
          <option value="linear">{t('ui_ms_interp_linear')}</option>
          <option value="suave">{t('ui_ms_interp_suave')}</option>
        </select>
      </Row>
      <Row label={t('ui_ms_resolucao')} htmlFor="ms-res">
        <NumField id="ms-res" value={first.resolucao} mixed={!same('resolucao')} decimals={0} onCommit={(v) => rodar(ac.resolucao(v))} />
      </Row>
      {unica && (
        <>
          <Row label={t('ui_ms_torcao')} htmlFor="ms-torcao">
            <NumField id="ms-torcao" value={torcaoTotalGraus(first.secoes) / RAD_PARA_GRAUS} quantity="angle" onCommit={(v) => rodar(ac.torcao(v))} />
          </Row>
          <Check id="ms-arr" checked={arr !== undefined} onChange={(on) => rodar(ac.arranjoLigado(on))}>{t('ui_ms_arranjo')}</Check>
          {arr && (
            <>
              <Row label={t('ui_ms_arr_copias')} htmlFor="ms-arr-n">
                <NumField id="ms-arr-n" value={arr.n} decimals={0} onCommit={(v) => rodar(ac.arranjoCampo({ n: v }))} />
              </Row>
              <Row label={t('ui_ms_arr_cx')} htmlFor="ms-arr-cx">
                <NumField id="ms-arr-cx" value={arr.cx} quantity="length" onCommit={(v) => rodar(ac.arranjoCampo({ cx: v }))} />
              </Row>
              <Row label={t('ui_ms_arr_cy')} htmlFor="ms-arr-cy">
                <NumField id="ms-arr-cy" value={arr.cy} quantity="length" onCommit={(v) => rodar(ac.arranjoCampo({ cy: v }))} />
              </Row>
              <Row label={t('ui_ms_arr_angulo')} htmlFor="ms-arr-ang">
                <NumField id="ms-arr-ang" value={arr.anguloTotal} quantity="angle" onCommit={(v) => rodar(ac.arranjoCampo({ anguloTotal: v }))} />
              </Row>
            </>
          )}
        </>
      )}
      <Row label={t('ui_ms_cor')} htmlFor="ms-cor">
        <input id="ms-cor" className="input" type="color" value={same('color') ? first.color ?? COR_PADRAO : COR_PADRAO} onChange={(e) => rodar(ac.cor(e.target.value))} />
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
