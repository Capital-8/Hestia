import { useState, type ReactElement } from 'react';
import { FAMILIA_TUBO_PADRAO, opcoesTubo } from '@hestia/tools';
import { useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row } from './fields.tsx';

/** Diâmetros nominais (mm) oferecidos no painel; o DN fica em `opcoesTubo`, lido pela ferramenta a cada clique. */
const DN_COMUNS = [32, 40, 50, 75, 100, 150, 200];

/** Painel de colocação da ferramenta Tubo (ficha C5): família de tubo, DN e altura (z) dos pontos clicados. */
export function TuboProperties(): ReactElement {
  const { t } = useT();
  const p = useProject();
  const escolhida = useUi((s) => s.options.componentFamilyId);
  // `opcoesTubo` é um objeto simples (a ferramenta não é React): o estado local só força o redesenho depois de cada edição.
  const [, redesenhar] = useState(0);
  const familias = Object.values(p.componentFamilies ?? {}).filter((f) => (f.ligacoes?.length ?? 0) >= 2);
  const atual = escolhida ?? FAMILIA_TUBO_PADRAO;
  const dns = DN_COMUNS.includes(opcoesTubo.dn) ? DN_COMUNS : [...DN_COMUNS, opcoesTubo.dn].sort((a, b) => a - b);
  return (
    <Group title={t('tubo_grupo')}>
      {familias.length === 0 ? <p className="hint">{t('tubo_sem_familia')}</p> : null}
      <Row label={t('tubo_familia')} htmlFor="place-tubo-familia">
        <select id="place-tubo-familia" className="select" value={atual} onChange={(e) => useUi.setState((s) => ({ options: { ...s.options, componentFamilyId: e.target.value, componentTypeId: null } }))}>
          {familias.some((f) => f.id === atual) ? null : <option value={atual}>{atual}</option>}
          {familias.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
      </Row>
      <Row label={t('tubo_dn')} htmlFor="place-tubo-dn">
        <select id="place-tubo-dn" className="select" value={opcoesTubo.dn} onChange={(e) => { opcoesTubo.dn = Number(e.target.value); redesenhar((n) => n + 1); }}>
          {dns.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Row>
      <Row label={t('tubo_altura')} htmlFor="place-tubo-z">
        <NumField id="place-tubo-z" quantity="length" value={opcoesTubo.z} onCommit={(v) => { opcoesTubo.z = v; redesenhar((n) => n + 1); }} />
      </Row>
    </Group>
  );
}
