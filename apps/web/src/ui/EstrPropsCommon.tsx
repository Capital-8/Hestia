import type { ReactElement } from 'react';
import { formatQuantity, type Command, type Id, type Project, wallsOnLevel } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useI18n, useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Row, TextField } from './fields.tsx';
import { leituraEstr } from './estrLeitura.ts';
import { useUnits } from './useUnits.ts';

/**
 * Aplica o mesmo patch a todos os elementos selecionados num único passo de desfazer. O comando é recusado pelo modelo
 * com uma mensagem (nada muda); ela vai para a barra de status.
 */
export function aplicarEstr(ids: readonly Id[], label: string, comando: (id: Id) => Command): void {
  try {
    editor.store.transaction(label, () => {
      for (const id of ids) editor.store.exec(comando(id), label);
    });
  } catch (e) {
    useUi.setState({ status: e instanceof Error ? e.message : String(e) });
  }
}

/** Marca e comentários (comuns aos três painéis): "variado" quando a seleção tem valores diferentes. */
export function MarcaEComentarios({ els, idBase, onMark, onComments }: { els: ReadonlyArray<{ mark: string; comments: string }>; idBase: string; onMark: (v: string) => void; onComments: (v: string) => void }): ReactElement {
  const { t } = useT();
  const first = els[0]!;
  return (
    <>
      <Row label={t('estr_fld_mark')} htmlFor={`${idBase}-mark`}><TextField id={`${idBase}-mark`} value={first.mark} mixed={els.some((e) => e.mark !== first.mark)} onCommit={onMark} /></Row>
      <Row label={t('estr_fld_comments')} htmlFor={`${idBase}-comments`}><TextField id={`${idBase}-comments`} value={first.comments} mixed={els.some((e) => e.comments !== first.comments)} onCommit={onComments} /></Row>
    </>
  );
}

/** Seletor da parede hospedeira (paredes do nível do elemento); vazio = sem hospedeiro. */
export function HospedeiroRow({ levelId, value, mixed, idBase, onChange }: { levelId: Id; value: Id | undefined; mixed: boolean; idBase: string; onChange: (id: Id | undefined) => void }): ReactElement {
  const { t } = useT();
  const p: Project = useProject();
  const paredes = wallsOnLevel(p, levelId);
  return (
    <Row label={t('estr_fld_host')} htmlFor={`${idBase}-host`}>
      <select id={`${idBase}-host`} className="select" value={mixed ? '' : (value ?? '')} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}>
        <option value="">{mixed ? t('prc_opt_varied') : t('estr_host_none')}</option>
        {paredes.map((w, i) => <option key={w.id} value={w.id}>{`${p.wallTypes[w.typeId]?.name ?? w.id} · ${i + 1}`}</option>)}
      </select>
    </Row>
  );
}

/** Soma de uma quantidade do kernel nos elementos; null se o kernel não entrega para algum (mostra "—"). */
function somar(ids: readonly Id[], campo: 'volume' | 'areaForma' | 'peso'): number | null {
  let total = 0;
  for (const id of ids) {
    const v = leituraEstr(id)?.[campo];
    if (v === undefined) return null;
    total += v;
  }
  return ids.length === 0 ? null : total;
}

/**
 * Quantidades calculadas pelo kernel (volume, área de forma, peso): linhas somente leitura. Enquanto a consulta 203 não
 * está ligada (`leituraEstr`) mostram "—". O painel não calcula nada.
 */
export function LeiturasEstr({ ids }: { ids: readonly Id[] }): ReactElement {
  const { t } = useT();
  const units = useUnits();
  const lang = useI18n((s) => s.lang);
  const volume = somar(ids, 'volume');
  const forma = somar(ids, 'areaForma');
  const peso = somar(ids, 'peso');
  const travessao = '—';
  return (
    <>
      <Row label={t('estr_ro_volume')} readOnly><span>{volume === null ? travessao : formatQuantity(units, 'volume', volume)}</span></Row>
      <Row label={t('estr_ro_form')} readOnly><span>{forma === null ? travessao : formatQuantity(units, 'area', forma)}</span></Row>
      {/* units-ok: peso em kg não é grandeza de `formatQuantity` (o projeto só tem comprimento, área, volume, ângulo e inclinação) */}
      <Row label={t('estr_ro_weight')} readOnly><span>{peso === null ? travessao : `${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(peso)} ${t('estr_unit_kg')}`}</span></Row>
    </>
  );
}
