import { FAMILIA_VERSAO, LIMITES, PARAMETROS_PADRAO, type Familia } from './tipos.ts';
import { listarCamposDeExpressao } from './validarCampos.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import type { Problema } from './validar.ts';

/*
 * Regras 1 a 4 da ficha E1-validar: obrigatórios, limites, formato/reserva de id e ids duplicados. Tudo defensivo:
 * `comoArray` e `ehObjeto` tratam entrada estranha como lista/objeto vazio, e cada divergência vira `Problema`.
 */

const ID_VALIDO = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVADOS = new Set(['i', 'n', 'min', 'max', 'abs', 'floor', 'ceil', 'round', 'clamp', 'sqrt']);

// ───────────────────────── regra 1: obrigatorios ─────────────────────────

export function validarObrigatorios(f: Familia): Problema[] {
  const out: Problema[] = [];
  const parametros = comoArray<unknown>(f.parametros);

  for (const id of PARAMETROS_PADRAO) {
    const p = parametros.find((x): x is Record<string, unknown> => ehObjeto(x) && x.id === id);
    if (!p) {
      out.push(criarProblema('obrigatorio', `parâmetro obrigatório “${id}” está ausente`, `parametro:${id}`));
    } else if (p.tipo !== 'comprimento' || p.escopo !== 'instancia') {
      out.push(criarProblema('obrigatorio', `parâmetro “${id}” precisa ser comprimento de escopo “instancia”`, `parametro:${id}`));
    }
  }

  if (f.unidade !== 'mm') {
    out.push(criarProblema('obrigatorio', `a unidade da família precisa ser “mm” (recebeu “${texto(f.unidade)}”)`, 'familia'));
  }
  if (f.versao !== FAMILIA_VERSAO) {
    out.push(criarProblema('obrigatorio', `a versão da família precisa ser ${FAMILIA_VERSAO} (recebeu “${texto(f.versao)}”)`, 'familia'));
  }

  return out;
}

// ───────────────────────── regra 2: limite ─────────────────────────

export function validarLimites(f: Familia): Problema[] {
  const out: Problema[] = [];

  const contagens: ReadonlyArray<readonly [string, unknown, number]> = [
    ['parâmetros', f.parametros, LIMITES.parametros],
    ['peças', f.pecas, LIMITES.pecas],
    ['planos', f.planos, LIMITES.planos],
    ['aninhados', f.aninhados, LIMITES.aninhados],
    ['ferragens', f.ferragens, LIMITES.ferragens],
    ['tipos', f.tipos, LIMITES.tipos],
  ];
  for (const [nome, valor, limite] of contagens) {
    if (comoArray<unknown>(valor).length > limite) {
      out.push(criarProblema('limite', `a família passa de ${limite} ${nome}`, 'familia'));
    }
  }

  const grupos: ReadonlyArray<readonly [string, unknown]> = [
    ['parametro', f.parametros],
    ['plano', f.planos],
    ['peca', f.pecas],
    ['aninhado', f.aninhados],
    ['ferragem', f.ferragens],
    ['tipo', f.tipos],
  ];
  for (const [categoria, valor] of grupos) {
    for (const item of comoArray<unknown>(valor)) {
      if (ehObjeto(item) && typeof item.nome === 'string' && item.nome.length > LIMITES.nome) {
        out.push(criarProblema('limite', `o nome passa de ${LIMITES.nome} caracteres`, `${categoria}:${texto(item.id)}.nome`));
      }
    }
  }

  for (const [categoria, valor] of [['peca', f.pecas], ['aninhado', f.aninhados]] as const) {
    for (const item of comoArray<unknown>(valor)) {
      if (!ehObjeto(item) || typeof item.repetir !== 'string') continue;
      const literal = item.repetir.trim();
      if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(literal) && Number(literal) > LIMITES.repeticao) {
        out.push(criarProblema('limite', `a repetição literal passa de ${LIMITES.repeticao}`, `${categoria}:${texto(item.id)}.repetir`));
      }
    }
  }

  for (const campo of listarCamposDeExpressao(f)) {
    if (typeof campo.valor === 'string' && campo.valor.length > LIMITES.formula) {
      out.push(criarProblema('limite', `a fórmula passa de ${LIMITES.formula} caracteres`, campo.onde));
    }
  }

  return out;
}

// ───────────────────────── regra 3: id_invalido ─────────────────────────

export function validarIds(f: Familia): Problema[] {
  const out: Problema[] = [];

  const categorias: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ['parametro', f.parametros, true],
    ['plano', f.planos, true],
    ['peca', f.pecas, false],
    ['aninhado', f.aninhados, false],
    ['ferragem', f.ferragens, false],
    ['tipo', f.tipos, false],
  ];
  for (const [categoria, valor, reservado] of categorias) {
    for (const item of comoArray<unknown>(valor)) {
      const id = ehObjeto(item) ? item.id : undefined;
      const onde = `${categoria}:${texto(id)}`;
      if (typeof id !== 'string' || !ID_VALIDO.test(id)) {
        out.push(criarProblema('id_invalido', `id fora do formato permitido: “${texto(id)}”`, onde));
        continue;
      }
      if (reservado && RESERVADOS.has(id)) {
        out.push(criarProblema('id_invalido', `id reservado para a linguagem de fórmulas: “${id}”`, onde));
      }
    }
  }

  for (const peca of comoArray<unknown>(f.pecas)) {
    if (!ehObjeto(peca)) continue;
    for (const usinagem of comoArray<unknown>(peca.usinagens)) {
      const id = ehObjeto(usinagem) ? usinagem.id : undefined;
      if (typeof id !== 'string' || !ID_VALIDO.test(id)) {
        out.push(criarProblema('id_invalido', `id de usinagem fora do formato permitido: “${texto(id)}”`, `peca:${texto(peca.id)}.usinagem:${texto(id)}`));
      }
    }
  }

  return out;
}

// ───────────────────────── regra 4: id_duplicado ─────────────────────────

export function validarDuplicados(f: Familia): Problema[] {
  const out: Problema[] = [];
  const apontar = (vistos: Set<string>, categoria: string, item: unknown): void => {
    const id = ehObjeto(item) ? item.id : undefined;
    if (typeof id !== 'string') return;
    if (vistos.has(id)) {
      out.push(criarProblema('id_duplicado', `id repetido na mesma categoria: “${id}”`, `${categoria}:${id}`));
    } else {
      vistos.add(id);
    }
  };

  // Parâmetros e planos dividem o mesmo espaço de nomes porque as fórmulas chamam os dois pelo id.
  const nomes = new Set<string>();
  for (const item of comoArray<unknown>(f.parametros)) apontar(nomes, 'parametro', item);
  for (const item of comoArray<unknown>(f.planos)) apontar(nomes, 'plano', item);

  for (const [categoria, valor] of [
    ['peca', f.pecas],
    ['aninhado', f.aninhados],
    ['ferragem', f.ferragens],
    ['tipo', f.tipos],
  ] as const) {
    const vistos = new Set<string>();
    for (const item of comoArray<unknown>(valor)) apontar(vistos, categoria, item);
  }

  // Usinagens repetem id dentro da própria peça.
  for (const peca of comoArray<unknown>(f.pecas)) {
    if (!ehObjeto(peca)) continue;
    const vistos = new Set<string>();
    for (const usinagem of comoArray<unknown>(peca.usinagens)) {
      const id = ehObjeto(usinagem) ? usinagem.id : undefined;
      if (typeof id !== 'string') continue;
      if (vistos.has(id)) {
        out.push(criarProblema('id_duplicado', `id de usinagem repetido: “${id}”`, `peca:${texto(peca.id)}.usinagem:${id}`));
      } else {
        vistos.add(id);
      }
    }
  }

  return out;
}
