import { useReducer, type ReactElement } from 'react';
import type { TerrainEditTool, TerrainTool } from '@hestia/tools';
import { editor } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { useT, type Dict } from '../editor/i18n.ts';
import { sairEdicaoTerreno } from '../editor/terrenoEdicao.ts';
import { NumField } from './fields.tsx';
import { editorDeTerreno, topografiaAtiva, type ModoEdicaoTerreno, type ModoTopografia } from './terrainActions.ts';

const MODOS_TOPOGRAFIA: ReadonlyArray<{ value: ModoTopografia; chave: keyof Dict }> = [
  { value: 'pontos', chave: 'ui_tn_o_pontos' },
  { value: 'curvas', chave: 'ui_tn_o_curvas' },
];

const SUBMODOS: ReadonlyArray<{ value: ModoEdicaoTerreno; chave: keyof Dict }> = [
  { value: 'editar', chave: 'ui_tn_o_editar' },
  { value: 'ponto', chave: 'ui_tn_o_ponto' },
  { value: 'curva', chave: 'ui_tn_o_curva' },
  { value: 'quebra', chave: 'ui_tn_o_quebra' },
  { value: 'borda', chave: 'ui_tn_o_borda' },
];

/** Campos da Topografia: modo (pontos ou curvas), Cota (exibida) e Passo. A ferramenta guarda o estado; `onChange` pede um novo desenho. */
export function TopografiaOpcoes({ tool, onChange }: { tool: TerrainTool; onChange: () => void }): ReactElement {
  const { t } = useT();
  return (
    <>
      <label>
        {t('pro_mode')}
        <select id="opt-tn-modo" className="select" value={tool.modoAtual} onChange={(e) => { tool.definirModo(e.target.value as ModoTopografia); onChange(); }}>
          {MODOS_TOPOGRAFIA.map((m) => <option key={m.value} value={m.value}>{t(m.chave)}</option>)}
        </select>
      </label>
      <label>
        {t('ui_tn_o_cota')}
        <NumField id="opt-tn-cota" quantity="length" value={tool.cotaDoCampo} onCommit={(v) => { tool.definirCotaDoCampo(v); onChange(); }} />
      </label>
      <label>
        {t('ui_tn_o_passo')}
        <NumField id="opt-tn-passo" quantity="length" value={tool.passo} onCommit={(v) => { tool.definirPasso(v); onChange(); }} />
      </label>
    </>
  );
}

/** Campos do Editar terreno: submodos Ponto, Curva, Linha de quebra, Borda e Editar; Remover borda; campo Cota; Concluir. */
export function EdicaoOpcoes({ tool, onChange, onConcluir }: { tool: TerrainEditTool; onChange: () => void; onConcluir: () => void }): ReactElement {
  const { t } = useT();
  const cota = tool.cotaDoSelecionado ?? tool.cotaDoCampo;
  return (
    <>
      <span role="group" aria-label={t('pro_mode')} style={{ display: 'inline-flex', gap: 4 }}>
        {SUBMODOS.map((m) => (
          <button key={m.value} type="button" className={`btn small${tool.modoAtual === m.value ? ' primary' : ''}`} aria-pressed={tool.modoAtual === m.value} onClick={() => { tool.definirModo(m.value); onChange(); }}>
            {t(m.chave)}
          </button>
        ))}
        <button type="button" className="btn small" onClick={() => { tool.removerBorda(); onChange(); }}>{t('ui_tn_o_remover_borda')}</button>
      </span>
      <label>
        {t('ui_tn_o_cota')}
        <NumField id="opt-tn-edit-cota" quantity="length" value={cota} onCommit={(v) => { tool.definirCotaDoCampo(v); onChange(); }} />
      </label>
      <button type="button" className="btn small" onClick={onConcluir}>{t('ui_tn_o_concluir')}</button>
    </>
  );
}

/** Barra de opções da Topografia e do Editar terreno: lê a ferramenta ativa do editor. */
export function TerrainOptionsBar({ tool }: { tool: 'terrain' | 'terrainEdit' }): ReactElement | null {
  // O estado vive na ferramenta (fora do React): `previewTick` e o `force` refazem a leitura depois de cada gesto ou de cada campo.
  useUi((s) => s.previewTick);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const topografia = tool === 'terrain' ? topografiaAtiva(editor) : null;
  const edicao = tool === 'terrainEdit' ? editorDeTerreno(editor) : null;
  if (topografia) return <TopografiaOpcoes tool={topografia} onChange={force} />;
  if (edicao) return <EdicaoOpcoes tool={edicao} onChange={force} onConcluir={() => sairEdicaoTerreno((id) => editor.setTool(id))} />;
  return null;
}
