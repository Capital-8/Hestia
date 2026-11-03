import type { LinhaLista, VeioNaLista } from './listaPecas.ts';

/*
 * Plano de corte (arranjo das peças nas chapas). FICHA E6-corte: implementar as funções abaixo. Testes em `planoCorte.test.ts`
 * (invariantes: nada fora da chapa, nada sobreposto, kerf respeitado, veio respeitado, cada peça uma vez). Puras, numéricas e
 * DETERMINÍSTICAS (o Rust vai reproduzir posições idênticas a 1 µm: use sempre o mesmo desempate). Medidas em milímetros.
 * Sistema da chapa: origem no canto inferior esquerdo, X ao longo de `largura`, Y ao longo de `altura`; a área útil é
 * `[refilo, largura − refilo] × [refilo, altura − refilo]`. O veio da chapa corre ao longo de X.
 */

export interface PecaParaCorte {
  /** Identificação para a interface (por exemplo o nome da peça e o número da unidade). */
  id: string;
  /** Maior e menor dimensão da peça (mm). */
  comprimento: number;
  largura: number;
  veio: VeioNaLista;
}

export interface ChapaParaCorte {
  largura: number;
  altura: number;
  refilo: number;
  /** A chapa tem veio: peça com veio 'comprimento' fica com o comprimento ao longo de X, com 'largura' fica com a largura ao longo de X. */
  veio: boolean;
  /** Espessura da serra (mm): folga mínima entre duas peças vizinhas. */
  kerf: number;
}

export interface Posicionada {
  /** Índice da peça na lista de entrada. */
  peca: number;
  /** Canto inferior esquerdo e tamanho ocupado na chapa (mm). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** `true` quando o comprimento da peça ficou ao longo de Y (peça girada 90°). */
  girada: boolean;
}

export interface ChapaCortada {
  posicoes: Posicionada[];
  /** Soma das áreas das peças desta chapa (mm2). */
  areaUsada: number;
}

export interface PlanoCorte {
  chapas: ChapaCortada[];
  /** Peças que não cabem nem na chapa vazia (índices na lista de entrada, em ordem crescente). */
  naoCouberam: number[];
  /** Soma das áreas das peças colocadas (mm2) e `n × (área útil)` (mm2). */
  areaPecas: number;
  areaChapas: number;
  /** `areaPecas / areaChapas`; 0 quando não há chapa. */
  aproveitamento: number;
}

/** Tolerância para comparar medidas e sobras (mm). */
const TOL = 1e-9;

interface RetanguloLivre {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Ordem global de criação: desempate "retângulo mais antigo". */
  idade: number;
}

interface ChapaAberta {
  livres: RetanguloLivre[];
  posicoes: Posicionada[];
  areaUsada: number;
}

interface ContadorIdade {
  valor: number;
}

interface OrientacaoEscolhida {
  girada: boolean;
  sobraCurta: number;
  sobraLonga: number;
}

interface Escolha {
  chapa: number;
  retangulo: number;
  girada: boolean;
  sobraCurta: number;
  sobraLonga: number;
  idade: number;
}

function novoRetangulo(x: number, y: number, w: number, h: number, contador: ContadorIdade): RetanguloLivre {
  const retangulo: RetanguloLivre = { x, y, w, h, idade: contador.valor };
  contador.valor += 1;
  return retangulo;
}

function menorQue(a: number, b: number): boolean {
  return a < b - TOL;
}

/** Compara duas orientações dentro de um mesmo retângulo: lado curto, lado longo, depois não girada. */
function orientacaoMelhor(candidata: OrientacaoEscolhida, atual: OrientacaoEscolhida | null): boolean {
  if (atual === null) return true;
  if (menorQue(candidata.sobraCurta, atual.sobraCurta)) return true;
  if (menorQue(atual.sobraCurta, candidata.sobraCurta)) return false;
  if (menorQue(candidata.sobraLonga, atual.sobraLonga)) return true;
  if (menorQue(atual.sobraLonga, candidata.sobraLonga)) return false;
  if (candidata.girada !== atual.girada) return !candidata.girada;
  return false;
}

/** Compara duas posições entre retângulos: lado curto, lado longo, não girada, retângulo mais antigo. */
function escolhaMelhor(candidata: Escolha, atual: Escolha | null): boolean {
  if (atual === null) return true;
  if (menorQue(candidata.sobraCurta, atual.sobraCurta)) return true;
  if (menorQue(atual.sobraCurta, candidata.sobraCurta)) return false;
  if (menorQue(candidata.sobraLonga, atual.sobraLonga)) return true;
  if (menorQue(atual.sobraLonga, candidata.sobraLonga)) return false;
  if (candidata.girada !== atual.girada) return !candidata.girada;
  return candidata.idade < atual.idade;
}

/** Melhor orientação que cabe em um retângulo livre de `wLivre × hLivre`, ou `null` se nenhuma cabe. */
function melhorOrientacao(
  peca: PecaParaCorte,
  wLivre: number,
  hLivre: number,
  orientacoes: readonly boolean[],
): OrientacaoEscolhida | null {
  let melhor: OrientacaoEscolhida | null = null;
  for (const girada of orientacoes) {
    const w = girada ? peca.largura : peca.comprimento;
    const h = girada ? peca.comprimento : peca.largura;
    if (w > wLivre + TOL || h > hLivre + TOL) continue;
    const sobraCurta = Math.min(wLivre - w, hLivre - h);
    const sobraLonga = Math.max(wLivre - w, hLivre - h);
    const candidata: OrientacaoEscolhida = { girada, sobraCurta, sobraLonga };
    if (orientacaoMelhor(candidata, melhor)) melhor = candidata;
  }
  return melhor;
}

/** Procura a melhor posição nas chapas já abertas (da primeira à última, retângulos na ordem de criação). */
function melhorPosicao(
  peca: PecaParaCorte,
  chapas: readonly ChapaAberta[],
  orientacoes: readonly boolean[],
): Escolha | null {
  let melhor: Escolha | null = null;
  for (let ci = 0; ci < chapas.length; ci++) {
    const aberta = chapas[ci]!;
    for (let ri = 0; ri < aberta.livres.length; ri++) {
      const retangulo = aberta.livres[ri]!;
      const orientacao = melhorOrientacao(peca, retangulo.w, retangulo.h, orientacoes);
      if (orientacao === null) continue;
      const candidata: Escolha = {
        chapa: ci,
        retangulo: ri,
        girada: orientacao.girada,
        sobraCurta: orientacao.sobraCurta,
        sobraLonga: orientacao.sobraLonga,
        idade: retangulo.idade,
      };
      if (escolhaMelhor(candidata, melhor)) melhor = candidata;
    }
  }
  return melhor;
}

function abrirChapa(chapa: ChapaParaCorte, contador: ContadorIdade): ChapaAberta {
  const w = chapa.largura - 2 * chapa.refilo;
  const h = chapa.altura - 2 * chapa.refilo;
  return {
    livres: [novoRetangulo(chapa.refilo, chapa.refilo, w, h, contador)],
    posicoes: [],
    areaUsada: 0,
  };
}

/** Coloca a peça no canto inferior esquerdo do retângulo escolhido e o divide em DIREITA e ACIMA. Devolve a área ocupada. */
function colocarPeca(
  chapas: ChapaAberta[],
  escolha: Escolha,
  indice: number,
  peca: PecaParaCorte,
  kerf: number,
  contador: ContadorIdade,
): number {
  const aberta = chapas[escolha.chapa]!;
  const livre = aberta.livres[escolha.retangulo]!;
  const girada = escolha.girada;
  const w = girada ? peca.largura : peca.comprimento;
  const h = girada ? peca.comprimento : peca.largura;

  aberta.livres.splice(escolha.retangulo, 1);
  aberta.posicoes.push({ peca: indice, x: livre.x, y: livre.y, w, h, girada });
  aberta.areaUsada += w * h;

  const sobraW = livre.w - w - kerf;
  if (sobraW > 0) {
    aberta.livres.push(novoRetangulo(livre.x + w + kerf, livre.y, sobraW, h, contador));
  }
  const sobraH = livre.h - h - kerf;
  if (sobraH > 0) {
    aberta.livres.push(novoRetangulo(livre.x, livre.y + h + kerf, livre.w, sobraH, contador));
  }

  return w * h;
}

/** Índices por área decrescente, depois comprimento decrescente, depois índice crescente. */
function ordemDeCorte(pecas: readonly PecaParaCorte[]): number[] {
  const ordem = pecas.map((_, indice) => indice);
  ordem.sort((a, b) => {
    const pa = pecas[a]!;
    const pb = pecas[b]!;
    const areaA = pa.comprimento * pa.largura;
    const areaB = pb.comprimento * pb.largura;
    if (Math.abs(areaA - areaB) > TOL) return areaB - areaA;
    if (Math.abs(pa.comprimento - pb.comprimento) > TOL) return pb.comprimento - pa.comprimento;
    return a - b;
  });
  return ordem;
}

/**
 * Orientações permitidas de uma peça: sem veio na chapa (`chapa.veio` falso), ou peça com veio 'livre' ou `null`: as duas
 * (comprimento ao longo de X, e girada). Com veio na chapa: 'comprimento' só com o comprimento ao longo de X; 'largura' só girada
 * (comprimento ao longo de Y). Devolve as orientações como `girada: boolean`, a não girada primeiro.
 */
export function orientacoesPermitidas(p: PecaParaCorte, chapa: ChapaParaCorte): boolean[] {
  if (!chapa.veio) return [false, true];
  if (p.veio === 'comprimento') return [false];
  if (p.veio === 'largura') return [true];
  return [false, true];
}

/**
 * Plano de corte guilhotina com kerf. Método (siga-o para a saída ser idêntica no Rust): ordene os índices por área decrescente (empate: comprimento
 * decrescente, depois índice crescente). Cada chapa nova começa com UM retângulo livre (a área útil). Para cada peça, na ordem, procure, nas chapas já
 * abertas (da primeira à última) e dentro de cada uma nos retângulos livres (na ordem em que foram criados), a melhor posição pelo critério "melhor
 * lado curto": para cada orientação permitida em que a peça cabe no retângulo, o sobrante do lado curto `min(Wlivre − w, Hlivre − h)`; vence o menor
 * sobrante, depois o menor sobrante do lado longo, depois a orientação não girada, depois o retângulo mais antigo. Se nenhuma chapa aberta serve, abra
 * uma nova; se a peça não cabe nem na chapa nova, vai para `naoCouberam`. A peça é colocada no canto inferior esquerdo do retângulo livre escolhido e
 * este é dividido em dois retângulos guilhotinados, descontando o kerf: DIREITA = `(x + w + kerf, y, Wlivre − w − kerf, h)` (se a largura sobrante for
 * maior que 0) e ACIMA = `(x, y + h + kerf, Wlivre, Hlivre − h − kerf)` (se a altura sobrante for maior que 0); a divisão é sempre nesta ordem
 * (primeiro DIREITA, depois ACIMA) e retângulos de largura ou altura ≤ 0 não são criados. O resultado lista as chapas na ordem de abertura e as posições na ordem de colocação.
 */
export function planoDeCorte(pecas: readonly PecaParaCorte[], chapa: ChapaParaCorte): PlanoCorte {
  const chapas: ChapaAberta[] = [];
  const naoCouberam: number[] = [];
  const contador: ContadorIdade = { valor: 0 };
  let areaPecas = 0;

  for (const indice of ordemDeCorte(pecas)) {
    const peca = pecas[indice]!;
    const orientacoes = orientacoesPermitidas(peca, chapa);
    let escolha = melhorPosicao(peca, chapas, orientacoes);

    if (escolha === null) {
      const wUtil = chapa.largura - 2 * chapa.refilo;
      const hUtil = chapa.altura - 2 * chapa.refilo;
      const orientacao = melhorOrientacao(peca, wUtil, hUtil, orientacoes);
      if (orientacao === null) {
        naoCouberam.push(indice);
        continue;
      }
      chapas.push(abrirChapa(chapa, contador));
      const aberta = chapas[chapas.length - 1]!;
      escolha = {
        chapa: chapas.length - 1,
        retangulo: 0,
        girada: orientacao.girada,
        sobraCurta: orientacao.sobraCurta,
        sobraLonga: orientacao.sobraLonga,
        idade: aberta.livres[0]!.idade,
      };
    }

    areaPecas += colocarPeca(chapas, escolha, indice, peca, chapa.kerf, contador);
  }

  const areaUtil = (chapa.largura - 2 * chapa.refilo) * (chapa.altura - 2 * chapa.refilo);
  const areaChapas = chapas.length * areaUtil;
  naoCouberam.sort((a, b) => a - b);

  return {
    chapas: chapas.map((aberta) => ({ posicoes: aberta.posicoes, areaUsada: aberta.areaUsada })),
    naoCouberam,
    areaPecas,
    areaChapas,
    aproveitamento: areaChapas > 0 ? areaPecas / areaChapas : 0,
  };
}

/** Uma `PecaParaCorte` por UNIDADE de cada linha (`quantidade` vezes), com `id` = `<nome> #<k>` (k de 1 a quantidade), na ordem das linhas. */
export function pecasParaCorte(linhas: readonly LinhaLista[]): PecaParaCorte[] {
  const pecas: PecaParaCorte[] = [];
  for (const linha of linhas) {
    for (let k = 1; k <= linha.quantidade; k++) {
      pecas.push({
        id: `${linha.nome} #${k}`,
        comprimento: linha.comprimento,
        largura: linha.largura,
        veio: linha.veio,
      });
    }
  }
  return pecas;
}
