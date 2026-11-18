import type { Familia } from '../tipos.ts';
import { bloco, booleano, chapaZ, comprimento, derivado, enumerado, material, nova, placaX, placaY } from './novosApoio.ts';

/*
 * Genéricos (bloco em caixa, painel plano, perfil linear) e louças e metais que cabem em chapas (cubas de inox e de embutir,
 * bancada com recorte para cuba, box de vidro reto e de canto, prateleira e porta-toalha, espelho com moldura). O editor não faz
 * bacia, lavatório de coluna, banheira nem torneira (virão por importação de blocos). Medidas em mm.
 */

const IN = 'mat_metal';
const VI = 'mat_vidro_incolor';

// ───────────────────────── genéricos ─────────────────────────

export const FAMILIA_BLOCO_CAIXA: Familia = nova({
  id: 'fam_bloco_caixa',
  nome: 'Bloco em caixa',
  categoria: 'generico',
  descricao: 'Caixa paramétrica genérica: bloco maciço ou caixa oca aberta em cima, com espessura de parede ajustável e material livre.',
  parametros: [
    comprimento('L', 'Largura', 600, 20, 4000),
    comprimento('A', 'Altura', 600, 20, 3000),
    comprimento('P', 'Profundidade', 600, 20, 4000),
    booleano('oco', 'Caixa oca (aberta em cima)', false),
    comprimento('e', 'Espessura da parede', 18, 3, 50, 1),
    material('material', 'Material', 'madeira_macica'),
  ],
  pecas: [
    bloco('bloco', 'Bloco maciço', '0', '0', '0', 'L', 'P', 'A', 'material', { quando: '!oco' }),
    chapaZ('fundoCaixa', 'Fundo da caixa', 'base', '0', '0', '0', 'L', 'P', 'min(e, A - 1)', 'material', { quando: 'oco' }),
    placaX('ladoE', 'Lado esquerdo', 'lateral', '0', '0', 'min(e, A - 1)', 'P', 'A - min(e, A - 1)', 'min(e, L / 3)', 'material', { quando: 'oco' }),
    placaX('ladoD', 'Lado direito', 'lateral', 'L - min(e, L / 3)', '0', 'min(e, A - 1)', 'P', 'A - min(e, A - 1)', 'min(e, L / 3)', 'material', { quando: 'oco' }),
    placaY('frenteCaixa', 'Frente', 'painel', 'min(e, L / 3)', '0', 'min(e, A - 1)', 'L - 2 * min(e, L / 3)', 'A - min(e, A - 1)', 'min(e, P / 3)', 'material', { quando: 'oco' }),
    placaY('fundoParede', 'Costas', 'painel', 'min(e, L / 3)', 'P - min(e, P / 3)', 'min(e, A - 1)', 'L - 2 * min(e, L / 3)', 'A - min(e, A - 1)', 'min(e, P / 3)', 'material', { quando: 'oco' }),
  ],
  tipos: [
    { id: 'cubo60', nome: 'Cubo 600', valores: { L: 600, A: 600, P: 600 } },
    { id: 'caixa_oca', nome: 'Caixa oca 800 × 400 × 400', valores: { L: 800, A: 400, P: 400, oco: true } },
    { id: 'laje', nome: 'Laje baixa 2000 × 100 × 1000', valores: { L: 2000, A: 100, P: 1000 } },
  ],
  tipoPadrao: 'cubo60',
});

export const FAMILIA_PAINEL_PLANO: Familia = nova({
  id: 'fam_painel_plano',
  nome: 'Painel plano',
  categoria: 'generico',
  descricao: 'Painel plano de espessura ajustável, de pé, para tapumes, fundos, divisórias e placas, em qualquer material.',
  parametros: [
    comprimento('L', 'Largura', 1200, 50, 6000),
    comprimento('A', 'Altura', 2400, 50, 6000),
    comprimento('P', 'Espessura', 18, 3, 200, 1),
    material('material', 'Material', 'mat_porta'),
  ],
  pecas: [placaY('painel', 'Painel', 'painel', '0', '0', '0', 'L', 'A', 'P', 'material')],
  tipos: [
    { id: 'painel12x24', nome: 'Painel 1200 × 2400 × 18', valores: { L: 1200, A: 2400, P: 18 } },
    { id: 'divisoria', nome: 'Divisória 900 × 2100 × 35', valores: { L: 900, A: 2100, P: 35 } },
    { id: 'placa', nome: 'Placa 600 × 400 × 6', valores: { L: 600, A: 400, P: 6 } },
  ],
  tipoPadrao: 'painel12x24',
});

export const FAMILIA_PERFIL_LINEAR: Familia = nova({
  id: 'fam_perfil_linear',
  nome: 'Perfil linear',
  categoria: 'generico',
  descricao: 'Perfil linear ao longo do eixo X: barra maciça, tubo retangular (4 chapas) ou cantoneira (duas abas), com seção A × P e espessura de parede ajustáveis.',
  parametros: [
    comprimento('L', 'Comprimento', 1000, 50, 6000),
    comprimento('A', 'Altura da seção', 40, 20, 300, 5),
    comprimento('P', 'Largura da seção', 40, 20, 300, 5),
    enumerado('forma', 'Forma da seção', 'barra', [['barra', 'Barra maciça'], ['tubo', 'Tubo retangular'], ['cantoneira', 'Cantoneira']]),
    comprimento('e', 'Espessura da parede', 3, 1, 8, 1),
    material('material', 'Material', 'mat_metal'),
  ],
  pecas: [
    bloco('barra', 'Barra', '0', '0', '0', 'L', 'P', 'A', 'material', { quando: 'forma == "barra"' }),
    chapaZ('tuboInf', 'Tubo: face inferior', 'base', '0', '0', '0', 'L', 'P', 'e', 'material', { quando: 'forma == "tubo"' }),
    chapaZ('tuboSup', 'Tubo: face superior', 'topo', '0', '0', 'A - e', 'L', 'P', 'e', 'material', { quando: 'forma == "tubo"' }),
    placaY('tuboFrente', 'Tubo: face frontal', 'painel', '0', '0', 'e', 'L', 'A - 2 * e', 'e', 'material', { quando: 'forma == "tubo"' }),
    placaY('tuboFundo', 'Tubo: face traseira', 'painel', '0', 'P - e', 'e', 'L', 'A - 2 * e', 'e', 'material', { quando: 'forma == "tubo"' }),
    chapaZ('abaBase', 'Cantoneira: aba horizontal', 'base', '0', '0', '0', 'L', 'P', 'e', 'material', { quando: 'forma == "cantoneira"' }),
    placaY('abaVertical', 'Cantoneira: aba vertical', 'painel', '0', '0', 'e', 'L', 'A - e', 'e', 'material', { quando: 'forma == "cantoneira"' }),
  ],
  tipos: [
    { id: 'barra40', nome: 'Barra 40 × 40 × 1000', valores: { L: 1000, A: 40, P: 40 } },
    { id: 'tubo50x30', nome: 'Tubo 50 × 30 × 3000', valores: { L: 3000, A: 50, P: 30, forma: 'tubo' } },
    { id: 'cantoneira', nome: 'Cantoneira 40 × 40 × 1000', valores: { L: 1000, A: 40, P: 40, forma: 'cantoneira' } },
  ],
  tipoPadrao: 'barra40',
});

export const GENERICOS_NOVOS: Familia[] = [FAMILIA_BLOCO_CAIXA, FAMILIA_PAINEL_PLANO, FAMILIA_PERFIL_LINEAR];

// ───────────────────────── louças e metais ─────────────────────────

export const FAMILIA_CUBA_INOX: Familia = nova({
  id: 'fam_cuba_inox',
  nome: 'Cuba de inox quadrada',
  categoria: 'loucas',
  descricao: 'Cuba de inox quadrada de sobrepor, feita de chapas planas (fundo, quatro paredes e ralo). Sem curvas; a válvula e a torneira virão por bloco importado.',
  parametros: [
    comprimento('L', 'Largura', 400, 300, 600),
    comprimento('A', 'Profundidade da cuba', 200, 150, 300),
    comprimento('P', 'Comprimento', 400, 300, 600),
    comprimento('e', 'Espessura da chapa', 2, 1, 5, 1),
  ],
  pecas: [
    chapaZ('fundo', 'Fundo', 'base', 'e', 'e', '0', 'L - 2 * e', 'P - 2 * e', 'e', IN),
    placaY('frente', 'Parede frontal', 'painel', '0', '0', '0', 'L', 'A', 'e', IN),
    placaY('traseira', 'Parede traseira', 'painel', '0', 'P - e', '0', 'L', 'A', 'e', IN),
    placaX('esquerda', 'Parede esquerda', 'lateral', '0', 'e', '0', 'P - 2 * e', 'A', 'e', IN),
    placaX('direita', 'Parede direita', 'lateral', 'L - e', 'e', '0', 'P - 2 * e', 'A', 'e', IN),
    bloco('ralo', 'Ralo', 'L / 2 - 30', 'P / 2 - 30', 'e', '60', '60', '3', IN),
  ],
  tipos: [
    { id: 'cuba40', nome: 'Cuba 400 × 400 × 200', valores: { L: 400, P: 400, A: 200 } },
    { id: 'cuba50', nome: 'Cuba 500 × 500 × 250', valores: { L: 500, P: 500, A: 250 } },
    { id: 'cuba34', nome: 'Cuba 340 × 340 × 170', valores: { L: 340, P: 340, A: 170 } },
  ],
  tipoPadrao: 'cuba40',
});

export const FAMILIA_CUBA_EMBUTIR: Familia = nova({
  id: 'fam_cuba_embutir',
  nome: 'Cuba de embutir retangular',
  categoria: 'loucas',
  descricao: 'Cuba retangular de embutir com aba de apoio de 30 mm e cuba de chapas planas por baixo, em inox ou em outro material (padrão inox).',
  parametros: [
    comprimento('L', 'Largura', 500, 400, 900),
    comprimento('A', 'Altura total', 180, 120, 300),
    comprimento('P', 'Profundidade', 400, 300, 550),
    comprimento('e', 'Espessura da chapa', 2, 1, 5, 1),
    material('materialCuba', 'Material da cuba', 'mat_metal'),
  ],
  pecas: [
    chapaZ('abaFrente', 'Aba frontal', 'tampo', '0', '0', 'A - e', 'L', '30', 'e', 'materialCuba'),
    chapaZ('abaFundo', 'Aba traseira', 'tampo', '0', 'P - 30', 'A - e', 'L', '30', 'e', 'materialCuba'),
    chapaZ('abaEsq', 'Aba esquerda', 'tampo', '0', '30', 'A - e', '30', 'P - 60', 'e', 'materialCuba'),
    chapaZ('abaDir', 'Aba direita', 'tampo', 'L - 30', '30', 'A - e', '30', 'P - 60', 'e', 'materialCuba'),
    chapaZ('fundoCuba', 'Fundo da cuba', 'base', '30 + e', '30 + e', '0', 'L - 60 - 2 * e', 'P - 60 - 2 * e', 'e', 'materialCuba'),
    placaY('paredeFrente', 'Parede frontal', 'painel', '30', '30', '0', 'L - 60', 'A - e', 'e', 'materialCuba'),
    placaY('paredeFundo', 'Parede traseira', 'painel', '30', 'P - 30 - e', '0', 'L - 60', 'A - e', 'e', 'materialCuba'),
    placaX('paredeEsq', 'Parede esquerda', 'lateral', '30', '30 + e', '0', 'P - 60 - 2 * e', 'A - e', 'e', 'materialCuba'),
    placaX('paredeDir', 'Parede direita', 'lateral', 'L - 30 - e', '30 + e', '0', 'P - 60 - 2 * e', 'A - e', 'e', 'materialCuba'),
  ],
  tipos: [
    { id: 'embutir50', nome: 'Cuba 500 × 400 × 180', valores: { L: 500, P: 400, A: 180 } },
    { id: 'embutir60', nome: 'Cuba 600 × 450 × 200', valores: { L: 600, P: 450, A: 200 } },
    { id: 'embutir_dupla', nome: 'Cuba grande 800 × 450 × 200', valores: { L: 800, P: 450, A: 200 } },
  ],
  tipoPadrao: 'embutir50',
});

export const FAMILIA_BANCADA_CUBA: Familia = nova({
  id: 'fam_bancada_recorte_cuba',
  nome: 'Bancada com recorte para cuba',
  categoria: 'loucas',
  descricao: 'Bancada de pedra com recorte (vazio) para cuba, rodabanca opcional e cuba de chapas planas por baixo. A cota de apoio da bancada é a profundidade da cuba.',
  parametros: [
    comprimento('L', 'Largura', 1200, 600, 3000),
    comprimento('A', 'Altura total', 310, 210, 450),
    comprimento('P', 'Profundidade', 550, 400, 700),
    comprimento('cuW', 'Largura da cuba', 400, 300, 600),
    comprimento('cuP', 'Profundidade da cuba (no plano)', 340, 250, 450),
    derivado('prof', 'Profundidade da cuba', '180'),
    derivado('hRb', 'Altura da rodabanca', 'A - prof - 30'),
    derivado('cx', 'Início X da cuba', '(L - cuW) / 2'),
    derivado('cy', 'Início Y da cuba', '(P - cuP) / 2'),
  ],
  pecas: [
    chapaZ('tampo', 'Bancada de quartzo', 'tampo', '0', '0', 'prof', 'L', 'P', '30', 'mat_quartzo'),
    chapaZ('recorte', 'Recorte da cuba', 'tampo', 'cx', 'cy', 'prof', 'cuW', 'cuP', '30', 'mat_quartzo', { vazio: true }),
    chapaZ('rodabanca', 'Rodabanca', 'tampo', '0', 'P - 20', 'prof + 30', 'L', '20', 'hRb', 'mat_quartzo', { quando: 'hRb > 0' }),
    placaY('cubaFrente', 'Cuba: parede frontal', 'painel', 'cx', 'cy', '0', 'cuW', 'prof', '10', IN),
    placaY('cubaFundo', 'Cuba: parede traseira', 'painel', 'cx', 'cy + cuP - 10', '0', 'cuW', 'prof', '10', IN),
    placaX('cubaEsq', 'Cuba: parede esquerda', 'lateral', 'cx', 'cy + 10', '0', 'cuP - 20', 'prof', '10', IN),
    placaX('cubaDir', 'Cuba: parede direita', 'lateral', 'cx + cuW - 10', 'cy + 10', '0', 'cuP - 20', 'prof', '10', IN),
    chapaZ('cubaFundoP', 'Cuba: fundo', 'base', 'cx + 10', 'cy + 10', '0', 'cuW - 20', 'cuP - 20', '10', IN),
  ],
  tipos: [
    { id: 'bancada120', nome: 'Bancada 1200 × 550', valores: { L: 1200, P: 550, A: 310 } },
    { id: 'bancada180', nome: 'Bancada 1800 × 600 com rodabanca', valores: { L: 1800, P: 600, A: 360 } },
    { id: 'bancada80', nome: 'Bancada de banheiro 800 × 480', valores: { L: 800, P: 480, A: 240, cuW: 350, cuP: 300 } },
  ],
  tipoPadrao: 'bancada120',
});

export const FAMILIA_BOX_RETO: Familia = nova({
  id: 'fam_box_reto',
  nome: 'Box de vidro reto',
  categoria: 'loucas',
  descricao: 'Box de banheiro reto: um fixo e uma porta de correr em vidro (incolor por padrão; troque pelo acabamento das portas), com trilhos inferior e superior em alumínio.',
  parametros: [
    comprimento('L', 'Largura', 1200, 700, 1800),
    comprimento('A', 'Altura', 1900, 1800, 2100),
    comprimento('P', 'Profundidade dos trilhos', 40, 40, 80, 5),
    comprimento('ev', 'Espessura do vidro', 8, 6, 10, 1),
  ],
  pecas: [
    bloco('trilhoInferior', 'Trilho inferior', '0', '0', '0', 'L', 'P', '20', IN),
    bloco('trilhoSuperior', 'Trilho superior', '0', '0', 'A - 20', 'L', 'P', '20', IN),
    placaY('fixo', 'Vidro fixo', 'porta', '0', 'P / 2 - ev - 1', '20', 'L / 2', 'A - 40', 'ev', VI),
    placaY('porta', 'Porta de correr', 'porta', 'L / 2 - 20', 'P / 2 + 1', '20', 'L / 2 + 20', 'A - 40', 'ev', VI),
    bloco('puxador', 'Puxador', 'L / 2 - 20', 'P / 2 + 1 + ev', 'A * 0.5', '15', '5', '300', IN),
  ],
  ferragens: [{ id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '8' }],
  tipos: [
    { id: 'box120', nome: 'Box 1200 × 1900', valores: { L: 1200, A: 1900 } },
    { id: 'box100', nome: 'Box 1000 × 1900', valores: { L: 1000, A: 1900 } },
    { id: 'box160', nome: 'Box 1600 × 2000', valores: { L: 1600, A: 2000 } },
  ],
  tipoPadrao: 'box120',
});

export const FAMILIA_BOX_CANTO: Familia = nova({
  id: 'fam_box_canto',
  nome: 'Box de vidro de canto',
  categoria: 'loucas',
  descricao: 'Box de canto em L: porta de abrir e fixo na frente e fixo lateral à direita, em vidro incolor, com trilhos inferior e superior em alumínio. Use M para espelhar.',
  parametros: [
    comprimento('L', 'Largura', 900, 700, 1400),
    comprimento('A', 'Altura', 1900, 1800, 2100),
    comprimento('P', 'Profundidade', 900, 700, 1400),
    comprimento('ev', 'Espessura do vidro', 8, 6, 10, 1),
  ],
  pecas: [
    bloco('trilhoFrente', 'Trilho frontal inferior', '0', '0', '0', 'L', '30', '20', IN),
    bloco('trilhoLateral', 'Trilho lateral inferior', 'L - 30', '30', '0', '30', 'P - 30', '20', IN),
    bloco('trilhoFrenteSup', 'Trilho frontal superior', '0', '0', 'A - 20', 'L', '30', '20', IN),
    bloco('trilhoLateralSup', 'Trilho lateral superior', 'L - 30', '30', 'A - 20', '30', 'P - 30', '20', IN),
    placaY('porta', 'Porta de abrir', 'porta', '0', '10', '20', 'L * 0.5', 'A - 40', 'ev', VI),
    placaY('fixoFrente', 'Fixo frontal', 'porta', 'L * 0.5', '10', '20', 'L * 0.5', 'A - 40', 'ev', VI),
    placaX('fixoLateral', 'Fixo lateral', 'porta', 'L - 30 + 10', '30', '20', 'P - 30', 'A - 40', 'ev', VI),
    bloco('puxador', 'Puxador', 'L * 0.5 - 40', '0', 'A * 0.5', '15', '10', '300', IN),
  ],
  ferragens: [{ id: 'dobradica', nome: 'Dobradiça 35 mm', quantidade: '3' }],
  tipos: [
    { id: 'canto90', nome: 'Box de canto 900 × 900', valores: { L: 900, P: 900 } },
    { id: 'canto120', nome: 'Box de canto 1200 × 900', valores: { L: 1200, P: 900 } },
    { id: 'canto80', nome: 'Box de canto 800 × 800', valores: { L: 800, P: 800 } },
  ],
  tipoPadrao: 'canto90',
});

export const FAMILIA_PRATELEIRA_BANHEIRO: Familia = nova({
  id: 'fam_prateleira_banheiro',
  nome: 'Prateleira e porta-toalha',
  categoria: 'loucas',
  descricao: 'Acessório de parede para banheiro: prateleira de vidro com dois suportes, barra porta-toalha ou o conjunto dos dois, em inox e vidro incolor.',
  hospedagem: 'parede',
  parametros: [
    comprimento('L', 'Comprimento', 600, 300, 1000),
    comprimento('A', 'Altura', 150, 100, 300),
    comprimento('P', 'Profundidade', 120, 60, 200),
    enumerado('modelo', 'Modelo', 'prateleira', [['prateleira', 'Prateleira de vidro'], ['barra', 'Porta-toalha'], ['conjunto', 'Prateleira com porta-toalha']]),
  ],
  pecas: [
    chapaZ('vidro', 'Prateleira de vidro', 'prateleira', '0', '0', 'A - 8', 'L', 'P', '8', VI, { quando: 'modelo != "barra"' }),
    bloco('suporteE', 'Suporte esquerdo', '30', '0', '0', '20', 'P', 'A - 8', IN, { quando: 'modelo == "prateleira"' }),
    bloco('suporteD', 'Suporte direito', 'L - 50', '0', '0', '20', 'P', 'A - 8', IN, { quando: 'modelo == "prateleira"' }),
    bloco('barraToalha', 'Barra de toalha', '20', 'P - 40', 'A * 0.5', 'L - 40', '20', '20', IN, { quando: 'modelo == "barra"' }),
    bloco('pontaE', 'Suporte esquerdo da barra', '0', 'P - 60', 'A * 0.5 - 10', '20', '60', '40', IN, { quando: 'modelo == "barra"' }),
    bloco('pontaD', 'Suporte direito da barra', 'L - 20', 'P - 60', 'A * 0.5 - 10', '20', '60', '40', IN, { quando: 'modelo == "barra"' }),
    bloco('barraConjunto', 'Barra sob a prateleira', '30', 'P - 40', 'A * 0.3', 'L - 60', '20', '20', IN, { quando: 'modelo == "conjunto"' }),
    bloco('apoioE', 'Apoio esquerdo do conjunto', '30', '0', 'A * 0.3 + 20', '20', 'P', 'A - 8 - A * 0.3 - 20', IN, { quando: 'modelo == "conjunto"' }),
    bloco('apoioD', 'Apoio direito do conjunto', 'L - 50', '0', 'A * 0.3 + 20', '20', 'P', 'A - 8 - A * 0.3 - 20', IN, { quando: 'modelo == "conjunto"' }),
  ],
  tipos: [
    { id: 'prateleira60', nome: 'Prateleira de vidro 600', valores: { L: 600, A: 100, P: 120, modelo: 'prateleira' } },
    { id: 'toalheiro60', nome: 'Porta-toalha 600', valores: { L: 600, A: 150, P: 100, modelo: 'barra' } },
    { id: 'conjunto80', nome: 'Prateleira com porta-toalha 800', valores: { L: 800, A: 250, P: 140, modelo: 'conjunto' } },
  ],
  tipoPadrao: 'prateleira60',
});

export const FAMILIA_ESPELHO_MOLDURA: Familia = nova({
  id: 'fam_espelho_moldura',
  nome: 'Espelho com moldura',
  categoria: 'loucas',
  descricao: 'Espelho retangular com moldura de madeira em quatro peças (troque pelo acabamento do corpo para metal ou preto) e vidro espelhado de 6 mm ao fundo.',
  hospedagem: 'parede',
  parametros: [
    comprimento('L', 'Largura', 600, 300, 1800),
    comprimento('A', 'Altura', 900, 300, 2000),
    comprimento('P', 'Profundidade da moldura', 40, 20, 80, 5),
    comprimento('mW', 'Largura da moldura', 40, 20, 100, 5),
  ],
  pecas: [
    bloco('molduraInf', 'Moldura inferior', '0', '0', '0', 'L', 'P', 'mW', 'madeira_macica'),
    bloco('molduraSup', 'Moldura superior', '0', '0', 'A - mW', 'L', 'P', 'mW', 'madeira_macica'),
    bloco('molduraEsq', 'Moldura esquerda', '0', '0', 'mW', 'mW', 'P', 'A - 2 * mW', 'madeira_macica'),
    bloco('molduraDir', 'Moldura direita', 'L - mW', '0', 'mW', 'mW', 'P', 'A - 2 * mW', 'madeira_macica'),
    placaY('vidro', 'Vidro espelhado', 'painel', 'mW', 'P - 12', 'mW', 'L - 2 * mW', 'A - 2 * mW', '6', 'mat_espelho'),
  ],
  tipos: [
    { id: 'espelho60x90', nome: 'Espelho 600 × 900', valores: { L: 600, A: 900 } },
    { id: 'espelho40x60', nome: 'Espelho 400 × 600 (banheiro)', valores: { L: 400, A: 600 } },
    { id: 'espelho_corpo', nome: 'Espelho de corpo inteiro 500 × 1600', valores: { L: 500, A: 1600, mW: 50 } },
  ],
  tipoPadrao: 'espelho60x90',
});

export const LOUCAS_NOVAS: Familia[] = [
  FAMILIA_CUBA_INOX, FAMILIA_CUBA_EMBUTIR, FAMILIA_BANCADA_CUBA, FAMILIA_BOX_RETO, FAMILIA_BOX_CANTO, FAMILIA_PRATELEIRA_BANHEIRO, FAMILIA_ESPELHO_MOLDURA,
];
