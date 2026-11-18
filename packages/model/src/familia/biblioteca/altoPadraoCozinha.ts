import {
  FAMILIA_FORMATO,
  FAMILIA_VERSAO,
  type Aninhado,
  type CategoriaFamilia,
  type Conector,
  type Familia,
  type Ferragem,
  type Hospedagem,
  type Parametro,
  type Peca,
  type Tipo,
} from '../tipos.ts';
import { conectoresDe } from './conectores.ts';
import { chapaCorpo, comprimento, derivado, FITA, inteiro } from './cozinhaComum.ts';
import { comEscolhas } from './escolhas.ts';

/*
 * Linha Alto Padrão (cozinha e cristaleira): módulos com cascata de pedra, vidro reflecta fumê e perfil cava contínuo.
 * Medidas em milímetros; validação completa via `validarFamilia` e `biblioteca.test.ts`.
 */

export interface ConfigAltoPadrao {
  id: string;
  nome: string;
  descricao: string;
  categoria?: CategoriaFamilia;
  hospedagem?: Hospedagem;
  parametros: Parametro[];
  pecas: Peca[];
  aninhados?: Aninhado[];
  ferragens: Ferragem[];
  conectores: Conector[];
  tipos: Tipo[];
  tipoPadrao: string;
}

export const criarAltoPadrao = (cfg: ConfigAltoPadrao): Familia =>
  comEscolhas({
    formato: FAMILIA_FORMATO,
    versao: FAMILIA_VERSAO,
    id: cfg.id,
    nome: cfg.nome,
    categoria: cfg.categoria ?? 'marcenaria',
    descricao: cfg.descricao,
    unidade: 'mm',
    hospedagem: cfg.hospedagem ?? 'nivel',
    origem: 'canto',
    parametros: cfg.parametros,
    planos: [],
    pecas: cfg.pecas,
    aninhados: cfg.aninhados ?? [],
    ferragens: cfg.ferragens,
    conectores: cfg.conectores,
    tipos: cfg.tipos,
    tipoPadrao: cfg.tipoPadrao,
  });

// ───────────────────────── 1. Ilha Gourmet Cascata ─────────────────────────

export const FAMILIA_ILHA_GOURMET: Familia = criarAltoPadrao({
  id: 'fam_ilha_gourmet',
  nome: 'Ilha Gourmet Cascata',
  descricao: 'Ilha gourmet com tampo e laterais em cascata de pedra, gavetões frontais, cooktop embutido e painel ripado traseiro.',
  parametros: [
    comprimento('L', 'Largura', 1800, 1200, 3600, 10),
    comprimento('A', 'Altura', 900, 750, 1100, 10),
    comprimento('P', 'Profundidade', 900, 700, 1300, 10),
    comprimento('rodape', 'Altura do rodapé', 100, 60, 150, 10, 'tipo'),
    comprimento('cooktopL', 'Largura do cooktop', 680, 500, 900, 10, 'tipo'),
    comprimento('cooktopP', 'Profundidade do cooktop', 460, 350, 550, 10, 'tipo'),
    comprimento('largRipa', 'Largura da ripa', 40, 25, 80, 5, 'tipo'),
    comprimento('vaoRipa', 'Vão entre ripas', 18, 8, 40, 2, 'tipo'),
    chapaCorpo('mdf18'),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
    derivado('tampoEsp', 'Espessura da pedra cascata', '38'),
    derivado('hCorpo', 'Altura do corpo', 'A - tampoEsp'),
    derivado('zBase', 'Cota do topo da base', 'rodape + esp'),
    derivado('xInt', 'Início interno entre cascatas', 'tampoEsp'),
    derivado('lInt', 'Largura interna entre cascatas', 'L - 2 * tampoEsp'),
    derivado('profRipado', 'Profundidade reservada ao ripado', '36'),
    derivado('pGab', 'Profundidade do gabinete frontal', 'P - profRipado'),
    derivado('lCol', 'Largura de cada coluna de gavetões', '(lInt - 3 * esp) / 2'),
    derivado('hGav', 'Altura de cada gavetão', 'floor((hCorpo - esp - zBase) / 2)'),
    derivado('pGav', 'Profundidade da caixa do gavetão', 'min(650, pGab - 30)'),
    derivado('nRipas', 'Quantidade de ripas traseiras', 'min(64, floor((lInt + vaoRipa) / (largRipa + vaoRipa)))'),
    derivado('xRipas', 'Início X das ripas', 'xInt + (lInt - (nRipas * largRipa + (nRipas - 1) * vaoRipa)) / 2'),
    derivado('cooktopLUsado', 'Largura útil do cooktop', 'clamp(cooktopL, 300, L - 200)'),
    derivado('cooktopPUsado', 'Profundidade útil do cooktop', 'clamp(cooktopP, 250, P - 200)'),
  ],
  pecas: [
    { id: 'tampo', nome: 'Tampo pedra cascata', papel: 'tampo', eixo: 'z', origem: ['0', '0', 'hCorpo'], tamanho: ['L', 'P'], espessura: 'tampoEsp', material: 'mat_tampo', fita: { n: FITA }, veio: 'a' },
    { id: 'cascataE', nome: 'Cascata esquerda', papel: 'tampo', eixo: 'x', origem: ['0', '0', '0'], tamanho: ['P', 'hCorpo'], espessura: 'tampoEsp', material: 'mat_tampo', fita: { n: FITA }, veio: 'b' },
    { id: 'cascataD', nome: 'Cascata direita', papel: 'tampo', eixo: 'x', origem: ['L - tampoEsp', '0', '0'], tamanho: ['P', 'hCorpo'], espessura: 'tampoEsp', material: 'mat_tampo', fita: { n: FITA }, veio: 'b' },
    { id: 'cooktopVidro', nome: 'Cooktop vidro preto', papel: 'generica', eixo: 'z', origem: ['(L - cooktopLUsado) / 2', '(P - cooktopPUsado) * 0.35', 'A'], tamanho: ['cooktopLUsado', 'cooktopPUsado'], espessura: '8', material: 'mat_pedra_escura' },
    { id: 'cooktopAro', nome: 'Friso cooktop', papel: 'generica', eixo: 'z', origem: ['(L - cooktopLUsado) / 2 + 40', '(P - cooktopPUsado) * 0.35 + 40', 'A + 8'], tamanho: ['cooktopLUsado - 80', 'cooktopPUsado - 80'], espessura: '4', material: 'mat_metal' },
    { id: 'rodap', nome: 'Rodapé frontal', papel: 'rodape', eixo: 'y', origem: ['xInt', '40', '0'], tamanho: ['lInt', 'rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['xInt', '0', 'rodape'], tamanho: ['lInt', 'pGab'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['xInt', '0', 'zBase'], tamanho: ['pGab', 'hCorpo - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - tampoEsp - esp', '0', 'zBase'], tamanho: ['pGab', 'hCorpo - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'divC', nome: 'Divisória central', papel: 'divisoria', eixo: 'x', origem: ['L / 2 - esp / 2', '0', 'zBase'], tamanho: ['pGab', 'hCorpo - esp - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'trF', nome: 'Travessa frontal', papel: 'travessa', eixo: 'z', origem: ['xInt + esp', '0', 'hCorpo - esp'], tamanho: ['lInt - 2 * esp', '80'], espessura: 'esp', material: 'corpo' },
    { id: 'trT', nome: 'Travessa traseira', papel: 'travessa', eixo: 'z', origem: ['xInt + esp', 'pGab - 80', 'hCorpo - esp'], tamanho: ['lInt - 2 * esp', '80'], espessura: 'esp', material: 'corpo' },
    { id: 'painelFundo', nome: 'Painel base do ripado', papel: 'painel', eixo: 'y', origem: ['xInt', 'P - profRipado', '0'], tamanho: ['lInt', 'hCorpo'], espessura: '12', material: 'corpo' },
    { id: 'ripa', nome: 'Ripa decorativa', papel: 'painel', eixo: 'x', origem: ['xRipas + (i - 1) * (largRipa + vaoRipa)', 'P - 24', '0'], tamanho: ['24', 'hCorpo'], espessura: 'largRipa', material: 'corpo', repetir: 'nRipas' },
  ],
  aninhados: [
    {
      id: 'gavEsq',
      nome: 'Gavetão esquerdo',
      familiaId: 'fam_gaveta',
      tipoId: 'alta',
      valores: { L: 'lCol', A: 'hGav', P: 'pGav' },
      origem: ['xInt + esp', '0', 'zBase + (i - 1) * hGav'],
      repetir: '2',
    },
    {
      id: 'gavDir',
      nome: 'Gavetão direito',
      familiaId: 'fam_gaveta',
      tipoId: 'alta',
      valores: { L: 'lCol', A: 'hGav', P: 'pGav' },
      origem: ['L / 2 + esp / 2', '0', 'zBase + (i - 1) * hGav'],
      repetir: '2',
    },
  ],
  ferragens: [
    { id: 'corredica', nome: 'Corrediça telescópica', quantidade: '4' },
    { id: 'puxador', nome: 'Puxador perfil', quantidade: '4' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '16' },
  ],
  conectores: conectoresDe('base'),
  tipos: [
    { id: 'ilha1800', nome: 'Ilha Gourmet 1,80 m', valores: { L: 1800, P: 900 } },
    { id: 'ilha2400', nome: 'Ilha Gourmet 2,40 m', valores: { L: 2400, P: 1000 } },
    { id: 'ilha3000', nome: 'Ilha Gourmet 3,00 m', valores: { L: 3000, P: 1100 } },
  ],
  tipoPadrao: 'ilha1800',
});

// ───────────────────────── 2. Cristaleira Vidro Reflecta ─────────────────────────

export const FAMILIA_CRISTALEIRA_VIDRO: Familia = criarAltoPadrao({
  id: 'fam_cristaleira_vidro',
  nome: 'Cristaleira Vidro Reflecta',
  descricao: 'Cristaleira alta com portas de vidro reflecta fumê, perfil metálico estrutural, prateleiras em vidro e rodapé embutido.',
  parametros: [
    comprimento('L', 'Largura', 900, 500, 1600, 10),
    comprimento('A', 'Altura', 2200, 1400, 2700, 10),
    comprimento('P', 'Profundidade', 420, 300, 650, 10),
    comprimento('rodape', 'Altura do rodapé', 100, 60, 150, 10, 'tipo'),
    inteiro('nPortas', 'Portas', 2, 1, 2),
    inteiro('nPrat', 'Prateleiras de vidro', 4, 1, 6),
    chapaCorpo('mdf18'),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
    derivado('zBase', 'Topo da base', 'rodape + esp'),
    derivado('vao', 'Vão interno vertical', 'A - esp - zBase'),
    derivado('mold', 'Largura do perfil metálico', '38'),
    derivado('hPorta', 'Altura total da porta', 'A - rodape - 4'),
    derivado('wPorta', 'Largura de cada porta', 'L / nPortas - 4'),
    derivado('hVidro', 'Altura do vidro da porta', 'hPorta - 2 * mold'),
  ],
  pecas: [
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zBase'], tamanho: ['P', 'A - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zBase'], tamanho: ['P', 'A - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', 'rodape'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'topo', nome: 'Topo', papel: 'topo', eixo: 'z', origem: ['esp', '0', 'A - esp'], tamanho: ['L - 2 * esp', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - 6', 'zBase'], tamanho: ['L - 2 * esp', 'vao'], espessura: '6', material: 'mat_fundo', veio: 'livre' },
    { id: 'rodap', nome: 'Rodapé embutido', papel: 'rodape', eixo: 'y', origem: ['esp', '50', '0'], tamanho: ['L - 2 * esp', 'rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, quando: 'rodape > 0' },
    { id: 'prateleira', nome: 'Prateleira de vidro', papel: 'prateleira', eixo: 'z', origem: ['esp', '8', 'zBase + i * (vao - 8 * nPrat) / (nPrat + 1) + (i - 1) * 8'], tamanho: ['L - 2 * esp', 'P - 14'], espessura: '8', material: 'mat_vidro', repetir: 'nPrat', quando: 'nPrat > 0' },
    { id: 'porta', nome: 'Vidro reflecta fumê', papel: 'porta', eixo: 'y', origem: ['(i - 1) * (L / nPortas) + 2 + mold', '-14', 'rodape + 2 + mold'], tamanho: ['wPorta - 2 * mold', 'hVidro'], espessura: '6', material: 'mat_vidro', repetir: 'nPortas', quando: 'nPortas > 0' },
    { id: 'moldEsq', nome: 'Perfil esquerdo da porta', papel: 'generica', eixo: 'y', origem: ['(i - 1) * (L / nPortas) + 2', '-20', 'rodape + 2'], tamanho: ['mold', 'hPorta'], espessura: '20', material: 'mat_metal', repetir: 'nPortas', quando: 'nPortas > 0' },
    { id: 'moldDir', nome: 'Perfil direito da porta', papel: 'generica', eixo: 'y', origem: ['(i - 1) * (L / nPortas) + 2 + wPorta - mold', '-20', 'rodape + 2'], tamanho: ['mold', 'hPorta'], espessura: '20', material: 'mat_metal', repetir: 'nPortas', quando: 'nPortas > 0' },
    { id: 'moldInf', nome: 'Perfil inferior da porta', papel: 'generica', eixo: 'y', origem: ['(i - 1) * (L / nPortas) + 2 + mold', '-20', 'rodape + 2'], tamanho: ['wPorta - 2 * mold', 'mold'], espessura: '20', material: 'mat_metal', repetir: 'nPortas', quando: 'nPortas > 0' },
    { id: 'moldSup', nome: 'Perfil superior da porta', papel: 'generica', eixo: 'y', origem: ['(i - 1) * (L / nPortas) + 2 + mold', '-20', 'rodape + 2 + hPorta - mold'], tamanho: ['wPorta - 2 * mold', 'mold'], espessura: '20', material: 'mat_metal', repetir: 'nPortas', quando: 'nPortas > 0' },
    { id: 'puxador', nome: 'Puxador perfil vertical', papel: 'generica', eixo: 'y', origem: ['i == 1 ? (nPortas == 1 ? L - 28 : L / nPortas - 26) : (i - 1) * (L / nPortas) + 14', '-30', 'rodape + clamp(hPorta * 0.4, 650, 950)'], tamanho: ['12', 'min(260, hPorta * 0.25)'], espessura: '10', material: 'mat_metal', repetir: 'nPortas', quando: 'nPortas > 0' },
  ],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça vidro/alumínio', quantidade: '(hVidro <= 900 ? 2 : hVidro <= 1600 ? 3 : hVidro <= 2200 ? 4 : 5) * nPortas', quando: 'nPortas > 0' },
    { id: 'puxador', nome: 'Puxador perfil alumínio', quantidade: 'nPortas', quando: 'nPortas > 0' },
    { id: 'pino', nome: 'Suporte de prateleira', quantidade: '4 * nPrat', quando: 'nPrat > 0' },
  ],
  conectores: conectoresDe('torre'),
  tipos: [
    { id: 'cris80', nome: 'Cristaleira 80 cm', valores: { L: 800, nPortas: 2 } },
    { id: 'cris90', nome: 'Cristaleira 90 cm', valores: { L: 900, nPortas: 2 } },
    { id: 'cris120', nome: 'Cristaleira 120 cm', valores: { L: 1200, nPortas: 2 } },
  ],
  tipoPadrao: 'cris90',
});

// ───────────────────────── 3. Balcão Cava 2 Portas ─────────────────────────

export const FAMILIA_BALCAO_CAVA: Familia = criarAltoPadrao({
  id: 'fam_balcao_cava',
  nome: 'Balcão Cava 2 Portas',
  descricao: 'Balcão de cozinha moderno com perfil cava superior contínuo em alumínio, portas amplas, prateleira interna e tampo em pedra.',
  parametros: [
    comprimento('L', 'Largura', 900, 400, 1800, 10),
    comprimento('A', 'Altura', 780, 500, 1100, 10),
    comprimento('P', 'Profundidade', 580, 350, 850, 10),
    comprimento('rodape', 'Altura do rodapé', 100, 60, 150, 10, 'tipo'),
    inteiro('nPortas', 'Portas', 2, 1, 2),
    inteiro('nPrat', 'Prateleiras', 1, 0, 4),
    chapaCorpo('mdf18'),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
    derivado('tampoEsp', 'Espessura do tampo', '25'),
    derivado('hCava', 'Altura do perfil cava', '32'),
    derivado('hCorpo', 'Altura do corpo', 'A - tampoEsp'),
    derivado('zBase', 'Topo da base', 'rodape + esp'),
    derivado('vao', 'Vão interno vertical', 'hCorpo - esp - zBase'),
    derivado('yFundo', 'Face frontal do fundo (Y)', 'P - 21'),
    derivado('hPorta', 'Altura das portas', 'hCorpo - hCava - rodape - 4'),
  ],
  pecas: [
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zBase'], tamanho: ['P', 'hCorpo - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zBase'], tamanho: ['P', 'hCorpo - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', 'rodape'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'trF', nome: 'Travessa frontal', papel: 'travessa', eixo: 'z', origem: ['esp', '0', 'hCorpo - esp'], tamanho: ['L - 2 * esp', '80'], espessura: 'esp', material: 'corpo' },
    { id: 'trT', nome: 'Travessa traseira', papel: 'travessa', eixo: 'z', origem: ['esp', 'yFundo - 80', 'hCorpo - esp'], tamanho: ['L - 2 * esp', '80'], espessura: 'esp', material: 'corpo' },
    { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'yFundo', 'zBase'], tamanho: ['L - 2 * esp', 'hCorpo - zBase'], espessura: '6', material: 'mat_fundo', veio: 'livre' },
    { id: 'rodap', nome: 'Rodapé', papel: 'rodape', eixo: 'y', origem: ['esp', '50', '0'], tamanho: ['L - 2 * esp', 'rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, quando: 'rodape > 0' },
    { id: 'prat', nome: 'Prateleira interna', papel: 'prateleira', eixo: 'z', origem: ['esp', '20', 'zBase + i * (vao - esp * nPrat) / (nPrat + 1) + (i - 1) * esp'], tamanho: ['L - 2 * esp', 'yFundo - 20'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, repetir: 'nPrat', quando: 'nPrat > 0' },
    { id: 'perfilCava', nome: 'Perfil cava alumínio', papel: 'generica', eixo: 'y', origem: ['0', '-18', 'hCorpo - hCava'], tamanho: ['L', 'hCava'], espessura: '18', material: 'mat_metal' },
    { id: 'porta', nome: 'Porta', papel: 'porta', eixo: 'y', origem: ['(i - 1) * (L / nPortas) + 2', '-18', 'rodape + 2'], tamanho: ['L / nPortas - 4', 'hPorta'], espessura: '18', material: 'mat_porta', fita: { n: FITA, s: FITA, l: FITA, o: FITA }, veio: 'b', repetir: 'nPortas', quando: 'nPortas > 0' },
    { id: 'tampo', nome: 'Tampo em pedra', papel: 'tampo', eixo: 'z', origem: ['0', '-20', 'hCorpo'], tamanho: ['L', 'P + 20'], espessura: 'tampoEsp', material: 'mat_tampo', fita: { n: FITA }, veio: 'a' },
  ],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça amortecida', quantidade: '(hPorta <= 900 ? 2 : hPorta <= 1600 ? 3 : hPorta <= 2200 ? 4 : 5) * nPortas', quando: 'nPortas > 0' },
    { id: 'pino', nome: 'Pino de prateleira', quantidade: '4 * nPrat', quando: 'nPrat > 0' },
  ],
  conectores: conectoresDe('base'),
  tipos: [
    { id: 'cava80', nome: 'Balcão Cava 80', valores: { L: 800, nPortas: 2 } },
    { id: 'cava90', nome: 'Balcão Cava 90', valores: { L: 900, nPortas: 2 } },
    { id: 'cava120', nome: 'Balcão Cava 120', valores: { L: 1200, nPortas: 2 } },
  ],
  tipoPadrao: 'cava90',
});

// ───────────────────────── 4. Aéreo Basculante Vidro Reflecta ─────────────────────────

export const FAMILIA_AEREO_VIDRO: Familia = criarAltoPadrao({
  id: 'fam_aereo_vidro',
  nome: 'Aéreo Basculante Vidro Reflecta',
  descricao: 'Armário aéreo suspenso basculante com frente em vidro reflecta fumê, moldura metálica, puxador inferior e prateleira interna.',
  parametros: [
    comprimento('L', 'Largura', 900, 400, 1800, 10),
    comprimento('A', 'Altura', 450, 300, 800, 10),
    comprimento('P', 'Profundidade', 340, 250, 550, 10),
    comprimento('zFixacao', 'Cota de fixação (fundo do móvel)', 1500, 1000, 2200, 10),
    inteiro('nPrat', 'Prateleira interna', 1, 0, 2),
    chapaCorpo('mdf18'),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
    derivado('vao', 'Vão interno vertical', 'A - 2 * esp'),
    derivado('mold', 'Largura da moldura metálica', '32'),
    derivado('wPorta', 'Largura da frente', 'L - 4'),
    derivado('hPorta', 'Altura da frente', 'A - 4'),
  ],
  pecas: [
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zFixacao'], tamanho: ['P', 'A'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zFixacao'], tamanho: ['P', 'A'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['esp', '0', 'zFixacao'], tamanho: ['L - 2 * esp', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'topo', nome: 'Topo', papel: 'topo', eixo: 'z', origem: ['esp', '0', 'zFixacao + A - esp'], tamanho: ['L - 2 * esp', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - 6', 'zFixacao + esp'], tamanho: ['L - 2 * esp', 'vao'], espessura: '6', material: 'mat_fundo', veio: 'livre' },
    { id: 'prateleira', nome: 'Prateleira de vidro', papel: 'prateleira', eixo: 'z', origem: ['esp', '8', 'zFixacao + esp + i * (vao - 8 * nPrat) / (nPrat + 1) + (i - 1) * 8'], tamanho: ['L - 2 * esp', 'P - 14'], espessura: '8', material: 'mat_vidro', repetir: 'nPrat', quando: 'nPrat > 0' },
    { id: 'porta', nome: 'Porta basculante vidro', papel: 'porta', eixo: 'y', origem: ['2 + mold', '-14', 'zFixacao + 2 + mold'], tamanho: ['wPorta - 2 * mold', 'hPorta - 2 * mold'], espessura: '6', material: 'mat_vidro' },
    { id: 'moldEsq', nome: 'Moldura esquerda', papel: 'generica', eixo: 'y', origem: ['2', '-20', 'zFixacao + 2'], tamanho: ['mold', 'hPorta'], espessura: '20', material: 'mat_metal' },
    { id: 'moldDir', nome: 'Moldura direita', papel: 'generica', eixo: 'y', origem: ['2 + wPorta - mold', '-20', 'zFixacao + 2'], tamanho: ['mold', 'hPorta'], espessura: '20', material: 'mat_metal' },
    { id: 'moldInf', nome: 'Moldura inferior', papel: 'generica', eixo: 'y', origem: ['2 + mold', '-20', 'zFixacao + 2'], tamanho: ['wPorta - 2 * mold', 'mold'], espessura: '20', material: 'mat_metal' },
    { id: 'moldSup', nome: 'Moldura superior', papel: 'generica', eixo: 'y', origem: ['2 + mold', '-20', 'zFixacao + 2 + hPorta - mold'], tamanho: ['wPorta - 2 * mold', 'mold'], espessura: '20', material: 'mat_metal' },
    { id: 'puxador', nome: 'Puxador perfil inferior', papel: 'generica', eixo: 'y', origem: ['(L - min(L - 40, 220)) / 2', '-28', 'zFixacao + 10'], tamanho: ['min(L - 40, 220)', '12'], espessura: '8', material: 'mat_metal' },
  ],
  ferragens: [
    { id: 'dobradica', nome: 'Pistão / dobradiça basculante', quantidade: '2' },
    { id: 'puxador', nome: 'Puxador perfil', quantidade: '1' },
    { id: 'pino', nome: 'Suporte de prateleira', quantidade: '4 * nPrat', quando: 'nPrat > 0' },
  ],
  conectores: conectoresDe('aereo'),
  tipos: [
    { id: 'av80', nome: 'Aéreo Vidro 80', valores: { L: 800 } },
    { id: 'av90', nome: 'Aéreo Vidro 90', valores: { L: 900 } },
    { id: 'av120', nome: 'Aéreo Vidro 120', valores: { L: 1200 } },
  ],
  tipoPadrao: 'av90',
});
