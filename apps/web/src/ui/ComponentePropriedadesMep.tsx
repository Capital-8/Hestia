import type { ReactElement } from 'react';
import { avaliarVerificacoes, resolverComponente, tabelaDaFamilia } from '@hestia/engine';
import { type Component, type Familia, type Valor } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row, TextField } from './fields.tsx';
import { comumDe } from './componentPropAcoes.ts';
import {
  aplicarInclinacao,
  desconectarLigacao,
  grausDeRadianos,
  inclinacaoDe,
  linhasDeLigacao,
  renomearSistema,
  sistemaDaLinhas,
  type LinhaLigacao,
} from './componentPropMep.ts';

/*
 * Seções MEP do painel de propriedades de um componente (ficha G3, CONTRATO §3 e §5): inclinação, ligações com o vizinho
 * conectado, sistema, verificações (D5) e tabelas de dimensões. Inclinação vale para a seleção toda; ligações, verificações
 * e tabelas pedem uma instância só. Cada edição é uma transação (um desfazer).
 */

interface PropsMep {
  familia: Familia;
  components: readonly Component[];
}

const executar = (acao: () => void): void => {
  try {
    acao();
  } catch (e) {
    useUi.setState({ status: e instanceof Error ? e.message : { key: 'mov_op_recusada' } });
  }
};

export function ComponentePropriedadesMep({ familia, components }: PropsMep): ReactElement | null {
  const p = useProject();
  const { t } = useT();
  const temLigacoes = (familia.ligacoes?.length ?? 0) > 0;
  const verificacoes = familia.verificacoes ?? [];
  const tabelas = familia.tabelas ?? [];
  if (!temLigacoes && verificacoes.length === 0 && tabelas.length === 0) return null;

  const ids = components.map((c) => c.id);
  const unica = components.length === 1 ? components[0] : undefined;
  const incl = comumDe(components, (c) => inclinacaoDe(c)[0]);
  const giro = comumDe(components, (c) => inclinacaoDe(c)[1]);
  const linhas: LinhaLigacao[] = unica ? linhasDeLigacao(p, unica) : [];
  const sistema = sistemaDaLinhas(linhas);
  const env: Record<string, Valor> = unica ? resolverComponente(p, unica).env : {};
  const diagnosticos = unica ? avaliarVerificacoes(familia, env) : [];

  return (
    <>
      {temLigacoes && (
        <Group title={t('mi_grp_inclinacao')}>
          <Row label={t('mi_inclinacao')} htmlFor="p-comp-incl">
            <NumField
              id="p-comp-incl"
              value={incl.misto ? null : grausDeRadianos(incl.valor)}
              mixed={incl.misto}
              suffix="°"
              decimals={2}
              onCommit={(v) => executar(() => aplicarInclinacao(editor.store, ids, 0, v, 'mi_undo_inclinar'))}
            />
          </Row>
          <Row label={t('mi_giro')} htmlFor="p-comp-giro">
            <NumField
              id="p-comp-giro"
              value={giro.misto ? null : grausDeRadianos(giro.valor)}
              mixed={giro.misto}
              suffix="°"
              decimals={2}
              onCommit={(v) => executar(() => aplicarInclinacao(editor.store, ids, 1, v, 'mi_undo_inclinar'))}
            />
          </Row>
        </Group>
      )}
      {temLigacoes && (
        <Group title={t('mi_grp_conexoes')}>
          {!unica ? (
            <div className="hint">{t('mi_selecione_uma')}</div>
          ) : (
            <>
              {linhas.map((linha) => (
                <div className="prow" key={linha.ligacao.id} style={{ alignItems: 'start' }}>
                  <span className="lbl">{linha.ligacao.nome}</span>
                  <span className="val">
                    {linha.conexao
                      ? linha.vizinho
                        ? t('mi_conectada_a', { familia: linha.vizinho.familia, ligacao: linha.vizinho.ligacao })
                        : t('mi_conexao_ausente')
                      : t('mi_livre')}
                  </span>
                  {linha.vizinho && (
                    <button
                      type="button"
                      className="chiplink"
                      title={t('mi_ver_vizinho_dica')}
                      onClick={() => useUi.setState({ selection: [linha.vizinho?.id ?? ''], selectedLevel: null })}
                    >
                      {t('mi_ver_vizinho')}
                    </button>
                  )}
                  {linha.conexao && (
                    <button
                      type="button"
                      className="chiplink"
                      title={t('mi_desconectar_dica')}
                      onClick={() => executar(() => desconectarLigacao(editor.store, ids, linha.ligacao.id, 'mi_undo_desconectar'))}
                    >
                      {t('mi_desconectar')}
                    </button>
                  )}
                </div>
              ))}
              <Row label={t('mi_sistema')} htmlFor="p-comp-sistema">
                {sistema ? (
                  <TextField
                    id="p-comp-sistema"
                    value={sistema.nome}
                    onCommit={(v) => executar(() => renomearSistema(editor.store, sistema.id, v, 'mi_undo_sistema'))}
                  />
                ) : (
                  <span className="val soft">{t('mi_sistema_nenhum')}</span>
                )}
              </Row>
            </>
          )}
        </Group>
      )}
      {(verificacoes.length > 0 || tabelas.length > 0) && !unica && (
        <div className="hint">{t('mi_so_uma_instancia')}</div>
      )}
      {unica && verificacoes.length > 0 && (
        <Group title={t('mi_grp_verificacoes')}>
          {diagnosticos.length === 0 ? (
            <div className="hint">{t('mi_verificacoes_nenhuma')}</div>
          ) : (
            diagnosticos.map((d) => (
              <div
                key={d.onde}
                className="hint"
                role={d.severidade === 'erro' ? 'alert' : undefined}
                style={d.severidade === 'erro' ? { color: 'var(--danger, #b42318)' } : undefined}
              >
                {d.mensagem}
              </div>
            ))
          )}
        </Group>
      )}
      {unica && tabelas.map((tabela) => {
        const grade = tabelaDaFamilia(familia, tabela.id, familia.tipos, env);
        if (grade.length === 0) return null;
        const [cabecalho = [], ...corpo] = grade;
        return (
          <Group key={tabela.id} title={tabela.nome}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {cabecalho.map((titulo, i) => <th key={i} style={{ textAlign: 'left', padding: '2px 4px' }}>{titulo}</th>)}
                </tr>
              </thead>
              <tbody>
                {corpo.map((linha, r) => (
                  <tr key={r}>
                    {linha.map((celula, i) => <td key={i} style={{ padding: '2px 4px' }}>{celula}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Group>
        );
      })}
    </>
  );
}
