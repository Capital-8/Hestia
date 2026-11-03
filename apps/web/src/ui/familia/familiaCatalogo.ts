import { validarCatalogo, type Catalogo, type Chapa, type FerragemCatalogo, type Fita } from '@hestia/model';

/*
 * Apoio puro do catálogo de marcenaria do editor (sem React): ids automáticos, leitura de campo por coluna e receitas
 * que devolvem um catálogo NOVO (ou `null` quando o texto não serve). O catálogo vive fora do histórico da família.
 */

export type CampoChapa =
  | 'id' | 'nome' | 'material' | 'espessura' | 'largura' | 'altura' | 'veio' | 'refilo' | 'custoM2' | 'cor';

export type CampoFita = 'id' | 'nome' | 'espessura' | 'altura' | 'custoM' | 'cor';

export type CampoFerragem = 'id' | 'nome' | 'codigo' | 'unidade' | 'custo';

export const UNIDADES_FERRAGEM: ReadonlyArray<FerragemCatalogo['unidade']> = ['un', 'par', 'jogo', 'm'];

export const ROTULO_UNIDADE: Readonly<Record<FerragemCatalogo['unidade'], string>> = {
  un: 'Unidade',
  par: 'Par',
  jogo: 'Jogo',
  m: 'Metro',
};

/** Primeiro id livre: `prefixo` quando ninguém usa; senão `prefixo_2`, `prefixo_3`… */
export function novoIdUnico(prefixo: string, existentes: Iterable<string>): string {
  const usados = new Set(existentes);
  const base = prefixo.trim() === '' ? 'item' : prefixo.trim();
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/** Texto numérico com vírgula decimal; `null` quando vazio ou inválido. */
function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function comChapas(c: Catalogo, chapas: Chapa[]): Catalogo {
  return { ...c, chapas };
}

function comFitas(c: Catalogo, fitas: Fita[]): Catalogo {
  return { ...c, fitas };
}

function comFerragens(c: Catalogo, ferragens: FerragemCatalogo[]): Catalogo {
  return { ...c, ferragens };
}

/** Edita a chapa da posição `indice`. Devolve catálogo novo, ou `null` se o texto não serve (o campo volta ao valor anterior). */
export function atualizarChapaEm(catalogo: Catalogo, indice: number, campo: CampoChapa, texto: string): Catalogo | null {
  const chapa = catalogo.chapas[indice];
  if (chapa === undefined) return null;
  const nova: Chapa = { ...chapa };
  switch (campo) {
    case 'id': {
      const id = texto.trim();
      if (id === '') return null;
      nova.id = id;
      break;
    }
    case 'nome':
      nova.nome = texto.trim();
      break;
    case 'material':
      nova.material = texto.trim();
      break;
    case 'cor': {
      const cor = texto.trim();
      if (cor === '') delete nova.cor;
      else nova.cor = cor;
      break;
    }
    case 'veio': {
      const v = texto.trim().toLowerCase();
      if (v === 'true' || v === '1') nova.veio = true;
      else if (v === 'false' || v === '0' || v === '') nova.veio = false;
      else return null;
      break;
    }
    case 'espessura':
    case 'largura':
    case 'altura':
    case 'refilo': {
      const n = lerNumero(texto);
      if (n === null) return null;
      nova[campo] = n;
      break;
    }
    case 'custoM2': {
      const n = lerNumero(texto);
      if (n === null) {
        if (texto.trim() === '') {
          delete nova.custoM2;
          break;
        }
        return null;
      }
      nova.custoM2 = n;
      break;
    }
  }
  const chapas = catalogo.chapas.slice();
  chapas[indice] = nova;
  return comChapas(catalogo, chapas);
}

/** Edita a chapa de id `id`; `null` se ela não existe ou o texto não serve. */
export function atualizarChapa(catalogo: Catalogo, id: string, campo: CampoChapa, texto: string): Catalogo | null {
  const indice = catalogo.chapas.findIndex((c) => c.id === id);
  if (indice < 0) return null;
  return atualizarChapaEm(catalogo, indice, campo, texto);
}

/** Edita a fita da posição `indice`; `null` se o texto não serve. */
export function atualizarFitaEm(catalogo: Catalogo, indice: number, campo: CampoFita, texto: string): Catalogo | null {
  const fita = catalogo.fitas[indice];
  if (fita === undefined) return null;
  const nova: Fita = { ...fita };
  switch (campo) {
    case 'id': {
      const id = texto.trim();
      if (id === '') return null;
      nova.id = id;
      break;
    }
    case 'nome':
      nova.nome = texto.trim();
      break;
    case 'cor': {
      const cor = texto.trim();
      if (cor === '') delete nova.cor;
      else nova.cor = cor;
      break;
    }
    case 'espessura':
    case 'altura': {
      const n = lerNumero(texto);
      if (n === null) return null;
      nova[campo] = n;
      break;
    }
    case 'custoM': {
      const n = lerNumero(texto);
      if (n === null) {
        if (texto.trim() === '') {
          delete nova.custoM;
          break;
        }
        return null;
      }
      nova.custoM = n;
      break;
    }
  }
  const fitas = catalogo.fitas.slice();
  fitas[indice] = nova;
  return comFitas(catalogo, fitas);
}

/** Edita a fita de id `id`; `null` se ela não existe ou o texto não serve. */
export function atualizarFita(catalogo: Catalogo, id: string, campo: CampoFita, texto: string): Catalogo | null {
  const indice = catalogo.fitas.findIndex((f) => f.id === id);
  if (indice < 0) return null;
  return atualizarFitaEm(catalogo, indice, campo, texto);
}

/** Edita a ferragem da posição `indice`; `null` se o texto não serve (inclusive unidade desconhecida). */
export function atualizarFerragemEm(catalogo: Catalogo, indice: number, campo: CampoFerragem, texto: string): Catalogo | null {
  const ferragem = catalogo.ferragens[indice];
  if (ferragem === undefined) return null;
  const nova: FerragemCatalogo = { ...ferragem };
  switch (campo) {
    case 'id': {
      const id = texto.trim();
      if (id === '') return null;
      nova.id = id;
      break;
    }
    case 'nome':
      nova.nome = texto.trim();
      break;
    case 'codigo': {
      const codigo = texto.trim();
      if (codigo === '') delete nova.codigo;
      else nova.codigo = codigo;
      break;
    }
    case 'unidade': {
      const unidade = texto.trim() as FerragemCatalogo['unidade'];
      if (!UNIDADES_FERRAGEM.includes(unidade)) return null;
      nova.unidade = unidade;
      break;
    }
    case 'custo': {
      const n = lerNumero(texto);
      if (n === null) {
        if (texto.trim() === '') {
          delete nova.custo;
          break;
        }
        return null;
      }
      nova.custo = n;
      break;
    }
  }
  const ferragens = catalogo.ferragens.slice();
  ferragens[indice] = nova;
  return comFerragens(catalogo, ferragens);
}

/** Edita a ferragem de id `id`; `null` se ela não existe ou o texto não serve. */
export function atualizarFerragem(catalogo: Catalogo, id: string, campo: CampoFerragem, texto: string): Catalogo | null {
  const indice = catalogo.ferragens.findIndex((f) => f.id === id);
  if (indice < 0) return null;
  return atualizarFerragemEm(catalogo, indice, campo, texto);
}

/** Acrescenta uma chapa com id automático e valores iniciais razoáveis. */
export function adicionarChapa(catalogo: Catalogo): Catalogo {
  const id = novoIdUnico('chapa', catalogo.chapas.map((c) => c.id));
  const chapa: Chapa = {
    id,
    nome: 'Nova chapa',
    material: 'MDF',
    espessura: 18,
    largura: 2750,
    altura: 1850,
    veio: false,
    refilo: 10,
    custoM2: 0,
    cor: '#d8b98b',
  };
  return comChapas(catalogo, [...catalogo.chapas, chapa]);
}

/** Acrescenta uma fita com id automático e valores iniciais razoáveis. */
export function adicionarFita(catalogo: Catalogo): Catalogo {
  const id = novoIdUnico('fita', catalogo.fitas.map((f) => f.id));
  const fita: Fita = { id, nome: 'Nova fita', espessura: 0.45, altura: 22, custoM: 0 };
  return comFitas(catalogo, [...catalogo.fitas, fita]);
}

/** Acrescenta uma ferragem com id automático e valores iniciais razoáveis. */
export function adicionarFerragem(catalogo: Catalogo): Catalogo {
  const id = novoIdUnico('ferragem', catalogo.ferragens.map((f) => f.id));
  const ferragem: FerragemCatalogo = { id, nome: 'Nova ferragem', unidade: 'un', custo: 0 };
  return comFerragens(catalogo, [...catalogo.ferragens, ferragem]);
}

/** Remove a chapa da posição `indice` (catálogo igual quando o índice não existe). */
export function removerChapaEm(catalogo: Catalogo, indice: number): Catalogo {
  if (catalogo.chapas[indice] === undefined) return catalogo;
  return comChapas(catalogo, catalogo.chapas.filter((_, i) => i !== indice));
}

/** Remove a chapa de id `id` (catálogo igual quando não existe). */
export function removerChapa(catalogo: Catalogo, id: string): Catalogo {
  return removerChapaEm(catalogo, catalogo.chapas.findIndex((c) => c.id === id));
}

/** Remove a fita da posição `indice` (catálogo igual quando o índice não existe). */
export function removerFitaEm(catalogo: Catalogo, indice: number): Catalogo {
  if (catalogo.fitas[indice] === undefined) return catalogo;
  return comFitas(catalogo, catalogo.fitas.filter((_, i) => i !== indice));
}

/** Remove a fita de id `id` (catálogo igual quando não existe). */
export function removerFita(catalogo: Catalogo, id: string): Catalogo {
  return removerFitaEm(catalogo, catalogo.fitas.findIndex((f) => f.id === id));
}

/** Remove a ferragem da posição `indice` (catálogo igual quando o índice não existe). */
export function removerFerragemEm(catalogo: Catalogo, indice: number): Catalogo {
  if (catalogo.ferragens[indice] === undefined) return catalogo;
  return comFerragens(catalogo, catalogo.ferragens.filter((_, i) => i !== indice));
}

/** Remove a ferragem de id `id` (catálogo igual quando não existe). */
export function removerFerragem(catalogo: Catalogo, id: string): Catalogo {
  return removerFerragemEm(catalogo, catalogo.ferragens.findIndex((f) => f.id === id));
}

/** Até `max` mensagens de `validarCatalogo`, na ordem em que a validação as devolve. */
export function problemasDoCatalogo(catalogo: Catalogo, max = 5): string[] {
  return validarCatalogo(catalogo).slice(0, max).map((p) => p.mensagem);
}
