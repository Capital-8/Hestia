import { useEffect, useState, type ReactElement } from 'react';
import { servicoTerreno } from '@hestia/engine';
import type { Id } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { useT } from '../editor/i18n.ts';
import { Row } from './fields.tsx';

/**
 * Peças comuns dos painéis de propriedades de terreno, região e lote (ficha U1): aplicar patch a vários elementos num só passo de
 * desfazer, material e cor, e a assinatura do kernel (as leituras calculadas só existem com o kernel pronto).
 */

/** Valor comum de uma lista e se há variação (como o `common` de Properties). */
export function comum<T, K>(itens: readonly T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const primeiro = get(itens[0]!);
  return { value: primeiro, mixed: itens.some((x) => get(x) !== primeiro) };
}

/** Executa um comando por id como UM passo de desfazer; comando recusado pelo modelo vira mensagem na barra de status. */
export function aplicarEmTodos(ids: readonly Id[], rotulo: string, comando: (id: Id) => Parameters<typeof editor.store.exec>[0]): void {
  try {
    editor.store.transaction(rotulo, () => {
      for (const id of ids) editor.store.exec(comando(id), rotulo);
    });
  } catch (e) {
    useUi.setState({ status: e instanceof Error ? e.message : { key: 'shr_status_op_rejected' } });
  }
}

/** Número que muda quando o kernel do terreno fica pronto (ou deixa de ficar): força o painel a recalcular as leituras. */
export function useKernelTerreno(): number {
  const [n, setN] = useState(0);
  useEffect(() => servicoTerreno().aoMudarPronto(() => setN((x) => x + 1)), []);
  return n;
}

/** Linha de material: lista os materiais do projeto, com "nenhum". */
export function MaterialRow({ id, value, mixed, onChange }: { id: string; value: string | undefined; mixed?: boolean; onChange: (v: string | undefined) => void }): ReactElement {
  const { t } = useT();
  const p = useProject();
  return (
    <Row label={t('ui_tn_p_material')} htmlFor={id}>
      <select id={id} className="select" value={mixed ? '' : (value ?? '')} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}>
        {mixed ? <option value="">{t('prc_opt_varied')}</option> : <option value="">{t('ui_tn_p_nenhum')}</option>}
        {Object.values(p.materials).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </Row>
  );
}

/** Linha de cor com "padrão" (volta a cor automática). */
export function CorRow({ id, value, padrao, onChange }: { id: string; value: string | undefined; padrao: string; onChange: (v: string | undefined) => void }): ReactElement {
  const { t } = useT();
  return (
    <Row label={t('pra_fld_color')} htmlFor={id}>
      <input id={id} type="color" value={value ?? padrao} aria-label={t('pra_fld_color')} onChange={(e) => onChange(e.target.value)} />
      {value ? <button type="button" className="btn small" onClick={() => onChange(undefined)}>{t('ui_tn_p_cor_padrao')}</button> : null}
    </Row>
  );
}

/** Leitura somente texto: "—" quando o kernel ainda não respondeu. */
export function Leitura({ label, valor }: { label: string; valor: string | null }): ReactElement {
  return <Row label={label} readOnly><span className="val">{valor ?? '—'}</span></Row>;
}
