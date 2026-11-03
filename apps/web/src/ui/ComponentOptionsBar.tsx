import { useEffect, type ReactElement } from 'react';
import { BIBLIOTECA_BASE, type Familia, type Id, type Project, type ProjectStore, type Tipo } from '@hestia/model';
import type { ToolOptions } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';

/*
 * Barra da ferramenta Componente: a família (do projeto ou da biblioteca, que é carregada ao escolher) e o tipo da
 * família. A primeira família disponível entra sozinha quando a ferramenta é ativada, para o clique já inserir.
 */

/** Famílias já carregadas no projeto, na ordem em que entraram. */
export function familiasDoProjeto(p: Project): Familia[] {
  return Object.values(p.componentFamilies ?? {});
}

/** Famílias da biblioteca que ainda não estão no projeto. */
export function familiasDaBiblioteca(p: Project): Familia[] {
  const noProjeto = new Set(Object.keys(p.componentFamilies ?? {}));
  return BIBLIOTECA_BASE.filter((f) => !noProjeto.has(f.id));
}

/** Primeira da lista (projeto primeiro, depois biblioteca), ou null sem famílias. */
export function familiaInicial(p: Project): Familia | null {
  return familiasDoProjeto(p)[0] ?? familiasDaBiblioteca(p)[0] ?? null;
}

/** Família pelo id, do projeto ou da biblioteca. */
export function familiaEscolhida(p: Project, id: Id | undefined): Familia | null {
  if (!id) return null;
  return p.componentFamilies?.[id] ?? BIBLIOTECA_BASE.find((f) => f.id === id) ?? null;
}

export interface EscolhaDeFamilia {
  familia: Familia;
  /** A família veio da biblioteca e precisa entrar no projeto. */
  carregar: boolean;
}

/** Resolve a escolha do seletor: projeto, biblioteca (a carregar) ou null se o id não existe. */
export function resolverEscolhaDeFamilia(p: Project, id: Id): EscolhaDeFamilia | null {
  const doProjeto = p.componentFamilies?.[id];
  if (doProjeto) return { familia: doProjeto, carregar: false };
  const daBiblioteca = BIBLIOTECA_BASE.find((f) => f.id === id);
  return daBiblioteca ? { familia: daBiblioteca, carregar: true } : null;
}

export interface EscolhaAplicada {
  familia: Familia;
  opcoes: Pick<ToolOptions, 'componentFamilyId' | 'componentTypeId'>;
}

/** Carrega a família no projeto (um passo de desfazer) quando ela vem da biblioteca e devolve as opções a gravar. */
export function aplicarEscolhaDeFamilia(store: ProjectStore, id: Id): EscolhaAplicada | null {
  const escolha = resolverEscolhaDeFamilia(store.project, id);
  if (!escolha) return null;
  if (escolha.carregar) store.exec({ type: 'upsertFamily', family: structuredClone(escolha.familia) }, 'Carregar família');
  return { familia: escolha.familia, opcoes: { componentFamilyId: escolha.familia.id, componentTypeId: null } };
}

/** Tipos da família escolhida (vazio sem família). */
export function tiposDaFamilia(familia: Familia | null): Tipo[] {
  return familia?.tipos ?? [];
}

export function ComponentOptionsBar(): ReactElement {
  const p = useProject();
  const o = useUi((s) => s.options);
  const doProjeto = familiasDoProjeto(p);
  const daBiblioteca = familiasDaBiblioteca(p);
  const atual = familiaEscolhida(p, o.componentFamilyId) ?? familiaInicial(p);
  const tipos = tiposDaFamilia(atual);
  const tipoAtual = o.componentTypeId && tipos.some((tp) => tp.id === o.componentTypeId) ? o.componentTypeId : '';
  const set = (patch: Partial<ToolOptions>): void => {
    useUi.setState((s) => ({ options: { ...s.options, ...patch } }));
  };
  const escolher = (id: Id): void => {
    const r = aplicarEscolhaDeFamilia(editor.store, id);
    if (r) useUi.setState((s) => ({ options: { ...s.options, ...r.opcoes } }));
  };
  useEffect(() => {
    const id = o.componentFamilyId;
    if (id && p.componentFamilies?.[id]) return;
    const alvo = (id ? familiaEscolhida(p, id) : null) ?? familiaInicial(p);
    if (!alvo) return;
    const r = aplicarEscolhaDeFamilia(editor.store, alvo.id);
    if (r) useUi.setState((s) => ({ options: { ...s.options, ...r.opcoes } }));
  }, [p, o.componentFamilyId]);
  return (
    <>
      <label>
        Família
        <select id="opt-compfamily" className="select" value={atual?.id ?? ''} onChange={(e) => escolher(e.target.value)}>
          {doProjeto.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          {daBiblioteca.length > 0 && (
            <optgroup label="Biblioteca">
              {daBiblioteca.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      <label>
        Tipo
        <select id="opt-comptype" className="select" value={tipoAtual} onChange={(e) => set({ componentTypeId: e.target.value === '' ? null : e.target.value })} disabled={!atual}>
          <option value="">Padrão da família</option>
          {tipos.map((tp) => <option key={tp.id} value={tp.id}>{tp.nome}</option>)}
        </select>
      </label>
      <span className="hint">R gira, M espelha</span>
    </>
  );
}
