import { compilar, referencias } from './expressao.ts';
import type { Familia } from './tipos.ts';
import { LIMITES_CORPO } from './tiposCorpo.ts';
import type { CampoExpressao } from './validarCampos.ts';
import { comoArray, criarProblema, ehObjeto, texto } from './validarComum.ts';
import { camposDoPerfil, exigirPositivo, literal, temFuros, validarPerfil } from './validarPerfil.ts';
import type { Problema } from './validar.ts';

/*
 * Validação dos corpos paramétricos (CONTRATO §2.2, §2.3, §2.5), regra 10 de `validarFamilia`. Só o que dá para conferir sem
 * resolver: ids, limites, formas, caminho, transição, medidas literais e a sintaxe/referências das fórmulas.
 * `validarFormulas` e `validarReferencias` enxergam só os campos de `validarCampos.ts` (peças, aninhados, ferragens), por isso
 * as fórmulas dos corpos são conferidas aqui, com as mesmas regras (i/n só com `repetir`; `x.esp` só para chapa).
 * Fica para a resolução (A3/A4): segmento de comprimento zero, retorno de 180°, curvas sobrepostas, auto-interseção e
 * estouro de triângulos. Nunca lança.
 */

const FORMAS = new Set(['extrusao', 'revolucao', 'varredura', 'transicao']);

/** Todos os campos de fórmula de um corpo, com o `onde` de cada um (inclui o perfil e o caminho). */
export function camposDoCorpo(corpo: unknown, onde: string): CampoExpressao[] {
  if (!ehObjeto(corpo)) return [];
  const permiteIN = corpo.repetir !== undefined;
  const out: CampoExpressao[] = [];
  const add = (lugar: string, valor: unknown, obrigatorio: boolean, IN: boolean): void => {
    out.push({ onde: `${onde}.${lugar}`, valor, obrigatorio, permiteIN: IN });
  };

  const quadro = ehObjeto(corpo.quadro) ? corpo.quadro : undefined;
  const origem = comoArray<unknown>(quadro?.origem);
  for (let i = 0; i < 3; i++) add(`quadro.origem[${i}]`, origem[i], true, permiteIN);
  if (quadro?.rotacao !== undefined) {
    const rotacao = comoArray<unknown>(quadro.rotacao);
    for (let i = 0; i < 3; i++) add(`quadro.rotacao[${i}]`, rotacao[i], true, permiteIN);
  }

  if (corpo.repetir !== undefined) add('repetir', corpo.repetir, false, false);
  if (corpo.quando !== undefined) add('quando', corpo.quando, false, permiteIN);

  const forma = ehObjeto(corpo.forma) ? corpo.forma : undefined;
  if (forma === undefined) return out;
  const perfil = (lugar: string): CampoExpressao[] => camposDoPerfil(forma[lugar], `${onde}.forma.${lugar}`, permiteIN);

  switch (forma.tipo) {
    case 'extrusao':
      add('forma.comprimento', forma.comprimento, true, permiteIN);
      out.push(...perfil('perfil'));
      break;
    case 'revolucao':
      add('forma.angulo', forma.angulo, true, permiteIN);
      add('forma.segmentos', forma.segmentos, false, permiteIN);
      out.push(...perfil('perfil'));
      break;
    case 'varredura': {
      out.push(...perfil('perfil'));
      const caminho = ehObjeto(forma.caminho) ? forma.caminho : undefined;
      comoArray<unknown>(caminho?.pontos).forEach((ponto, k) => {
        const par = comoArray<unknown>(ponto);
        for (let j = 0; j < 3; j++) add(`forma.caminho.pontos[${k}][${j}]`, par[j], true, permiteIN);
      });
      comoArray<unknown>(caminho?.raios).forEach((raio, k) => add(`forma.caminho.raios[${k}]`, raio, false, permiteIN));
      add('forma.caminho.segmentosPorCurva', caminho?.segmentosPorCurva, false, permiteIN);
      break;
    }
    case 'transicao':
      add('forma.comprimento', forma.comprimento, true, permiteIN);
      out.push(...perfil('perfilA'), ...perfil('perfilB'));
      if (forma.desvio !== undefined) {
        const desvio = comoArray<unknown>(forma.desvio);
        add('forma.desvio[0]', desvio[0], true, permiteIN);
        add('forma.desvio[1]', desvio[1], true, permiteIN);
      }
      break;
    default:
      break;
  }
  return out;
}

export function validarCorpos(f: Familia): Problema[] {
  if (f.corpos === undefined) return [];
  if (!Array.isArray(f.corpos)) return [criarProblema('tipo', 'corpos precisa ser uma lista', 'familia')];
  const corpos = comoArray<unknown>(f.corpos);

  const out: Problema[] = [];
  if (corpos.length > LIMITES_CORPO.corpos) {
    out.push(criarProblema('limite', `a família passa de ${LIMITES_CORPO.corpos} corpos`, 'familia'));
  }

  // Espaço de nomes compartilhado: peças, aninhados e corpos (CONTRATO §2.5).
  const nomes = new Set<string>();
  for (const peca of comoArray<unknown>(f.pecas)) {
    if (ehObjeto(peca) && typeof peca.id === 'string') nomes.add(peca.id);
  }
  for (const aninhado of comoArray<unknown>(f.aninhados)) {
    if (ehObjeto(aninhado) && typeof aninhado.id === 'string') nomes.add(aninhado.id);
  }

  const { ids, chapas } = escopoDeReferencias(f);

  corpos.forEach((corpo, i) => {
    if (!ehObjeto(corpo)) {
      out.push(criarProblema('tipo', 'o corpo precisa ser um objeto', `corpos[${i}]`));
      return;
    }
    const onde = `corpos[${texto(corpo.id)}]`;
    const id = typeof corpo.id === 'string' && corpo.id.trim() !== '' ? corpo.id : undefined;
    if (id === undefined) {
      out.push(criarProblema('id_invalido', 'corpo sem id (o id precisa ser texto não vazio)', onde));
    } else if (nomes.has(id)) {
      out.push(criarProblema('id_duplicado', `id “${id}” já existe em peça, aninhado ou outro corpo`, onde));
    } else {
      nomes.add(id);
    }

    const forma = corpo.forma;
    if (forma === undefined) {
      out.push(criarProblema('obrigatorio', 'forma ausente', `${onde}.forma`));
    } else if (!ehObjeto(forma) || typeof forma.tipo !== 'string' || !FORMAS.has(forma.tipo)) {
      out.push(criarProblema('tipo', `forma de corpo desconhecida “${texto(ehObjeto(forma) ? forma.tipo : forma)}”`, `${onde}.forma`));
    } else {
      validarForma(forma, onde, out);
    }

    validarExpressoes(camposDoCorpo(corpo, onde), ids, chapas, out);
    validarFurar(corpo, id, corpos, onde, out);
  });

  return out;
}

function validarForma(forma: Record<string, unknown>, onde: string, out: Problema[]): void {
  const base = `${onde}.forma`;
  switch (forma.tipo) {
    case 'extrusao':
      validarPerfil(forma.perfil, `${base}.perfil`, out);
      exigirPositivo(forma.comprimento, `${base}.comprimento`, out);
      break;
    case 'revolucao':
      validarPerfil(forma.perfil, `${base}.perfil`, out);
      validarAngulo(forma.angulo, `${base}.angulo`, out);
      validarUNaRevolucao(forma.perfil, `${base}.perfil`, out);
      break;
    case 'varredura':
      validarPerfil(forma.perfil, `${base}.perfil`, out);
      validarCaminho(forma.caminho, `${base}.caminho`, out);
      break;
    case 'transicao':
      validarPerfil(forma.perfilA, `${base}.perfilA`, out);
      validarPerfil(forma.perfilB, `${base}.perfilB`, out);
      if (temFuros(forma.perfilA)) out.push(criarProblema('tipo', 'a transição não aceita furos (perfil oco)', `${base}.perfilA`));
      if (temFuros(forma.perfilB)) out.push(criarProblema('tipo', 'a transição não aceita furos (perfil oco)', `${base}.perfilB`));
      exigirPositivo(forma.comprimento, `${base}.comprimento`, out);
      break;
    default:
      break;
  }
}

function validarAngulo(angulo: unknown, onde: string, out: Problema[]): void {
  const n = literal(angulo);
  if (n !== undefined && !(n > 0 && n <= 360)) {
    out.push(criarProblema('faixa', 'ângulo de revolução precisa estar em (0, 360]', onde));
  }
}

/** Revolução: `u` é a distância ao eixo, então pontos literais de polígono com u < 0 são erro (CONTRATO §2.2). */
function validarUNaRevolucao(perfil: unknown, onde: string, out: Problema[]): void {
  if (!ehObjeto(perfil) || perfil.tipo !== 'poligono') return;
  comoArray<unknown>(perfil.pontos).forEach((ponto, k) => {
    const u = literal(comoArray<unknown>(ponto)[0]);
    if (u !== undefined && u < 0) {
      out.push(criarProblema('faixa', 'revolução precisa de u ≥ 0 (distância ao eixo)', `${onde}.pontos[${k}][0]`));
    }
  });
}

function validarCaminho(caminho: unknown, onde: string, out: Problema[]): void {
  if (caminho === undefined) {
    out.push(criarProblema('obrigatorio', 'caminho ausente', onde));
    return;
  }
  if (!ehObjeto(caminho)) {
    out.push(criarProblema('tipo', 'o caminho precisa ser um objeto', onde));
    return;
  }

  const pontos = caminho.pontos;
  if (pontos === undefined) {
    out.push(criarProblema('obrigatorio', 'caminho sem pontos', `${onde}.pontos`));
  } else if (!Array.isArray(pontos)) {
    out.push(criarProblema('tipo', 'os pontos do caminho precisam ser uma lista', `${onde}.pontos`));
  } else {
    const lista = comoArray<unknown>(pontos);
    if (lista.length < 2) {
      out.push(criarProblema('faixa', `caminho precisa de pelo menos 2 pontos (tem ${lista.length})`, `${onde}.pontos`));
    }
    if (lista.length > LIMITES_CORPO.pontosCaminho) {
      out.push(criarProblema('limite', `caminho passa de ${LIMITES_CORPO.pontosCaminho} pontos`, `${onde}.pontos`));
    }
    lista.forEach((ponto, k) => {
      if (!Array.isArray(ponto) || ponto.length !== 3) {
        out.push(criarProblema('tipo', 'ponto do caminho precisa de 3 coordenadas', `${onde}.pontos[${k}]`));
      }
    });

    if (caminho.raios !== undefined) {
      if (!Array.isArray(caminho.raios)) {
        out.push(criarProblema('tipo', 'os raios precisam ser uma lista', `${onde}.raios`));
      } else {
        const maximo = Math.max(0, lista.length - 2);
        const quantos = comoArray<unknown>(caminho.raios).length;
        if (quantos > maximo) {
          out.push(criarProblema('faixa', `há ${quantos} raios para ${lista.length} pontos (máximo ${maximo})`, `${onde}.raios`));
        }
      }
    }
  }

  const segmentos = literal(caminho.segmentosPorCurva);
  if (segmentos !== undefined && (segmentos < 2 || segmentos > LIMITES_CORPO.segmentosCurva)) {
    out.push(criarProblema('faixa', `segmentos por curva precisa estar entre 2 e ${LIMITES_CORPO.segmentosCurva}`, `${onde}.segmentosPorCurva`));
  }
}

/** Mesma regra de `validarReferencias`, reaplicada aqui porque ela não enxerga os corpos. */
function validarExpressoes(campos: CampoExpressao[], ids: ReadonlySet<string>, chapas: ReadonlySet<string>, out: Problema[]): void {
  for (const campo of campos) {
    if (campo.valor === undefined) {
      if (campo.obrigatorio) out.push(criarProblema('obrigatorio', 'campo obrigatório ausente', campo.onde));
      continue;
    }
    if (typeof campo.valor !== 'string') {
      out.push(criarProblema('tipo', 'expressão precisa ser texto', campo.onde));
      continue;
    }
    const compilado = compilar(campo.valor);
    if ('erro' in compilado) {
      out.push(criarProblema('formula', `fórmula inválida: ${compilado.erro.message}`, campo.onde));
      continue;
    }
    for (const nome of referencias(compilado.no)) {
      if (!referenciaValida(nome, ids, chapas, campo.permiteIN)) {
        out.push(criarProblema('referencia', `“${nome}” não existe neste escopo`, campo.onde));
      }
    }
  }
}

function escopoDeReferencias(f: Familia): { ids: Set<string>; chapas: Set<string> } {
  const ids = new Set<string>();
  const chapas = new Set<string>();
  for (const p of comoArray<unknown>(f.parametros)) {
    if (!ehObjeto(p) || typeof p.id !== 'string') continue;
    ids.add(p.id);
    if (p.tipo === 'chapa') chapas.add(p.id);
  }
  for (const p of comoArray<unknown>(f.planos)) {
    if (ehObjeto(p) && typeof p.id === 'string') ids.add(p.id);
  }
  return { ids, chapas };
}

function referenciaValida(nome: string, ids: ReadonlySet<string>, chapas: ReadonlySet<string>, permiteIN: boolean): boolean {
  if (nome === 'i' || nome === 'n') return permiteIN;
  const partes = nome.split('.');
  if (partes.length === 1) return ids.has(nome);
  if (partes.length === 2 && partes[1] === 'esp') {
    const base = partes[0];
    return base !== undefined && chapas.has(base);
  }
  return false;
}

/** `furar` (D2): lista de ids de OUTROS corpos de extrusão da família; id desconhecido, o próprio corpo ou forma sem vão são problemas. */
function validarFurar(corpo: Record<string, unknown>, id: string | undefined, corpos: unknown[], onde: string, out: Problema[]): void {
  if (corpo.furar === undefined) return;
  if (!Array.isArray(corpo.furar) || corpo.furar.some((x) => typeof x !== 'string')) {
    out.push(criarProblema('tipo', 'furar precisa ser uma lista de ids de corpos', `${onde}.furar`));
    return;
  }
  for (const alvo of corpo.furar as string[]) {
    const outro = corpos.find((c) => ehObjeto(c) && c.id === alvo);
    if (alvo === id || !ehObjeto(outro)) out.push(criarProblema('referencia', `furar aponta para “${alvo}”, que não é outro corpo da família`, `${onde}.furar`));
    else if (!ehObjeto(outro.forma) || outro.forma.tipo !== 'extrusao') out.push(criarProblema('tipo', `furar só aceita corpo de extrusão (“${alvo}” não é)`, `${onde}.furar`));
  }
}
