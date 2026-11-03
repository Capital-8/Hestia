import { useState, type ReactElement } from 'react';
import { DEFAULT_DISJOIN, TOOL_LABEL } from '@hestia/tools';
import { addRoomsAllCircuits } from '../editor/roomActions.ts';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { perimeterActions, usePerimeter } from '../editor/perimeter.ts';
import { PerimeterOptionsBar } from './perimeter/PerimeterOptionsBar.tsx';
import { Check, NumField } from './fields.tsx';
import { useUnits } from './useUnits.ts';
import { DisjoinCheck } from './DisjoinCheck.tsx';
import { SlabOptionsBar } from './SlabOptionsBar.tsx';
import { CeilingOptionsBar } from './CeilingOptionsBar.tsx';
import { RoofOptionsBar } from './RoofOptionsBar.tsx';
import { RoofArrowOptionsBar } from './RoofArrowOptionsBar.tsx';
import { StairOptionsBar } from './StairOptionsBar.tsx';
import { StairRunOptionsBar } from './StairRunOptionsBar.tsx';
import { RampOptionsBar } from './RampOptionsBar.tsx';
import { ArrayOptionsBar } from './ArrayOptionsBar.tsx';
import { GridOptionsBar } from './GridOptionsBar.tsx';
import { formatQuantity, openingFamilies, openingFamilyOf, DIM_FAMILY_PADRAO, defaultDimensionFamilyIdOf, dimensionFamiliesOf, type LocationLine } from '@hestia/model';

export const LOCATION_LABEL: Record<LocationLine, string> = {
  wallCenter: 'Eixo da parede',
  coreCenter: 'Eixo do núcleo',
  finishExterior: 'Face externa do acabamento',
  finishInterior: 'Face interna do acabamento',
  coreExterior: 'Face externa do núcleo',
  coreInterior: 'Face interna do núcleo',
};

/**
 * Opções da ferramenta Cota: **família** (a aparência nomeada, criada no diálogo "Famílias de cotas") + direção e
 * sequência. Unidade, casas, marca e altura do texto saíram daqui: são da família (antes a barra gravava esses campos
 * cota por cota, o que furava o estilo do projeto).
 */
function DimensionOptions(): ReactElement {
  const p = useProject();
  const o = useUi((s) => s.options);
  const set = (patch: Partial<typeof o>): void => useUi.setState({ options: { ...useUi.getState().options, ...patch } });
  const familias = dimensionFamiliesOf(p.settings);
  const familia = o.dimensionFamilyId ?? defaultDimensionFamilyIdOf(p.settings);
  return (
    <>
      <label>Família
        <select
          id="opt-dimfamily"
          className="select"
          value={familia}
          title="Aparência da cota: marcador, texto, folgas e formato. Edite em Famílias de cotas…"
          onChange={(e) => set({ dimensionFamilyId: e.target.value === DIM_FAMILY_PADRAO ? null : e.target.value })}
        >
          {familias.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label>Direção
        <select className="select" value={o.dimensionMode ?? 'auto'} onChange={(e) => set({ dimensionMode: e.target.value as 'auto' | 'aligned' | 'horizontal' | 'vertical' })}>
          <option value="auto">Automática (pela referência)</option>
          <option value="aligned">Alinhada</option>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </label>
      <label>Sequência<select className="select" value={o.dimensionString ?? 'single'} onChange={(e) => set({ dimensionString: e.target.value as 'single' | 'continuous' | 'baseline' })}><option value="single">Individual</option><option value="continuous">Contínua</option><option value="baseline">A partir de uma base</option></select></label>
      {o.dimensionMode === 'aligned' || o.dimensionMode === 'horizontal' || o.dimensionMode === 'vertical' ? null : (
        <span style={{ color: 'var(--fg-soft)' }}>A direção vem dos pontos medidos</span>
      )}
    </>
  );
}

/** Tipo Selector do Revit: agrupa os tipos por família e filtra por nome ou código. */
function OpeningTypePicker({ kind, value, onChange }: { kind: 'door' | 'window'; value: string; onChange: (id: string) => void }): ReactElement {
  const p = useProject();
  const [q, setQ] = useState('');
  const types = Object.values(p.openingTypes).filter((t) => t.kind === kind);
  const needle = q.trim().toLowerCase();
  const shown = needle ? types.filter((t) => t.name.toLowerCase().includes(needle) || (t.code ?? '').toLowerCase().includes(needle)) : types;
  // Favoritos no topo (ArchiCAD: Favorites); os demais ficam agrupados por família.
  const favorites = p.settings.favoriteOpeningTypes ?? [];
  const favSet = new Set(favorites);
  const favoriteItems = shown.filter((t) => favSet.has(t.id));
  const rest = shown.filter((t) => !favSet.has(t.id));
  // Um grupo por família (ordem da interface); tipos sem família (dado fora do contrato) caem em "Outros".
  const groups = openingFamilies(kind)
    .map((f) => ({ family: f, items: rest.filter((t) => openingFamilyOf(t)?.id === f.id) }))
    .filter((g) => g.items.length);
  const orphans = rest.filter((t) => !openingFamilyOf(t));
  const visible = new Set(shown.map((t) => t.id));
  const current = p.openingTypes[value];
  return (
    <>
      <label>
        Buscar
        <input id="opt-opensearch" className="input" style={{ width: 120 }} value={q} placeholder="nome ou código" aria-label="Buscar tipo de abertura" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <label>
        Tipo
        <select id="opt-opentype" className="select" value={value} onChange={(e) => onChange(e.target.value)}>
          {current && !visible.has(value) ? <option value={value}>{current.name}</option> : null}
          {favoriteItems.length ? (
            <optgroup label="★ Favoritos">
              {favoriteItems.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          ) : null}
          {groups.map((g) => (
            <optgroup key={g.family.id} label={g.family.name}>
              {g.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          ))}
          {orphans.length ? (
            <optgroup label="Outros">
              {orphans.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
          ) : null}
        </select>
      </label>
      <button
        type="button"
        className="btn small"
        aria-label={favSet.has(value) ? 'Remover tipo dos favoritos' : 'Adicionar tipo aos favoritos'}
        title={favSet.has(value) ? 'Remover dos favoritos (desfazível)' : 'Adicionar aos favoritos (desfazível)'}
        onClick={() => editor.store.exec({ type: 'toggleOpeningFavorite', id: value }, favSet.has(value) ? 'Remover tipo dos favoritos' : 'Favoritar tipo de abertura')}
      >
        {favSet.has(value) ? '★' : '☆'}
      </button>
    </>
  );
}

export function OptionsBar(): ReactElement {
  const p = useProject();
  const perim = usePerimeter();
  const tool = useUi((s) => s.tool);
  const o = useUi((s) => s.options);
  const units = useUnits();
  const sel = useUi((s) => s.selection);
  const areaPlan = useUi((s) => s.view === 'plan' && s.planKind === 'area' && !!s.areaPlanId);
  const set = (patch: Partial<typeof o>): void => useUi.setState({ options: { ...o, ...patch } });
  if (perim.active) return <PerimeterOptionsBar target={perim.target} modify={perim.modify} options={perim.options} onChange={perimeterActions.setOptions} />;
  // A paleta Propriedades é a fonte de configuração antes da colocação; a barra superior fica como indicação da ferramenta.
  if (['wall', 'door', 'window', 'floor', 'slab', 'ceiling', 'stairrun', 'roof', 'roofextrusion'].includes(tool)) {
    return <div className="optbar" role="group" aria-label="Opções da ferramenta"><span className="tool-name">{TOOL_LABEL[tool]}</span><span style={{ color: 'var(--fg-soft)' }}>Configurações em Propriedades</span></div>;
  }
  return (
    <div className="optbar" role="group" aria-label="Opções da ferramenta">
      <span className="tool-name">{TOOL_LABEL[tool]}</span>
      {areaPlan && <span style={{ color: 'var(--fg-soft)' }}>Planta de área — anotação</span>}
      {areaPlan && <button className="btn small" onClick={() => useUi.setState({ dialog: 'cotasAuto' })} title="Cotas automáticas da planta de área ativa">Cotas automáticas…</button>}
      {tool === 'wall' && (
        <>
          <label>
            Tipo
            <select id="opt-walltype" className="select" value={o.wallTypeId} onChange={(e) => set({ wallTypeId: e.target.value })}>
              {Object.values(p.wallTypes).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label>
            Forma
            <select id="opt-shape" className="select" value={o.wallShape} onChange={(e) => set({ wallShape: e.target.value as 'line' | 'arc' | 'rect' })}>
              <option value="line">Reta</option>
              <option value="arc">Arco (3 pontos)</option>
              <option value="rect">Retângulo (2 cantos)</option>
            </select>
          </label>
          <label>
            Linha de localização
            <select id="opt-loc" className="select" value={o.locationLine} onChange={(e) => set({ locationLine: e.target.value as LocationLine })}>
              {(Object.keys(LOCATION_LABEL) as LocationLine[]).map((k) => (
                <option key={k} value={k}>{LOCATION_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label>
            Altura
            <NumField id="opt-height" value={o.wallHeight} onCommit={(v) => set({ wallHeight: v })} quantity="length" min={0.1} />
          </label>
          <Check id="opt-chain" checked={o.chain} onChange={(v) => set({ chain: v })}>Encadear</Check>
        </>
      )}
      {tool === 'room' && (
        <button id="opt-roomall" className="btn small" onClick={() => addRoomsAllCircuits()} title="Cria um ambiente em cada circuito fechado que ainda não tem um; um só Ctrl+Z desfaz tudo">
          Ambientes em todos os circuitos fechados
        </button>
      )}
      {tool === 'dimension' && <DimensionOptions />}
      {tool === 'text' && (
        <>
          <label>Altura<NumField id="opt-textheight" value={(o.textHeight ?? 2.5) / 1000} quantity="smallLength" min={0.0005} onCommit={(v) => set({ textHeight: v * 1000 })} /></label>
          <label>Largura<NumField id="opt-textwidth" value={(o.textWidth ?? 60) / 1000} quantity="smallLength" min={0.005} onCommit={(v) => set({ textWidth: v * 1000 })} /></label>
          <label>Chamada<select className="select" value={o.textLeader ?? 'none'} onChange={(e) => set({ textLeader: e.target.value as 'none' | 'straight' | 'elbow' })}><option value="none">Sem líder</option><option value="straight">Reta</option><option value="elbow">Com dobra</option></select></label>
        </>
      )}
      {tool === 'filledRegion' && <Check id="opt-region-mask" checked={o.regionMask === true} onChange={(v) => set({ regionMask: v })}>Mascarar elementos atrás</Check>}
      {tool === 'filledRegion' && <label>Cor<input className="input" type="color" value={o.regionColor ?? '#f5d782'} onChange={(e) => set({ regionColor: e.target.value })} /></label>}
      {tool === 'detailLine' && <label>Traço<select className="select" value={o.detailLineStyle ?? 'solid'} onChange={(e) => set({ detailLineStyle: e.target.value as 'solid' | 'dashed' | 'dotted' })}><option value="solid">Contínuo</option><option value="dashed">Tracejado</option><option value="dotted">Pontilhado</option></select></label>}
      {tool === 'tag' && (
        <>
          <label>Informação<select className="select" value={o.tagProperty ?? 'type'} onChange={(e) => set({ tagProperty: e.target.value as NonNullable<typeof o.tagProperty> })}><option value="type">Tipo</option><option value="name">Nome</option><option value="mark">Marca</option><option value="level">Nível</option><option value="width">Largura</option><option value="height">Altura</option></select></label>
          <label>Orientação<select className="select" value={o.tagOrientation ?? 'horizontal'} onChange={(e) => set({ tagOrientation: e.target.value as 'horizontal' | 'vertical' })}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
          <Check id="opt-tag-leader" checked={o.tagLeader !== false} onChange={(v) => set({ tagLeader: v })}>Líder</Check>
        </>
      )}
      {tool === 'floor' && (
        <>
          <label>
            Tipo
            <select id="opt-floortype" className="select" value={o.floorTypeId} onChange={(e) => set({ floorTypeId: e.target.value })}>
              {Object.values(p.floorTypes).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label>
            Deslocamento do topo
            <NumField id="opt-flooroffset" value={o.floorOffset} onCommit={(v) => set({ floorOffset: v })} quantity="length" />
          </label>
        </>
      )}
      {(tool === 'slab' || tool === 'slope') && <SlabOptionsBar tool={tool} />}
      {tool === 'ceiling' && <CeilingOptionsBar />}
      {(tool === 'roof' || tool === 'roofextrusion') && <RoofOptionsBar />}
      {tool === 'roofarrow' && <RoofArrowOptionsBar />}
      {tool === 'stair' && <StairOptionsBar />}
      {tool === 'stairrun' && <StairRunOptionsBar />}
      {tool === 'ramp' && <RampOptionsBar />}
      {(tool === 'door' || tool === 'window') && (
        <OpeningTypePicker
          kind={tool}
          value={tool === 'door' ? o.doorTypeId : o.windowTypeId}
          onChange={(id) => set(tool === 'door' ? { doorTypeId: id } : { windowTypeId: id })}
        />
      )}
      {tool === 'trim' && (
        <label>
          Modo
          <select
            id="opt-trimmode"
            className="select"
            value={o.trimMode ?? 'unico'}
            onChange={(e) => {
              // Trocar o modo recomeça a escolha (como no modo do Piso).
              useUi.setState({ options: { ...useUi.getState().options, trimMode: e.target.value as 'canto' | 'unico' | 'varios' } });
              editor.setTool('trim');
            }}
          >
            <option value="canto">Ao canto</option>
            <option value="unico">Um elemento</option>
            <option value="varios">Vários</option>
          </select>
        </label>
      )}
      {tool === 'move' && <DisjoinCheck id="opt-mdisjoin" checked={o.moveDisjoin ?? DEFAULT_DISJOIN.move} onChange={(v) => set({ moveDisjoin: v })} />}
      {tool === 'rotate' && (
        <>
          <Check id="opt-rcopy" checked={o.rotateCopy} onChange={(v) => set({ rotateCopy: v })}>Copiar</Check>
          <DisjoinCheck id="opt-rdisjoin" checked={o.rotateDisjoin ?? DEFAULT_DISJOIN.rotate} onChange={(v) => set({ rotateDisjoin: v })} />
        </>
      )}
      {tool === 'mirror' && (
        <>
          <Check id="opt-mcopy" checked={o.mirrorCopy} onChange={(v) => set({ mirrorCopy: v })}>Copiar</Check>
          <DisjoinCheck id="opt-mirrordisjoin" checked={o.mirrorDisjoin ?? DEFAULT_DISJOIN.mirror} onChange={(v) => set({ mirrorDisjoin: v })} />
        </>
      )}
      {tool === 'array' && <ArrayOptionsBar />}
      {tool === 'grid' && <GridOptionsBar />}
      {tool === 'align' && (
        <label>
          Preferir
          <select
            id="opt-alignprefer"
            className="select"
            value={o.alignPrefer ?? 'faces'}
            onChange={(e) => set({ alignPrefer: e.target.value as NonNullable<typeof o.alignPrefer> })}
          >
            <option value="faces">Faces da parede</option>
            <option value="eixos">Eixos da parede</option>
            <option value="nucleo">Face do núcleo</option>
          </select>
        </label>
      )}
      {tool === 'offset' && (
        <>
          <label>
            Distância
            <NumField
              id="opt-offset"
              value={o.offsetDistance}
              onCommit={(v) => set({ offsetDistance: v })}
              quantity="length"
              min={0.01}
              strictRange
              onInvalid={(texto) => useUi.setState({ status: `Distância inválida (${texto.trim() || 'vazia'}): digite uma distância válida, maior que zero. Mantida: ${formatQuantity(units, 'length', o.offsetDistance)}.` })}
              onValid={() => { const st = useUi.getState().status; if (typeof st === 'string' && st.startsWith('Distância inválida')) useUi.setState({ status: 'Pronto.' }); }}
            />
          </label>
          <Check id="opt-ocopy" checked={o.offsetCopy} onChange={(v) => set({ offsetCopy: v })}>Copiar</Check>
        </>
      )}
      {tool === 'parallel' && (
        <label>
          Medir distância
          <select id="opt-offsetfrom" className="select" value={o.offsetFrom ?? 'face'} onChange={(e) => set({ offsetFrom: e.target.value as 'axis' | 'face' })}>
            <option value="face">Face a face (padrão)</option>
            <option value="axis">Entre eixos</option>
          </select>
        </label>
      )}
      {tool === 'select' && (
        <>
          <span style={{ color: 'var(--fg-soft)' }}>{sel.length ? `${sel.length} selecionado${sel.length > 1 ? 's' : ''}` : 'Nada selecionado'}</span>
          {sel.length > 0 && (
            <button className="btn small danger" onClick={() => editor.deleteSelection()}>Excluir (Del)</button>
          )}
        </>
      )}
    </div>
  );
}
