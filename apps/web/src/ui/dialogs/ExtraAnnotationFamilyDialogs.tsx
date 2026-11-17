import { useState, type ReactElement } from 'react';
import {
  defaultNorthArrowFamilyIdOf,
  defaultRevisionCloudFamilyIdOf,
  defaultSpotFamilyIdOf,
  defaultTextFamilyIdOf,
  northArrowFamiliesOf,
  revisionCloudFamiliesOf,
  spotFamiliesOf,
  textFamiliesOf,
  type NorthArrowFamily,
  type RevisionCloudFamily,
  type SpotFamily,
  type TextFamily,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { FamilyCheck, FamilyRow, FamilyTypeDialog } from './familia/index.ts';
import { NumField, TextField } from '../fields.tsx';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
const uid = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/** Diálogo de edição de famílias/tipos de Texto (Revit: Text Types). */
export function TextFamiliesDialog(): ReactElement {
  const p = useProject();
  const initialId = useUi.getState().dialogArg || defaultTextFamilyIdOf(p.settings);
  const [list, setList] = useState<TextFamily[]>(() => textFamiliesOf(p.settings));
  const [selId, setSelId] = useState<string>(() => list.find((x) => x.id === initialId)?.id ?? list[0]!.id);
  const draft = list.find((x) => x.id === selId) ?? list[0]!;
  const patch = (k: Partial<TextFamily>): void => setList((xs) => xs.map((x) => (x.id === draft.id ? { ...x, ...k } : x)));
  const duplicate = (): void => {
    const next: TextFamily = { ...draft, id: uid('tf'), name: `${draft.name} (cópia)` };
    setList((xs) => [...xs, next]);
    setSelId(next.id);
  };
  const del = (): void => {
    if (list.length <= 1) return;
    const next = list.filter((x) => x.id !== draft.id);
    setList(next);
    setSelId(next[0]!.id);
  };
  const apply = (): void => {
    editor.store.transaction('Atualizar famílias de texto', () => {
      for (const f of list) editor.store.exec({ type: 'upsertTextFamily', family: f });
      editor.store.exec({ type: 'setDefaultTextFamily', id: draft.id });
    });
  };
  return (
    <FamilyTypeDialog
      title="Propriedades de tipo — Texto"
      onClose={close}
      onSubmit={() => { apply(); close(); }}
      size="mid"
      family="Texto"
      types={list}
      currentId={draft.id}
      onSelectType={setSelId}
      onDuplicate={duplicate}
      name={{ id: 'tf-name', value: draft.name, onCommit: (v) => patch({ name: v }) }}
      footer={{ onDelete: del, deleteDisabled: list.length <= 1, onApply: apply, onOk: () => { apply(); close(); } }}
    >
      <FamilyRow label="Fonte" htmlFor="tf-font">
        <select id="tf-font" className="select" value={draft.font} onChange={(e) => patch({ font: e.target.value })}>
          <option value="Arial Narrow, Arial, sans-serif">Arial Narrow / Sans-serif</option>
          <option value="monospace">Monospace (Técnica)</option>
          <option value="serif">Serif</option>
        </select>
      </FamilyRow>
      <FamilyRow label="Tamanho do texto" htmlFor="tf-h">
        <NumField id="tf-h" value={draft.textMm} decimals={1} unit="mm" min={0.5} onCommit={(v) => patch({ textMm: v })} />
      </FamilyRow>
      <FamilyRow label="Seta da chamada" htmlFor="tf-arr">
        <select id="tf-arr" className="select" value={draft.leaderArrow} onChange={(e) => patch({ leaderArrow: e.target.value as TextFamily['leaderArrow'] })}>
          <option value="arrow">Seta cheia</option>
          <option value="dot">Ponto</option>
          <option value="slash">Traço oblíquo</option>
          <option value="none">Nenhuma</option>
        </select>
      </FamilyRow>
      <FamilyCheck id="tf-bold" checked={draft.bold === true} onChange={(v) => patch({ bold: v })}>Negrito</FamilyCheck>
      <FamilyCheck id="tf-italic" checked={draft.italic === true} onChange={(v) => patch({ italic: v })}>Itálico</FamilyCheck>
      <FamilyCheck id="tf-under" checked={draft.underline === true} onChange={(v) => patch({ underline: v })}>Sublinhado</FamilyCheck>
      <FamilyCheck id="tf-frame" checked={draft.frame === true} onChange={(v) => patch({ frame: v })}>Exibir borda / moldura</FamilyCheck>
      <FamilyCheck id="tf-opaque" checked={draft.opaqueBackground === true} onChange={(v) => patch({ opaqueBackground: v })}>Fundo opaco (mascarar trás)</FamilyCheck>
    </FamilyTypeDialog>
  );
}

/** Diálogo de edição de famílias/tipos de Cota de Elevação e Coordenada de Ponto (Revit: Spot Elevation / Coordinate). */
export function SpotFamiliesDialog(): ReactElement {
  const p = useProject();
  const initialId = useUi.getState().dialogArg || defaultSpotFamilyIdOf(p.settings, 'elevation');
  const [list, setList] = useState<SpotFamily[]>(() => spotFamiliesOf(p.settings));
  const [selId, setSelId] = useState<string>(() => list.find((x) => x.id === initialId)?.id ?? list[0]!.id);
  const [basePt, setBasePt] = useState(() => p.settings.projectBasePoint ?? { x: 0, y: 0, z: 0 });
  const [surveyPt, setSurveyPt] = useState(() => p.settings.surveyPoint ?? { x: 0, y: 0, z: 0, trueNorthDeg: 0 });
  const draft = list.find((x) => x.id === selId) ?? list[0]!;
  const patch = (k: Partial<SpotFamily>): void => setList((xs) => xs.map((x) => (x.id === draft.id ? { ...x, ...k } : x)));
  const duplicate = (): void => {
    const next: SpotFamily = { ...draft, id: uid('sf'), name: `${draft.name} (cópia)` };
    setList((xs) => [...xs, next]);
    setSelId(next.id);
  };
  const del = (): void => {
    const sameKind = list.filter((x) => x.kind === draft.kind);
    if (sameKind.length <= 1) return;
    const next = list.filter((x) => x.id !== draft.id);
    setList(next);
    setSelId(next.find((x) => x.kind === draft.kind)?.id ?? next[0]!.id);
  };
  const apply = (): void => {
    editor.store.transaction('Atualizar famílias de cota de ponto', () => {
      for (const f of list) editor.store.exec({ type: 'upsertSpotFamily', family: f });
      editor.store.exec({ type: 'setDefaultSpotFamily', kind: draft.kind, id: draft.id });
      editor.store.exec({ type: 'setSettings', patch: { projectBasePoint: basePt, surveyPoint: surveyPt } });
    });
  };
  const sameKindCount = list.filter((x) => x.kind === draft.kind).length;
  return (
    <FamilyTypeDialog
      title={draft.kind === 'elevation' ? 'Propriedades de tipo — Cota de elevação' : 'Propriedades de tipo — Coordenada de ponto'}
      onClose={close}
      onSubmit={() => { apply(); close(); }}
      size="mid"
      family={draft.kind === 'elevation' ? 'Cota de elevação' : 'Coordenada de ponto'}
      types={list.filter((x) => x.kind === draft.kind)}
      currentId={draft.id}
      onSelectType={setSelId}
      onDuplicate={duplicate}
      name={{ id: 'sf-name', value: draft.name, onCommit: (v) => patch({ name: v }) }}
      footer={{ onDelete: del, deleteDisabled: sameKindCount <= 1, onApply: apply, onOk: () => { apply(); close(); } }}
    >
      <FamilyRow label="Símbolo em planta" htmlFor="sf-psym">
        <select id="sf-psym" className="select" value={draft.planSymbol} onChange={(e) => patch({ planSymbol: e.target.value as SpotFamily['planSymbol'] })}>
          <option value="target-bw">Alvo circular P&amp;B (NBR)</option>
          <option value="crosshair">Mira em cruz</option>
          <option value="circle">Círculo simples</option>
        </select>
      </FamilyRow>
      <FamilyRow label="Símbolo em corte" htmlFor="sf-ssym">
        <select id="sf-ssym" className="select" value={draft.sectionSymbol} onChange={(e) => patch({ sectionSymbol: e.target.value as SpotFamily['sectionSymbol'] })}>
          <option value="triangle-bw">Triângulo invertido P&amp;B (NBR)</option>
          <option value="triangle-open">Triângulo vazado</option>
          <option value="arrow">Seta simples</option>
        </select>
      </FamilyRow>
      <FamilyRow label="Base de referência" htmlFor="sf-base">
        <select id="sf-base" className="select" value={draft.base} onChange={(e) => patch({ base: e.target.value as SpotFamily['base'] })}>
          <option value="relative">Relativa ao nível (0,00)</option>
          <option value="project">Ponto Base do Projeto (PBP)</option>
          <option value="survey">Ponto de Levantamento Topográfico (Survey)</option>
        </select>
      </FamilyRow>
      <FamilyRow label="Tamanho do símbolo" htmlFor="sf-sz"><NumField id="sf-sz" value={draft.symbolMm} decimals={1} unit="mm" min={1.5} onCommit={(v) => patch({ symbolMm: v })} /></FamilyRow>
      <FamilyRow label="Altura do texto" htmlFor="sf-th"><NumField id="sf-th" value={draft.textMm} decimals={1} unit="mm" min={1} onCommit={(v) => patch({ textMm: v })} /></FamilyRow>
      <FamilyRow label="Prefixo" htmlFor="sf-pre"><TextField id="sf-pre" value={draft.prefix} onCommit={(v) => patch({ prefix: v })} /></FamilyRow>
      <FamilyCheck id="sf-ldr" checked={draft.showLeader} onChange={(v) => patch({ showLeader: v })}>Exibir linha de chamada por padrão</FamilyCheck>
      <FamilyRow label="PBP (X / Y / Z)" htmlFor="sf-pbpx">
        <div style={{ display: 'flex', gap: 6 }}>
          <NumField id="sf-pbpx" value={basePt.x} decimals={2} unit="m" onCommit={(x) => setBasePt((s) => ({ ...s, x }))} />
          <NumField id="sf-pbpy" value={basePt.y} decimals={2} unit="m" onCommit={(y) => setBasePt((s) => ({ ...s, y }))} />
          <NumField id="sf-pbpz" value={basePt.z} decimals={2} unit="m" onCommit={(z) => setBasePt((s) => ({ ...s, z }))} />
        </div>
      </FamilyRow>
      <FamilyRow label="Survey (X / Y / Z)" htmlFor="sf-surx">
        <div style={{ display: 'flex', gap: 6 }}>
          <NumField id="sf-surx" value={surveyPt.x} decimals={2} unit="m" onCommit={(x) => setSurveyPt((s) => ({ ...s, x }))} />
          <NumField id="sf-sury" value={surveyPt.y} decimals={2} unit="m" onCommit={(y) => setSurveyPt((s) => ({ ...s, y }))} />
          <NumField id="sf-surz" value={surveyPt.z} decimals={2} unit="m" onCommit={(z) => setSurveyPt((s) => ({ ...s, z }))} />
        </div>
      </FamilyRow>
    </FamilyTypeDialog>
  );
}

/** Diálogo de edição de famílias/tipos de Nuvem de Revisão (Revit: Revision Cloud). */
export function RevisionCloudFamiliesDialog(): ReactElement {
  const p = useProject();
  const initialId = useUi.getState().dialogArg || defaultRevisionCloudFamilyIdOf(p.settings);
  const [list, setList] = useState<RevisionCloudFamily[]>(() => revisionCloudFamiliesOf(p.settings));
  const [selId, setSelId] = useState<string>(() => list.find((x) => x.id === initialId)?.id ?? list[0]!.id);
  const draft = list.find((x) => x.id === selId) ?? list[0]!;
  const patch = (k: Partial<RevisionCloudFamily>): void => setList((xs) => xs.map((x) => (x.id === draft.id ? { ...x, ...k } : x)));
  const duplicate = (): void => {
    const next: RevisionCloudFamily = { ...draft, id: uid('rcf'), name: `${draft.name} (cópia)` };
    setList((xs) => [...xs, next]);
    setSelId(next.id);
  };
  const del = (): void => {
    if (list.length <= 1) return;
    const next = list.filter((x) => x.id !== draft.id);
    setList(next);
    setSelId(next[0]!.id);
  };
  const apply = (): void => {
    editor.store.transaction('Atualizar famílias de nuvem de revisão', () => {
      for (const f of list) editor.store.exec({ type: 'upsertRevisionCloudFamily', family: f });
      editor.store.exec({ type: 'setDefaultRevisionCloudFamily', id: draft.id });
    });
  };
  return (
    <FamilyTypeDialog
      title="Propriedades de tipo — Nuvem de revisão"
      onClose={close}
      onSubmit={() => { apply(); close(); }}
      size="mid"
      family="Nuvem de revisão"
      types={list}
      currentId={draft.id}
      onSelectType={setSelId}
      onDuplicate={duplicate}
      name={{ id: 'rc-name', value: draft.name, onCommit: (v) => patch({ name: v }) }}
      footer={{ onDelete: del, deleteDisabled: list.length <= 1, onApply: apply, onOk: () => { apply(); close(); } }}
    >
      <FamilyRow label="Comprimento do arco" htmlFor="rc-arc"><NumField id="rc-arc" value={draft.arcLengthMm} decimals={1} unit="mm" min={2} onCommit={(v) => patch({ arcLengthMm: v })} /></FamilyRow>
      <FamilyRow label="Espessura da linha" htmlFor="rc-lw"><NumField id="rc-lw" value={draft.lineWidthPx} decimals={1} unit="px" min={0.5} onCommit={(v) => patch({ lineWidthPx: v })} /></FamilyRow>
      <FamilyRow label="Cor da nuvem" htmlFor="rc-col"><input id="rc-col" className="input" type="color" value={draft.color} onChange={(e) => patch({ color: e.target.value })} /></FamilyRow>
    </FamilyTypeDialog>
  );
}

/** Diálogo de edição de famílias/tipos de Seta Norte (Revit: North Arrow). */
export function NorthArrowFamiliesDialog(): ReactElement {
  const p = useProject();
  const initialId = useUi.getState().dialogArg || defaultNorthArrowFamilyIdOf(p.settings);
  const [list, setList] = useState<NorthArrowFamily[]>(() => northArrowFamiliesOf(p.settings));
  const [selId, setSelId] = useState<string>(() => list.find((x) => x.id === initialId)?.id ?? list[0]!.id);
  const draft = list.find((x) => x.id === selId) ?? list[0]!;
  const patch = (k: Partial<NorthArrowFamily>): void => setList((xs) => xs.map((x) => (x.id === draft.id ? { ...x, ...k } : x)));
  const duplicate = (): void => {
    const next: NorthArrowFamily = { ...draft, id: uid('naf'), name: `${draft.name} (cópia)` };
    setList((xs) => [...xs, next]);
    setSelId(next.id);
  };
  const del = (): void => {
    if (list.length <= 1) return;
    const next = list.filter((x) => x.id !== draft.id);
    setList(next);
    setSelId(next[0]!.id);
  };
  const apply = (): void => {
    editor.store.transaction('Atualizar famílias de seta norte', () => {
      for (const f of list) editor.store.exec({ type: 'upsertNorthArrowFamily', family: f });
      editor.store.exec({ type: 'setDefaultNorthArrowFamily', id: draft.id });
    });
  };
  return (
    <FamilyTypeDialog
      title="Propriedades de tipo — Seta norte"
      onClose={close}
      onSubmit={() => { apply(); close(); }}
      size="mid"
      family="Seta norte"
      types={list}
      currentId={draft.id}
      onSelectType={setSelId}
      onDuplicate={duplicate}
      name={{ id: 'na-name', value: draft.name, onCommit: (v) => patch({ name: v }) }}
      footer={{ onDelete: del, deleteDisabled: list.length <= 1, onApply: apply, onOk: () => { apply(); close(); } }}
    >
      <FamilyRow label="Estilo gráfico" htmlFor="na-sty">
        <select id="na-sty" className="select" value={draft.style} onChange={(e) => patch({ style: e.target.value as NorthArrowFamily['style'] })}>
          <option value="nbr-minimal">NBR Minimalista (círculo + seta)</option>
          <option value="compass">Bússola B&amp;W (metade preenchida)</option>
          <option value="wind-rose">Rosa dos Ventos (N/S/L/O)</option>
        </select>
      </FamilyRow>
      <FamilyRow label="Diâmetro no papel" htmlFor="na-d"><NumField id="na-d" value={draft.diameterMm} decimals={1} unit="mm" min={4} onCommit={(v) => patch({ diameterMm: v })} /></FamilyRow>
      <FamilyRow label="Cor do símbolo" htmlFor="na-col"><input id="na-col" className="input" type="color" value={draft.color} onChange={(e) => patch({ color: e.target.value })} /></FamilyRow>
      <FamilyCheck id="na-card" checked={draft.showCardinals} onChange={(v) => patch({ showCardinals: v })}>Exibir pontos cardeais (S / L / O)</FamilyCheck>
    </FamilyTypeDialog>
  );
}
