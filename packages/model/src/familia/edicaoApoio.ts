import { FUNCOES, compilar, referencias } from './expressao.ts';
import type { Aninhado, Familia, Ferragem, Parametro, Peca, PlanoReferencia, Tipo, Usinagem, Valor } from './tipos.ts';

/*
 * Apoio das operações de edição (ficha E4-edicao): validação de ids, escolha de id livre e UM percurso único das
 * expressões da família. `todasAsExpressoes`, `usosDoNome` e o renomear usam `percorrerFamilia` para não divergirem.
 */

export interface ExpressaoEditavel {
  /** Lugar no formato de `Problema.onde`. */
  onde: string;
  texto: string;
  gravar: (novo: string) => void;
}

export interface VisitaFamilia {
  formula: (onde: string, texto: string, gravar: (novo: string) => void) => void;
  material?: (pecaId: string, material: string | undefined) => void;
  valoresDeTipo?: (tipoId: string, valores: Record<string, Valor> | undefined) => void;
}

/** Lista segura: campo ausente ou de tipo errado vira lista vazia (nada aqui lança). */
export function lista<T>(v: readonly T[] | undefined): readonly T[] {
  return Array.isArray(v) ? v : [];
}

const RESERVADOS: ReadonlySet<string> = new Set(['i', 'n', ...Object.keys(FUNCOES)]);

export function idValido(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(id);
}

export function idReservado(id: string): boolean {
  return RESERVADOS.has(id);
}

/** Ids de parâmetros e planos (dividem o mesmo espaço de nomes). */
export function idsOcupados(f: Familia): Set<string> {
  const out = new Set<string>();
  for (const p of lista<Parametro>(f.parametros)) if (idValido(p?.id)) out.add(p.id);
  for (const p of lista<PlanoReferencia>(f.planos)) if (idValido(p?.id)) out.add(p.id);
  return out;
}

/** Primeiro id livre: `base`, `base_2`, `base_3`… */
export function idLivre(base: string, usados: Iterable<string>): string {
  const ocupados = new Set(usados);
  if (!ocupados.has(base)) return base;
  let n = 2;
  while (ocupados.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** Nome de referência sem o membro (`corpo.esp` → `corpo`). */
export function nomeBase(nome: string): string {
  const ponto = nome.indexOf('.');
  return ponto < 0 ? nome : nome.slice(0, ponto);
}

/**
 * Percorre todas as fórmulas da família (parâmetros, planos, peças — contorno e usinagens —, aninhados e ferragens),
 * na ordem em que aparecem. Também entrega o material de cada peça e os valores de cada tipo, para os usos do nome.
 */
export function percorrerFamilia(f: Familia, v: VisitaFamilia): void {
  const add = (onde: string, texto: unknown, gravar: (novo: string) => void): void => {
    if (typeof texto === 'string') v.formula(onde, texto, gravar);
  };

  for (const p of lista<Parametro>(f.parametros)) {
    if (!p || typeof p !== 'object') continue;
    add(`parametro:${p.id}.formula`, p.formula, (novo) => { p.formula = novo; });
  }

  for (const p of lista<PlanoReferencia>(f.planos)) {
    if (!p || typeof p !== 'object') continue;
    add(`plano:${p.id}.posicao`, p.posicao, (novo) => { p.posicao = novo; });
  }

  for (const p of lista<Peca>(f.pecas)) {
    if (!p || typeof p !== 'object') continue;
    const base = `peca:${p.id}`;

    const origem = Array.isArray(p.origem) ? p.origem : [];
    origem.forEach((t, i) => add(`${base}.origem[${i}]`, t, (novo) => { p.origem[i] = novo; }));

    const tamanho = Array.isArray(p.tamanho) ? p.tamanho : [];
    tamanho.forEach((t, i) => add(`${base}.tamanho[${i}]`, t, (novo) => { p.tamanho[i] = novo; }));

    add(`${base}.espessura`, p.espessura, (novo) => { p.espessura = novo; });
    add(`${base}.repetir`, p.repetir, (novo) => { p.repetir = novo; });
    add(`${base}.quando`, p.quando, (novo) => { p.quando = novo; });

    const contorno = p.contorno;
    if (contorno !== undefined && contorno.tipo === 'poligono') {
      const pontos = Array.isArray(contorno.pontos) ? contorno.pontos : [];
      pontos.forEach((ponto, k) => {
        if (!Array.isArray(ponto)) return;
        ponto.forEach((t, j) => add(`${base}.contorno[${k}][${j}]`, t, (novo) => { ponto[j] = novo; }));
      });
    }

    for (const u of lista<Usinagem>(p.usinagens)) {
      if (!u || typeof u !== 'object') continue;
      const ub = `${base}.usinagem:${u.id}`;
      const posicao = Array.isArray(u.posicao) ? u.posicao : [];
      posicao.forEach((t, i) => add(`${ub}.posicao[${i}]`, t, (novo) => { u.posicao[i] = novo; }));
      add(`${ub}.diametro`, u.diametro, (novo) => { u.diametro = novo; });
      add(`${ub}.largura`, u.largura, (novo) => { u.largura = novo; });
      add(`${ub}.comprimento`, u.comprimento, (novo) => { u.comprimento = novo; });
      if (u.profundidade !== 'passante') add(`${ub}.profundidade`, u.profundidade, (novo) => { u.profundidade = novo; });
      add(`${ub}.quantidade`, u.quantidade, (novo) => { u.quantidade = novo; });
      add(`${ub}.quando`, u.quando, (novo) => { u.quando = novo; });
    }

    v.material?.(p.id, p.material);
  }

  for (const a of lista<Aninhado>(f.aninhados)) {
    if (!a || typeof a !== 'object') continue;
    const base = `aninhado:${a.id}`;
    const valores = a.valores;
    if (valores !== undefined && typeof valores === 'object') {
      for (const [chave, texto] of Object.entries(valores)) {
        add(`${base}.valores.${chave}`, texto, (novo) => { valores[chave] = novo; });
      }
    }

    const origem = Array.isArray(a.origem) ? a.origem : [];
    origem.forEach((t, i) => add(`${base}.origem[${i}]`, t, (novo) => { a.origem[i] = novo; }));

    add(`${base}.repetir`, a.repetir, (novo) => { a.repetir = novo; });
    add(`${base}.rotacao`, a.rotacao, (novo) => { a.rotacao = novo; });
    add(`${base}.quando`, a.quando, (novo) => { a.quando = novo; });
  }

  for (const fe of lista<Ferragem>(f.ferragens)) {
    if (!fe || typeof fe !== 'object') continue;
    const base = `ferragem:${fe.id}`;
    add(`${base}.quantidade`, fe.quantidade, (novo) => { fe.quantidade = novo; });
    add(`${base}.quando`, fe.quando, (novo) => { fe.quando = novo; });
  }

  for (const t of lista<Tipo>(f.tipos)) {
    if (!t || typeof t !== 'object') continue;
    v.valoresDeTipo?.(t.id, t.valores);
  }
}

/** Todas as expressões da família, com como gravar cada uma (mesmo percurso do renomear e dos usos). */
export function todasAsExpressoes(f: Familia): ExpressaoEditavel[] {
  const out: ExpressaoEditavel[] = [];
  percorrerFamilia(f, {
    formula: (onde, texto, gravar) => { out.push({ onde, texto, gravar }); },
  });
  return out;
}

/** A fórmula usa `nome` ou um membro dele (`nome.esp`), mas não um nome apenas parecido (`esp2`). */
export function usaNome(texto: string, nome: string): boolean {
  const compilada = compilar(texto);
  if ('erro' in compilada) return false;
  return referencias(compilada.no).some((r) => r === nome || r.startsWith(`${nome}.`));
}

/** Implementação de `usosDoNome` (ver contrato em `edicao.ts`). */
export function usosDoNomeEm(f: Familia, nome: string): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  const push = (onde: string): void => {
    if (vistos.has(onde)) return;
    vistos.add(onde);
    out.push(onde);
  };

  percorrerFamilia(f, {
    formula: (onde, texto) => {
      if (onde === `parametro:${nome}.formula`) return;
      if (usaNome(texto, nome)) push(onde);
    },
    material: (pecaId, material) => {
      if (material === nome) push(`peca:${pecaId}.material`);
    },
    valoresDeTipo: (tipoId, valores) => {
      if (valores !== undefined && Object.prototype.hasOwnProperty.call(valores, nome)) {
        push(`tipo:${tipoId}.valores.${nome}`);
      }
    },
  });

  return out;
}
