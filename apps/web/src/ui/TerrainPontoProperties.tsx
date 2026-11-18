import { useState, type ReactElement } from 'react';
import { coordenadaReal, cotaExibida, TERRENO_LIMITES, type Terrain } from '@hestia/model';
import type { TerrainEditTool } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row } from './fields.tsx';
import { editorDeTerreno } from './terrainActions.ts';

/**
 * Grupo "Ponto selecionado" das propriedades do terreno: X, Y e Cota do ponto ou vértice escolhido no modo Editar terreno, para o ajuste fino.
 * A escolha vive na ferramenta (`TerrainEditTool.pontoSelecionado`); este painel a lê a cada tick de interface (clique, arrasto, edição, desfazer) e grava
 * pela própria ferramenta (`definirPontoSelecionado`: um `editTerrainFontes`, um desfazer). Ponto solto: só ele. Vértice de curva: X e Y do vértice e a
 * cota da curva INTEIRA (a nota diz isso). Vértice de quebra: X, Y e Z. Com a Localização do projeto definida, E e N reais aparecem só para leitura.
 */
/** O que o painel usa da ferramenta Editar terreno (a ferramenta ativa, ou um dublê nos testes). */
export type FerramentaDePonto = Pick<TerrainEditTool, 'terrenoId' | 'pontoSelecionado' | 'definirPontoSelecionado'>;

export function PontoSelecionado({ terreno, tool }: { terreno: Terrain; tool: FerramentaDePonto | null }): ReactElement | null {
  const { t } = useT();
  const p = useProject();
  // Refaz os campos quando a gravação é recusada (o texto digitado não vale): a chave muda e o NumField volta ao valor do modelo.
  const [recusas, setRecusas] = useState(0);
  const d = tool && tool.terrenoId === terreno.id ? tool.pontoSelecionado : null;
  if (!tool || !d) return null;
  const gravar = (campos: { x?: number; y?: number; cota?: number }): void => {
    if (!tool.definirPontoSelecionado(campos)) setRecusas((n) => n + 1);
  };
  const tipo = { ponto: 'ui_tn_pt_tipo_ponto', curva: 'ui_tn_pt_tipo_curva', quebra: 'ui_tn_pt_tipo_quebra' } as const;
  const real = p.localizacao ? coordenadaReal(p, d) : null;
  const k = (campo: string): string => `${campo}-${recusas}`;
  const c = TERRENO_LIMITES.coordMax;
  return (
    <Group title={t('ui_tn_pt_grupo')} stateKey="terreno-ponto">
      <Row label={t('ui_tn_pt_tipo')} readOnly><span className="val">{t(tipo[d.ref.tipo])}</span></Row>
      <Row label={t('ui_tn_pt_x')} htmlFor="p-tn-pt-x"><NumField key={k('x')} id="p-tn-pt-x" quantity="length" min={-c} max={c} strictRange value={d.x} onCommit={(v) => gravar({ x: v })} onInvalid={() => gravar({ x: Number.NaN })} /></Row>
      <Row label={t('ui_tn_pt_y')} htmlFor="p-tn-pt-y"><NumField key={k('y')} id="p-tn-pt-y" quantity="length" min={-c} max={c} strictRange value={d.y} onCommit={(v) => gravar({ y: v })} onInvalid={() => gravar({ y: Number.NaN })} /></Row>
      <Row label={t('ui_tn_pt_cota')} htmlFor="p-tn-pt-cota"><NumField key={k('z')} id="p-tn-pt-cota" quantity="length" value={cotaExibida(p, d.z)} onCommit={(v) => gravar({ cota: v })} onInvalid={() => gravar({ cota: Number.NaN })} /></Row>
      {d.ref.tipo === 'curva' ? <div className="hint" style={{ padding: '0 8px 4px' }}>{t('ui_tn_pt_cota_curva')}</div> : null}
      {real ? <Row label={t('ui_tn_pt_leste')} htmlFor="p-tn-pt-e"><NumField id="p-tn-pt-e" quantity="length" readOnly value={real.leste} onCommit={() => undefined} /></Row> : null}
      {real ? <Row label={t('ui_tn_pt_norte')} htmlFor="p-tn-pt-n"><NumField id="p-tn-pt-n" quantity="length" readOnly value={real.norte} onCommit={() => undefined} /></Row> : null}
    </Group>
  );
}

/** O painel ligado à ferramenta ativa: relê a escolha a cada tick de interface (clique, arrasto de alça, edição, desfazer). */
export function PontoSelecionadoAtivo({ terreno }: { terreno: Terrain }): ReactElement {
  useUi((s) => s.previewTick);
  return <PontoSelecionado terreno={terreno} tool={editorDeTerreno(editor)} />;
}
