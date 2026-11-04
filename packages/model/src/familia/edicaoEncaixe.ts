import { renomearNoTexto } from './expressao.ts';
import { lista } from './edicaoApoio.ts';
import type { Conector, Escolha, Familia } from './tipos.ts';

/*
 * Operações de edição dos conectores e escolhas (ficha ESC-modelo). Ver o contrato em `edicao.ts`: puras sobre o
 * rascunho, devolvem `null` em sucesso ou o MOTIVO em português; com erro a família fica exatamente como estava.
 * Conferem só o id (duplicado/inexistente); o resto quem garante é `validarEncaixe`, como nas outras edições.
 */

/**
 * Renomear um parâmetro troca também `escolhas[].parametro` e as referências na `folga` dos conectores.
 * Chamada por `renomearParametro` depois de reescrever as fórmulas.
 */
export function propagarRenomeEmEncaixes(f: Familia, velho: string, novo: string): void {
  for (const c of lista<Conector>(f.conectores)) {
    if (!c || typeof c !== 'object' || typeof c.folga !== 'string') continue;
    const trocado = renomearNoTexto(c.folga, velho, novo);
    if (trocado !== c.folga) c.folga = trocado;
  }
  for (const e of lista<Escolha>(f.escolhas)) {
    if (e && typeof e === 'object' && e.parametro === velho) e.parametro = novo;
  }
}

/** Acrescenta o conector ao fim (cria a lista se não houver). Erros: objeto inválido, id vazio ou repetido. */
export function adicionarConector(f: Familia, c: Conector): string | null {
  if (!c || typeof c !== 'object') return 'conector inválido';
  if (f.conectores !== undefined && !Array.isArray(f.conectores)) return 'a família não tem lista de conectores';
  if (typeof c.id !== 'string' || c.id.trim() === '') return 'o conector precisa de um id não vazio';
  if (f.conectores?.some((x) => x?.id === c.id)) return `id repetido: “${c.id}”`;

  if (f.conectores === undefined) f.conectores = [c];
  else f.conectores.push(c);
  return null;
}

/** Troca os campos presentes no patch (nome, lado, etiqueta, aceita, folga). Erro: conector inexistente. */
export function editarConector(f: Familia, id: string, patch: Partial<Omit<Conector, 'id'>>): string | null {
  if (!patch || typeof patch !== 'object') return 'patch inválido';
  const alvo = (Array.isArray(f.conectores) ? f.conectores : []).find((x) => x?.id === id);
  if (alvo === undefined) return `conector “${id}” não existe`;

  if (patch.nome !== undefined) alvo.nome = patch.nome;
  if (patch.lado !== undefined) alvo.lado = patch.lado;
  if (patch.etiqueta !== undefined) alvo.etiqueta = patch.etiqueta;
  if (patch.aceita !== undefined) alvo.aceita = patch.aceita;
  if (patch.folga !== undefined) alvo.folga = patch.folga;
  return null;
}

/** Remove o conector. Erro: inexistente. */
export function excluirConector(f: Familia, id: string): string | null {
  if (!Array.isArray(f.conectores)) return `conector “${id}” não existe`;
  const indice = f.conectores.findIndex((x) => x?.id === id);
  if (indice < 0) return `conector “${id}” não existe`;

  f.conectores.splice(indice, 1);
  return null;
}

/** Acrescenta a escolha ao fim (cria a lista se não houver). Erros: objeto inválido, id vazio ou repetido. */
export function adicionarEscolha(f: Familia, e: Escolha): string | null {
  if (!e || typeof e !== 'object') return 'escolha inválida';
  if (f.escolhas !== undefined && !Array.isArray(f.escolhas)) return 'a família não tem lista de escolhas';
  if (typeof e.id !== 'string' || e.id.trim() === '') return 'a escolha precisa de um id não vazio';
  if (f.escolhas?.some((x) => x?.id === e.id)) return `id repetido: “${e.id}”`;

  if (f.escolhas === undefined) f.escolhas = [e];
  else f.escolhas.push(e);
  return null;
}

/** Troca os campos presentes no patch (nome, parametro, zona). Erro: escolha inexistente. */
export function editarEscolha(f: Familia, id: string, patch: Partial<Omit<Escolha, 'id'>>): string | null {
  if (!patch || typeof patch !== 'object') return 'patch inválido';
  const alvo = (Array.isArray(f.escolhas) ? f.escolhas : []).find((x) => x?.id === id);
  if (alvo === undefined) return `escolha “${id}” não existe`;

  if (patch.nome !== undefined) alvo.nome = patch.nome;
  if (patch.parametro !== undefined) alvo.parametro = patch.parametro;
  if (patch.zona !== undefined) alvo.zona = patch.zona;
  return null;
}

/** Remove a escolha. Erro: inexistente. */
export function excluirEscolha(f: Familia, id: string): string | null {
  if (!Array.isArray(f.escolhas)) return `escolha “${id}” não existe`;
  const indice = f.escolhas.findIndex((x) => x?.id === id);
  if (indice < 0) return `escolha “${id}” não existe`;

  f.escolhas.splice(indice, 1);
  return null;
}
