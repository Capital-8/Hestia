import type { Familia } from '../tipos.ts';
import {
  criarAltoPadrao,
  FAMILIA_AEREO_VIDRO,
  FAMILIA_BALCAO_CAVA,
  FAMILIA_CRISTALEIRA_VIDRO,
  FAMILIA_ILHA_GOURMET,
} from './altoPadraoCozinha.ts';
import { conectoresDe } from './conectores.ts';
import { chapaCorpo, comprimento, derivado, FITA, inteiro } from './cozinhaComum.ts';

/*
 * Linha Alto Padrão (dormitório, living e banho) + registro consolidado `ALTO_PADRAO`.
 * Medidas em milímetros; validação completa via `validarFamilia` e `biblioteca.test.ts`.
 */

export {
  FAMILIA_AEREO_VIDRO,
  FAMILIA_BALCAO_CAVA,
  FAMILIA_CRISTALEIRA_VIDRO,
  FAMILIA_ILHA_GOURMET,
};

// ───────────────────────── 5. Roupeiro Piso-Teto Portas de Correr ─────────────────────────

export const FAMILIA_ROUPEIRO_CORRER: Familia = criarAltoPadrao({
  id: 'fam_roupeiro_correr',
  nome: 'Roupeiro Piso-Teto Portas de Correr',
  descricao: 'Roupeiro piso-teto de alto padrão com 2 ou 3 portas de correr com perfis metálicos verticais, maleiro superior e divisória central.',
  parametros: [
    comprimento('L', 'Largura', 2200, 1200, 3600, 10),
    comprimento('A', 'Altura', 2500, 1800, 2800, 10),
    comprimento('P', 'Profundidade', 650, 500, 850, 10),
    comprimento('rodape', 'Altura do rodapé', 80, 0, 150, 10, 'tipo'),
    inteiro('nFolhas', 'Folhas de correr', 2, 2, 3),
    chapaCorpo('mdf18'),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
    derivado('zBase', 'Topo da base', 'rodape + esp'),
    derivado('zMaleiro', 'Cota do maleiro', 'A - esp - clamp(A * 0.18, 320, 480)'),
    derivado('lInt', 'Largura interna do vão', 'L - 2 * esp'),
    derivado('lVaoFolhas', 'Largura útil para as folhas', 'lInt - 2'),
    derivado('wFolha', 'Largura de cada folha', '(lVaoFolhas + (nFolhas - 1) * 20) / nFolhas'),
    derivado('passoFolha', 'Passo horizontal entre folhas', '(lVaoFolhas - wFolha) / (nFolhas - 1)'),
    derivado('zFolha', 'Cota inferior da folha', 'zBase + 8'),
    derivado('hFolha', 'Altura das folhas', 'A - esp - 12 - zFolha'),
  ],
  pecas: [
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zBase'], tamanho: ['P', 'A - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zBase'], tamanho: ['P', 'A - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', 'rodape'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'topo', nome: 'Topo', papel: 'topo', eixo: 'z', origem: ['esp', '0', 'A - esp'], tamanho: ['lInt', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - 6', 'zBase'], tamanho: ['lInt', 'A - esp - zBase'], espessura: '6', material: 'mat_fundo', veio: 'livre' },
    { id: 'rodap', nome: 'Rodapé', papel: 'rodape', eixo: 'y', origem: ['esp', '50', '0'], tamanho: ['lInt', 'rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, quando: 'rodape > 0' },
    { id: 'pratMaleiro', nome: 'Maleiro superior', papel: 'prateleira', eixo: 'z', origem: ['esp', '45', 'zMaleiro'], tamanho: ['lInt', 'P - 51'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'divC', nome: 'Divisória central', papel: 'divisoria', eixo: 'x', origem: ['L / 2 - esp / 2', '45', 'zBase'], tamanho: ['P - 51', 'zMaleiro - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'pratDir', nome: 'Prateleira interna', papel: 'prateleira', eixo: 'z', origem: ['L / 2 + esp / 2', '45', 'zBase + i * (zMaleiro - zBase - 2 * esp) / 3 + (i - 1) * esp'], tamanho: ['L / 2 - 1.5 * esp', 'P - 51'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, repetir: '2' },
    { id: 'cabideiro', nome: 'Cabideiro metálico', papel: 'bloco', eixo: 'z', origem: ['esp', '200', 'zMaleiro - 70'], tamanho: ['L / 2 - 1.5 * esp', '30'], espessura: '24', material: 'mat_metal' },
    { id: 'trilhoInf', nome: 'Trilho inferior', papel: 'generica', eixo: 'z', origem: ['esp', '0', 'zBase'], tamanho: ['lInt', '44'], espessura: '8', material: 'mat_metal' },
    { id: 'trilhoSup', nome: 'Trilho superior', papel: 'generica', eixo: 'z', origem: ['esp', '0', 'A - esp - 12'], tamanho: ['lInt', '44'], espessura: '12', material: 'mat_metal' },
    { id: 'perfE', nome: 'Perfil esquerdo da folha', papel: 'generica', eixo: 'y', origem: ['esp + 1 + (i - 1) * passoFolha', 'i == 2 ? 22 : 2', 'zFolha'], tamanho: ['22', 'hFolha'], espessura: '18', material: 'mat_metal', repetir: 'nFolhas' },
    { id: 'perfD', nome: 'Perfil direito da folha', papel: 'generica', eixo: 'y', origem: ['esp + 1 + (i - 1) * passoFolha + wFolha - 22', 'i == 2 ? 22 : 2', 'zFolha'], tamanho: ['22', 'hFolha'], espessura: '18', material: 'mat_metal', repetir: 'nFolhas' },
    { id: 'porta', nome: 'Folha de correr', papel: 'porta', eixo: 'y', origem: ['esp + 1 + (i - 1) * passoFolha + 22', 'i == 2 ? 22 : 2', 'zFolha'], tamanho: ['wFolha - 44', 'hFolha'], espessura: '18', material: 'mat_porta', fita: { n: FITA, s: FITA, l: FITA, o: FITA }, veio: 'b', repetir: 'nFolhas' },
  ],
  ferragens: [
    { id: 'puxador', nome: 'Perfil puxador piso-teto', quantidade: '2 * nFolhas' },
    { id: 'pino', nome: 'Pino de prateleira', quantidade: '8' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '16' },
  ],
  conectores: conectoresDe('torre'),
  tipos: [
    { id: 'rc200', nome: 'Roupeiro Correr 2,00 m (2 folhas)', valores: { L: 2000, nFolhas: 2 } },
    { id: 'rc220', nome: 'Roupeiro Correr 2,20 m (2 folhas)', valores: { L: 2200, nFolhas: 2 } },
    { id: 'rc280', nome: 'Roupeiro Correr 2,80 m (3 folhas)', valores: { L: 2800, nFolhas: 3 } },
  ],
  tipoPadrao: 'rc220',
});

// ───────────────────────── 6. Painel Ripado TV + Rack Suspenso ─────────────────────────

export const FAMILIA_PAINEL_RIPADO_RACK: Familia = criarAltoPadrao({
  id: 'fam_painel_ripado_rack',
  nome: 'Painel Ripado TV + Rack Suspenso',
  descricao: 'Conjunto de painel ripado vertical piso-teto com destaque para TV e rack inferior suspenso com três gavetas e puxadores perfil.',
  categoria: 'mobiliario',
  hospedagem: 'parede',
  parametros: [
    comprimento('L', 'Largura', 2200, 1200, 3600, 10),
    comprimento('A', 'Altura', 2200, 1400, 2800, 10),
    comprimento('P', 'Profundidade', 380, 280, 600, 10),
    comprimento('zRack', 'Altura do rack em relação ao piso', 250, 150, 450, 10, 'tipo'),
    comprimento('hRack', 'Altura do rack suspenso', 320, 220, 450, 10, 'tipo'),
    comprimento('largRipa', 'Largura da ripa', 45, 25, 80, 5, 'tipo'),
    comprimento('vaoRipa', 'Vão entre ripas', 15, 5, 40, 5, 'tipo'),
    chapaCorpo('mdf18'),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
    derivado('zTopoRack', 'Topo do rack suspenso', 'zRack + hRack'),
    derivado('pRack', 'Profundidade do rack', 'P - esp'),
    derivado('wGav', 'Largura de cada gaveta', '(L - 4 * esp) / 3'),
    derivado('hGav', 'Altura da frente da gaveta', 'hRack - 2 * esp - 4'),
    derivado('pGav', 'Profundidade da gaveta', 'pRack - 20'),
    derivado('nRipas', 'Número de ripas verticais', 'min(64, floor((L + vaoRipa) / (largRipa + vaoRipa)))'),
    derivado('xRipas', 'Início X das ripas', '(L - (nRipas * largRipa + (nRipas - 1) * vaoRipa)) / 2'),
  ],
  pecas: [
    { id: 'painelBase', nome: 'Painel traseiro', papel: 'painel', eixo: 'y', origem: ['0', 'P - esp', 'zRack'], tamanho: ['L', 'A - zRack'], espessura: 'esp', material: 'corpo', veio: 'a' },
    { id: 'ripa', nome: 'Ripa vertical', papel: 'painel', eixo: 'x', origem: ['xRipas + (i - 1) * (largRipa + vaoRipa)', 'P - esp - 22', 'zTopoRack'], tamanho: ['22', 'A - zTopoRack'], espessura: 'largRipa', material: 'corpo', repetir: 'nRipas' },
    { id: 'painelTv', nome: 'Painel liso TV', papel: 'painel', eixo: 'y', origem: ['L * 0.18', 'P - esp - 40', 'zTopoRack + 100'], tamanho: ['L * 0.64', 'A - zTopoRack - 200'], espessura: '18', material: 'mat_pedra_escura', fita: { n: FITA, s: FITA, l: FITA, o: FITA } },
    { id: 'baseRack', nome: 'Base do rack', papel: 'base', eixo: 'z', origem: ['0', '0', 'zRack'], tamanho: ['L', 'pRack'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'topoRack', nome: 'Tampo do rack', papel: 'tampo', eixo: 'z', origem: ['0', '0', 'zTopoRack - esp'], tamanho: ['L', 'pRack'], espessura: 'esp', material: 'mat_tampo', fita: { n: FITA } },
    { id: 'latERack', nome: 'Lateral esquerda do rack', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zRack + esp'], tamanho: ['pRack', 'hRack - 2 * esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'latDRack', nome: 'Lateral direita do rack', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zRack + esp'], tamanho: ['pRack', 'hRack - 2 * esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'div1', nome: 'Divisória 1 do rack', papel: 'divisoria', eixo: 'x', origem: ['esp + wGav', '0', 'zRack + esp'], tamanho: ['pRack', 'hRack - 2 * esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'div2', nome: 'Divisória 2 do rack', papel: 'divisoria', eixo: 'x', origem: ['2 * esp + 2 * wGav', '0', 'zRack + esp'], tamanho: ['pRack', 'hRack - 2 * esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
  ],
  aninhados: [
    {
      id: 'gavetas',
      nome: 'Gaveta do rack',
      familiaId: 'fam_gaveta',
      valores: { L: 'wGav', A: 'hGav', P: 'pGav' },
      origem: ['esp + (i - 1) * (wGav + esp)', '0', 'zRack + esp + 2'],
      repetir: '3',
    },
  ],
  ferragens: [
    { id: 'corredica', nome: 'Corrediça telescópica', quantidade: '3' },
    { id: 'puxador', nome: 'Puxador perfil', quantidade: '3' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '12' },
  ],
  conectores: conectoresDe('painel'),
  tipos: [
    { id: 'pr180', nome: 'Painel + Rack 1,80 m', valores: { L: 1800 } },
    { id: 'pr220', nome: 'Painel + Rack 2,20 m', valores: { L: 2200 } },
    { id: 'pr280', nome: 'Painel + Rack 2,80 m', valores: { L: 2800 } },
  ],
  tipoPadrao: 'pr220',
});

// ───────────────────────── 7. Bancada Banho Cuba Esculpida ─────────────────────────

export const FAMILIA_BANCADA_CUBA: Familia = criarAltoPadrao({
  id: 'fam_bancada_cuba',
  nome: 'Bancada Banho Cuba Esculpida',
  descricao: 'Bancada suspensa de banho com tampo em pedra clara, cuba esculpida rebaixada, torneira e puxadores em bronze/cobre e dois gavetões.',
  parametros: [
    comprimento('L', 'Largura', 1000, 600, 2400, 10),
    comprimento('A', 'Altura', 600, 400, 900, 10),
    comprimento('P', 'Profundidade', 500, 380, 750, 10),
    comprimento('zFixacao', 'Cota de fixação', 300, 150, 650, 10),
    comprimento('cubaL', 'Largura da cuba', 480, 300, 800, 10, 'tipo'),
    comprimento('cubaP', 'Profundidade da cuba', 340, 240, 480, 10, 'tipo'),
    chapaCorpo('mdf18'),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
    derivado('zTop', 'Cota superior da bancada', 'zFixacao + A'),
    derivado('hGab', 'Altura do gabinete inferior', 'A - 125'),
    derivado('hFrente', 'Altura da frente de cada gavetão', '(hGab - esp - 6) / 2'),
    derivado('cubaLUsada', 'Largura útil da cuba', 'clamp(cubaL, 260, L - 120)'),
    derivado('cubaPUsada', 'Profundidade útil da cuba', 'clamp(cubaP, 200, P - 120)'),
    derivado('cubaX', 'Início X da cuba', '(L - cubaLUsada) / 2'),
    derivado('cubaY', 'Início Y da cuba', '(P - cubaPUsada) / 2 + 10'),
  ],
  pecas: [
    { id: 'saiaF', nome: 'Saia frontal da bancada', papel: 'tampo', eixo: 'y', origem: ['0', '-20', 'zTop - 120'], tamanho: ['L', '120'], espessura: '25', material: 'mat_tampo', fita: { n: FITA } },
    { id: 'saiaE', nome: 'Saia esquerda da bancada', papel: 'tampo', eixo: 'x', origem: ['0', '5', 'zTop - 120'], tamanho: ['P - 5', '95'], espessura: '25', material: 'mat_tampo' },
    { id: 'saiaD', nome: 'Saia direita da bancada', papel: 'tampo', eixo: 'x', origem: ['L - 25', '5', 'zTop - 120'], tamanho: ['P - 5', '95'], espessura: '25', material: 'mat_tampo' },
    { id: 'tampoEsq', nome: 'Tampo esquerdo', papel: 'tampo', eixo: 'z', origem: ['0', '5', 'zTop - 25'], tamanho: ['cubaX', 'P - 5'], espessura: '25', material: 'mat_tampo' },
    { id: 'tampoDir', nome: 'Tampo direito', papel: 'tampo', eixo: 'z', origem: ['cubaX + cubaLUsada', '5', 'zTop - 25'], tamanho: ['L - cubaX - cubaLUsada', 'P - 5'], espessura: '25', material: 'mat_tampo' },
    { id: 'tampoFrente', nome: 'Tampo frontal da cuba', papel: 'tampo', eixo: 'z', origem: ['cubaX', '5', 'zTop - 25'], tamanho: ['cubaLUsada', 'cubaY - 5'], espessura: '25', material: 'mat_tampo' },
    { id: 'tampoFundo', nome: 'Tampo traseiro da cuba', papel: 'tampo', eixo: 'z', origem: ['cubaX', 'cubaY + cubaPUsada', 'zTop - 25'], tamanho: ['cubaLUsada', 'P - cubaY - cubaPUsada'], espessura: '25', material: 'mat_tampo' },
    { id: 'cubaFundo', nome: 'Fundo da cuba esculpida', papel: 'tampo', eixo: 'z', origem: ['cubaX', 'cubaY', 'zTop - 115'], tamanho: ['cubaLUsada', 'cubaPUsada'], espessura: '20', material: 'mat_tampo' },
    { id: 'cubaParedeE', nome: 'Parede esquerda da cuba', papel: 'tampo', eixo: 'x', origem: ['cubaX', 'cubaY', 'zTop - 95'], tamanho: ['cubaPUsada', '70'], espessura: '15', material: 'mat_tampo' },
    { id: 'cubaParedeD', nome: 'Parede direita da cuba', papel: 'tampo', eixo: 'x', origem: ['cubaX + cubaLUsada - 15', 'cubaY', 'zTop - 95'], tamanho: ['cubaPUsada', '70'], espessura: '15', material: 'mat_tampo' },
    { id: 'cubaParedeF', nome: 'Parede frontal da cuba', papel: 'tampo', eixo: 'y', origem: ['cubaX + 15', 'cubaY', 'zTop - 95'], tamanho: ['cubaLUsada - 30', '70'], espessura: '15', material: 'mat_tampo' },
    { id: 'cubaParedeT', nome: 'Parede traseira da cuba', papel: 'tampo', eixo: 'y', origem: ['cubaX + 15', 'cubaY + cubaPUsada - 15', 'zTop - 95'], tamanho: ['cubaLUsada - 30', '70'], espessura: '15', material: 'mat_tampo' },
    { id: 'ralo', nome: 'Válvula ralo bronze', papel: 'generica', eixo: 'z', origem: ['L / 2 - 22', 'cubaY + cubaPUsada / 2 - 22', 'zTop - 95'], tamanho: ['44', '44'], espessura: '4', material: 'mat_cobre' },
    { id: 'torneiraBase', nome: 'Corpo da torneira bronze', papel: 'generica', eixo: 'z', origem: ['L / 2 - 15', 'cubaY + cubaPUsada + 15', 'zTop'], tamanho: ['30', '30'], espessura: '140', material: 'mat_cobre' },
    { id: 'torneiraBica', nome: 'Bica da torneira bronze', papel: 'generica', eixo: 'z', origem: ['L / 2 - 11', 'cubaY + cubaPUsada - 45', 'zTop + 140'], tamanho: ['22', '90'], espessura: '16', material: 'mat_cobre' },
    { id: 'base', nome: 'Base do gabinete', papel: 'base', eixo: 'z', origem: ['0', '0', 'zFixacao'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zFixacao + esp'], tamanho: ['P', 'hGab - esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zFixacao + esp'], tamanho: ['P', 'hGab - esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA } },
    { id: 'fundo', nome: 'Fundo do gabinete', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - 6', 'zFixacao + esp'], tamanho: ['L - 2 * esp', 'hGab - esp'], espessura: '6', material: 'mat_fundo' },
    { id: 'frenteGav', nome: 'Frente de gavetão', papel: 'frente_gaveta', eixo: 'y', origem: ['2', '-18', 'zFixacao + esp + 2 + (i - 1) * (hFrente + 2)'], tamanho: ['L - 4', 'hFrente'], espessura: '18', material: 'mat_porta', fita: { n: FITA, s: FITA, l: FITA, o: FITA }, repetir: '2' },
    { id: 'puxadorGav', nome: 'Puxador bronze', papel: 'generica', eixo: 'y', origem: ['(L - min(L - 80, 280)) / 2', '-28', 'zFixacao + esp + 2 + (i - 1) * (hFrente + 2) + hFrente - 24'], tamanho: ['min(L - 80, 280)', '12'], espessura: '10', material: 'mat_cobre', repetir: '2' },
  ],
  ferragens: [
    { id: 'corredica', nome: 'Corrediça telescópica', quantidade: '2' },
    { id: 'puxador', nome: 'Puxador bronze', quantidade: '2' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '8' },
  ],
  conectores: conectoresDe('base'),
  tipos: [
    { id: 'banho80', nome: 'Bancada Cuba Esculpida 80', valores: { L: 800 } },
    { id: 'banho100', nome: 'Bancada Cuba Esculpida 100', valores: { L: 1000 } },
    { id: 'banho120', nome: 'Bancada Cuba Esculpida 120', valores: { L: 1200 } },
  ],
  tipoPadrao: 'banho100',
});

export const ALTO_PADRAO: readonly Familia[] = [
  FAMILIA_ILHA_GOURMET,
  FAMILIA_CRISTALEIRA_VIDRO,
  FAMILIA_BALCAO_CAVA,
  FAMILIA_AEREO_VIDRO,
  FAMILIA_ROUPEIRO_CORRER,
  FAMILIA_PAINEL_RIPADO_RACK,
  FAMILIA_BANCADA_CUBA,
];
