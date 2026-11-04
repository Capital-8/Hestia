import { validarCatalogo, type Catalogo, type Chapa, type FerragemCatalogo, type Fita, type ProblemaCatalogo } from '@hestia/model';

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

/** Resultado de uma edição: o catálogo novo ou o motivo pelo qual o valor anterior permanece. */
export type ResultadoEdicaoCatalogo = { ok: true; catalogo: Catalogo } | { ok: false; motivo: string };

/** Identidade de um problema de validação, para comparar antes e depois de uma edição. */
function chaveDoProblema(p: ProblemaCatalogo): string {
  return `${p.codigo}\u0000${p.onde}\u0000${p.mensagem}`;
}

/**
 * Só recusa problemas NOVOS: um catálogo que já veio com id repetido (por importação, por exemplo) continua editável nos
 * outros campos, mas a edição que cria a repetição ou um valor inválido é barrada.
 */
function conferirEdicao(antes: Catalogo, depois: Catalogo): ResultadoEdicaoCatalogo {
  const vistos = new Set(validarCatalogo(antes).map(chaveDoProblema));
  const novo = validarCatalogo(depois).find((p) => !vistos.has(chaveDoProblema(p)));
  return novo === undefined ? { ok: true, catalogo: depois } : { ok: false, motivo: novo.mensagem };
}

/** Custo informado precisa ser positivo (o padrão do modelo aceita zero; a interface recusa, como pediu o QA). */
function custoPositivo(texto: string): ResultadoEdicaoCatalogo | null {
  const limpo = texto.trim();
  if (limpo === '') return null;
  const n = lerNumero(texto);
  if (n === null) return { ok: false, motivo: 'Valor inválido.' };
  return n > 0 ? null : { ok: false, motivo: 'O custo precisa ser maior que zero.' };
}

/** Edita a chapa da posição `indice`. Devolve catálogo novo ou o motivo da recusa (o campo volta ao valor anterior). */
export function editarChapaEm(catalogo: Catalogo, indice: number, campo: CampoChapa, texto: string): ResultadoEdicaoCatalogo {
  const chapa = catalogo.chapas[indice];
  if (chapa === undefined) return { ok: false, motivo: 'esta chapa não existe' };
  const nova: Chapa = { ...chapa };
  switch (campo) {
    case 'id': {
      const id = texto.trim();
      if (id === '') return { ok: false, motivo: 'Informe o id.' };
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
      else return { ok: false, motivo: 'Use true ou false.' };
      break;
    }
    case 'espessura':
    case 'largura':
    case 'altura':
    case 'refilo': {
      const n = lerNumero(texto);
      if (n === null) return { ok: false, motivo: 'Valor inválido.' };
      nova[campo] = n;
      break;
    }
    case 'custoM2': {
      const recusa = custoPositivo(texto);
      if (recusa !== null) return recusa;
      const n = lerNumero(texto);
      if (n === null) delete nova.custoM2;
      else nova.custoM2 = n;
      break;
    }
  }
  const chapas = catalogo.chapas.slice();
  chapas[indice] = nova;
  return conferirEdicao(catalogo, comChapas(catalogo, chapas));
}

/** Edita a chapa de id `id`; o resultado também indica o motivo quando ela não existe ou o texto não serve. */
export function editarChapa(catalogo: Catalogo, id: string, campo: CampoChapa, texto: string): ResultadoEdicaoCatalogo {
  const indice = catalogo.chapas.findIndex((c) => c.id === id);
  if (indice < 0) return { ok: false, motivo: 'esta chapa não existe' };
  return editarChapaEm(catalogo, indice, campo, texto);
}

/** Edita a chapa da posição `indice`; `null` quando a edição é recusada (o campo volta ao valor anterior). */
export function atualizarChapaEm(catalogo: Catalogo, indice: number, campo: CampoChapa, texto: string): Catalogo | null {
  const r = editarChapaEm(catalogo, indice, campo, texto);
  return r.ok ? r.catalogo : null;
}

/** Edita a chapa de id `id`; `null` se ela não existe ou o texto não serve. */
export function atualizarChapa(catalogo: Catalogo, id: string, campo: CampoChapa, texto: string): Catalogo | null {
  const r = editarChapa(catalogo, id, campo, texto);
  return r.ok ? r.catalogo : null;
}

/** Edita a fita da posição `indice`; devolve catálogo novo ou o motivo da recusa. */
export function editarFitaEm(catalogo: Catalogo, indice: number, campo: CampoFita, texto: string): ResultadoEdicaoCatalogo {
  const fita = catalogo.fitas[indice];
  if (fita === undefined) return { ok: false, motivo: 'esta fita não existe' };
  const nova: Fita = { ...fita };
  switch (campo) {
    case 'id': {
      const id = texto.trim();
      if (id === '') return { ok: false, motivo: 'Informe o id.' };
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
      if (n === null) return { ok: false, motivo: 'Valor inválido.' };
      nova[campo] = n;
      break;
    }
    case 'custoM': {
      const recusa = custoPositivo(texto);
      if (recusa !== null) return recusa;
      const n = lerNumero(texto);
      if (n === null) delete nova.custoM;
      else nova.custoM = n;
      break;
    }
  }
  const fitas = catalogo.fitas.slice();
  fitas[indice] = nova;
  return conferirEdicao(catalogo, comFitas(catalogo, fitas));
}

/** Edita a fita de id `id`; o resultado também indica o motivo quando ela não existe ou o texto não serve. */
export function editarFita(catalogo: Catalogo, id: string, campo: CampoFita, texto: string): ResultadoEdicaoCatalogo {
  const indice = catalogo.fitas.findIndex((f) => f.id === id);
  if (indice < 0) return { ok: false, motivo: 'esta fita não existe' };
  return editarFitaEm(catalogo, indice, campo, texto);
}

/** Edita a fita da posição `indice`; `null` quando a edição é recusada. */
export function atualizarFitaEm(catalogo: Catalogo, indice: number, campo: CampoFita, texto: string): Catalogo | null {
  const r = editarFitaEm(catalogo, indice, campo, texto);
  return r.ok ? r.catalogo : null;
}

/** Edita a fita de id `id`; `null` se ela não existe ou o texto não serve. */
export function atualizarFita(catalogo: Catalogo, id: string, campo: CampoFita, texto: string): Catalogo | null {
  const r = editarFita(catalogo, id, campo, texto);
  return r.ok ? r.catalogo : null;
}

/** Edita a ferragem da posição `indice`; devolve catálogo novo ou o motivo da recusa. */
export function editarFerragemEm(catalogo: Catalogo, indice: number, campo: CampoFerragem, texto: string): ResultadoEdicaoCatalogo {
  const ferragem = catalogo.ferragens[indice];
  if (ferragem === undefined) return { ok: false, motivo: 'esta ferragem não existe' };
  const nova: FerragemCatalogo = { ...ferragem };
  switch (campo) {
    case 'id': {
      const id = texto.trim();
      if (id === '') return { ok: false, motivo: 'Informe o id.' };
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
      if (!UNIDADES_FERRAGEM.includes(unidade)) return { ok: false, motivo: 'Escolha uma unidade válida.' };
      nova.unidade = unidade;
      break;
    }
    case 'custo': {
      const recusa = custoPositivo(texto);
      if (recusa !== null) return recusa;
      const n = lerNumero(texto);
      if (n === null) delete nova.custo;
      else nova.custo = n;
      break;
    }
  }
  const ferragens = catalogo.ferragens.slice();
  ferragens[indice] = nova;
  return conferirEdicao(catalogo, comFerragens(catalogo, ferragens));
}

/** Edita a ferragem de id `id`; o resultado também indica o motivo quando ela não existe ou o texto não serve. */
export function editarFerragem(catalogo: Catalogo, id: string, campo: CampoFerragem, texto: string): ResultadoEdicaoCatalogo {
  const indice = catalogo.ferragens.findIndex((f) => f.id === id);
  if (indice < 0) return { ok: false, motivo: 'esta ferragem não existe' };
  return editarFerragemEm(catalogo, indice, campo, texto);
}

/** Edita a ferragem da posição `indice`; `null` quando a edição é recusada. */
export function atualizarFerragemEm(catalogo: Catalogo, indice: number, campo: CampoFerragem, texto: string): Catalogo | null {
  const r = editarFerragemEm(catalogo, indice, campo, texto);
  return r.ok ? r.catalogo : null;
}

/** Edita a ferragem de id `id`; `null` se ela não existe ou o texto não serve. */
export function atualizarFerragem(catalogo: Catalogo, id: string, campo: CampoFerragem, texto: string): Catalogo | null {
  const r = editarFerragem(catalogo, id, campo, texto);
  return r.ok ? r.catalogo : null;
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
