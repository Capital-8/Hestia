import type { Familia } from '../tipos.ts';
import { bloco, chapa, chapaZ, comprimento, derivado, enumerado, inteiro, nova, placaX, placaY, TIPOS_TAMPO, FITA_PVC } from './novosApoio.ts';

/*
 * Conjuntos aninhados e o aparador da Biblioteca. `fam_conjunto_centro` agrupa 2 ou 3 mesas de centro de alturas decrescentes;
 * `fam_mesa_cadeiras` coloca uma mesa de jantar com até 8 cadeiras espaçadas automaticamente nas duas faces compridas (cada cadeira
 * com 450 mm de largura e folga mínima de 20 mm; as que não cabem são omitidas). Cada peça interna segue o próprio `Aninhado`
 * com `repetir`. Medidas em mm.
 */

export const FAMILIA_CONJUNTO_CENTRO: Familia = nova({
  id: 'fam_conjunto_centro',
  nome: 'Conjunto de mesas de centro',
  categoria: 'mobiliario',
  descricao: 'Conjunto de 2 ou 3 mesas de centro lado a lado, de alturas decrescentes (cada uma 50 mm mais baixa), com o mesmo tampo e a mesma base. Cada mesa é uma Mesa de centro aninhada.',
  parametros: [
    comprimento('L', 'Largura total', 1400, 1100, 2200),
    comprimento('A', 'Altura da maior mesa', 450, 400, 550),
    comprimento('P', 'Profundidade da maior mesa', 600, 500, 900),
    inteiro('nMesas', 'Número de mesas', 2, 2, 3),
    enumerado('tipoTampo', 'Tipo de tampo', 'madeira', TIPOS_TAMPO),
    enumerado('base', 'Base', 'pes4', [['pes4', '4 pés'], ['prateleira', '4 pés com prateleira'], ['laterais', 'Laterais em painel']]),
    derivado('w', 'Largura de cada mesa', '(L - (nMesas - 1) * 60) / nMesas'),
  ],
  pecas: [],
  aninhados: [1, 2, 3].map((k) => ({
    id: `mesa${k}`,
    nome: `Mesa ${k}`,
    familiaId: 'fam_mesa_centro',
    valores: { L: 'w', A: `A - ${(k - 1) * 50}`, P: `P - ${(k - 1) * 60}`, formato: '"ret"', tipoTampo: 'tipoTampo', base: 'base' },
    origem: [`${k - 1} * (w + 60)`, '0', '0'] as [string, string, string],
    ...(k === 3 ? { quando: 'nMesas >= 3' } : {}),
  })),
  tipos: [
    { id: 'duas', nome: 'Conjunto de 2 mesas (1400 × 600)', valores: { L: 1400, A: 450, P: 600, nMesas: 2 } },
    { id: 'tres', nome: 'Conjunto de 3 mesas (1800 × 600)', valores: { L: 1800, A: 450, P: 600, nMesas: 3 } },
    { id: 'tres_compacto', nome: 'Conjunto de 3 mesas compacto (1200 × 500)', valores: { L: 1200, A: 420, P: 500, nMesas: 3 } },
  ],
  tipoPadrao: 'duas',
});

export const FAMILIA_MESA_CADEIRAS: Familia = nova({
  id: 'fam_mesa_cadeiras',
  nome: 'Mesa com cadeiras',
  categoria: 'mobiliario',
  descricao: 'Mesa de jantar retangular com 2 a 8 cadeiras de jantar, distribuídas nas duas faces compridas com espaçamento automático. A profundidade total é a da mesa mais 2 × 510 mm de cadeiras (460 mm cada, mais 50 mm de folga).',
  parametros: [
    comprimento('L', 'Comprimento da mesa', 1600, 1200, 2800),
    comprimento('A', 'Altura da mesa', 750, 700, 800),
    comprimento('P', 'Profundidade da mesa', 900, 700, 1100),
    inteiro('cadeiras', 'Número de cadeiras', 4, 2, 8),
    enumerado('tipoTampo', 'Tipo de tampo', 'madeira', TIPOS_TAMPO),
    enumerado('base', 'Base', 'pes4', [['pes4', '4 pés'], ['cavalete', 'Cavalete'], ['trapezio', 'Trapézio']]),
    derivado('nF', 'Cadeiras na face frontal', 'min(ceil(cadeiras / 2), floor(L / 470))'),
    derivado('nT', 'Cadeiras na face traseira', 'min(floor(cadeiras / 2), floor(L / 470))'),
    derivado('pF', 'Passo na face frontal', 'L / max(nF, 1)'),
    derivado('pT', 'Passo na face traseira', 'L / max(nT, 1)'),
  ],
  pecas: [],
  aninhados: [
    {
      id: 'mesa', nome: 'Mesa', familiaId: 'fam_mesa_jantar',
      valores: { L: 'L', A: 'A', P: 'P', tipoTampo: 'tipoTampo', base: 'base' },
      origem: ['0', '510', '0'],
    },
    {
      id: 'cadF', nome: 'Cadeira frontal', familiaId: 'fam_cadeira',
      valores: { L: '450', P: '460', A: '900' },
      origem: ['(i - 1) * pF + (pF - 450) / 2 + 450', '460', '0'], rotacao: '180', repetir: 'nF', quando: 'nF > 0',
    },
    {
      id: 'cadT', nome: 'Cadeira traseira', familiaId: 'fam_cadeira',
      valores: { L: '450', P: '460', A: '900' },
      origem: ['(i - 1) * pT + (pT - 450) / 2', '510 + P + 50', '0'], repetir: 'nT', quando: 'nT > 0',
    },
  ],
  tipos: [
    { id: 'mesa4', nome: 'Mesa 1,60 m com 4 cadeiras', valores: { L: 1600, P: 900, cadeiras: 4 } },
    { id: 'mesa6', nome: 'Mesa 2,00 m com 6 cadeiras', valores: { L: 2000, P: 1000, cadeiras: 6 } },
    { id: 'mesa8', nome: 'Mesa 2,40 m com 8 cadeiras', valores: { L: 2400, P: 1000, cadeiras: 8 } },
  ],
  tipoPadrao: 'mesa4',
});

const M = 'madeira_macica';
const F = { fita: { n: FITA_PVC }, veio: 'b' as const };

export const FAMILIA_APARADOR: Familia = nova({
  id: 'fam_aparador',
  nome: 'Aparador',
  categoria: 'mobiliario',
  descricao: 'Aparador baixo de 850 mm: caixa de chapa sobre 4 pés de madeira, com tampo em madeira, vidro, mármore ou quartzo, 2 a 4 portas e uma prateleira interna.',
  parametros: [
    comprimento('L', 'Largura', 1600, 900, 2400),
    comprimento('A', 'Altura', 850, 750, 950),
    comprimento('P', 'Profundidade', 420, 320, 550),
    inteiro('portas', 'Número de portas', 2, 2, 4),
    chapa('corpo', 'Chapa do corpo', 'mdf18', ['mdf15', 'mdf18', 'mdf25']),
    enumerado('tipoTampo', 'Tipo de tampo', 'madeira', TIPOS_TAMPO),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
    derivado('espT', 'Espessura do tampo', 'tipoTampo == "vidro" ? 12 : (tipoTampo == "madeira" ? 30 : 20)'),
    derivado('hPe', 'Altura dos pés', '120'),
    derivado('hC', 'Altura da caixa', 'A - hPe - espT'),
    derivado('wP', 'Largura de cada porta', 'L / portas'),
  ],
  pecas: [
    ...TIPOS_TAMPO.map(([t]) => chapaZ(`tampo_${t}`, `Tampo (${t})`, 'tampo', '0', '0', 'A - espT', 'L', 'P', 'espT', ({ madeira: 'mat_tampo', vidro: 'mat_vidro_incolor', marmore: 'mat_marmore', quartzo: 'mat_quartzo' })[t], { quando: `tipoTampo == "${t}"`, fita: { n: FITA_PVC }, veio: 'a' })),
    bloco('pe1', 'Pé frontal esquerdo', '30', '30', '0', '50', '50', 'hPe', M),
    bloco('pe2', 'Pé frontal direito', 'L - 80', '30', '0', '50', '50', 'hPe', M),
    bloco('pe3', 'Pé traseiro esquerdo', '30', 'P - 80', '0', '50', '50', 'hPe', M),
    bloco('pe4', 'Pé traseiro direito', 'L - 80', 'P - 80', '0', '50', '50', 'hPe', M),
    placaX('latE', 'Lateral esquerda', 'lateral', '0', '18', 'hPe', 'P - 18', 'hC', 'esp', 'corpo', F),
    placaX('latD', 'Lateral direita', 'lateral', 'L - esp', '18', 'hPe', 'P - 18', 'hC', 'esp', 'corpo', F),
    chapaZ('base', 'Base', 'base', 'esp', '18', 'hPe', 'L - 2 * esp', 'P - 18', 'esp', 'corpo', F),
    chapaZ('topo', 'Topo', 'topo', 'esp', '18', 'hPe + hC - esp', 'L - 2 * esp', 'P - 18', 'esp', 'corpo', F),
    placaY('fundo', 'Fundo', 'fundo', 'esp', 'P - 6', 'hPe + esp', 'L - 2 * esp', 'hC - 2 * esp', '6', 'corpo'),
    chapaZ('prateleira', 'Prateleira', 'prateleira', 'esp', '18', 'hPe + hC / 2', 'L - 2 * esp', 'P - 24', 'esp', 'corpo', F),
    placaY('porta', 'Porta', 'porta', '(i - 1) * wP + 2', '0', 'hPe + 2', 'wP - 4', 'hC - 4', '18', 'mat_porta', { repetir: 'portas', fita: { n: FITA_PVC } }),
  ],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça 35 mm', quantidade: 'portas * 2' },
    { id: 'puxador', nome: 'Puxador 128 mm', quantidade: 'portas' },
    { id: 'pino', nome: 'Pino de prateleira', quantidade: '4' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '8' },
  ],
  tipos: [
    { id: 'aparador160', nome: 'Aparador 1,60 m (2 portas)', valores: { L: 1600, portas: 2 } },
    { id: 'aparador200', nome: 'Aparador 2,00 m (4 portas)', valores: { L: 2000, portas: 4 } },
    { id: 'aparador120', nome: 'Aparador 1,20 m (2 portas)', valores: { L: 1200, portas: 2, P: 380 } },
  ],
  tipoPadrao: 'aparador160',
});

export const CONJUNTOS: Familia[] = [FAMILIA_CONJUNTO_CENTRO, FAMILIA_MESA_CADEIRAS, FAMILIA_APARADOR];
