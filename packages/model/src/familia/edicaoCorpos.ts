import { clonarSeguro } from './dependencias.ts';
import { idLivre, lista } from './edicaoApoio.ts';
import type { Aninhado, Expr, Familia, Peca } from './tipos.ts';
import { LIMITES_CORPO, type Caminho, type Corpo, type FormaCorpo, type Perfil, type Ponto3 } from './tiposCorpo.ts';
import { validarCorpos } from './validarCorpos.ts';

/*
 * Operações de edição dos CORPOS paramétricos (ficha B6; semântica em docs/familias-parametricas/CONTRATO.md §2). Mesmo contrato
 * de `edicao.ts`: puras sobre o rascunho, devolvem `null` em sucesso ou o MOTIVO em português; com erro a família fica exatamente
 * como estava. Cada operação monta o corpo NOVO, confere com `validarCorpos` (o resto da família serve de contexto) e só então
 * grava: o erro nunca deixa o rascunho pela metade.
 */

const SEM_LISTA = 'a família não tem lista de corpos';
const NUMERO_LITERAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/** Peças, aninhados e corpos dividem o mesmo espaço de ids (CONTRATO §2.5). */
function idsDoNamespace(f: Familia): string[] {
  const out: string[] = [];
  for (const p of lista<Peca>(f.pecas)) if (typeof p?.id === 'string') out.push(p.id);
  for (const a of lista<Aninhado>(f.aninhados)) if (typeof a?.id === 'string') out.push(a.id);
  for (const c of lista<Corpo>(f.corpos)) if (typeof c?.id === 'string') out.push(c.id);
  return out;
}

/** Primeiro problema de ERRO que `validarCorpos` acha no corpo (forma, perfil, caminho, fórmulas), ou `null`. */
function problemaDoCorpo(f: Familia, corpo: Corpo): string | null {
  const erro = validarCorpos({ ...f, corpos: [corpo] }).find((p) => p.nivel === 'erro');
  return erro === undefined ? null : `${erro.mensagem} (${erro.onde})`;
}

/** Confere o corpo novo e, só se estiver válido, grava no lugar do antigo. */
function gravar(f: Familia, indice: number, novo: Corpo): string | null {
  const erro = problemaDoCorpo(f, novo);
  if (erro !== null) return erro;
  if (!Array.isArray(f.corpos)) return SEM_LISTA;
  f.corpos[indice] = novo;
  return null;
}

interface Achado {
  indice: number;
  corpo: Corpo;
}

/** Corpo pelo id: índice e objeto, ou o motivo da recusa (lista ausente/corrompida ou id inexistente). */
function localizar(f: Familia, id: string): Achado | string {
  if (!Array.isArray(f.corpos)) return SEM_LISTA;
  const indice = f.corpos.findIndex((c) => c?.id === id);
  const corpo = f.corpos[indice];
  if (indice < 0 || corpo === undefined) return `corpo “${id}” não existe`;
  return { indice, corpo };
}

/** Acrescenta o corpo ao fim (cria a lista se não houver). Erros, nesta ordem: objeto inválido, lista corrompida, id vazio, id repetido (entre peças, aninhados e corpos), nome vazio, limite, forma/perfil/caminho inválidos. */
export function adicionarCorpo(f: Familia, corpo: Corpo): string | null {
  if (!corpo || typeof corpo !== 'object') return 'corpo inválido';
  if (f.corpos !== undefined && !Array.isArray(f.corpos)) return SEM_LISTA;
  if (typeof corpo.id !== 'string' || corpo.id.trim() === '') return 'o corpo precisa de um id não vazio';
  if (idsDoNamespace(f).includes(corpo.id)) return `id repetido: “${corpo.id}”`;
  if (typeof corpo.nome !== 'string' || corpo.nome.trim() === '') return 'o corpo precisa de um nome';
  if (lista<Corpo>(f.corpos).length >= LIMITES_CORPO.corpos) return `limite de ${LIMITES_CORPO.corpos} corpos atingido`;
  const erro = problemaDoCorpo(f, corpo);
  if (erro !== null) return erro;

  if (f.corpos === undefined) f.corpos = [corpo];
  else f.corpos.push(corpo);
  return null;
}

/** Troca os campos presentes no patch (`undefined` remove o campo). O id não muda. Erros: patch inválido, id no patch, nome vazio, corpo inexistente, forma inválida. */
export function editarCorpo(f: Familia, id: string, patch: Partial<Omit<Corpo, 'id'>>): string | null {
  if (!patch || typeof patch !== 'object') return 'patch inválido';
  if ('id' in patch) return 'o id do corpo não muda por edição';
  if (patch.nome !== undefined && (typeof patch.nome !== 'string' || patch.nome.trim() === '')) return 'o corpo precisa de um nome';
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;

  const novo: Corpo = { ...achado.corpo, ...patch };
  for (const chave of Object.keys(patch) as (keyof typeof patch)[]) {
    if (patch[chave] === undefined) Reflect.deleteProperty(novo, chave);
  }
  return gravar(f, achado.indice, novo);
}

/** Remove o corpo. Erros: lista ausente/corrompida, corpo inexistente. */
export function excluirCorpo(f: Familia, id: string): string | null {
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;
  if (!Array.isArray(f.corpos)) return SEM_LISTA;

  f.corpos.splice(achado.indice, 1);
  return null;
}

/** Duplica o corpo logo depois do original, com id novo (`<id>_2`… o primeiro livre) e nome `<nome> (cópia)`, copiando tudo. Erros: corpo inexistente, limite de corpos. */
export function duplicarCorpo(f: Familia, id: string): string | null {
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;
  if (!Array.isArray(f.corpos)) return SEM_LISTA;
  if (f.corpos.length >= LIMITES_CORPO.corpos) return `limite de ${LIMITES_CORPO.corpos} corpos atingido`;

  const copia = clonarSeguro(achado.corpo);
  copia.id = idLivre(achado.corpo.id, idsDoNamespace(f));
  copia.nome = `${achado.corpo.nome} (cópia)`;
  f.corpos.splice(achado.indice + 1, 0, copia);
  return null;
}

/** Move o corpo `delta` posições na lista, limitado às pontas (delta 0 não muda nada). Erros: lista ausente/corrompida, corpo inexistente. */
export function reordenarCorpo(f: Familia, id: string, delta: number): string | null {
  const achado = localizar(f, id);
  if (typeof achado === 'string') return achado;
  if (!Array.isArray(f.corpos)) return SEM_LISTA;

  const destino = Math.max(0, Math.min(f.corpos.length - 1, achado.indice + Math.trunc(delta)));
  if (!Number.isFinite(destino) || destino === achado.indice) return null;

  const [corpo] = f.corpos.splice(achado.indice, 1);
  f.corpos.splice(destino, 0, corpo!);
  return null;
}

const origemZero = (): Ponto3 => ['0', '0', '0'];
const circulo = (diametro: Expr): Perfil => ({ tipo: 'circulo', diametro });

/** Corpo novo com forma padrão sensata para o tipo (cada chamada devolve objetos independentes). */
export function criarCorpoPadrao(tipo: FormaCorpo['tipo'], id: string): Corpo {
  const quadro = { origem: origemZero() };
  switch (tipo) {
    case 'extrusao':
      return { id, nome: 'Extrusão', papel: 'generico', quadro, forma: { tipo, perfil: circulo('50'), comprimento: '500' } };
    case 'revolucao':
      return {
        id,
        nome: 'Revolução',
        papel: 'generico',
        quadro,
        forma: { tipo, perfil: { tipo: 'retangulo', largura: '20', altura: '40' }, angulo: '360', afastamento: '50' },
      };
    case 'varredura':
      return {
        id,
        nome: 'Varredura',
        papel: 'tubo',
        quadro,
        forma: {
          tipo,
          perfil: circulo('50'),
          caminho: { pontos: [origemZero(), ['500', '0', '0'], ['500', '500', '0']], raios: ['100'] },
        },
      };
    case 'transicao':
      return { id, nome: 'Transição', papel: 'generico', quadro, forma: { tipo, perfilA: circulo('100'), perfilB: circulo('50'), comprimento: '200' } };
  }
}

/**
 * Troca o perfil do corpo. Extrusão, revolução e varredura têm um perfil; a transição tem dois e exige `lado` ('A' ou 'B').
 * Erros: corpo inexistente, sem forma, sem perfil, transição sem lado, perfil inválido (pela validação de A2).
 */
export function definirPerfil(f: Familia, corpoId: string, perfil: Perfil, lado?: 'A' | 'B'): string | null {
  if (!perfil || typeof perfil !== 'object') return 'perfil inválido';
  const achado = localizar(f, corpoId);
  if (typeof achado === 'string') return achado;
  const forma = achado.corpo.forma;
  if (!forma || typeof forma !== 'object') return `o corpo “${corpoId}” não tem forma`;

  let novaForma: FormaCorpo;
  if (forma.tipo === 'transicao') {
    if (lado !== 'A' && lado !== 'B') return 'a transição tem dois perfis: informe o lado A ou B';
    novaForma = lado === 'A' ? { ...forma, perfilA: perfil } : { ...forma, perfilB: perfil };
  } else if (forma.tipo === 'extrusao' || forma.tipo === 'revolucao' || forma.tipo === 'varredura') {
    novaForma = { ...forma, perfil };
  } else {
    return `o corpo “${corpoId}” não tem perfil`;
  }
  return gravar(f, achado.indice, { ...achado.corpo, forma: novaForma });
}

/** Função de mudança do caminho: devolve o caminho novo ou o motivo da recusa. */
type MudancaCaminho = (caminho: Caminho) => Caminho | string;

/** Caminho sem a chave `raios` quando `raios` é ausente (não deixa `raios: undefined` para trás). */
function caminhoCom(base: Caminho, pontos: Ponto3[], raios: Expr[] | undefined): Caminho {
  const novo: Caminho = { ...base, pontos };
  if (raios === undefined) delete novo.raios;
  else novo.raios = raios;
  return novo;
}

/**
 * `raios[i]` vale para o vértice interior i + 1, e o caminho novo tem `m` pontos. `mapa[j]` é o índice ANTIGO do ponto novo j
 * (ou -1 se ele é novo). Devolve exatamente `m − 2` raios, mantendo o raio de cada vértice que sobrevive; ausente se nunca
 * houve raios e nenhum vértice ganhou curva.
 */
function raiosApos(antigos: Expr[] | undefined, n: number, mapa: readonly number[]): Expr[] | undefined {
  const novos: Expr[] = [];
  for (let j = 1; j <= mapa.length - 2; j++) {
    const o = mapa[j] ?? -1;
    const raio = o >= 1 && o <= n - 2 ? antigos?.[o - 1] : undefined;
    novos.push(raio ?? '0');
  }
  if (antigos === undefined && novos.every((r) => r === '0')) return undefined;
  return novos;
}

/** Aplica a mudança ao caminho de uma varredura. Erros: corpo inexistente, não é varredura, caminho sem pontos, recusa da mudança. */
function editarCaminho(f: Familia, corpoId: string, mudar: MudancaCaminho): string | null {
  const achado = localizar(f, corpoId);
  if (typeof achado === 'string') return achado;
  const forma = achado.corpo.forma;
  if (!forma || typeof forma !== 'object' || forma.tipo !== 'varredura') return `o corpo “${corpoId}” não é uma varredura`;
  const caminho = forma.caminho;
  if (!caminho || typeof caminho !== 'object' || !Array.isArray(caminho.pontos)) return 'o caminho não tem pontos';

  const novo = mudar(caminho);
  if (typeof novo === 'string') return novo;
  return gravar(f, achado.indice, { ...achado.corpo, forma: { ...forma, caminho: novo } });
}

const pontoInvalido = (ponto: Ponto3): boolean => !Array.isArray(ponto) || ponto.length !== 3;

/** Acrescenta um ponto ao caminho (no fim, ou na `posicao` dada) e ajusta os raios. Erros: não é varredura, posição fora do caminho, ponto sem 3 coordenadas. */
export function adicionarPontoCaminho(f: Familia, corpoId: string, ponto: Ponto3, posicao?: number): string | null {
  return editarCaminho(f, corpoId, (c) => {
    if (pontoInvalido(ponto)) return 'o ponto do caminho precisa de 3 coordenadas';
    const n = c.pontos.length;
    const k = posicao ?? n;
    if (!Number.isInteger(k) || k < 0 || k > n) return `posição ${k} fora do caminho`;

    const pontos = [...c.pontos];
    pontos.splice(k, 0, ponto);
    const mapa = Array.from({ length: n + 1 }, (_, j) => (j < k ? j : j === k ? -1 : j - 1));
    return caminhoCom(c, pontos, raiosApos(c.raios, n, mapa));
  });
}

/** Troca as coordenadas do ponto `indice` (os raios não mudam). Erros: não é varredura, ponto inexistente, ponto sem 3 coordenadas. */
export function moverPontoCaminho(f: Familia, corpoId: string, indice: number, ponto: Ponto3): string | null {
  return editarCaminho(f, corpoId, (c) => {
    if (pontoInvalido(ponto)) return 'o ponto do caminho precisa de 3 coordenadas';
    if (!Number.isInteger(indice) || indice < 0 || indice >= c.pontos.length) return `ponto ${indice} não existe no caminho`;

    const pontos = [...c.pontos];
    pontos[indice] = ponto;
    return caminhoCom(c, pontos, c.raios);
  });
}

/** Remove o ponto `indice` e ajusta os raios (cada vértice que sobrevive leva a sua curva). Erros: não é varredura, ponto inexistente; caminho com menos de 2 pontos é recusado pela validação. */
export function removerPontoCaminho(f: Familia, corpoId: string, indice: number): string | null {
  return editarCaminho(f, corpoId, (c) => {
    const n = c.pontos.length;
    if (!Number.isInteger(indice) || indice < 0 || indice >= n) return `ponto ${indice} não existe no caminho`;

    const pontos = c.pontos.filter((_, j) => j !== indice);
    const mapa = Array.from({ length: n - 1 }, (_, j) => (j < indice ? j : j + 1));
    return caminhoCom(c, pontos, raiosApos(c.raios, n, mapa));
  });
}

/**
 * Define o raio de curva do vértice interior `vertice` (1 a pontos − 2; o vértice i + 1 é `raios[i]`). Texto vazio vale 0 (canto
 * vivo). Erros: não é varredura, vértice que não é interior, raio que não é texto, raio literal negativo.
 */
export function definirRaio(f: Familia, corpoId: string, vertice: number, raio: Expr): string | null {
  return editarCaminho(f, corpoId, (c) => {
    const interiores = c.pontos.length - 2;
    if (!Number.isInteger(vertice) || vertice < 1 || vertice > interiores) {
      return `o vértice ${vertice} não pode ter curva (use um vértice interior, de 1 a ${Math.max(0, interiores)})`;
    }
    if (typeof raio !== 'string') return 'o raio precisa ser uma fórmula de texto';
    const limpo = raio.trim() === '' ? '0' : raio.trim();
    if (NUMERO_LITERAL.test(limpo) && Number(limpo) < 0) return 'o raio não pode ser negativo';

    const raios = Array.from({ length: interiores }, (_, j) => c.raios?.[j] ?? '0');
    raios[vertice - 1] = limpo;
    return caminhoCom(c, c.pontos, raios);
  });
}
