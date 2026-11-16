import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { derivarContornosPisosDaMassa, servicoMassa, TOLERANCIA_PISO_PADRAO } from '@hestia/engine';
import { comandoDerivarPisos, newId, type Id } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { Check, NumField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { massaUnicaSelecionada, motivoNaoGerar, niveisDaMassa, tiposDoTipo, type TipoPisoMassa } from './massPisosForm.ts';

/**
 * Diálogo "Pisos da massa" (ficha D1, plano de massa A.6 e A.7): para a massa selecionada, um piso (ou laje) por nível marcado, com o
 * contorno pela união das cópias e simplificado. A prévia vem do motor (kernel); sem kernel o diálogo diz isso e Gerar fica desligado. Gerar
 * é UMA transação (um Ctrl+Z desfaz tudo) e rodar de novo substitui os gerados antes pela mesma massa e nível.
 */
export function MassPisosDialog(): ReactElement {
  const p = useProject();
  const { t, lang } = useT();
  const selecao = useUi((s) => s.selection);
  const massa = massaUnicaSelecionada(p, selecao);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  // O kernel pode ficar pronto depois de abrir o diálogo: a prévia é refeita quando isso acontece (como na tabela da massa).
  const [, refazer] = useState(0);
  useEffect(() => servicoMassa().aoMudarPronto(() => refazer((n) => n + 1)), []);

  const [niveis, setNiveis] = useState<Id[]>(() => (massa ? niveisDaMassa(p, massa) : []));
  const [tipo, setTipo] = useState<TipoPisoMassa>('piso');
  const [typeId, setTypeId] = useState<Id>(() => tiposDoTipo(p, 'piso')[0]?.id ?? '');
  const [tolerancia, setTolerancia] = useState<number>(TOLERANCIA_PISO_PADRAO);
  const [erro, setErro] = useState('');

  const niveisDoProjeto = useMemo(() => [...p.levels].sort((a, b) => a.elevation - b.elevation), [p.levels]);
  const tipos = tiposDoTipo(p, tipo);
  const motivo = motivoNaoGerar({ niveis, tipo, typeId, tolerancia }, massa !== null);
  // Sem memo: o serviço já guarda as fatias por projeto, e a prévia precisa refazer-se quando o kernel fica pronto (`refazer`).
  const previa = massa && motivo !== 'ui_mp_bad_tol' ? derivarContornosPisosDaMassa(p, massa.id, niveis, tolerancia, servicoMassa()) : null;
  const contornos = previa ? previa.porNivel.reduce((s, n) => s + n.poligonos.length, 0) : 0;
  const nomeDoNivel = (id: Id): string => p.levels.find((l) => l.id === id)?.name ?? id;

  const alternarNivel = (id: Id): void => {
    setErro('');
    setNiveis((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : niveisDoProjeto.map((l) => l.id).filter((x) => x === id || atual.includes(x))));
  };

  const trocarTipo = (novo: TipoPisoMassa): void => {
    setTipo(novo);
    setTypeId(tiposDoTipo(p, novo)[0]?.id ?? '');
    setErro('');
  };

  const gerar = (): void => {
    if (!massa || !previa || motivo !== null) return;
    const lista = previa.porNivel.flatMap((n) =>
      n.poligonos.map((poli) => ({ id: newId(tipo === 'piso' ? 'fl' : 'sl'), nivelId: n.nivelId, boundary: poli[0]!, holes: poli.slice(1) })),
    );
    if (lista.length === 0) {
      setErro(t('ui_mp_none'));
      return;
    }
    try {
      editor.store.exec(comandoDerivarPisos(p, { massaId: massa.id, tipo, typeId, contornos: lista }, lang), 'ui_mp_undo', lang);
      close();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const aviso = erro || (motivo ? t(motivo) : previa === null ? t('ui_mp_no_kernel') : '');
  const pode = motivo === null && previa !== null && contornos > 0;

  return (
    <Dialog
      title={t('ui_mp_title')}
      sub={t('ui_mp_sub')}
      size="mid"
      onClose={close}
      footer={
        <>
          <span aria-live="polite" style={{ color: 'var(--fg-soft)' }}>{aviso}</span>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('ui_mp_btn_cancel')}</button>
          <button className="btn primary" onClick={gerar} disabled={!pode}>{t('ui_mp_btn_gerar')}</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="hint">{t('ui_mp_levels_hint')}</div>
        <div role="group" aria-label={t('ui_mp_levels')} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {niveisDoProjeto.map((l) => (
            <Check key={l.id} id={`mp-nivel-${l.id}`} checked={niveis.includes(l.id)} onChange={() => alternarNivel(l.id)}>
              {l.name}
            </Check>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="mp-tipo-gera">{t('ui_mp_kind')}</label>
          <select id="mp-tipo-gera" className="input" value={tipo} onChange={(e) => trocarTipo(e.target.value as TipoPisoMassa)}>
            <option value="piso">{t('ui_mp_kind_piso')}</option>
            <option value="laje">{t('ui_mp_kind_laje')}</option>
          </select>
          <label htmlFor="mp-tipo-id">{t('ui_mp_tipo')}</label>
          <select id="mp-tipo-id" className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {tipos.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label htmlFor="mp-tol">{t('ui_mp_tol')}</label>
          <NumField
            id="mp-tol"
            value={tolerancia}
            quantity="length"
            width={72}
            onCommit={(v) => {
              setErro('');
              setTolerancia(v);
            }}
          />
        </div>

        {previa ? (
          <div className="hint">
            {t('ui_mp_preview', { n: contornos, m: previa.porNivel.length })}
            {previa.semFatia.length > 0 ? ` · ${t('ui_mp_skipped', { niveis: previa.semFatia.map(nomeDoNivel).join(', ') })}` : ''}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
