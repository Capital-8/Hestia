import { useMemo, useState, type ReactElement } from 'react';
import {
  DIM_FAMILY_PADRAO,
  defaultDimensionFamilyIdOf,
  dimensionFamiliesOf,
  dimensionFamilyIssue,
  dimensionStyleOf,
  type DimensionFamily,
  type DimensionStyle,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';
import { Check, NumField, Row, TextField } from '../fields.tsx';
import {
  DIM_TICK_OPTIONS,
  PRECISION_OPTIONS,
  READ_CONVENTION_OPTIONS,
  STYLE_TEXT_MAX,
  TEXT_FIT_OPTIONS,
  TEXT_PLACEMENT_OPTIONS,
  UNIT_OPTIONS,
  fontOptions,
} from './dimensionStyleModel.ts';
import { DimensionStylePreview } from './dimensionStylePreview.tsx';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

/** Unidade de papel das medidas do estilo de cota (marcador, texto, folgas): não é medida do modelo. */
const PAPER_UNIT = 'mm';

/** Família implícita `Padrão` (o estilo global do projeto), para aparecer sempre na lista. */
function padraoFamily(): DimensionFamily {
  return { id: DIM_FAMILY_PADRAO, name: 'Padrão', ...dimensionStyleOf(editor.project.settings) };
}

const novaFamilia = (base: DimensionFamily | undefined, existentes: readonly DimensionFamily[]): DimensionFamily => {
  const usados = new Set(existentes.map((f) => f.name.toLocaleLowerCase('pt-BR')));
  const raiz = base ? `${base.name} (cópia)` : 'Nova família';
  let nome = raiz;
  let n = 1;
  while (usados.has(nome.toLocaleLowerCase('pt-BR'))) { n += 1; nome = base ? `${base.name} (cópia ${n})` : `Nova família ${n}`; }
  return { ...(base ?? { ...dimensionStyleOf(editor.project.settings) }), id: `fam_${Math.random().toString(36).slice(2, 10)}`, name: nome };
};

/**
 * "Famílias de cotas" (Revit: Dimension Types): lista de aparências nomeadas, com prévia ao vivo. Cada família é
 * autocontida (marcador, texto, folgas, leitura, formato); a `Padrão` é o estilo global do projeto, mantido compatível
 * com os projetos antigos. OK grava tudo num único passo de desfazer.
 */
export function DimensionFamiliesDialog(): ReactElement {
  const p = useProject();
  const salvas = useMemo(() => dimensionFamiliesOf(p.settings), [p.settings]);
  // A `Padrão` aparece sempre; as demais vêm das famílias gravadas (sem repetir a implícita).
  const inicial = useMemo(() => [padraoFamily(), ...salvas.filter((f) => f.id !== DIM_FAMILY_PADRAO)], [salvas]);
  const [drafts, setDrafts] = useState<DimensionFamily[]>(() => inicial);
  const [selecionada, setSelecionada] = useState<string>(() => defaultDimensionFamilyIdOf(p.settings));
  const [padrao, setPadrao] = useState<string>(() => defaultDimensionFamilyIdOf(p.settings));
  const [erro, setErro] = useState<string | null>(null);
  const atual = drafts.find((f) => f.id === selecionada) ?? drafts[0]!;

  const trocar = (patch: Partial<DimensionFamily>): void => {
    setDrafts((lista) => lista.map((f) => (f.id === atual.id ? { ...f, ...patch } : f)));
    setErro(null);
  };

  const aplicar = (): void => {
    // Valida todas: nome único, enums e faixas; recusa o conjunto inteiro (nada de gravar família quebrada).
    for (const f of drafts) {
      const issue = dimensionFamilyIssue(f, drafts.filter((o) => o.id !== f.id));
      if (issue) { setSelecionada(f.id); setErro(`${f.name || 'Família'}: ${issue}`); return; }
    }
    const originais = dimensionFamiliesOf(editor.project.settings);
    editor.store.transaction('Famílias de cotas', () => {
      for (const f of drafts) {
        const antes = originais.find((o) => o.id === f.id);
        const mudou = !antes || JSON.stringify(antes) !== JSON.stringify(f);
        if (!mudou) continue;
        editor.store.exec({ type: 'upsertDimensionFamily', family: f });
      }
      for (const antes of dimensionFamiliesOf(editor.project.settings)) {
        if (antes.id !== DIM_FAMILY_PADRAO && !drafts.some((f) => f.id === antes.id)) editor.store.exec({ type: 'removeDimensionFamily', id: antes.id });
      }
      if (padrao !== defaultDimensionFamilyIdOf(editor.project.settings)) editor.store.exec({ type: 'setDefaultDimensionFamily', id: padrao });
    });
    close();
  };

  const numRow = (key: 'tickSize' | 'textHeight' | 'extensionGap' | 'extensionOvershoot' | 'textGap' | 'stackSpacing', label: string): ReactElement => (
    <Row label={label} htmlFor={`dfam-${key}`}>
      <NumField
        id={`dfam-${key}`}
        value={atual[key]}
        decimals={1}
        unit={PAPER_UNIT}
        min={0}
        onCommit={(v) => trocar({ [key]: v } as Partial<DimensionFamily>)}
      />
    </Row>
  );

  const selectRow = <K extends keyof DimensionStyle>(key: K, label: string, options: ReadonlyArray<{ value: DimensionStyle[K]; label: string }>): ReactElement => (
    <Row label={label} htmlFor={`dfam-${String(key)}`}>
      <select id={`dfam-${String(key)}`} className="select" value={String(atual[key])} onChange={(e) => {
        const escolhido = options.find((o) => String(o.value) === e.target.value);
        if (escolhido) trocar({ [key]: escolhido.value } as Partial<DimensionFamily>);
      }}>
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </Row>
  );

  const ehPadrao = atual.id === DIM_FAMILY_PADRAO;

  return (
    <Dialog
      title="Famílias de cotas"
      sub="Aparência nomeada das cotas: marcador, texto, leitura e formato. A família escolhida na barra é a da cota nova."
      size="wide"
      onClose={close}
      onSubmit={aplicar}
      footer={
        <>
          <button className="btn" onClick={() => { const nova = novaFamilia(atual, drafts); setDrafts((l) => [...l, nova]); setSelecionada(nova.id); }}>Duplicar</button>
          <button className="btn" onClick={() => { const nova = novaFamilia(undefined, drafts); setDrafts((l) => [...l, nova]); setSelecionada(nova.id); }}>Nova</button>
          <button className="btn danger" disabled={ehPadrao} title={ehPadrao ? 'A família Padrão é o estilo do projeto e não pode ser excluída' : 'Excluir a família'} onClick={() => {
            setDrafts((l) => l.filter((f) => f.id !== atual.id));
            setSelecionada(padrao === atual.id ? DIM_FAMILY_PADRAO : padrao);
            if (padrao === atual.id) setPadrao(DIM_FAMILY_PADRAO);
          }}>Excluir</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>Cancelar</button>
          <button className="btn primary" onClick={aplicar}>OK</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 12 }}>
        <div role="listbox" aria-label="Famílias de cotas" style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 380, overflow: 'auto' }}>
          {drafts.map((f) => (
            <button
              key={f.id}
              role="option"
              aria-selected={f.id === atual.id}
              className={`rb-menuitem${f.id === atual.id ? ' on' : ''}`}
              style={{ textAlign: 'left', border: 'none', background: f.id === atual.id ? 'var(--accent-soft)' : 'transparent', padding: '5px 8px', borderRadius: 4, display: 'flex', justifyContent: 'space-between', gap: 6 }}
              onClick={() => { setSelecionada(f.id); setErro(null); }}
            >
              <span>{f.name || '(sem nome)'}</span>
              {f.id === padrao ? <span className="soft" title="Família padrão do projeto">padrão</span> : null}
            </button>
          ))}
        </div>
        <div>
          {erro ? <div className="error" role="alert" style={{ marginBottom: 8 }}>{erro}</div> : null}
          <DimensionStylePreview style={atual} />
          <div style={{ height: 8 }} />
          <Row label="Nome" htmlFor="dfam-name">
            <TextField id="dfam-name" value={atual.name} disabled={ehPadrao} onCommit={(v) => trocar({ name: v })} />
          </Row>
          <Row label="Padrão do projeto">
            <Check id="dfam-default" checked={padrao === atual.id} disabled={ehPadrao} onChange={() => setPadrao(atual.id)}>Usar esta família nas cotas novas</Check>
          </Row>
          <div className="prow"><span className="soft">{ehPadrao ? 'A família Padrão é o estilo global do projeto (Cotas do projeto › Estilo das cotas).' : 'Família nomeada: mudar aqui não afeta as outras.'}</span></div>
          {selectRow('tick', 'Marcador', DIM_TICK_OPTIONS)}
          {numRow('tickSize', 'Tamanho do marcador')}
          {selectRow('textPlacement', 'Posição do texto', TEXT_PLACEMENT_OPTIONS)}
          {selectRow('readConvention', 'Leitura do valor', READ_CONVENTION_OPTIONS)}
          {numRow('textGap', 'Folga do texto até a linha')}
          {numRow('textHeight', 'Altura do texto')}
          <Row label="Fonte" htmlFor="dfam-font">
            <select id="dfam-font" className="select" value={atual.font} onChange={(e) => trocar({ font: e.target.value })}>
              {fontOptions(atual.font).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Row>
          {numRow('extensionGap', 'Folga da linha de extensão')}
          {numRow('extensionOvershoot', 'Ultrapassagem da linha de extensão')}
          {numRow('stackSpacing', 'Espaçamento entre cotas empilhadas')}
          {selectRow('textFit', 'Quando o valor não cabe', TEXT_FIT_OPTIONS)}
          {selectRow('unit', 'Unidade', UNIT_OPTIONS)}
          {selectRow('precision', 'Precisão', PRECISION_OPTIONS)}
          <Row label="Prefixo" htmlFor="dfam-prefix">
            <TextField id="dfam-prefix" value={atual.prefix} onCommit={(v) => trocar({ prefix: v.slice(0, STYLE_TEXT_MAX) })} />
          </Row>
          <Row label="Sufixo" htmlFor="dfam-suffix">
            <TextField id="dfam-suffix" value={atual.suffix} onCommit={(v) => trocar({ suffix: v.slice(0, STYLE_TEXT_MAX) })} />
          </Row>
        </div>
      </div>
    </Dialog>
  );
}
