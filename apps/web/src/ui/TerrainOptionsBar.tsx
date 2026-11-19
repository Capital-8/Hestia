import { useReducer, type ReactElement } from 'react';
import { TERRENO_LIMITES, type PapelRegiaoTerreno } from '@hestia/model';
import { FLECHA_MAX, FLECHA_MIN, FLECHA_PADRAO, TerrainRegionTool, type TerrainEditTool, type TerrainTool, type ToolOptions } from '@hestia/tools';
import { editor } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { useT, type Dict } from '../editor/i18n.ts';
import { sairEdicaoTerreno } from '../editor/terrenoEdicao.ts';
import { Check, NumField } from './fields.tsx';
import { grausParaRad, radParaGraus } from './dialogs/localizacaoForm.ts';
import { fracaoParaPercentual, percentualParaFracao } from './terrainPropsModel.ts';
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

/**
 * Campos da forma da curva de nível (galeria "Desenhar"): flecha máxima da discretização (m, com as unidades do projeto) e, nos polígonos,
 * o número de lados. Some com a forma "Linha". As opções vivem no estado de interface, como as da Parede e da linha de detalhe.
 */
export function FormaCurvaCampos(): ReactElement | null {
  const { t } = useT();
  const o = useUi((s) => s.options);
  const forma = o.terrainShape ?? 'line';
  if (forma === 'line') return null;
  const set = (patch: Partial<ToolOptions>): void => useUi.setState((s) => ({ options: { ...s.options, ...patch } }));
  return (
    <>
      <label>
        {t('ui_tn_o_flecha')}
        <NumField id="opt-tn-flecha" quantity="smallLength" value={o.terrainFlecha ?? FLECHA_PADRAO} min={FLECHA_MIN} max={FLECHA_MAX} onCommit={(v) => set({ terrainFlecha: Math.min(FLECHA_MAX, Math.max(FLECHA_MIN, v)) })} />
      </label>
      {forma === 'poly-inscribed' || forma === 'poly-circumscribed' ? (
        <label>
          {t('pro_poly_sides')}
          <NumField id="opt-tn-lados" value={o.terrainPolygonSides ?? 6} decimals={0} min={3} max={64} onCommit={(v) => set({ terrainPolygonSides: Math.min(64, Math.max(3, Math.round(v))) })} />
        </label>
      ) : null}
    </>
  );
}

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
      {tool.modoAtual === 'curvas' ? <FormaCurvaCampos /> : null}
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
      {tool.modoAtual === 'curva' ? <FormaCurvaCampos /> : null}
      <button type="button" className="btn small" onClick={onConcluir}>{t('ui_tn_o_concluir')}</button>
    </>
  );
}

const PAPEIS_REGIAO: ReadonlyArray<{ value: PapelRegiaoTerreno; chave: keyof Dict }> = [
  { value: 'subdivisao', chave: 'ui_tn_r_papel_subdivisao' },
  { value: 'plataforma', chave: 'ui_tn_r_papel_plataforma' },
  { value: 'nivelada', chave: 'ui_tn_r_papel_nivelada' },
];

/** A ferramenta Região de terreno ativa, ou null. */
const regiaoDoEditor = (ed: { readonly activeTool: unknown }): TerrainRegionTool | null => (ed.activeTool instanceof TerrainRegionTool ? ed.activeTool : null);

/**
 * Campos da Região de terreno: papel (as três predefinições), "Por elemento" (só plataforma), Cota, Inclinação (%), Direção de subida (graus),
 * taludes de corte e aterro e Área permeável. A subdivisão não tem plano nem taludes: só o papel e a permeabilidade.
 */
export function RegiaoOpcoes({ tool, onChange }: { tool: TerrainRegionTool; onChange: () => void }): ReactElement {
  const { t } = useT();
  const plano = tool.predefinicao !== 'subdivisao';
  return (
    <>
      <label>
        {t('ui_tn_r_papel')}
        <select id="opt-rg-papel" className="select" value={tool.predefinicao} onChange={(e) => { tool.definirPredefinicao(e.target.value as PapelRegiaoTerreno); onChange(); }}>
          {PAPEIS_REGIAO.map((o) => <option key={o.value} value={o.value}>{t(o.chave)}</option>)}
        </select>
      </label>
      {tool.predefinicao === 'plataforma' ? <Check id="opt-rg-elemento" checked={tool.porElemento} onChange={(v) => { tool.definirPorElemento(v); onChange(); }}>{t('ui_tn_o_por_elemento')}</Check> : null}
      {plano ? (
        <>
          <label>
            {t('ui_tn_o_cota')}
            <NumField id="opt-rg-cota" quantity="length" value={tool.cotaDoCampo} onCommit={(v) => { tool.definirCotaDoCampo(v); onChange(); }} />
          </label>
          <label>
            {t('ui_tn_r_inclinacao')}
            <NumField id="opt-rg-incl" suffix="%" decimals={2} min={0} max={TERRENO_LIMITES.inclinacaoMax * 100} value={fracaoParaPercentual(tool.inclinacao)} onCommit={(v) => { tool.definirInclinacao(percentualParaFracao(v)); onChange(); }} />
          </label>
          <label>
            {t('ui_tn_r_direcao')}
            <NumField id="opt-rg-dir" suffix="°" decimals={2} value={radParaGraus(tool.direcao)} onCommit={(v) => { tool.definirDirecao(grausParaRad(v)); onChange(); }} />
          </label>
          <label>
            {t('ui_tn_r_talude_corte')}
            <NumField id="opt-rg-tcorte" suffix=":1" decimals={2} min={0} max={TERRENO_LIMITES.taludeMax} value={tool.taludeCorte} onCommit={(v) => { tool.definirTalude('corte', v); onChange(); }} />
          </label>
          <label>
            {t('ui_tn_r_talude_aterro')}
            <NumField id="opt-rg-taterro" suffix=":1" decimals={2} min={0} max={TERRENO_LIMITES.taludeMax} value={tool.taludeAterro} onCommit={(v) => { tool.definirTalude('aterro', v); onChange(); }} />
          </label>
        </>
      ) : null}
      <Check id="opt-rg-perm" checked={tool.permeavel} onChange={(v) => { tool.definirPermeavel(v); onChange(); }}>{t('ui_tn_r_permeavel')}</Check>
    </>
  );
}

/** Barra de opções da Topografia, do Editar terreno e da Região de terreno: lê a ferramenta ativa do editor. */
export function TerrainOptionsBar({ tool }: { tool: 'terrain' | 'terrainEdit' | 'terrainRegion' }): ReactElement | null {
  // O estado vive na ferramenta (fora do React): `previewTick` e o `force` refazem a leitura depois de cada gesto ou de cada campo.
  useUi((s) => s.previewTick);
  const [, force] = useReducer((n: number) => n + 1, 0);
  const topografia = tool === 'terrain' ? topografiaAtiva(editor) : null;
  const edicao = tool === 'terrainEdit' ? editorDeTerreno(editor) : null;
  const regiao = tool === 'terrainRegion' ? regiaoDoEditor(editor) : null;
  if (topografia) return <TopografiaOpcoes tool={topografia} onChange={force} />;
  if (regiao) return <RegiaoOpcoes tool={regiao} onChange={force} />;
  if (edicao) return <EdicaoOpcoes tool={edicao} onChange={force} onConcluir={() => sairEdicaoTerreno((id) => editor.setTool(id))} />;
  return null;
}
