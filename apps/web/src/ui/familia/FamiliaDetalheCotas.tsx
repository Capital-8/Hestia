import type { CotaResolvida } from '@hestia/engine';
import { adicionarCota, editarCota, editarCotaDirigida, excluirCota, type DetalheFamilia, type Familia, type ReferenciaCota } from '@hestia/model';
import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { CampoCorpo } from './FamiliaCorpoCampo.tsx';
import { proximoId, refParaTexto, textoParaRef } from './familiaDetalhe.ts';
import { useFamilia } from './familiaStore.ts';
import './familiaCorpo.css';

/*
 * Tabela de cotas de UM detalhe (ficha D4): de, até, parâmetro dirigido e valor. Editar o valor de uma cota dirigida muda o
 * parâmetro (cadeado) por `editarCotaDirigida`, com desfazer; cota só de medida mostra o valor e não edita. A recusa do modelo
 * (por exemplo, valor fora de min/max) aparece no aviso. Cota por ponto livre existe no modelo mas não tem seletor aqui.
 */

interface Props {
  familia: Familia;
  detalhe: DetalheFamilia;
  resolvidas: readonly CotaResolvida[];
  aoErro: (motivo: string | null) => void;
}

export function FamiliaDetalheCotas({ familia, detalhe, resolvidas, aoErro }: Props): ReactElement {
  const { t } = useT();
  const cotas = detalhe.cotas ?? [];
  const executar = (rotulo: string, receita: (f: Familia) => string | null): void =>
    aoErro(useFamilia.getState().executar(rotulo, receita));

  const opcoes: { valor: string; rotulo: string }[] = [
    ...familia.planos.map((p) => ({ valor: `plano:${p.id}`, rotulo: t('fam_det_ref_plano', { nome: p.nome }) })),
    ...(familia.ligacoes ?? []).map((l) => ({ valor: `ligacao:${l.id}`, rotulo: t('fam_det_ref_ligacao', { nome: l.nome }) })),
  ];
  const seletor = (id: string, valor: ReferenciaCota, aoMudar: (r: ReferenciaCota) => void): ReactElement => (
    <select
      id={id}
      aria-label={id}
      className="fam-f"
      value={refParaTexto(valor)}
      onChange={(e) => {
        const r = textoParaRef(e.target.value);
        if (r !== null) aoMudar(r);
      }}
    >
      {valor.tipo === 'ponto' && <option value="ponto">{`(${valor.ponto.join(', ')})`}</option>}
      {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
    </select>
  );

  const nova = (): void => {
    const a = textoParaRef(opcoes[0]?.valor ?? '');
    const b = textoParaRef(opcoes[1]?.valor ?? opcoes[0]?.valor ?? '');
    if (a === null || b === null) return;
    executar('Nova cota', (f) => adicionarCota(f, detalhe.id, { id: proximoId('cota', cotas.map((c) => c.id)), de: a, ate: b }));
  };

  const parametros = familia.parametros.filter((p) => (p.tipo === 'comprimento' || p.tipo === 'numero' || p.tipo === 'inteiro') && p.formula === undefined);

  return (
    <div className="fam-grp">
      <div className="fam-gh">{t('fam_det_cotas', { n: cotas.length })}</div>
      {cotas.length === 0 && <div className="fam-hint">{t('fam_det_cotas_vazio')}</div>}
      {cotas.length > 0 && (
        <table className="fam-corpo-tabela">
          <thead>
            <tr><th>{t('fam_det_cota_de')}</th><th>{t('fam_det_cota_ate')}</th><th>{t('fam_det_cota_parametro')}</th><th>{t('fam_det_cota_valor')}</th><th /></tr>
          </thead>
          <tbody>
            {cotas.map((c) => {
              const r = resolvidas.find((x) => x.id === c.id);
              const valor = r === undefined ? '' : String(Math.round(r.valorMm));
              return (
                <tr key={c.id}>
                  <td>{seletor(`fdc-${c.id}-de`, c.de, (de) => executar('Editar cota', (f) => editarCota(f, detalhe.id, c.id, { de })))}</td>
                  <td>{seletor(`fdc-${c.id}-ate`, c.ate, (ate) => executar('Editar cota', (f) => editarCota(f, detalhe.id, c.id, { ate })))}</td>
                  <td>
                    <select
                      aria-label={t('fam_det_cota_parametro')}
                      className="fam-f"
                      value={c.parametro ?? ''}
                      onChange={(e) => executar('Editar cota', (f) => editarCota(f, detalhe.id, c.id, { parametro: e.target.value === '' ? undefined : e.target.value }))}
                    >
                      <option value="">{t('fam_det_cota_sem_parametro')}</option>
                      {parametros.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
                    </select>
                  </td>
                  <td>
                    {c.parametro !== undefined ? (
                      <span title={t('fam_det_cota_dirigida', { param: c.parametro })}>
                        <CampoCorpo
                          key={`${c.id}:${valor}`}
                          id={`fdc-${c.id}-valor`}
                          rotulo={t('fam_det_cota_valor')}
                          valor={valor}
                          formula={false}
                          celula
                          gravar={(texto) => {
                            const n = Number(texto.replace(',', '.'));
                            if (texto.trim() === '' || !Number.isFinite(n)) return t('fam_det_cota_valor');
                            return useFamilia.getState().executar('Editar cota dirigida', (f) => editarCotaDirigida(f, detalhe.id, c.id, n));
                          }}
                        />
                      </span>
                    ) : (
                      <span>{valor}</span>
                    )}
                  </td>
                  <td>
                    <button type="button" className="fam-bt" aria-label={t('fam_det_cota_excluir')} title={t('fam_det_cota_excluir')} onClick={() => executar('Excluir cota', (f) => excluirCota(f, detalhe.id, c.id))}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <button type="button" className="fam-bt" disabled={opcoes.length === 0} onClick={nova}>{t('fam_det_cota_nova')}</button>
    </div>
  );
}
