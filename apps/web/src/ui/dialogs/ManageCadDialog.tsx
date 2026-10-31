import type { ReactElement } from 'react';
import { useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { cadBoxOf, cadDrawingsOf, cadLevelName, frameCad, removeCad, renameCad, selectCad, setCadVisible } from '../../editor/cadActions.ts';
import { Dialog } from './Dialog.tsx';
import { TextField } from '../fields.tsx';

/**
 * Diálogo "CAD importado": lista os desenhos DXF do projeto com nível, visibilidade, conteúdo e ações (selecionar,
 * enquadrar, renomear e excluir). É o gerenciador das importações: a aba Inserir abre por aqui, e o Navegador de projeto
 * repete as mesmas ações no nó "CAD importado".
 */
export function ManageCadDialog(): ReactElement {
  const p = useProject();
  const cads = cadDrawingsOf(p);
  const close = (): void => useUi.setState({ dialog: null });
  return (
    <Dialog
      title="CAD importado"
      sub="Desenhos DXF do projeto: visibilidade, enquadramento e exclusão"
      onClose={close}
      size="wide"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>Fechar</button>
          <button className="btn primary" onClick={() => useUi.setState({ dialog: 'importCad', dialogArg: null })}>
            Importar DXF…
          </button>
        </>
      }
    >
      {cads.length === 0 ? (
        <p role="status" style={{ margin: 0, opacity: 0.8 }}>
          Nenhum desenho CAD importado. Use <b>Importar DXF…</b> para inserir a primeira planta de referência.
        </p>
      ) : (
        <div className="table-scroll">
        <table className="kbtable">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Nome</th>
              <th style={{ textAlign: 'left' }}>Nível</th>
              <th>Visível</th>
              <th style={{ textAlign: 'left' }}>Conteúdo</th>
              <th style={{ textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {cads.map((c) => {
              const box = cadBoxOf(c);
              return (
                <tr key={c.id}>
                  <td style={{ minWidth: 180 }}>
                    <TextField
                      id={`cad-manage-name-${c.id}`}
                      value={c.name}
                      onCommit={(v) => renameCad(c, v)}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{cadLevelName(p, c)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      aria-label={`Visível ${c.name}`}
                      checked={c.visible !== false}
                      onChange={(e) => setCadVisible(c, e.target.checked)}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--fg-soft)' }}>
                    {c.layers.length} camada(s) · {c.paths.length} traço(s) · {c.texts.length} texto(s)
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn small" onClick={() => selectCad(c)} title="Seleciona o desenho (as Propriedades mostram o CAD)">Selecionar</button>{' '}
                    <button
                      className="btn small"
                      onClick={() => {
                        selectCad(c);
                        frameCad(c);
                      }}
                      disabled={!box}
                      title="Abre a planta do nível e enquadra o desenho"
                    >
                      Enquadrar
                    </button>{' '}
                    <button className="btn small" onClick={() => removeCad(c)} title="Exclui o desenho (Ctrl+Z desfaz)">Excluir</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      {cads.length > 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--fg-soft)' }}>
          As linhas e os vértices dos desenhos visíveis entram na captura (botão <b>Snap</b> da barra de status, item
          “CAD importado (DXF)”). Use <b>Ocultar</b> no menu de contexto ou desmarque <b>Visível</b> para tirar o desenho
          da captura.
        </p>
      ) : null}
    </Dialog>
  );
}
