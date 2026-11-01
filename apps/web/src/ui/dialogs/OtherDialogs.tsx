import { useState, type ReactElement } from 'react';
import { COMANDOS_COM_ATALHO, TOOL_GROUPS, type ShortcutCommand } from '@hestia/tools';
import { nomeComandoLang, useI18n } from '../../editor/i18n.ts';
import { makeLevel, newId } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { pinAutoTops } from '../../editor/levelActions.ts';
import { commitLevelElevation } from '../../editor/commitLevelElevation.ts';
import { hasAutosave } from '../../editor/storage.ts';
import { useUi } from '../../editor/state.ts';
import { useAtalhos } from '../../editor/shortcutConfig.ts';
import { NumField, TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

// O diálogo do tipo de abertura vive em `openingType/`; o nome antigo continua sendo a porta de entrada do App.
export { OpeningTypeDialog } from './openingType/OpeningTypeDialog.tsx';

export function LevelsDialog(): ReactElement {
  const p = useProject();
  const arg = useUi((s) => s.dialogArg);
  // Destaque da linha: o nível selecionado no 3D manda; sem ele, vale o `dialogArg` (clique na linha de nível do 3D).
  const destaque = useUi((s) => s.selectedLevel) ?? arg;
  const [err, setErr] = useState('');
  const run = (fn: () => void): void => {
    try {
      fn();
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro');
    }
  };
  return (
    <Dialog title="Níveis" sub="Referências verticais do projeto" size="narrow" onClose={close} footer={<button className="btn primary" onClick={close}>Fechar</button>}>
      <table className="layers">
        <thead><tr><th>Nome</th><th>Elevação</th><th /></tr></thead>
        <tbody>
          {p.levels.map((l) => (
            <tr key={l.id} style={l.id === destaque ? { background: 'var(--sel-bg, rgba(0,0,0,0.06))' } : undefined} data-selected={l.id === destaque ? 'true' : undefined}>
              <td><TextField value={l.name} onCommit={(v) => run(() => editor.store.exec({ type: 'upsertLevel', level: { ...l, name: v || l.name } }))} /></td>
              <td><NumField value={l.elevation} quantity="length" onCommit={(v) => run(() => {
                if (!commitLevelElevation(l.id, v)) throw new Error(useUi.getState().status);
              })} /></td>
              <td><button className="btn small danger" onClick={() => run(() => editor.store.exec({ type: 'deleteLevel', id: l.id }))}>Excluir</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {err ? <p className="error" role="alert">{err}</p> : null}
      <p>
        <button className="btn small" onClick={() => run(() => {
          // Inserir um nível no meio não pode trocar o topo automático das escadas que já existem: fixa antes.
          editor.store.transaction('Novo nível', () => {
            pinAutoTops(editor.store);
            editor.store.exec({ type: 'upsertLevel', level: makeLevel({ id: newId('lv'), name: `Pavimento ${p.levels.length + 1}`, elevation: (p.levels[p.levels.length - 1]?.elevation ?? 0) + 3 }) });
          });
        })}>+ Novo nível</button>
      </p>
    </Dialog>
  );
}

/**
 * Novo projeto: só o projeto em branco e o que já está salvo — o último projeto deste navegador (autosave) e um
 * arquivo `.hestia.json` do disco. Os exemplos de `TEMPLATES` (casa, prédio, esquadrias…) são material de teste e
 * não aparecem mais aqui: abrir o app nunca deve começar por um projeto de exemplo.
 */
export function StartDialog(): ReactElement {
  const [has] = useState(() => hasAutosave());
  const emBranco = (): void => {
    editor.newProject('blank');
    close();
    useUi.setState({ tutorial: true });
  };
  const abrirArquivo = (): void => {
    close();
    document.getElementById('file-open')?.click();
  };
  const voltarAoSalvo = (): void => {
    editor.restoreAutosave();
    close();
  };
  const icone = (d: string): ReactElement => (
    <span className="tpl-thumb">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--line-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
  return (
    <Dialog title="Novo projeto" sub="Crie um projeto em branco ou abra um projeto salvo" onClose={close} footer={
      <>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={close}>Cancelar</button>
      </>
    }>
      <div className="tplgrid">
        <button className="tpl" onClick={emBranco}>
          {icone('M5 3h9l5 5v13H5z M14 3v5h5')}
          <span className="tpl-body">
            <span className="tpl-name">Em branco</span>
            <span className="tpl-desc">Dois níveis e os tipos de parede padrão.</span>
            <span className="tpl-meta">Começa sem geometria<span className="area">novo</span></span>
          </span>
        </button>
        <button className="tpl" onClick={abrirArquivo}>
          {icone('M3 7h6l2 2h10v10H3z')}
          <span className="tpl-body">
            <span className="tpl-name">Abrir projeto…</span>
            <span className="tpl-desc">Um arquivo .hestia.json salvo no computador.</span>
            <span className="tpl-meta">Abrir do disco<span className="area">arquivo</span></span>
          </span>
        </button>
        {has ? (
          <button className="tpl" onClick={voltarAoSalvo}>
            {icone('M12 3a9 9 0 1 1-9 9h3a6 6 0 1 0 6-6v3L7 5l5-4z')}
            <span className="tpl-body">
              <span className="tpl-name">Último projeto salvo neste navegador</span>
              <span className="tpl-desc">Retoma o projeto em que você estava trabalhando.</span>
              <span className="tpl-meta">Salvo automaticamente<span className="area">retomar</span></span>
            </span>
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Teclas que não são comando: a tabela de comandos (com as sequências atuais) entra antes destas. */
const KEYS: Array<[string, string]> = [
  ['Esc', 'Cancela o passo; segundo Esc sai da ferramenta. Na vista de corte, volta à planta'],
  ['Enter', 'Confirma o valor digitado'],
  ['0–9 , + − × ÷', 'Digitar medida durante o desenho (aceita expressões)'],
  ['Tab', 'Alterna opção (lado externo da parede, sentido da porta, linha e arco no croqui da escada)'],
  ['Espaço', 'Inverte a dobradiça ao inserir porta; segurar e arrastar move a vista'],
  ['Shift', 'Trava em 0°/90° ao desenhar; soma à seleção'],
  ['Alt (ao arrastar uma ponta)', 'Inverte quem acompanha: solta o canto simples, leva todas as paredes de um nó'],
  ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copiar, recortar e colar seguindo o cursor (o colar acompanha o mouse até o clique)'],
  ['Del', 'Exclui a seleção'],
  ['Ctrl+Z / Ctrl+Y', 'Desfazer / Refazer'],
  ['Ctrl+S', 'Salvar'],
  ['Roda / botão do meio', 'Zoom / mover a vista'],
  ['Botão direito', 'Cancela o passo'],
];

/** Descrições longas de comandos cujo rótulo sozinho não diz tudo (escada, corte etc.). */
const DESCRICAO_COMANDO: Partial<Record<ShortcutCommand, string>> = {
  stair: 'Escada (croqui: limites, espelhos, caminhada, patamar)',
  stairrun: 'Escada reta, em L, em U ou com leque',
  ramp: 'Rampa reta, em L ou em U',
  trim: 'Aparar/Estender',
  joins: 'Junção de canto',
  split: 'Dividir parede',
  section: 'Corte (duas marcas na planta)',
};

/** Tabela de atalhos gerada da configuração atual: comandos na ordem da faixa, depois as teclas fixas. */
export function ShortcutsDialog(): ReactElement {
  const mapa = useAtalhos((s) => s.mapa);
  const lang = useI18n((s) => s.lang);
  const ordem = [...new Set<ShortcutCommand>([...TOOL_GROUPS.flatMap((g) => g.tools), ...COMANDOS_COM_ATALHO])];
  return (
    <Dialog
      title="Atalhos"
      size="mid"
      onClose={close}
      footer={<><button className="btn" onClick={() => useUi.setState({ dialog: 'shortcutsConfig', dialogArg: null })}>Personalizar atalhos…</button><button className="btn primary" onClick={close}>Fechar</button></>}
    >
      <table className="kbtable">
        <tbody>
          <tr><td><span style={{ color: 'var(--fg-faint)' }}>sem tecla</span></td><td>Selecionar (volta com Esc)</td></tr>
          {ordem.map((cmd) => (
            <tr key={cmd}>
              <td>{mapa[cmd] ? <kbd>{mapa[cmd]}</kbd> : <span style={{ color: 'var(--fg-faint)' }}>sem atalho</span>}</td>
              <td title={DESCRICAO_COMANDO[cmd]}>{nomeComandoLang(cmd, lang)}</td>
            </tr>
          ))}
          {KEYS.map(([k, d]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>)}
        </tbody>
      </table>
    </Dialog>
  );
}
