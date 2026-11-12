// Seção "Linhas extras" do painel de propriedades da parede cortina (ADR 0056, fase 2): as linhas extras desta parede (posição
// digitada, travar, apagar) e adicionar uma linha por posição. A grade do tipo e a sobrescrita por parede não moram aqui: a grade
// fica no diálogo "Editar tipo" (aba Cortina), e as linhas geradas e os segmentos removidos ficam no subelemento (Tab ou clique).
// Cada ação é um comando do modelo. Erros do modelo aparecem na própria seção, sem derrubar o painel.
import { useState, type ReactElement } from 'react';
import { isCurtainType, newId, resolverParede, type Command, type ParedeResolvida, type Wall } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { CADEADO_VIEWBOX, iconeCadeado } from '../editor/curtainHandles.ts';
import { Group, NumField, Row } from './fields.tsx';

type Eixo = 'u' | 'v';

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

/** Seção "Linhas extras" da parede cortina selecionada. Sem tipo cortina, não renderiza nada. */
export function CurtainLinhasExtras({ wall }: { wall: Wall }): ReactElement | null {
  const { t, lang } = useT();
  const p = useProject();
  const [erro, setErro] = useState<string | null>(null);
  const [novaEixo, setNovaEixo] = useState<Eixo>('u');
  const [novaPos, setNovaPos] = useState<number | null>(null);
  const tipo = p.wallTypes[wall.typeId];
  const res = isCurtainType(tipo) ? resolverParede(p, wall) : null;
  if (!isCurtainType(tipo) || !res) return null;

  /** Executa a ação; erro do modelo vai para a seção, sem derrubar o painel. */
  const executar = (fn: () => void): void => {
    try {
      fn();
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  const cmd = (c: Command): void => editor.store.exec(c, undefined, lang);

  const meio = (novaEixo === 'u' ? res.L : res.H) / 2;
  const posNova = novaPos ?? meio;
  const extras = linhasExtras(res);

  return (
    <Group title={t('pct_inst_extra_title')} stateKey="curtain-extra-lines">
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
      {erro && <p className="hint" role="alert">{erro}</p>}
    </Group>
  );
}
