import type { Familia } from '../tipos.ts';
import { bloco, booleano, chapa, chapaZ, comprimento, derivado, enumerado, FITA_PVC, inteiro, material, nova, placaX, placaY } from './novosApoio.ts';

/*
 * Marcenaria nova da Biblioteca: closet aberto (cabideiros e prateleiras), nicho embutido, home office (bancada e armário suspenso),
 * bancada de banheiro com gabinete e cuba e painéis ripados com fundo (vertical e horizontal). Chapas planas de MDF do catálogo
 * padrão; montagem PROPOSTA do Hestia, a validar com o marceneiro. Medidas em mm.
 */

const F = { fita: { n: FITA_PVC }, veio: 'b' as const };
const CORPO = chapa('corpo', 'Chapa do corpo', 'mdf18', ['mdf15', 'mdf18', 'mdf25']);
const ESP = derivado('esp', 'Espessura do corpo', 'corpo.esp');

export const FAMILIA_CLOSET_ABERTO: Familia = nova({
  id: 'fam_closet_aberto',
  nome: 'Closet aberto',
  categoria: 'marcenaria',
  descricao: 'Closet aberto sem portas: vãos alternados com cabideiro e com prateleiras, laterais, divisórias, base e topo em chapa. Sem fundo, para encostar na parede.',
  parametros: [
    comprimento('L', 'Largura', 2400, 900, 3600),
    comprimento('A', 'Altura', 2400, 2000, 2700),
    comprimento('P', 'Profundidade', 550, 400, 650),
    inteiro('vaos', 'Número de vãos', 4, 2, 4),
    inteiro('prat', 'Prateleiras por vão de prateleiras', 4, 1, 6),
    comprimento('hCab', 'Altura do cabideiro', 1800, 1000, 2100),
    CORPO,
    ESP,
    derivado('wv', 'Largura de cada vão', '(L - (vaos + 1) * esp) / vaos'),
    derivado('zCab', 'Cota do cabideiro', 'min(hCab, A - esp - 100)'),
    derivado('nRod', 'Vãos com cabideiro', 'ceil(vaos / 2)'),
    derivado('nPv', 'Vãos com prateleiras', 'floor(vaos / 2)'),
    derivado('vaoPrat', 'Altura útil das prateleiras', 'A - 2 * esp - prat * esp'),
  ],
  pecas: [
    placaX('latE', 'Lateral esquerda', 'lateral', '0', '0', '0', 'P', 'A', 'esp', 'corpo', F),
    placaX('latD', 'Lateral direita', 'lateral', 'L - esp', '0', '0', 'P', 'A', 'esp', 'corpo', F),
    placaX('divisoria', 'Divisória', 'divisoria', 'esp + i * wv + (i - 1) * esp', '0', 'esp', 'P', 'A - 2 * esp', 'esp', 'corpo', { ...F, repetir: 'vaos - 1' }),
    chapaZ('base', 'Base', 'base', 'esp', '0', '0', 'L - 2 * esp', 'P', 'esp', 'corpo', F),
    chapaZ('topo', 'Topo', 'topo', 'esp', '0', 'A - esp', 'L - 2 * esp', 'P', 'esp', 'corpo', F),
    bloco('cabideiro', 'Cabideiro', 'esp + 2 * (i - 1) * (wv + esp)', 'P / 2 - 15', 'zCab', 'wv', '30', '30', 'mat_metal', { repetir: 'nRod' }),
    chapaZ('prateleira', 'Prateleira', 'prateleira', 'esp + (2 * floor((i - 1) / prat) + 1) * (wv + esp)', '0',
      'esp + (i - floor((i - 1) / prat) * prat) * vaoPrat / (prat + 1) + (i - floor((i - 1) / prat) * prat - 1) * esp', 'wv', 'P', 'esp', 'corpo', { ...F, repetir: 'nPv * prat' }),
  ],
  ferragens: [
    { id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '24' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '16' },
    { id: 'pino', nome: 'Pino de prateleira', quantidade: 'nPv * prat * 4' },
  ],
  tipos: [
    { id: 'closet240', nome: 'Closet 2,40 m (4 vãos)', valores: { L: 2400, vaos: 4 } },
    { id: 'closet180', nome: 'Closet 1,80 m (3 vãos)', valores: { L: 1800, vaos: 3 } },
    { id: 'closet120', nome: 'Closet 1,20 m (2 vãos)', valores: { L: 1200, vaos: 2, prat: 3 } },
  ],
  tipoPadrao: 'closet240',
});

export const FAMILIA_NICHO_EMBUTIDO: Familia = nova({
  id: 'fam_nicho_embutido',
  nome: 'Nicho embutido',
  categoria: 'marcenaria',
  descricao: 'Nicho de chapa para embutir na parede (caixa aberta com laterais, topo, base e fundo), aberto, com prateleiras ou com divisórias verticais.',
  hospedagem: 'parede',
  parametros: [
    comprimento('L', 'Largura', 600, 200, 1500),
    comprimento('A', 'Altura', 600, 200, 2400),
    comprimento('P', 'Profundidade', 150, 80, 300, 10),
    enumerado('layout', 'Divisão interna', 'aberto', [['aberto', 'Aberto'], ['prateleiras', 'Com prateleiras'], ['divisorias', 'Com divisórias']]),
    inteiro('nDiv', 'Quantidade de divisões', 1, 1, 3),
    chapa('corpo', 'Chapa do corpo', 'mdf15', ['mdf15', 'mdf18']),
    ESP,
    derivado('vaoH', 'Altura útil entre prateleiras', 'A - 2 * esp - nDiv * esp'),
    derivado('vaoL', 'Largura útil entre divisórias', 'L - 2 * esp - nDiv * esp'),
  ],
  pecas: [
    placaX('latE', 'Lateral esquerda', 'lateral', '0', '0', '0', 'P', 'A', 'esp', 'corpo', F),
    placaX('latD', 'Lateral direita', 'lateral', 'L - esp', '0', '0', 'P', 'A', 'esp', 'corpo', F),
    chapaZ('base', 'Base', 'base', 'esp', '0', '0', 'L - 2 * esp', 'P - 6', 'esp', 'corpo', F),
    chapaZ('topo', 'Topo', 'topo', 'esp', '0', 'A - esp', 'L - 2 * esp', 'P - 6', 'esp', 'corpo', F),
    placaY('fundo', 'Fundo', 'fundo', 'esp', 'P - 6', 'esp', 'L - 2 * esp', 'A - 2 * esp', '6', 'corpo'),
    chapaZ('prateleira', 'Prateleira', 'prateleira', 'esp', '0', 'esp + i * vaoH / (nDiv + 1) + (i - 1) * esp', 'L - 2 * esp', 'P - 6', 'esp', 'corpo', { ...F, repetir: 'nDiv', quando: 'layout == "prateleiras"' }),
    placaX('divisoria', 'Divisória', 'divisoria', 'esp + i * vaoL / (nDiv + 1) + (i - 1) * esp', '0', 'esp', 'P - 6', 'A - 2 * esp', 'esp', 'corpo', { ...F, repetir: 'nDiv', quando: 'layout == "divisorias"' }),
  ],
  ferragens: [{ id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '8' }, { id: 'pino', nome: 'Pino de prateleira', quantidade: 'layout == "prateleiras" ? nDiv * 4 : 0' }],
  tipos: [
    { id: 'nicho60', nome: 'Nicho 600 × 600 aberto', valores: { L: 600, A: 600, P: 150 } },
    { id: 'nicho_prateleiras', nome: 'Nicho 600 × 1200 com 2 prateleiras', valores: { L: 600, A: 1200, P: 200, layout: 'prateleiras', nDiv: 2 } },
    { id: 'nicho_divisorias', nome: 'Nicho 900 × 400 com 2 divisórias', valores: { L: 900, A: 400, P: 150, layout: 'divisorias', nDiv: 2 } },
  ],
  tipoPadrao: 'nicho60',
});

export const FAMILIA_HOME_OFFICE: Familia = nova({
  id: 'fam_home_office',
  nome: 'Home office',
  categoria: 'marcenaria',
  descricao: 'Home office em marcenaria: bancada de 740 mm com dois painéis laterais e fundo, e armário suspenso de 2 a 4 portas sobre ela, encostado na parede dos fundos.',
  parametros: [
    comprimento('L', 'Largura', 1800, 1200, 3000),
    comprimento('A', 'Altura total', 2100, 1900, 2400),
    comprimento('P', 'Profundidade da bancada', 600, 500, 700),
    comprimento('pAr', 'Profundidade do armário', 350, 300, 450),
    comprimento('hAr', 'Altura do armário', 700, 500, 900),
    inteiro('portas', 'Portas do armário', 2, 2, 4),
    CORPO,
    ESP,
    derivado('zAr', 'Altura de instalação do armário', 'A - hAr'),
    derivado('wP', 'Largura de cada porta', 'L / portas'),
  ],
  pecas: [
    chapaZ('tampo', 'Tampo da bancada', 'tampo', '0', '0', '710', 'L', 'P', '30', 'mat_tampo', { fita: { n: FITA_PVC }, veio: 'a' }),
    placaX('painelE', 'Painel lateral esquerdo', 'lateral', '0', '0', '0', 'P', '710', '30', 'mat_tampo'),
    placaX('painelD', 'Painel lateral direito', 'lateral', 'L - 30', '0', '0', 'P', '710', '30', 'mat_tampo'),
    placaY('fundoBancada', 'Fundo da bancada', 'fundo', '30', 'P - 18', '300', 'L - 60', '410', '18', 'mat_tampo'),
    placaX('latArE', 'Lateral do armário (esquerda)', 'lateral', '0', 'P - pAr', 'zAr', 'pAr', 'hAr', 'esp', 'corpo', F),
    placaX('latArD', 'Lateral do armário (direita)', 'lateral', 'L - esp', 'P - pAr', 'zAr', 'pAr', 'hAr', 'esp', 'corpo', F),
    chapaZ('baseAr', 'Base do armário', 'base', 'esp', 'P - pAr', 'zAr', 'L - 2 * esp', 'pAr', 'esp', 'corpo', F),
    chapaZ('topoAr', 'Topo do armário', 'topo', 'esp', 'P - pAr', 'A - esp', 'L - 2 * esp', 'pAr', 'esp', 'corpo', F),
    placaY('fundoAr', 'Fundo do armário', 'fundo', 'esp', 'P - 6', 'zAr + esp', 'L - 2 * esp', 'hAr - 2 * esp', '6', 'corpo'),
    chapaZ('prateleiraAr', 'Prateleira do armário', 'prateleira', 'esp', 'P - pAr', 'zAr + hAr / 2', 'L - 2 * esp', 'pAr - 6', 'esp', 'corpo', F),
    placaY('portaAr', 'Porta do armário', 'porta', '(i - 1) * wP + 2', 'P - pAr - 18', 'zAr + 2', 'wP - 4', 'hAr - 4', '18', 'mat_porta', { repetir: 'portas', fita: { n: FITA_PVC } }),
  ],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça 35 mm', quantidade: 'portas * 2' },
    { id: 'puxador', nome: 'Puxador 128 mm', quantidade: 'portas' },
    { id: 'pino', nome: 'Pino de prateleira', quantidade: '4' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '12' },
  ],
  tipos: [
    { id: 'home180', nome: 'Home office 1,80 m (2 portas)', valores: { L: 1800, portas: 2 } },
    { id: 'home240', nome: 'Home office 2,40 m (3 portas)', valores: { L: 2400, portas: 3 } },
    { id: 'home150', nome: 'Home office 1,50 m (2 portas)', valores: { L: 1500, portas: 2 } },
  ],
  tipoPadrao: 'home180',
});

export const FAMILIA_BANCADA_BANHEIRO: Familia = nova({
  id: 'fam_bancada_banheiro',
  nome: 'Bancada de banheiro com gabinete',
  categoria: 'marcenaria',
  descricao: 'Gabinete de banheiro de 850 mm com tampo de quartzo, recorte e cuba de embutir opcional, frente em portas ou em gavetas, sobre rodapé recuado.',
  parametros: [
    comprimento('L', 'Largura', 800, 600, 1600),
    comprimento('A', 'Altura', 850, 750, 950),
    comprimento('P', 'Profundidade', 480, 400, 600),
    enumerado('frente', 'Frente', 'portas', [['portas', 'Portas'], ['gavetas', 'Gavetas']]),
    inteiro('nFr', 'Portas ou gavetas', 2, 1, 4),
    booleano('cuba', 'Cuba de embutir', true),
    CORPO,
    ESP,
    derivado('cuW', 'Largura do recorte', 'min(L * 0.5, 500)'),
    derivado('cuP', 'Profundidade do recorte', 'min(P * 0.7, 340)'),
    derivado('cx', 'Início X do recorte', '(L - cuW) / 2'),
    derivado('cy', 'Início Y do recorte', '(P - cuP) / 2'),
    derivado('hC', 'Altura do gabinete', 'A - 100 - 30'),
  ],
  pecas: [
    chapaZ('tampo', 'Tampo de quartzo', 'tampo', '0', '0', 'A - 30', 'L', 'P', '30', 'mat_quartzo', { veio: 'livre' }),
    chapaZ('recorte', 'Recorte da cuba', 'tampo', 'cx', 'cy', 'A - 30', 'cuW', 'cuP', '30', 'mat_quartzo', { vazio: true, quando: 'cuba' }),
    bloco('rodape', 'Rodapé recuado', 'esp + 20', '40', '0', 'L - 2 * esp - 40', 'P - 100', '100', 'mat_porta', { papel: 'rodape' }),
    placaX('latE', 'Lateral esquerda', 'lateral', '0', '18', '100', 'P - 18', 'hC', 'esp', 'corpo', F),
    placaX('latD', 'Lateral direita', 'lateral', 'L - esp', '18', '100', 'P - 18', 'hC', 'esp', 'corpo', F),
    chapaZ('base', 'Base', 'base', 'esp', '18', '100', 'L - 2 * esp', 'P - 18', 'esp', 'corpo', F),
    placaY('fundo', 'Fundo', 'fundo', 'esp', 'P - 6', '100 + esp', 'L - 2 * esp', 'hC - esp', '6', 'corpo'),
    placaY('porta', 'Porta', 'porta', '(i - 1) * L / nFr + 2', '0', '102', 'L / nFr - 4', 'hC - 4', '18', 'mat_porta', { repetir: 'nFr', quando: 'frente == "portas"', fita: { n: FITA_PVC } }),
    placaY('frenteGaveta', 'Frente de gaveta', 'frente_gaveta', '2', '0', '100 + 2 + (i - 1) * hC / nFr', 'L - 4', 'hC / nFr - 4', '18', 'mat_porta', { repetir: 'nFr', quando: 'frente == "gavetas"', fita: { n: FITA_PVC } }),
    placaY('cubaFrente', 'Cuba: parede frontal', 'bloco', 'cx', 'cy', 'A - 30 - 150', 'cuW', '150', '10', 'mat_ceramica', { quando: 'cuba' }),
    placaY('cubaFundo', 'Cuba: parede traseira', 'bloco', 'cx', 'cy + cuP - 10', 'A - 30 - 150', 'cuW', '150', '10', 'mat_ceramica', { quando: 'cuba' }),
    placaX('cubaEsq', 'Cuba: parede esquerda', 'bloco', 'cx', 'cy + 10', 'A - 30 - 150', 'cuP - 20', '150', '10', 'mat_ceramica', { quando: 'cuba' }),
    placaX('cubaDir', 'Cuba: parede direita', 'bloco', 'cx + cuW - 10', 'cy + 10', 'A - 30 - 150', 'cuP - 20', '150', '10', 'mat_ceramica', { quando: 'cuba' }),
    chapaZ('cubaBase', 'Cuba: fundo', 'bloco', 'cx + 10', 'cy + 10', 'A - 30 - 150', 'cuW - 20', 'cuP - 20', '10', 'mat_ceramica', { quando: 'cuba' }),
  ],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça 35 mm', quantidade: 'frente == "portas" ? nFr * 2 : 0' },
    { id: 'corredica', nome: 'Corrediça telescópica 450', quantidade: 'frente == "gavetas" ? nFr : 0' },
    { id: 'puxador', nome: 'Puxador 128 mm', quantidade: 'nFr' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '8' },
  ],
  tipos: [
    { id: 'banc80', nome: 'Gabinete 800 (2 portas)', valores: { L: 800, nFr: 2 } },
    { id: 'banc60_gavetas', nome: 'Gabinete 600 (2 gavetas)', valores: { L: 600, nFr: 2, frente: 'gavetas' } },
    { id: 'banc120', nome: 'Gabinete 1200 (3 gavetas)', valores: { L: 1200, nFr: 3, frente: 'gavetas', P: 500 } },
  ],
  tipoPadrao: 'banc80',
});

function ripadoFundo(direcao: 'vertical' | 'horizontal'): Familia {
  const v = direcao === 'vertical';
  return nova({
    id: v ? 'fam_painel_ripado_fundo' : 'fam_painel_ripado_horizontal',
    nome: v ? 'Painel ripado vertical com fundo' : 'Painel ripado horizontal',
    categoria: 'marcenaria',
    descricao: v
      ? 'Painel de ripas verticais sobre um fundo de chapa (variação do painel ripado), com largura de ripa e vão ajustáveis.'
      : 'Painel de ripas horizontais sobre um fundo de chapa (variação do painel ripado), com altura de ripa e vão ajustáveis.',
    hospedagem: 'parede',
    etiqueta: 'painel',
    parametros: [
      comprimento('L', 'Largura', 1800, 300, 3600),
      comprimento('A', 'Altura', 2400, 300, 3000),
      comprimento('P', 'Profundidade', 40, 30, 100, 5),
      comprimento('rip', v ? 'Largura da ripa' : 'Altura da ripa', 40, 20, 120, 5),
      comprimento('vao', 'Vão entre ripas', 20, 5, 80, 5),
      material('materialRipa', 'Material das ripas', 'madeira'),
      derivado('fundoEsp', 'Espessura do fundo', '15'),
      derivado('nRipas', 'Número de ripas', v ? 'min(64, floor((L + vao) / (rip + vao)))' : 'min(64, floor((A + vao) / (rip + vao)))'),
      derivado('profRipa', 'Profundidade da ripa', 'P - fundoEsp'),
    ],
    pecas: [
      placaY('fundoRipado', 'Fundo do painel', 'fundo', '0', '0', '0', 'L', 'A', 'fundoEsp', 'mat_porta'),
      v
        ? placaX('ripa', 'Ripa', 'painel', '(i - 1) * (rip + vao)', 'fundoEsp', '0', 'profRipa', 'A', 'rip', 'materialRipa', { repetir: 'nRipas' })
        : chapaZ('ripa', 'Ripa', 'painel', '0', 'fundoEsp', '(i - 1) * (rip + vao)', 'L', 'profRipa', 'rip', 'materialRipa', { repetir: 'nRipas' }),
    ],
    ferragens: [{ id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: 'nRipas * 2' }],
    tipos: [
      { id: 'ripado120', nome: 'Painel 1200', valores: { L: 1200 } },
      { id: 'ripado180', nome: 'Painel 1800', valores: { L: 1800 } },
      { id: 'ripado240', nome: 'Painel 2400', valores: { L: 2400 } },
    ],
    tipoPadrao: 'ripado180',
  });
}

export const FAMILIA_RIPADO_FUNDO: Familia = ripadoFundo('vertical');
export const FAMILIA_RIPADO_HORIZONTAL: Familia = ripadoFundo('horizontal');

export const MARCENARIA_NOVA: Familia[] = [FAMILIA_CLOSET_ABERTO, FAMILIA_NICHO_EMBUTIDO, FAMILIA_HOME_OFFICE, FAMILIA_BANCADA_BANHEIRO, FAMILIA_RIPADO_FUNDO, FAMILIA_RIPADO_HORIZONTAL];
