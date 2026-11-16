import { useMemo, useState, type ReactElement } from 'react';
import { copiarSecoes, MASSA_LIMITES, type PerfilMassa, type SecaoMassa } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { NumField } from '../fields.tsx';
import { useFormat } from '../useUnits.ts';
import {
  adicionarSecao,
  alturaTotal,
  aplicarSecoes,
  caixaDaPrevia,
  contornosDaPilha,
  duplicarSecao,
  editarSecao,
  FORMAS,
  removerSecao,
  trocarForma,
  validacaoAoVivo,
  type Forma,
} from '../massSecoesForm.ts';
import { Dialog } from './Dialog.tsx';
import { FamilyActions, FamilyHint, FamilyReadout, FamilySection } from './familia/index.ts';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

/** Cor do contorno de cada seção na prévia: do azul (base) ao laranja (topo). */
const corDaSecao = (k: number, n: number): string => `hsl(${Math.round(215 - (175 * k) / Math.max(1, n - 1))} 65% 45%)`;

type CampoDim = 'raio' | 'rx' | 'ry' | 'lados';

/** Perfil com uma dimensão trocada (só o campo que existe na forma). */
function comDimensao(p: PerfilMassa, campo: CampoDim, v: number): PerfilMassa {
  if (p.forma === 'circulo' && campo === 'raio') return { ...p, raio: v };
  if (p.forma === 'elipse' && (campo === 'rx' || campo === 'ry')) return { ...p, [campo]: v };
  if (p.forma === 'poligono' && (campo === 'raio' || campo === 'lados')) return { ...p, [campo]: v };
  return p;
}

/** Linha de uma seção: z, forma, dimensões (1 ou 2 campos), rotação, escala, dx, dy e as ações da linha. */
function LinhaSecao({ i, s, total, onEdit, onForma, onDup, onRemove, podeDup }: {
  i: number;
  s: SecaoMassa;
  total: number;
  onEdit: (patch: Partial<SecaoMassa>) => void;
  onForma: (f: Forma) => void;
  onDup: () => void;
  onRemove: () => void;
  podeDup: boolean;
}): ReactElement {
  const { t } = useT();
  const id = (c: string): string => `ms-s${i}-${c}`;
  const dim = (campo: CampoDim, valor: number, opts: { quantity?: 'length'; decimals?: number } = { quantity: 'length' }): ReactElement => (
    <NumField id={id(campo)} value={valor} width={64} {...opts} onCommit={(v) => onEdit({ perfil: comDimensao(s.perfil, campo, v) })} />
  );
  const p = s.perfil;
  return (
    <tr>
      <th scope="row">{i + 1}</th>
      <td><NumField id={id('z')} value={s.z} quantity="length" width={64} onCommit={(v) => onEdit({ z: v })} /></td>
      <td>
        <select id={id('forma')} className="select" value={p.forma} aria-label={t('ui_ms_col_forma')} onChange={(e) => onForma(e.target.value as Forma)}>
          {FORMAS.map((f) => <option key={f} value={f}>{t(`ui_ms_perfil_${f}`)}</option>)}
        </select>
      </td>
      <td>{p.forma === 'circulo' || p.forma === 'poligono' ? dim('raio', p.raio) : p.forma === 'elipse' ? dim('rx', p.rx) : <span>{t('ui_ms_dim_pontos', { n: p.pontos.length })}</span>}</td>
      <td>{p.forma === 'elipse' ? dim('ry', p.ry) : p.forma === 'poligono' ? dim('lados', p.lados, { decimals: 0 }) : null}</td>
      <td><NumField id={id('rot')} value={s.rotacao} quantity="angle" width={64} onCommit={(v) => onEdit({ rotacao: v })} /></td>
      <td><NumField id={id('escala')} value={s.escala} decimals={3} width={56} onCommit={(v) => onEdit({ escala: v })} /></td>
      <td><NumField id={id('dx')} value={s.dx} quantity="length" width={64} onCommit={(v) => onEdit({ dx: v })} /></td>
      <td><NumField id={id('dy')} value={s.dy} quantity="length" width={64} onCommit={(v) => onEdit({ dy: v })} /></td>
      <td>
        <button type="button" className="btn small" id={id('dup')} disabled={!podeDup} title={t('ui_ms_btn_dup')} aria-label={`${t('ui_ms_btn_dup')} ${i + 1}`} onClick={onDup}>⧉</button>
        <button type="button" className="btn small danger" id={id('del')} disabled={total <= 2} title={t('ui_ms_btn_remove')} aria-label={`${t('ui_ms_btn_remove')} ${i + 1}`} onClick={onRemove}>✕</button>
      </td>
    </tr>
  );
}

/** Prévia ao vivo: planta das seções sobrepostas, cada uma com o seu contorno (y para cima). */
function PreviaPlanta({ secoes }: { secoes: readonly SecaoMassa[] }): ReactElement {
  const { t } = useT();
  const aneis = useMemo(() => contornosDaPilha(secoes), [secoes]);
  const c = caixaDaPrevia(aneis);
  const cruz = c.largura * 0.03;
  return (
    <div className="stt-preview">
      <svg viewBox={`${c.minX} ${-(c.minY + c.altura)} ${c.largura} ${c.altura}`} role="img" aria-label={t('ui_ms_preview_aria', { n: secoes.length })} style={{ maxWidth: 360, margin: '0 auto' }}>
        <g transform="scale(1,-1)" fill="none">
          <path d={`M${-cruz} 0H${cruz}M0 ${-cruz}V${cruz}`} stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.4} />
          {aneis.map((anel, k) => (anel.length >= 2
            ? <polygon key={k} points={anel.map((q) => `${Math.round(q.x * 1000) / 1000},${Math.round(q.y * 1000) / 1000}`).join(' ')} stroke={corDaSecao(k, aneis.length)} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            : null))}
        </g>
      </svg>
    </div>
  );
}

/**
 * Diálogo "Seções da massa" (ficha U1, A.6): uma linha por seção, adicionar, remover e duplicar, prévia em planta e
 * validação ao vivo com a mensagem do modelo. Trabalha num rascunho; "Aplicar" grava UM `setMassSecoes` (um passo de
 * desfazer) e só aceita pilha válida. Toda a lógica está em `massSecoesForm.ts`.
 */
export function MassSecoesDialog({ massaId }: { massaId: string }): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const fmt = useFormat();
  const massa = p.elements[massaId];
  const base = massa?.kind === 'mass' ? massa : null;
  const [secoes, setSecoes] = useState<SecaoMassa[]>(() => (base ? copiarSecoes(base.secoes) : []));
  const [recusa, setRecusa] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!base) {
    return (
      <Dialog title={t('ui_ms_dlg_title')} onClose={fechar} footer={<button className="btn primary" onClick={fechar}>{t('stt_ok')}</button>}>
        <FamilyHint warn role="alert">{t('ui_ms_missing')}</FamilyHint>
      </Dialog>
    );
  }

  const issue = validacaoAoVivo(base, secoes, lang);
  const mudou = JSON.stringify(secoes) !== JSON.stringify(base.secoes);
  const troca = (nova: SecaoMassa[] | null, motivo: string): void => {
    if (nova) {
      setSecoes(nova);
      setAviso(null);
    } else setAviso(motivo);
    setRecusa(null);
  };
  const aplicar = (): void => {
    if (issue) return setRecusa(issue);
    const r = aplicarSecoes(editor.store, base.id, secoes, t('ui_ms_undo_secoes'), lang);
    if (r.ok) fechar();
    else setRecusa(r.erro);
  };
  const cheio = secoes.length >= MASSA_LIMITES.secoes;
  const mensagem = recusa ?? issue;

  return (
    <Dialog
      title={t('ui_ms_dlg_title')}
      sub={base.name}
      size="wide"
      onClose={fechar}
      onSubmit={aplicar}
      footer={
        <>
          <span className="fam-grow" />
          <button className="btn" onClick={fechar}>{t('stt_cancel')}</button>
          <button className="btn primary" id="ms-aplicar" onClick={aplicar} disabled={issue !== null || !mudou} aria-disabled={issue !== null || !mudou} title={issue ?? undefined}>{t('stt_apply')}</button>
        </>
      }
    >
      <div className="fam-form">
        <FamilySection title={t('ui_ms_dlg_secoes')} collapsible={false}>
          <table className="layers" aria-label={t('ui_ms_dlg_secoes')}>
            <thead>
              <tr>
                <th>#</th>
                <th>{t('ui_ms_col_z')}</th>
                <th>{t('ui_ms_col_forma')}</th>
                <th colSpan={2}>{t('ui_ms_col_dim')}</th>
                <th>{t('ui_ms_col_rot')}</th>
                <th>{t('ui_ms_col_escala')}</th>
                <th>dx</th>
                <th>dy</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {secoes.map((s, i) => (
                <LinhaSecao
                  key={i}
                  i={i}
                  s={s}
                  total={secoes.length}
                  podeDup={duplicarSecao(secoes, i) !== null}
                  onEdit={(patch) => troca(editarSecao(secoes, i, patch), '')}
                  onForma={(f) => troca(editarSecao(secoes, i, { perfil: trocarForma(s.perfil, f) }), '')}
                  onDup={() => troca(duplicarSecao(secoes, i), t('ui_ms_dup_apertado'))}
                  onRemove={() => troca(removerSecao(secoes, i), t('ui_ms_limite_min', { min: 2 }))}
                />
              ))}
            </tbody>
          </table>
          <FamilyActions>
            <button type="button" className="btn small" id="ms-add" disabled={cheio} title={cheio ? t('ui_ms_limite_max', { max: MASSA_LIMITES.secoes }) : undefined} onClick={() => troca(adicionarSecao(secoes), t('ui_ms_limite_max', { max: MASSA_LIMITES.secoes }))}>{t('ui_ms_btn_add')}</button>
          </FamilyActions>
          {aviso && <FamilyHint tone="strong" role="status">{aviso}</FamilyHint>}
          {mensagem ? <FamilyHint warn role="alert">{mensagem}</FamilyHint> : <FamilyHint role="status">{t('ui_ms_valida')}</FamilyHint>}
          <FamilyReadout label={t('ui_ms_count')} value={`${secoes.length} / ${MASSA_LIMITES.secoes}`} />
          <FamilyReadout label={t('ui_ms_height')} value={fmt('length', alturaTotal({ secoes }))} />
        </FamilySection>
        <FamilySection title={t('ui_ms_preview')} collapsible={false}>
          <PreviaPlanta secoes={secoes} />
        </FamilySection>
      </div>
    </Dialog>
  );
}
