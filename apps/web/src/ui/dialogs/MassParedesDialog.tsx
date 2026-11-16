import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { derivarContornosParedesDaMassa, servicoMassa, SEGMENTO_MINIMO_PADRAO, TOLERANCIA_PAREDE_PADRAO } from '@hestia/engine';
import { comandoDerivarParedes, type CadeiaDerivadaParedes, type Id } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { Check, NumField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { massaUnicaSelecionada, niveisDaMassa } from './massPisosForm.ts';
import { motivoNaoGerarParedes, notaDaFaceInclinada, tiposDeParede } from './massParedesForm.ts';

/**
 * Diálogo "Paredes da massa" (ficha D2, plano de massa A.6 e A.7): para a massa selecionada, uma cadeia de paredes por nível marcado, pelo
 * contorno simplificado da massa. A prévia vem do motor (kernel); sem kernel o diálogo diz isso e Gerar fica desligado. Gerar é UMA
 * transação (um Ctrl+Z desfaz tudo) e rodar de novo substitui as paredes geradas antes pela mesma massa nos níveis marcados.
 */
export function MassParedesDialog(): ReactElement {
  const p = useProject();
  const { t, lang } = useT();
  const selecao = useUi((s) => s.selection);
  const massa = massaUnicaSelecionada(p, selecao);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  // O kernel pode ficar pronto depois de abrir o diálogo: a prévia é refeita quando isso acontece (como nos pisos).
  const [, refazer] = useState(0);
  useEffect(() => servicoMassa().aoMudarPronto(() => refazer((n) => n + 1)), []);

  const [niveis, setNiveis] = useState<Id[]>(() => (massa ? niveisDaMassa(p, massa) : []));
  const [typeId, setTypeId] = useState<Id>(() => tiposDeParede(p)[0]?.id ?? '');
  const [tolerancia, setTolerancia] = useState<number>(TOLERANCIA_PAREDE_PADRAO);
  const [segmentoMinimo, setSegmentoMinimo] = useState<number>(SEGMENTO_MINIMO_PADRAO);
  const [erro, setErro] = useState('');

  const niveisDoProjeto = useMemo(() => [...p.levels].sort((a, b) => a.elevation - b.elevation), [p.levels]);
  const tipos = tiposDeParede(p);
  const motivo = motivoNaoGerarParedes({ niveis, typeId, tolerancia, segmentoMinimo }, massa !== null);
  // Sem memo: o serviço guarda as fatias por projeto, e a prévia precisa refazer-se quando o kernel fica pronto (`refazer`).
  const opcoes = { tolerancia, segmentoMinimo };
  const previa = massa && motivo === null ? derivarContornosParedesDaMassa(p, massa.id, niveis, opcoes, servicoMassa()) : null;
  const paredes = previa ? previa.porNivel.reduce((s, n) => s + n.cadeias.reduce((q, c) => q + c.length, 0), 0) : 0;
  const nota = massa ? notaDaFaceInclinada(servicoMassa().avisos(p), massa.id) : null;
  const nomeDoNivel = (id: Id): string => p.levels.find((l) => l.id === id)?.name ?? id;

  const alternarNivel = (id: Id): void => {
    setErro('');
    setNiveis((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : niveisDoProjeto.map((l) => l.id).filter((x) => x === id || atual.includes(x))));
  };

  const gerar = (): void => {
    if (!massa || !previa || motivo !== null) return;
    const cadeias: CadeiaDerivadaParedes[] = previa.porNivel.flatMap((n) =>
      n.cadeias.map((pontos) => ({ nivelId: n.nivelId, pontos, topoNivelId: n.topoNivelId, altura: n.altura })),
    );
    if (cadeias.length === 0) {
      setErro(t('ui_mw_none'));
      return;
    }
    try {
      editor.store.exec(comandoDerivarParedes(p, { massaId: massa.id, typeId, niveis, cadeias }, lang), 'ui_mw_undo', lang);
      close();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const aviso = erro || (motivo ? t(motivo) : previa === null ? t('ui_mw_no_kernel') : '');
  const pode = motivo === null && previa !== null && paredes > 0;

  return (
    <Dialog
      title={t('ui_mw_title')}
      sub={t('ui_mw_sub')}
      size="mid"
      onClose={close}
      footer={
        <>
          <span aria-live="polite" style={{ color: 'var(--fg-soft)' }}>{aviso}</span>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('ui_mw_btn_cancel')}</button>
          <button className="btn primary" onClick={gerar} disabled={!pode}>{t('ui_mw_btn_gerar')}</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="hint">{t('ui_mw_levels_hint')}</div>
        <div role="group" aria-label={t('ui_mw_levels')} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {niveisDoProjeto.map((l) => (
            <Check key={l.id} id={`mw-nivel-${l.id}`} checked={niveis.includes(l.id)} onChange={() => alternarNivel(l.id)}>
              {l.name}
            </Check>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="mw-tipo-id">{t('ui_mw_tipo')}</label>
          <select
            id="mw-tipo-id"
            className="input"
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setErro('');
            }}
          >
            {tipos.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label htmlFor="mw-tol">{t('ui_mw_tol')}</label>
          <NumField
            id="mw-tol"
            value={tolerancia}
            quantity="length"
            width={72}
            onCommit={(v) => {
              setErro('');
              setTolerancia(v);
            }}
          />
          <label htmlFor="mw-min">{t('ui_mw_min')}</label>
          <NumField
            id="mw-min"
            value={segmentoMinimo}
            quantity="length"
            width={72}
            onCommit={(v) => {
              setErro('');
              setSegmentoMinimo(v);
            }}
          />
        </div>

        {previa ? (
          <div className="hint">
            {t('ui_mw_preview', { n: paredes, m: previa.porNivel.length })}
            {previa.semFatia.length > 0 ? ` · ${t('ui_mw_skipped', { niveis: previa.semFatia.map(nomeDoNivel).join(', ') })}` : ''}
            {previa.semAltura.length > 0 ? ` · ${t('ui_mw_zero', { niveis: previa.semAltura.map(nomeDoNivel).join(', ') })}` : ''}
          </div>
        ) : null}
        {nota ? <div className="hint">{t(nota)}</div> : null}
      </div>
    </Dialog>
  );
}
