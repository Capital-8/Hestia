import { useEffect, useState, type ReactElement } from 'react';
import {
  DIM_FAMILY_PADRAO,
  areaPlanOf,
  dimensionFamiliesOf,
  dimensionFormatStyle,
  dimensionStyleFor,
  dimensionStyleOf,
  formatDimension,
  levelDimensions,
  levelTexts,
  planAnnotationsOf,
  sectionAnnotationsOf,
  type AngularDimension,
  type AngularDimensionSide,
  type AnnotationCommand,
  type DetailLine,
  type DetailRegion,
  type Dimension,
  type ElementTag,
  type Id,
  type Project,
  type TextNote,
} from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { resolveAngularDimension } from '@hestia/engine';
import { useUi } from '../editor/state.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useUnits } from './useUnits.ts';
import { DimensionProps } from './DimensionProps.tsx';

/** Cota, texto, detalhe ou etiqueta selecionado (decisão 0019); null se a seleção não é uma anotação. */
export interface NotaSelecionada {
  dim?: Dimension;
  text?: TextNote;
  line?: DetailLine;
  region?: DetailRegion;
  tag?: ElementTag;
  /**
   * Anotação da vista de corte/elevação: o par gravado é `(t,z)` e as referências de parede da planta não valem. O painel
   * usa isto para medir/formatar sem resolver `refs`.
   */
  section?: boolean;
}

/**
 * Anotação selecionada na vista. Com `sectionId` procura nas anotações da vista de corte/elevação; com `planId`, só nas da
 * planta de área; sem eles, no nível (planta de piso). Um id de elemento nunca vira anotação.
 */
export function selectedNote(p: Project, levelId: Id, ids: Id[], planId?: Id | null, sectionId?: Id | null): NotaSelecionada | null {
  if (ids.length !== 1) return null;
  const id = ids[0]!;
  if (sectionId) {
    const a = sectionAnnotationsOf(p.views.find((v) => v.id === sectionId));
    const dim = a.dimensions.find((d) => d.id === id);
    if (dim) return { dim, section: true };
    const text = a.texts.find((t) => t.id === id);
    if (text) return { text, section: true };
    const line = a.detailLines.find((x) => x.id === id);
    if (line) return { line, section: true };
    const region = a.detailRegions.find((x) => x.id === id);
    if (region) return { region, section: true };
    const tag = a.tags.find((x) => x.id === id);
    return tag ? { tag, section: true } : null;
  }
  if (planId) {
    const plan = areaPlanOf(p, planId);
    if (!plan) return null;
    const a = planAnnotationsOf(plan);
    const dim = a.dimensions.find((d) => d.id === id);
    if (dim) return { dim };
    const text = a.texts.find((t) => t.id === id);
    if (text) return { text };
    const line = a.detailLines.find((x) => x.id === id);
    if (line) return { line };
    const region = a.detailRegions.find((x) => x.id === id);
    if (region) return { region };
    const tag = a.tags.find((x) => x.id === id);
    return tag ? { tag } : null;
  }
  const dim = levelDimensions(p, levelId).find((d) => d.id === id);
  if (dim) return { dim };
  const text = levelTexts(p, levelId).find((t) => t.id === id);
  if (text) return { text };
  const level = p.levels.find((l) => l.id === levelId);
  const line = level?.detailLines?.find((x) => x.id === id);
  if (line) return { line };
  const region = level?.detailRegions?.find((x) => x.id === id);
  if (region) return { region };
  const tag = level?.tags?.find((x) => x.id === id);
  return tag ? { tag } : null;
}

/**
 * Comando de anotação com o dono da vista: `sectionId` (corte/elevação) tem prioridade, depois `planId` (planta de área);
 * sem nenhum, a anotação mora no nível. Exportado para os testes conferirem o destino sem depender do DOM.
 */
export function comVista<T extends AnnotationCommand>(c: T, planId?: Id | null, sectionId?: Id | null): T {
  const withPlan = planId ? ({ ...c, planId } as T) : c;
  return sectionId ? ({ ...withPlan, sectionId } as T) : withPlan;
}

/** Nome antigo de `comVista` (os testes e a interface da planta de área usavam este). */
export const comPlanoDaVista = comVista;

/**
 * Grava a mudança de um texto na vista. `sectionId` = corte/elevação; `planId` = planta de área; nenhum = nível.
 * Devolve nada e lança o erro do modelo (a UI o mostra na barra de estado).
 */
export function updateTextIn(store: { exec(c: AnnotationCommand, label?: string): void }, levelId: Id, id: Id, patch: Partial<Omit<TextNote, 'id'>>, planId?: Id | null, sectionId?: Id | null): void {
  store.exec(comVista({ type: 'updateText', levelId, id, patch }, planId, sectionId));
}

/** Grava a mudança de uma anotação; recusa do modelo vai para a barra de estado. */
function edit(run: () => void): void {
  try {
    run();
  } catch (e) {
    useUi.setState({ status: e instanceof Error ? e.message : 'Não foi possível alterar a anotação.' });
  }
}

/** Área de texto que aceita `\n` (o Enter quebra a linha; Ctrl+Enter ou sair do campo grava). */
function TextAreaField({ id, value, onCommit }: { id?: string; value: string; onCommit: (v: string) => void }): ReactElement {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <textarea
      id={id}
      className="input wide"
      rows={3}
      value={text}
      style={{ resize: 'vertical', minHeight: 52, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.target as HTMLTextAreaElement).blur();
        e.stopPropagation();
      }}
    />
  );
}

/**
 * Mudança de `angular` ao trocar o lado (Menor/Maior/Volta). A volta complementa o lado atual (2π − valor) e guarda
 * em `base` qual lado ela complementa, para voltar sem perder a referência. Só `to`/`value`/`side`/`base` mudam:
 * as referências de parede ficam intactas e nenhuma parede se move.
 */
export function angularSidePatch(a: AngularDimension, side: AngularDimensionSide): Partial<AngularDimension> {
  if (side === a.side) return {};
  const flip = (v: { x: number; y: number }): { x: number; y: number } => ({ x: -v.x, y: -v.y });
  if (side === 'reflex') {
    // "Maior (externo)" é a volta que complementa o suplementar: 360° − (180° − interno) = 180° + interno.
    const to = a.side === 'major' ? a.to : a.side === 'reflex' ? a.to : flip(a.to);
    const majorValue = a.side === 'major' ? a.value : a.side === 'reflex' ? Math.PI * 2 - a.value : Math.PI - a.value;
    return { side, base: 'major', to, value: Math.PI * 2 - majorValue };
  }
  if (a.side === 'reflex') {
    if (side === 'major') return { side, base: undefined, to: a.to, value: Math.PI * 2 - a.value };
    return { side, base: undefined, to: flip(a.to), value: a.value - Math.PI };
  }
  return { side, to: flip(a.to), value: Math.PI - a.value };
}

/** Propriedades da cota (valor só leitura, deslocamento da linha) e do texto (caixa, moldura, posição e estilo). */
export function AnnotationProps({ dim, text, line, region, tag, section, planId, sectionId }: NotaSelecionada & { planId?: Id | null; sectionId?: Id | null }): ReactElement {
  const p = useProject();
  const units = useUnits();
  const levelId = useUi((s) => s.levelId);
  const nota = (c: AnnotationCommand): void => editor.store.exec(comVista(c, planId, sectionId));
  const famíliasSalvas = dimensionFamiliesOf(p.settings);
  // A família `Padrão` (estilo global) sempre aparece: é a que vale para as cotas antigas, sem `familyId`.
  const familias = famíliasSalvas.some((f) => f.id === DIM_FAMILY_PADRAO)
    ? famíliasSalvas
    : [{ id: DIM_FAMILY_PADRAO, name: 'Padrão', ...dimensionStyleOf(p.settings) }, ...famíliasSalvas];
  const familiaAtual = (d: Dimension): Id => d.familyId ?? DIM_FAMILY_PADRAO;
  /** Linha "Família": troca a aparência da cota pela família escolhida (Padrão = estilo global do projeto). */
  const familiaRow = (d: Dimension): ReactElement => (
    <Row label="Família" htmlFor="p-dfamily">
      <select
        id="p-dfamily"
        className="select"
        value={familiaAtual(d)}
        onChange={(e) => {
          const id = e.target.value;
          edit(() => nota({ type: 'updateDimension', levelId, id: d.id, patch: { familyId: id === DIM_FAMILY_PADRAO ? undefined : id } }));
        }}
      >
        {familias.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    </Row>
  );
  if (dim) {
    if (dim.angular) {
      // No corte a cota angular não resolve referências de planta: usa a geometria gravada (mesma regra do desenho).
      const shown = section ? dim : resolveAngularDimension(p, levelId, dim);
      const a = shown.angular!;
      const valorAngular = formatDimension(shown, 0, units, dimensionFormatStyle(dimensionStyleFor(p.settings, dim)));
      const patchAngular = (patch: Partial<typeof a>): void => edit(() => nota({ type: 'updateDimension', levelId, id: dim.id, patch: { angular: { ...a, ...patch } } }));
      return (
        <Group title="Cota angular">
          <Row label="Valor"><span className="val">{valorAngular}</span></Row>
          {familiaRow(dim)}
          <Row label="Texto" htmlFor="p-dtext">
            <TextField id="p-dtext" value={dim.text ?? ''} placeholder={valorAngular} onCommit={(v) => edit(() => nota({ type: 'updateDimension', levelId, id: dim.id, patch: { text: v.trim() === '' ? undefined : v } }))} />
          </Row>
          <Row label="Lado"><select className="select" value={a.side} onChange={(e) => patchAngular(angularSidePatch(a, e.target.value as AngularDimensionSide))}><option value="minor">Menor (interno)</option><option value="reflex">Maior (externo/360°)</option>{a.side === 'major' && <option value="major">Maior (suplementar)</option>}</select></Row>
          <Row label="Raio" htmlFor="p-dradius"><NumField id="p-dradius" value={a.radius} decimals={2} quantity="length" min={0.01} onCommit={(v) => patchAngular({ radius: v })} /></Row>
          <Row label="Casas decimais"><select className="select" value={dim.precision ?? 2} onChange={(e) => edit(() => nota({ type: 'updateDimension', levelId, id: dim.id, patch: { precision: Number(e.target.value) as 0 | 1 | 2 | 3 } }))}><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></Row>
          <Row label="Altura do texto" htmlFor="p-dheight">{/* units-ok: altura em mm, como no campo da cota linear */}<NumField id="p-dheight" value={dim.textHeight ?? 2.5} decimals={1} unit="mm" min={0.5} onCommit={(v) => edit(() => nota({ type: 'updateDimension', levelId, id: dim.id, patch: { textHeight: v } }))} /></Row>
          <Row label="Marca"><select className="select" value={dim.tickStyle ?? 'slash'} onChange={(e) => edit(() => nota({ type: 'updateDimension', levelId, id: dim.id, patch: { tickStyle: e.target.value as Dimension['tickStyle'] } }))}><option value="slash">Traço</option><option value="arrow">Seta</option><option value="dot">Ponto</option></select></Row>
          <div className="prow"><span className="soft">A cota angular mede o encontro de duas referências e não move paredes. Texto vazio mostra o valor medido.</span></div>
        </Group>
      );
    }
    return <DimensionProps dim={dim} section={section} nota={nota} edit={edit} />;
  }
  if (line) return <Group title="Linha de detalhe"><Row label="Traço"><select className="select" value={line.style ?? 'solid'} onChange={(e) => edit(() => nota({ type: 'updateDetailLine', levelId, id: line.id, patch: { style: e.target.value as DetailLine['style'] } }))}><option value="solid">Contínuo</option><option value="dashed">Tracejado</option><option value="dotted">Pontilhado</option></select></Row></Group>;
  if (region) return <Group title="Região de detalhe"><Row label="Preenchimento"><input className="input" type="color" value={region.color ?? '#f5d782'} onChange={(e) => edit(() => nota({ type: 'updateDetailRegion', levelId, id: region.id, patch: { color: e.target.value, mask: false } }))} /></Row><Check id="p-region-mask" checked={region.mask === true} onChange={(v) => edit(() => nota({ type: 'updateDetailRegion', levelId, id: region.id, patch: { mask: v } }))}>Mascarar elementos</Check></Group>;
  if (tag) return <Group title="Etiqueta"><Row label="Informação"><select className="select" value={tag.property} onChange={(e) => edit(() => nota({ type: 'updateTag', levelId, id: tag.id, patch: { property: e.target.value as ElementTag['property'] } }))}><option value="type">Tipo</option><option value="name">Nome</option><option value="mark">Marca</option><option value="level">Nível</option><option value="width">Largura</option><option value="height">Altura</option></select></Row><Row label="Orientação"><select className="select" value={tag.orientation ?? 'horizontal'} onChange={(e) => edit(() => nota({ type: 'updateTag', levelId, id: tag.id, patch: { orientation: e.target.value as ElementTag['orientation'] } }))}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></Row><Check id="p-tag-leader" checked={tag.leader === true} onChange={(v) => edit(() => nota({ type: 'updateTag', levelId, id: tag.id, patch: { leader: v } }))}>Mostrar líder</Check></Group>;
  if (!text) return <></>;
  /** Grava uma mudança do texto na vista dona (corte/elevação, planta de área ou nível). */
  const notaTexto = (patch: Partial<Omit<TextNote, 'id'>>): void => edit(() => editor.store.exec(comVista({ type: 'updateText', levelId, id: text.id, patch }, planId, sectionId)));
  /** Centro da vista ativa: o texto passa a ser desenhado no ponto central do que está à vista. */
  const centralizar = (): void => {
    const v = editor.viewport();
    if (!v) {
      useUi.setState({ status: 'Abra a vista para centralizar o texto.' });
      return;
    }
    notaTexto({ at: { x: v.cx, y: v.cy } });
  };
  return (
    <Group title="Texto">
      <Row label="Conteúdo" htmlFor="p-ttext">
        <TextAreaField id="p-ttext" value={text.text} onCommit={(v) => notaTexto({ text: v })} />
      </Row>
      <Row label="Altura" htmlFor="p-theight">
        <NumField id="p-theight" value={text.height} decimals={1} unit="mm" min={0.5} onCommit={(v) => notaTexto({ height: v })} />
      </Row>
      <Row label="Largura da caixa" htmlFor="p-twidth">
        <NumField id="p-twidth" value={text.width ?? null} decimals={1} unit="mm" min={0.5} placeholder="Sem quebra" onClear={() => notaTexto({ width: undefined })} onCommit={(v) => notaTexto({ width: v })} />
      </Row>
      <Row label="Rotação" htmlFor="p-trot">
        <NumField id="p-trot" value={text.rotation} decimals={0} unit="°" onCommit={(v) => notaTexto({ rotation: v })} />
      </Row>
      <Row label="Moldura" htmlFor="p-tframe">
        <Check id="p-tframe" checked={text.frame === true} onChange={(v) => notaTexto({ frame: v })} />
      </Row>
      <Row label="Alinhamento"><select className="select" value={text.align ?? 'left'} onChange={(e) => notaTexto({ align: e.target.value as TextNote['align'] })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></Row>
      <Check id="p-tbold" checked={text.bold === true} onChange={(v) => notaTexto({ bold: v })}>Negrito</Check>
      <Check id="p-titalic" checked={text.italic === true} onChange={(v) => notaTexto({ italic: v })}>Itálico</Check>
      <Check id="p-tunderline" checked={text.underline === true} onChange={(v) => notaTexto({ underline: v })}>Sublinhado</Check>
      <Row label="Posição X" htmlFor="p-tx">
        <NumField id="p-tx" value={text.at.x} decimals={2} unit="m" onCommit={(v) => notaTexto({ at: { ...text.at, x: v } })} />
      </Row>
      <Row label="Posição Y" htmlFor="p-ty">
        <NumField id="p-ty" value={text.at.y} decimals={2} unit="m" onCommit={(v) => notaTexto({ at: { ...text.at, y: v } })} />
      </Row>
      <div className="prow"><span /><button type="button" className="btn small" title="Move a caixa para o centro da vista ativa" onClick={centralizar}>Centralizar no ponto</button></div>
    </Group>
  );
}
