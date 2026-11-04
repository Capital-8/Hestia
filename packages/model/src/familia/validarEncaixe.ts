import { compilar, referencias } from './expressao.ts';
import type { Familia, LadoConector, TipoParametro } from './tipos.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import type { Problema } from './validar.ts';

/*
 * Validação de conectores e escolhas (ficha ESC-modelo). Defensiva como as demais regras de `validarFamilia`:
 * entrada estranha vira `Problema`, nunca exceção. `onde` no formato `conector:<id>` e `escolha:<id>` (com `.campo`).
 */

const LADOS: readonly LadoConector[] = ['esquerda', 'direita', 'frente', 'fundo', 'base', 'topo'];
const TIPOS_DE_ESCOLHA: readonly TipoParametro[] = ['enum', 'booleano', 'inteiro'];

interface EscopoDeFolga {
  parametros: Map<string, Record<string, unknown>>;
  chapas: Set<string>;
}

/** A `folga` só referencia parâmetros existentes (com o mesmo tratamento de `x.esp` das outras fórmulas). */
function referenciaValidaNaFolga(nome: string, escopo: EscopoDeFolga): boolean {
  const partes = nome.split('.');
  if (partes.length === 1) return partes[0] !== undefined && escopo.parametros.has(partes[0]);
  if (partes.length === 2 && partes[1] === 'esp') return partes[0] !== undefined && escopo.chapas.has(partes[0]);
  return false;
}

function escopoDaFamilia(f: Familia): EscopoDeFolga {
  const parametros = new Map<string, Record<string, unknown>>();
  const chapas = new Set<string>();
  for (const item of comoArray<unknown>(f.parametros)) {
    if (!ehObjeto(item) || typeof item.id !== 'string') continue;
    if (!parametros.has(item.id)) parametros.set(item.id, item);
    if (item.tipo === 'chapa') chapas.add(item.id);
  }
  return { parametros, chapas };
}

function validarConectores(f: Familia, escopo: EscopoDeFolga): Problema[] {
  const out: Problema[] = [];
  const vistos = new Set<string>();

  for (const item of comoArray<unknown>(f.conectores)) {
    if (!ehObjeto(item)) {
      out.push(criarProblema('tipo', 'o conector precisa ser um objeto', 'conector:?'));
      continue;
    }
    const onde = `conector:${texto(item.id)}`;
    const id = typeof item.id === 'string' && item.id.trim() !== '' ? item.id : undefined;

    if (id === undefined) {
      out.push(criarProblema('obrigatorio', 'o conector precisa de um id não vazio', onde));
    } else if (vistos.has(id)) {
      out.push(criarProblema('id_duplicado', `id repetido na mesma categoria: “${id}”`, onde));
    } else {
      vistos.add(id);
    }

    if (typeof item.lado !== 'string' || !(LADOS as readonly string[]).includes(item.lado)) {
      out.push(criarProblema('tipo', `lado inválido: “${texto(item.lado)}”`, `${onde}.lado`));
    }
    if (typeof item.etiqueta !== 'string' || item.etiqueta.trim() === '') {
      out.push(criarProblema('obrigatorio', 'a etiqueta precisa ser um texto não vazio', `${onde}.etiqueta`));
    }

    if (item.folga !== undefined) {
      if (typeof item.folga !== 'string') {
        out.push(criarProblema('formula', 'expressão ausente ou que não é texto', `${onde}.folga`));
      } else {
        const compilado = compilar(item.folga);
        if ('erro' in compilado) {
          out.push(criarProblema('formula', `fórmula inválida: ${compilado.erro.message}`, `${onde}.folga`));
        } else {
          for (const nome of referencias(compilado.no)) {
            if (!referenciaValidaNaFolga(nome, escopo)) {
              out.push(criarProblema('referencia', `“${nome}” não existe neste escopo`, `${onde}.folga`));
            }
          }
        }
      }
    }
  }

  return out;
}

function validarEscolhas(f: Familia, escopo: EscopoDeFolga): Problema[] {
  const out: Problema[] = [];
  const vistos = new Set<string>();

  const zonas = new Set<string>();
  for (const item of comoArray<unknown>(f.pecas)) {
    if (ehObjeto(item) && typeof item.grupo === 'string' && item.grupo !== '') zonas.add(item.grupo);
  }

  for (const item of comoArray<unknown>(f.escolhas)) {
    if (!ehObjeto(item)) {
      out.push(criarProblema('tipo', 'a escolha precisa ser um objeto', 'escolha:?'));
      continue;
    }
    const onde = `escolha:${texto(item.id)}`;
    const id = typeof item.id === 'string' && item.id.trim() !== '' ? item.id : undefined;

    if (id === undefined) {
      out.push(criarProblema('obrigatorio', 'a escolha precisa de um id não vazio', onde));
    } else if (vistos.has(id)) {
      out.push(criarProblema('id_duplicado', `id repetido na mesma categoria: “${id}”`, onde));
    } else {
      vistos.add(id);
    }

    const parametro = typeof item.parametro === 'string' ? escopo.parametros.get(item.parametro) : undefined;
    if (parametro === undefined) {
      out.push(criarProblema('referencia', `parâmetro “${texto(item.parametro)}” não existe na família`, `${onde}.parametro`));
    } else if (!(TIPOS_DE_ESCOLHA as readonly string[]).includes(texto(parametro.tipo))) {
      out.push(criarProblema('tipo', `o parâmetro “${texto(item.parametro)}” (${texto(parametro.tipo)}) precisa ser enum, booleano ou inteiro`, `${onde}.parametro`));
    }

    if (typeof item.zona !== 'string' || !zonas.has(item.zona)) {
      out.push(criarProblema('referencia', `nenhuma peça está na zona “${texto(item.zona)}”`, `${onde}.zona`));
    }
  }

  return out;
}

export function validarEncaixe(f: Familia): Problema[] {
  const escopo = escopoDaFamilia(f);
  return [...validarConectores(f, escopo), ...validarEscolhas(f, escopo)];
}
