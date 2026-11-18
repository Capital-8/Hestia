import { clonarSeguro } from './dependencias.ts';
import { compilar, referencias } from './expressao.ts';
import { idLivre, nomeBase, lista } from './edicaoApoio.ts';
import { LIMITES, type Familia, type Peca } from './tipos.ts';

/*
 * Operações de edição das peças (ficha E4-edicao). Ver o contrato em `edicao.ts`. Todas conferem antes de alterar: com erro,
 * a família fica exatamente como estava.
 */

/** Acrescenta a peça ao fim. Erros: id inválido/repetido, limite de LIMITES.pecas. */
export function adicionarPeca(f: Familia, p: Peca): string | null {
  if (!p || typeof p !== 'object') return 'peça inválida';
  if (!Array.isArray(f.pecas)) return 'a família não tem lista de peças';
  if (typeof p.id !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.id)) return `id inválido: “${String(p.id)}”`;
  if (f.pecas.some((x) => x?.id === p.id)) return `id repetido: “${p.id}”`;
  if (f.pecas.length >= LIMITES.pecas) return `limite de ${LIMITES.pecas} peças atingido`;

  f.pecas.push(p);
  return null;
}

/** Conjunto de zonas (grupos não vazios) atualmente preenchidas por alguma peça. */
function zonasPreenchidas(f: Familia): Set<string> {
  const zonas = new Set<string>();
  for (const peca of lista<Peca>(f.pecas)) {
    const grupo = peca?.grupo;
    if (typeof grupo === 'string' && grupo !== '') zonas.add(grupo);
  }
  return zonas;
}

/**
 * Remove as escolhas cuja zona ficou sem nenhuma peça (órfãs por causa da operação): as que apontavam para uma zona
 * preenchida `antes` e que já não está `agora`. Escolhas já órfãs antes da operação ficam intactas. Compara pelos
 * conjuntos, não pela lista, porque a peça pode mudar de grupo.
 */
function podarEscolhasOrfas(f: Familia, zonasAntes: ReadonlySet<string>): void {
  if (!Array.isArray(f.escolhas)) return;
  const agora = zonasPreenchidas(f);
  for (let i = f.escolhas.length - 1; i >= 0; i--) {
    const zona = f.escolhas[i]?.zona;
    if (typeof zona === 'string' && zonasAntes.has(zona) && !agora.has(zona)) f.escolhas.splice(i, 1);
  }
}

export function excluirPeca(f: Familia, id: string): string | null {
  if (!Array.isArray(f.pecas)) return 'a família não tem lista de peças';
  const indice = f.pecas.findIndex((p) => p?.id === id);
  if (indice < 0) return `peça “${id}” não existe`;

  const zonasAntes = zonasPreenchidas(f);
  f.pecas.splice(indice, 1);
  podarEscolhasOrfas(f, zonasAntes);
  return null;
}

/**
 * Duplica a peça logo depois da original, com id novo (`<id>_2`, `<id>_3`… o primeiro livre) e nome `<nome> (cópia)`, copiando
 * tudo (cópia profunda). Devolve o erro; o id novo fica em `f.pecas[índice+1].id`.
 */
export function duplicarPeca(f: Familia, id: string): string | null {
  if (!Array.isArray(f.pecas)) return 'a família não tem lista de peças';
  const indice = f.pecas.findIndex((p) => p?.id === id);
  if (indice < 0) return `peça “${id}” não existe`;

  const original = f.pecas[indice]!;
  const copia = clonarSeguro(original);
  copia.id = idLivre(original.id, f.pecas.map((p) => p.id));
  copia.nome = `${original.nome} (cópia)`;
  f.pecas.splice(indice + 1, 0, copia);
  return null;
}

/** Move a peça `delta` posições na lista (limitado às pontas; delta 0 não muda nada). Erro: peça inexistente. */
export function moverPecaNaLista(f: Familia, id: string, delta: number): string | null {
  if (!Array.isArray(f.pecas)) return 'a família não tem lista de peças';
  const indice = f.pecas.findIndex((p) => p?.id === id);
  if (indice < 0) return `peça “${id}” não existe`;

  const destino = Math.max(0, Math.min(f.pecas.length - 1, indice + Math.trunc(delta)));
  if (!Number.isFinite(destino) || destino === indice) return null;

  const [peca] = f.pecas.splice(indice, 1);
  f.pecas.splice(destino, 0, peca!);
  return null;
}

/**
 * Cria uma cópia ESPELHADA em X (em torno do plano central da família, x = L / 2) logo depois da original: id `<id>_esp` (primeiro
 * livre com sufixo numérico se já existir), nome `<nome> (espelhada)`. Nova origem X = `L - (<origem0>) - (<extensão X>)` onde a
 * extensão X é: eixo x → `espessura`; eixo y ou z → `tamanho0`. Demais campos copiados. Se a peça tem `contorno` poligonal em eixo
 * y ou z, devolve o erro "espelhar peça com contorno poligonal ainda não é suportado" e não altera nada.
 */
export function espelharPecaEmX(f: Familia, id: string): string | null {
  if (!Array.isArray(f.pecas)) return 'a família não tem lista de peças';
  const indice = f.pecas.findIndex((p) => p?.id === id);
  if (indice < 0) return `peça “${id}” não existe`;

  const original = f.pecas[indice]!;
  if ((original.eixo === 'y' || original.eixo === 'z') && original.contorno?.tipo === 'poligono') {
    return 'espelhar peça com contorno poligonal ainda não é suportado';
  }

  const origem = Array.isArray(original.origem) ? original.origem : [];
  if (typeof origem[0] !== 'string') return 'a peça não tem origem';
  const extensao = original.eixo === 'x' ? original.espessura : (Array.isArray(original.tamanho) ? original.tamanho[0] : undefined);
  if (typeof extensao !== 'string') return 'a peça não tem a medida para espelhar';

  const copia = clonarSeguro(original);
  copia.id = idLivre(`${original.id}_esp`, f.pecas.map((p) => p.id));
  copia.nome = `${original.nome} (espelhada)`;
  copia.origem = [`L - (${origem[0]}) - (${extensao})`, origem[1], origem[2]];
  f.pecas.splice(indice + 1, 0, copia);
  return null;
}

/**
 * Arranjo linear: faz a peça se repetir `n` vezes com `passo` entre cópias ao longo de `eixo` ('x' | 'y' | 'z'): `repetir = n`
 * e a origem naquele eixo vira `(<origem atual>) + (i - 1) * (<passo>)`. Se a peça já tinha `repetir`, recusa ("a peça já se
 * repete"). `n` e `passo` são fórmulas e precisam compilar; `n` não pode usar `i`/`n`.
 */
export function arranjoLinear(f: Familia, id: string, eixo: 'x' | 'y' | 'z', n: string, passo: string): string | null {
  if (!Array.isArray(f.pecas)) return 'a família não tem lista de peças';
  const peca = lista<Peca>(f.pecas).find((p) => p?.id === id);
  if (peca === undefined) return `peça “${id}” não existe`;
  if (peca.repetir !== undefined) return 'a peça já se repete';

  if (eixo !== 'x' && eixo !== 'y' && eixo !== 'z') return `eixo desconhecido: “${String(eixo)}”`;
  const indice: 0 | 1 | 2 = eixo === 'x' ? 0 : eixo === 'y' ? 1 : 2;
  if (!Array.isArray(peca.origem)) return 'a peça não tem origem';
  const atual = peca.origem[indice];
  if (typeof atual !== 'string') return 'a peça não tem origem';

  const repeticao = compilar(n);
  if ('erro' in repeticao) return `a fórmula de repetição não compila: ${repeticao.erro.message}`;
  if (referencias(repeticao.no).some((r) => { const base = nomeBase(r); return base === 'i' || base === 'n'; })) {
    return 'a fórmula de repetição não pode usar i nem n';
  }
  const passoCompilado = compilar(passo);
  if ('erro' in passoCompilado) return `a fórmula do passo não compila: ${passoCompilado.erro.message}`;

  peca.repetir = n.trim();
  peca.origem[indice] = `(${atual}) + (i - 1) * (${passo.trim()})`;
  return null;
}
