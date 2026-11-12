// Grupo "Grade da instância" do painel de propriedades da parede cortina (decisão 0056, §4.3 e §10 fase 2): a grade desta
// parede (U e V, campo a campo, com "Voltar ao tipo"), as linhas extras (adicionar com posição, mover, travar, apagar) e os
// segmentos removidos (restaurar). Cada ação é um comando do modelo. A sobrescrita da grade e a restauração de segmento vão
// em transação, com um só passo de desfazer. Erros do modelo aparecem no próprio grupo.
import { useState, type ReactElement } from 'react';
import {
  isCurtainType,
  isWall,
  newId,
  resolverParede,
  type Command,
  type CurtainInstance,
  type GridAxisSpec,
  type GridJustify,
  type GridLayoutMode,
  type ParedeResolvida,
  type SegmentRef,
  type Wall,
} from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { CADEADO_VIEWBOX, iconeCadeado } from '../editor/curtainHandles.ts';
import { Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { JUSTIFICA, JUSTIFICA_CHAVE, MODOS, MODO_CHAVE, lerPosicoes } from './dialogs/CurtainTab.tsx';
import {
  campoSobrescrito,
  comGrade,
  definirCampo,
  definirValor,
  eixoEfetivoDe,
  gradeComEixo,
  mudarModo,
  voltarAoTipo,
  type CampoEixo,
  type Eixo,
  type SobreEixo,
} from './curtainGridOverride.ts';

interface LinhaExtra {
  eixo: Eixo;
  id: string;
  pos: number;
  locked: boolean;
}

/** Linhas extras da grade final, de U e V (as geradas são do tipo e aparecem no subelemento). */
function linhasExtras(res: ParedeResolvida): LinhaExtra[] {
  const out: LinhaExtra[] = [];
  for (const eixo of ['u', 'v'] as const) {
    for (const l of eixo === 'u' ? res.u : res.v) {
      if (l.added !== undefined) out.push({ eixo, id: l.added, pos: l.pos, locked: l.locked === true });
    }
  }
  return out;
}

/** Eixo e posição (m) da linha de um segmento removido, na grade atual (a posição final, mesmo que a linha tenha sido movida). */
function linhaDoSegmento(res: ParedeResolvida, sg: SegmentRef): { eixo: Eixo; metros: number } {
  const ref = sg.line;
  if ('added' in ref) {
    for (const eixo of ['u', 'v'] as const) {
      const achada = (eixo === 'u' ? res.u : res.v).find((l) => l.added === ref.added);
      if (achada) return { eixo, metros: achada.pos };
    }
    return { eixo: 'u', metros: 0 };
  }
  const A = ref.axis === 'u' ? res.L : res.H;
  const achada = (ref.axis === 'u' ? res.u : res.v).find((l) => l.gerada === ref.index - 1);
  return { eixo: ref.axis, metros: achada ? achada.pos : ref.pos * A };
}

interface EixoDaInstanciaProps {
  eixo: Eixo;
  tipo: GridAxisSpec;
  sobre: SobreEixo | undefined;
  onGravar: (sobre: SobreEixo) => void;
}

/** Um eixo da grade da instância: modo, valor (conforme o modo), justificação (distância fixa) e deslocamento. */
function EixoDaInstancia({ eixo, tipo, sobre, onGravar }: EixoDaInstanciaProps): ReactElement {
  const { t } = useT();
  const efetivo = eixoEfetivoDe(tipo, sobre);
  const s: SobreEixo = sobre ?? {};
  const pre = `pci-${eixo}`;
  const modo = efetivo.mode;
  const sobrescrito = (c: CampoEixo): boolean => campoSobrescrito(tipo, sobre, c);
  const reverter = (c: CampoEixo): ReactElement => (
    <button type="button" className="btn small" onClick={() => onGravar(voltarAoTipo(tipo, s, c))}>
      {t('pct_inst_revert')}
    </button>
  );
  const rotuloValor = modo === 'fixedNumber' ? 'pct_count' : modo === 'manual' ? 'pct_positions' : 'pct_distance';
  return (
    <>
      <div className="hint">{eixo === 'u' ? t('pct_grid_u') : t('pct_grid_v')}</div>
      <Row label={t('pct_mode')} htmlFor={`${pre}-modo`}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select id={`${pre}-modo`} className="select" value={modo} onChange={(e) => onGravar(mudarModo(tipo, s, e.target.value as GridLayoutMode))}>
            {MODOS.map((m) => (
              <option key={m} value={m}>{t(MODO_CHAVE[m])}</option>
            ))}
          </select>
          {sobrescrito('mode') && reverter('mode')}
        </div>
      </Row>
      <Row label={t(rotuloValor)} htmlFor={`${pre}-valor`}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {modo === 'manual' ? (
            <TextField id={`${pre}-valor`} value={(efetivo.positions ?? []).join('; ')} onCommit={(v) => onGravar(definirValor(s, modo, lerPosicoes(v)))} />
          ) : modo === 'fixedNumber' ? (
            <NumField id={`${pre}-valor`} value={efetivo.count ?? 1} decimals={0} min={1} onCommit={(v) => onGravar(definirValor(s, modo, Math.max(1, Math.round(v))))} />
          ) : (
            <NumField id={`${pre}-valor`} value={efetivo.distance ?? 1.2} quantity="length" min={0.01} onCommit={(v) => onGravar(definirValor(s, modo, v))} />
          )}
          {sobrescrito('value') && reverter('value')}
        </div>
      </Row>
      {modo === 'fixedDistance' && (
        <Row label={t('pct_justify')} htmlFor={`${pre}-just`}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select id={`${pre}-just`} className="select" value={efetivo.justify ?? 'start'} onChange={(e) => onGravar(definirCampo(s, 'justify', e.target.value as GridJustify))}>
              {JUSTIFICA.map((j) => (
                <option key={j} value={j}>{t(JUSTIFICA_CHAVE[j])}</option>
              ))}
            </select>
            {sobrescrito('justify') && reverter('justify')}
          </div>
        </Row>
      )}
      <Row label={t('pct_offset')} htmlFor={`${pre}-off`}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <NumField id={`${pre}-off`} value={efetivo.offset ?? 0} quantity="length" decimals={3} onCommit={(v) => onGravar(definirCampo(s, 'offset', v))} />
          {sobrescrito('offset') && reverter('offset')}
        </div>
      </Row>
    </>
  );
}

/** Grupo "Grade da instância" da parede cortina selecionada. Sem tipo cortina, não renderiza nada. */
export function CurtainInstanceGroup({ wall }: { wall: Wall }): ReactElement | null {
  const { t, lang } = useT();
  const fmt = useFormat();
  const p = useProject();
  const [erro, setErro] = useState<string | null>(null);
  const [novaEixo, setNovaEixo] = useState<Eixo>('u');
  const [novaPos, setNovaPos] = useState<number | null>(null);
  const tipo = p.wallTypes[wall.typeId];
  if (!isCurtainType(tipo)) return null;
  const res = resolverParede(p, wall);

  /** Executa a ação; erro do modelo vai para o grupo, sem derrubar o painel. */
  const executar = (fn: () => void): void => {
    try {
      fn();
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  const cmd = (c: Command): void => editor.store.exec(c, undefined, lang);

  const gravarGrade = (eixo: Eixo, sobre: SobreEixo): void =>
    executar(() =>
      editor.store.transaction('pct_undo_grid', () => {
        const atual = editor.store.project.elements[wall.id];
        const base: CurtainInstance = isWall(atual) ? (atual.curtain ?? {}) : {};
        cmd({ type: 'updateElements', ids: [wall.id], patch: { curtain: comGrade(base, gradeComEixo(base.grid, eixo, sobre)) } });
        cmd({ type: 'normalizarSobrescritas', wallId: wall.id });
      }),
    );

  const restaurarSegmento = (sg: SegmentRef): void =>
    executar(() =>
      editor.store.transaction('pct_undo_restore_segment', () => {
        cmd({ type: 'normalizarSobrescritas', wallId: wall.id });
        cmd({ type: 'restoreSegment', wallId: wall.id, line: sg.line, k: sg.k });
      }),
    );

  const meio = ((novaEixo === 'u' ? (res?.L ?? 0) : (res?.H ?? 0))) / 2;
  const posNova = novaPos ?? meio;
  const extras = res ? linhasExtras(res) : [];

  return (
    <Group title={t('pct_inst_title')} stateKey="curtain-instance">
      <div className="hint">{t('pct_inst_hint')}</div>
      <EixoDaInstancia eixo="u" tipo={tipo.curtain.u} sobre={wall.curtain?.grid?.u} onGravar={(s) => gravarGrade('u', s)} />
      <EixoDaInstancia eixo="v" tipo={tipo.curtain.v} sobre={wall.curtain?.grid?.v} onGravar={(s) => gravarGrade('v', s)} />

      {res && (
        <>
          <div className="hint">{t('pct_inst_extra_title')}</div>
          {extras.length === 0 && <p className="hint">{t('pct_inst_extra_none')}</p>}
          {extras.map((l) => {
            const icone = iconeCadeado(l.locked);
            const rotuloTrava = l.locked ? t('pct_inst_unlock') : t('pct_inst_lock');
            return (
              <Row key={l.id} label={l.eixo === 'u' ? t('pct_inst_axis_u') : t('pct_inst_axis_v')} htmlFor={`pci-x-${l.id}`}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <NumField id={`pci-x-${l.id}`} value={l.pos} quantity="length" decimals={3} onCommit={(v) => executar(() => cmd({ type: 'moveGridLine', wallId: wall.id, line: { added: l.id }, pos: v }))} />
                  <button type="button" className="btn small" aria-pressed={l.locked} aria-label={rotuloTrava} title={rotuloTrava} onClick={() => executar(() => cmd({ type: 'lockGridLine', wallId: wall.id, line: { added: l.id }, locked: !l.locked }))}>
                    <svg viewBox={CADEADO_VIEWBOX} width="14" height="14" aria-hidden="true" focusable="false">
                      <path d={icone.corpo} fill="currentColor" />
                      <path d={icone.arco} fill="none" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </button>
                  <button type="button" className="btn small" onClick={() => executar(() => cmd({ type: 'removeGridLine', wallId: wall.id, line: { added: l.id } }))}>
                    {t('pct_inst_extra_delete')}
                  </button>
                </div>
              </Row>
            );
          })}
          <Row label={t('pct_inst_axis_label')} htmlFor="pci-nova-eixo">
            <select id="pci-nova-eixo" className="select" value={novaEixo} onChange={(e) => setNovaEixo(e.target.value as Eixo)}>
              <option value="u">{t('pct_inst_axis_u')}</option>
              <option value="v">{t('pct_inst_axis_v')}</option>
            </select>
          </Row>
          <Row label={t('pct_inst_extra_pos')} htmlFor="pci-nova-pos">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <NumField id="pci-nova-pos" value={posNova} quantity="length" decimals={3} onCommit={(v) => setNovaPos(v)} />
              <button
                type="button"
                className="btn small"
                onClick={() => executar(() => cmd({ type: 'addGridLine', wallId: wall.id, line: { id: newId('gl'), axis: novaEixo, pos: posNova } }))}
              >
                {t('pct_inst_extra_add')}
              </button>
            </div>
          </Row>

          <div className="hint">{t('pct_inst_seg_title')}</div>
          {res.segmentos.length === 0 && <p className="hint">{t('pct_inst_seg_none')}</p>}
          {res.segmentos.map((sg, i) => {
            const { eixo, metros } = linhaDoSegmento(res, sg);
            const rotulo = t('pct_inst_seg_item', { eixo: eixo === 'u' ? 'U' : 'V', pos: fmt('length', metros), k: sg.k + 1 });
            return (
              <Row key={`${i}-${sg.k}`} label={rotulo}>
                <button type="button" className="btn small" onClick={() => restaurarSegmento(sg)}>
                  {t('pct_inst_seg_restore')}
                </button>
              </Row>
            );
          })}
        </>
      )}
      {erro && <p className="hint" role="alert">{erro}</p>}
    </Group>
  );
}
