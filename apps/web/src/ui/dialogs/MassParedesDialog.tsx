import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { derivarParedesInclinadasDaMassa, servicoMassa, DESVIO_PAREDE_PADRAO, PASSOS_MAXIMOS_PADRAO, SEGMENTO_MINIMO_PADRAO, TOLERANCIA_PAREDE_PADRAO, type ModoParedesTorcidas } from '@hestia/engine';
import { aberturasDasParedesDaMassa, comandoDerivarParedes, formatQuantity, type CadeiaDerivadaParedes, type Command, type Id } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { Check, NumField } from '../fields.tsx';
import { useUnits } from '../useUnits.ts';
import { Dialog } from './Dialog.tsx';
import { massaUnicaSelecionada, niveisDaMassa } from './massPisosForm.ts';
import { FACHADAS, avisosDaDerivacao, motivoNaoGerarParedes, opcoesDeTipoParede, tiposPorFachada, type Fachada } from './massParedesForm.ts';

/**
 * Diálogo "Paredes da massa" (ficha D2 e frente massa-paredes-torcidas, plano de massa A.6 e A.7): para a massa selecionada, uma cadeia de paredes por
 * nível marcado, pelo contorno simplificado da massa; onde a massa torce ou muda de contorno, as paredes são RETAS INCLINADAS por passo de altura
 * (`derivarParedesInclinadasDaMassa`), de alvenaria ou de cortina de vidro, com um tipo para todas ou um por fachada. A prévia (paredes, passos,
 * desvio máximo medido e avisos) vem do motor (kernel); sem kernel o diálogo diz isso e Gerar fica desligado. Gerar é UMA transação (um Ctrl+Z desfaz
 * tudo) e rodar de novo substitui as paredes geradas antes pela mesma massa nos níveis marcados (política: gerar uma vez e travar; as aberturas
 * hospedadas nelas saem junto, com confirmação). A face externa da parede fica na superfície da massa (`finishExterior`).
 */
export function MassParedesDialog(): ReactElement {
  const p = useProject();
  const { t, lang } = useT();
  const unidades = useUnits();
  const selecao = useUi((s) => s.selection);
  const massa = massaUnicaSelecionada(p, selecao);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  // O kernel pode ficar pronto depois de abrir o diálogo: a prévia é refeita quando isso acontece (como nos pisos).
  const [tick, refazer] = useState(0);
  useEffect(() => servicoMassa().aoMudarPronto(() => refazer((n) => n + 1)), []);

  const [niveis, setNiveis] = useState<Id[]>(() => (massa ? niveisDaMassa(p, massa) : []));
  const opcoes = useMemo(() => opcoesDeTipoParede(p, lang), [p, lang]);
  const [typeId, setTypeId] = useState<Id>(() => opcoes[0]?.id ?? '');
  const [porFachada, setPorFachada] = useState(false);
  const [tipoFachada, setTipoFachada] = useState<Record<Fachada, Id>>(() => ({ n: '', l: '', s: '', o: '' }));
  const [modo, setModo] = useState<ModoParedesTorcidas>('porTolerancia');
  const [desvioMax, setDesvioMax] = useState<number>(DESVIO_PAREDE_PADRAO);
  const [maxPassos, setMaxPassos] = useState<number>(PASSOS_MAXIMOS_PADRAO);
  const [tolerancia, setTolerancia] = useState<number>(TOLERANCIA_PAREDE_PADRAO);
  const [segmentoMinimo, setSegmentoMinimo] = useState<number>(SEGMENTO_MINIMO_PADRAO);
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const tipoDe = (id: Id): (typeof opcoes)[number] | undefined => opcoes.find((o) => o.id === id);
  const tipoDaFachada = (f: Fachada): Id => tipoFachada[f] || typeId;
  const usados: Id[] = porFachada ? FACHADAS.map(tipoDaFachada) : [typeId];
  const usaCortina = usados.some((id) => tipoDe(id)?.cortina);

  const niveisDoProjeto = useMemo(() => [...p.levels].sort((a, b) => a.elevation - b.elevation), [p.levels]);
  const motivo = motivoNaoGerarParedes({ niveis, typeId, tolerancia, segmentoMinimo, ...(modo === 'porTolerancia' ? { desvioMax, maxPassos } : {}) }, massa !== null);
  // A prévia refaz-se quando o kernel fica pronto (`refazer`, que entra nas dependências) e só roda de novo se algo do contorno mudar.
  const previa = useMemo(
    () => (massa && motivo === null ? derivarParedesInclinadasDaMassa(p, massa.id, niveis, { tolerancia, segmentoMinimo, modo, desvioMax, maxPassosPorNivel: maxPassos }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p, massa?.id, motivo, niveis, tolerancia, segmentoMinimo, modo, desvioMax, maxPassos, tick],
  );
  const paredes = previa?.nParedes ?? 0;
  const substituidas = massa ? aberturasDasParedesDaMassa(p, massa.id, niveis).length : 0;
  const avisos = previa ? avisosDaDerivacao(previa, usaCortina, modo, substituidas) : [];
  const nomeDoNivel = (id: Id): string => p.levels.find((l) => l.id === id)?.name ?? id;

  const alternarNivel = (id: Id): void => {
    setErro('');
    setConfirmando(false);
    setNiveis((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : niveisDoProjeto.map((l) => l.id).filter((x) => x === id || atual.includes(x))));
  };

  const gerar = (): void => {
    if (!massa || !previa || motivo !== null) return;
    if (substituidas > 0 && !confirmando) {
      setConfirmando(true);
      return;
    }
    const cadeias: CadeiaDerivadaParedes[] = previa.porNivel.flatMap((n) =>
      n.passos.flatMap((ps) =>
        ps.cadeias.map((c) => ({
          nivelId: n.nivelId,
          pontos: c.pontos,
          tilts: c.tilts,
          baseOffset: ps.baseOffset,
          topoNivelId: ps.topoNivelId,
          altura: ps.altura,
          ...(porFachada ? { typeIds: tiposPorFachada(c.pontos, { n: tipoDaFachada('n'), l: tipoDaFachada('l'), s: tipoDaFachada('s'), o: tipoDaFachada('o') }) } : {}),
        })),
      ),
    );
    if (cadeias.length === 0) {
      setErro(t('ui_mw_none'));
      return;
    }
    try {
      // Modelos de cortina de vidro ainda fora do projeto entram na MESMA transação (um Ctrl+Z desfaz tudo).
      const novos = [...new Set(usados)].map((id) => tipoDe(id)?.novo).filter((x): x is NonNullable<typeof x> => !!x);
      const comTipos = novos.length === 0 ? p : { ...p, wallTypes: { ...p.wallTypes, ...Object.fromEntries(novos.map((x) => [x.id, x])) } };
      const cmd = comandoDerivarParedes(comTipos, { massaId: massa.id, typeId, niveis, cadeias, locationLine: 'finishExterior' }, lang);
      const tudo: Command = novos.length === 0 ? cmd : { type: 'batch', commands: [...novos.map((wallType) => ({ type: 'upsertWallType' as const, wallType })), cmd] };
      editor.store.exec(tudo, 'ui_mw_undo', lang);
      close();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const aviso = erro || (motivo ? t(motivo) : previa === null ? t('ui_mw_no_kernel') : '');
  const mudarTipo = (id: Id): void => {
    setTypeId(id);
    setErro('');
    setConfirmando(false);
    // Cortina de vidro pede um passo por nível: faixas baixas não comportam a grade (o diálogo avisa se o usuário voltar a dividir).
    if (tipoDe(id)?.cortina) setModo('porNivel');
  };
  const seletorDeTipo = (id: string, valor: Id, onChange: (v: Id) => void): ReactElement => (
    <select id={id} className="input" value={valor} onChange={(e) => onChange(e.target.value)}>
      <optgroup label={t('ui_mw_grupo_projeto')}>
        {opcoes.filter((x) => x.grupo === 'projeto').map((x) => (
          <option key={x.id} value={x.id}>{x.name}</option>
        ))}
      </optgroup>
      {opcoes.some((x) => x.grupo === 'cortina') ? (
        <optgroup label={t('ui_mw_grupo_cortina')}>
          {opcoes.filter((x) => x.grupo === 'cortina').map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
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
          <button className="btn primary" onClick={gerar} disabled={!pode}>{confirmando ? t('ui_mw_btn_confirmar') : t('ui_mw_btn_gerar')}</button>
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
          {seletorDeTipo('mw-tipo-id', typeId, mudarTipo)}
          <Check id="mw-por-fachada" checked={porFachada} onChange={() => setPorFachada((v) => !v)}>
            {t('ui_mw_por_fachada')}
          </Check>
        </div>
        {porFachada ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
            {FACHADAS.map((f) => (
              <span key={f} style={{ display: 'contents' }}>
                <label htmlFor={`mw-fachada-${f}`}>{t(`ui_mw_fachada_${f}` as 'ui_mw_fachada_n')}</label>
                {seletorDeTipo(`mw-fachada-${f}`, tipoDaFachada(f), (v) => {
                  setTipoFachada((a) => ({ ...a, [f]: v }));
                  if (tipoDe(v)?.cortina) setModo('porNivel');
                  setConfirmando(false);
                })}
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="mw-modo">{t('ui_mw_modo')}</label>
          <select id="mw-modo" className="input" value={modo} onChange={(e) => setModo(e.target.value as ModoParedesTorcidas)}>
            <option value="porNivel">{t('ui_mw_modo_nivel')}</option>
            <option value="porTolerancia">{t('ui_mw_modo_tol')}</option>
          </select>
          {modo === 'porTolerancia' ? (
            <>
              <label htmlFor="mw-desvio">{t('ui_mw_desvio')}</label>
              <NumField id="mw-desvio" value={desvioMax} quantity="length" width={72} onCommit={(v) => { setErro(''); setDesvioMax(v); }} />
              <label htmlFor="mw-passos">{t('ui_mw_passos')}</label>
              <NumField id="mw-passos" value={maxPassos} decimals={0} min={1} max={64} width={56} onCommit={(v) => { setErro(''); setMaxPassos(Math.round(v)); }} />
            </>
          ) : null}
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
            {t('ui_mw_preview_incl', { n: paredes, p: previa.nPassos, m: previa.porNivel.length, i: previa.nInclinadas, d: formatQuantity(unidades, 'smallLength', previa.desvioMax) })}
            {previa.semFatia.length > 0 ? ` · ${t('ui_mw_skipped', { niveis: previa.semFatia.map(nomeDoNivel).join(', ') })}` : ''}
            {previa.semAltura.length > 0 ? ` · ${t('ui_mw_zero', { niveis: previa.semAltura.map(nomeDoNivel).join(', ') })}` : ''}
          </div>
        ) : null}
        {avisos.map((a) => (
          <div key={a.chave} className="hint" role="status" style={{ color: 'var(--warn, var(--fg-soft))' }}>{t(a.chave as 'ui_mw_warn_limite', a.args)}</div>
        ))}
        <div className="hint">{t('ui_mw_note_travar')}</div>
      </div>
    </Dialog>
  );
}
