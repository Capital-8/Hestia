import type { Peca, Usinagem } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { FamiliaUsinagemEditor } from './FamiliaUsinagemEditor.tsx';
import { executarPeca } from './familiaPecaAviso.ts';
import { ROTULO_FACE, ROTULO_TIPO_USINAGEM, resumoUsinagem, usinagemPadrao, validarUsinagem } from './familiaUsinagem.ts';
import { useResolucao } from './familiaStore.ts';
import './familiaCatalogo.css';

/** Usinagens da peça selecionada: lista com editar/excluir e o editor inline de cada usinagem. */

interface Editor {
  chave: number;
  idOriginal: string | null;
  usinagem: Usinagem;
}

export function FamiliaUsinagens({ peca }: { peca: Peca }): ReactElement {
  const env = useResolucao().env;
  const [editor, setEditor] = useState<Editor | null>(null);
  const lista = Array.isArray(peca.usinagens) ? peca.usinagens : [];

  const abrir = (idOriginal: string | null, usinagem: Usinagem): void => {
    setEditor((atual) => ({ chave: (atual?.chave ?? 0) + 1, idOriginal, usinagem }));
  };

  const nova = (): void => {
    abrir(null, usinagemPadrao('furo', 'a', lista.map((u) => u.id)));
  };

  const editar = (indice: number): void => {
    const alvo = lista[indice];
    if (alvo === undefined) return;
    abrir(alvo.id, structuredClone(alvo));
  };

  const excluir = (indice: number): void => {
    const alvo = lista[indice];
    if (alvo === undefined) return;
    const motivo = executarPeca('Excluir usinagem', (f) => {
      const alvoPeca = f.pecas.find((x) => x.id === peca.id);
      if (alvoPeca === undefined) return `peça “${peca.id}” não existe`;
      if (!Array.isArray(alvoPeca.usinagens)) return 'a peça não tem usinagens';
      const pos = alvoPeca.usinagens.findIndex((x) => x.id === alvo.id);
      if (pos < 0) return `usinagem “${alvo.id}” não existe`;
      alvoPeca.usinagens.splice(pos, 1);
      if (alvoPeca.usinagens.length === 0) delete alvoPeca.usinagens;
      return null;
    });
    if (motivo === null && editor?.idOriginal === alvo.id) setEditor(null);
  };

  const salvar = (usinagem: Usinagem): string | null => {
    if (editor === null) return 'o editor da usinagem está fechado';
    const idOriginal = editor.idOriginal;
    const motivo = executarPeca('Editar usinagem', (f) => {
      const alvoPeca = f.pecas.find((x) => x.id === peca.id);
      if (alvoPeca === undefined) return `peça “${peca.id}” não existe`;
      const recusa = validarUsinagem(alvoPeca, usinagem, idOriginal ?? undefined, env);
      if (recusa !== null) return recusa;
      if (idOriginal === null) {
        alvoPeca.usinagens = [...(alvoPeca.usinagens ?? []), usinagem];
        return null;
      }
      const listaAlvo = alvoPeca.usinagens ?? [];
      const pos = listaAlvo.findIndex((x) => x.id === idOriginal);
      if (pos < 0) return `usinagem “${idOriginal}” não existe`;
      listaAlvo[pos] = usinagem;
      return null;
    });
    if (motivo === null) setEditor(null);
    return motivo;
  };

  return (
    <div className="fam-grp">
      <div className="fam-gh">Usinagens</div>
      <div className="fam-usin-lista">
        {lista.length === 0 && <div className="fam-hint">Nenhuma usinagem nesta peça.</div>}
        {lista.map((u, i) => (
          <div key={`${u.id}-${i}`} className="fam-usin-linha">
            <div className="fam-usin-info">
              <span className="fam-usin-id" title={u.id}>{u.id}</span>
              <span className="fam-usin-tipo">{ROTULO_TIPO_USINAGEM[u.tipo]}</span>
              <span className="fam-usin-face">{ROTULO_FACE[u.face]}</span>
            </div>
            <div className="fam-usin-acoes">
              <button className="fam-bt" onClick={() => editar(i)}>Editar</button>
              <button className="fam-bt" onClick={() => excluir(i)}>Excluir</button>
            </div>
            <div className="fam-usin-resumo">{resumoUsinagem(u)}</div>
          </div>
        ))}
      </div>
      <div className="fam-row acao"><button className="fam-bt" onClick={nova}>Nova usinagem</button></div>
      {editor !== null && (
        <FamiliaUsinagemEditor
          key={editor.chave}
          inicial={editor.usinagem}
          aoSalvar={salvar}
          aoCancelar={() => setEditor(null)}
        />
      )}
    </div>
  );
}
