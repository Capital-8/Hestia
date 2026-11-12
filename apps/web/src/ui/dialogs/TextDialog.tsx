import { useState, useSyncExternalStore, type ReactElement } from 'react';
import type { Vec2 } from '@hestia/geom';
import { newId, type AnnotationCommand, type Id, type TextNote } from '@hestia/model';
import { levelFrameBox } from '@hestia/render';
import { useT } from '../../editor/i18n.ts';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { areaViewIdAtivo, planViewIdAtivo } from '../../editor/vistaAtiva.ts';
import { Check, NumField, Row } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';

/**
 * Diálogo "Caixa de texto": cria um `TextNote` com largura de quebra (`width`), moldura (`frame`), rotação e
 * alinhamento no centro da vista ativa. Na planta de área o texto vai para `plan.annotations`; na de piso, para o nível.
 *
 * O aberto/fechado fica num store próprio (e não em `useUi.dialog`) para não alargar `DialogKind` fora desta frente.
 */
let aberto = false;
const ouvintes = new Set<() => void>();
const avisar = (): void => { for (const f of ouvintes) f(); };

/** Abre a caixa de texto (ação da aba Anotar / painel da ferramenta Texto). */
export function abrirCaixaDeTexto(): void {
  if (aberto) return;
  aberto = true;
  avisar();
}

/** Fecha a caixa de texto sem criar nada. */
export function fecharCaixaDeTexto(): void {
  if (!aberto) return;
  aberto = false;
  avisar();
}

function inscrever(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

const lerAberto = (): boolean => aberto;

/** Estado de abertura do diálogo (para o `App` montá-lo sem mexer no `DialogKind`). */
export function useCaixaDeTextoAberta(): boolean {
  return useSyncExternalStore(inscrever, lerAberto, lerAberto);
}

/** Vista onde a caixa nasce: o nível ativo e, na planta de área, a planta dona das anotações. */
export interface EscopoCaixaTexto {
  levelId: Id;
  /** Planta de área ativa; ausente/null = anotação do nível (planta de piso). */
  planId?: Id | null;
  /** Vista de planta ativa (piso, cobertura ou área): a caixa nasce nela. Tem precedência sobre `planId`. */
  viewId?: Id | null;
}

/** Conteúdo e forma pedidos no diálogo. */
export interface EntradaCaixaTexto {
  text: string;
  /** Altura em mm de papel. */
  height: number;
  /** Largura da caixa em mm de papel; ausente/0 mantém o texto em uma linha por parágrafo. */
  width?: number | null;
  frame: boolean;
  /** Rotação em graus (anti-horária, como na planta). */
  rotation: number;
  align?: TextNote['align'];
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/**
 * Comando puro da caixa de texto (testável sem DOM): texto vazio devolve null; com `planId`, o comando é da planta de
 * área. O `at` é o centro da caixa (o render desenha o texto centrado no ponto).
 */
export function comandoCaixaDeTexto(escopo: EscopoCaixaTexto, centro: Vec2, entrada: EntradaCaixaTexto): AnnotationCommand | null {
  const conteudo = entrada.text.trim();
  if (!conteudo) return null;
  const text: TextNote = {
    id: newId('txt'),
    at: centro,
    text: conteudo,
    height: entrada.height,
    rotation: entrada.rotation,
    ...(entrada.align ? { align: entrada.align } : {}),
    ...(entrada.width !== undefined && entrada.width !== null && entrada.width > 0 ? { width: entrada.width } : {}),
    ...(entrada.frame ? { frame: true } : {}),
    ...(entrada.bold ? { bold: true } : {}),
    ...(entrada.italic ? { italic: true } : {}),
    ...(entrada.underline ? { underline: true } : {}),
  };
  return { type: 'addText', levelId: escopo.levelId, ...(escopo.viewId ? { viewId: escopo.viewId } : escopo.planId ? { planId: escopo.planId } : {}), text };
}

/** Centro da vista ativa em coordenadas do modelo: o centro do viewport ou, sem ele, o centro da caixa do nível. */
export function centroDaVista(
  v: { cx: number; cy: number } | null,
  caixa: { minX: number; minY: number; maxX: number; maxY: number } | null,
): Vec2 {
  if (v) return { x: v.cx, y: v.cy };
  if (caixa) return { x: (caixa.minX + caixa.maxX) / 2, y: (caixa.minY + caixa.maxY) / 2 };
  return { x: 0, y: 0 };
}

function FormularioCaixaTexto(): ReactElement {
  const { t } = useT();
  const [texto, setTexto] = useState('');
  const [altura, setAltura] = useState(2.5);
  const [largura, setLargura] = useState<number | null>(null);
  const [moldura, setMoldura] = useState(false);
  const [rotacao, setRotacao] = useState(0);
  const [alinhamento, setAlinhamento] = useState<NonNullable<TextNote['align']>>('left');
  const [negrito, setNegrito] = useState(false);
  const [italico, setItalico] = useState(false);
  const [sublinhado, setSublinhado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const criar = (): void => {
    const st = useUi.getState();
    const viewId = planViewIdAtivo(st);
    const planId = areaViewIdAtivo(editor.project, st);
    const v = editor.viewport();
    const centro = centroDaVista(v ? { cx: v.cx, cy: v.cy } : null, levelFrameBox(editor.project, st.levelId));
    const cmd = comandoCaixaDeTexto({ levelId: st.levelId, viewId }, centro, {
      text: texto,
      height: altura,
      width: largura,
      frame: moldura,
      rotation: rotacao,
      align: alinhamento,
      bold: negrito,
      italic: italico,
      underline: sublinhado,
    });
    if (!cmd || cmd.type !== 'addText') {
      setErro(t('dlm_err_text_empty'));
      return;
    }
    try {
      editor.store.exec(cmd, t('dlm_undo_text_box'));
      useUi.setState({
        selection: [cmd.text.id],
        status: { key: planId ? 'dlm_status_text_created_area' : 'dlm_status_text_created_level' },
      });
      fecharCaixaDeTexto();
    } catch (e) {
      setErro(e instanceof Error ? e.message : t('dlm_err_create_text'));
    }
  };

  return (
    <Dialog
      title={t('dlm_text_box')}
      sub={t('dlm_text_box_sub')}
      onClose={fecharCaixaDeTexto}
      size="mid"
      footer={
        <>
          <button className="btn" onClick={fecharCaixaDeTexto}>{t('dlm_btn_cancel')}</button>
          <button className="btn primary" onClick={criar}>{t('dlm_btn_create_text')}</button>
        </>
      }
    >
      <Row label={t('dlm_content')} htmlFor="txt-conteudo">
        <textarea
          id="txt-conteudo"
          className="input wide"
          rows={6}
          autoFocus
          value={texto}
          placeholder={t('dlm_ph_text_content')}
          style={{ resize: 'vertical', minHeight: 110, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </Row>
      <Row label={t('col_height')} htmlFor="txt-altura">
        <NumField id="txt-altura" value={altura} decimals={1} unit="mm" min={0.5} strictRange onCommit={setAltura} />
      </Row>
      <Row label={t('dlm_box_width')} htmlFor="txt-largura">
        <NumField id="txt-largura" value={largura} decimals={1} unit="mm" min={0.5} strictRange placeholder={t('dlm_ph_no_wrap')} onClear={() => setLargura(null)} onCommit={setLargura} />
      </Row>
      <Row label={t('dlm_rotation')} htmlFor="txt-rotacao">
        <NumField id="txt-rotacao" value={rotacao} decimals={0} unit="°" onCommit={setRotacao} />
      </Row>
      <Row label={t('dlm_alignment')} htmlFor="txt-alinhamento">
        <select id="txt-alinhamento" className="select" value={alinhamento} onChange={(e) => setAlinhamento(e.target.value as NonNullable<TextNote['align']>)}>
          <option value="left">{t('dlm_align_left')}</option>
          <option value="center">{t('dlm_align_center')}</option>
          <option value="right">{t('dlm_align_right')}</option>
        </select>
      </Row>
      <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
        <Check id="txt-moldura" checked={moldura} onChange={setMoldura}>{t('dlm_draw_frame')}</Check>
        <Check id="txt-negrito" checked={negrito} onChange={setNegrito}>{t('dlm_fmt_bold')}</Check>
        <Check id="txt-italico" checked={italico} onChange={setItalico}>{t('dlm_fmt_italic')}</Check>
        <Check id="txt-sublinhado" checked={sublinhado} onChange={setSublinhado}>{t('dlm_fmt_underline')}</Check>
      </div>
      {erro ? <div className="vr-error" role="alert">{erro}</div> : null}
      <p className="hint" style={{ marginTop: 10 }}>
        {t('dlm_text_box_hint')}
      </p>
    </Dialog>
  );
}

/** Montado uma vez pelo `App`; aparece quando `abrirCaixaDeTexto()` é chamado. */
export function TextDialog(): ReactElement | null {
  const abertoAgora = useCaixaDeTextoAberta();
  return abertoAgora ? <FormularioCaixaTexto /> : null;
}
