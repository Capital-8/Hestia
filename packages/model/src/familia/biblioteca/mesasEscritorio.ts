import type { Familia } from '../tipos.ts';
import { chapa, comprimento, derivado, enumerado, ESP_TAMPO, bloco, chapaZ, MATERIAL_TAMPO, nova, placaX, placaY, TIPOS_TAMPO, FITA_PVC } from './novosApoio.ts';

/*
 * Mesas de escritório com forma própria: em L (tampo poligonal de 6 pontos e retorno) e com gaveteiro (corpo de chapa com 3 gavetas
 * e pés do outro lado). Tampo em madeira, vidro, mármore ou quartzo. O retorno em L pode ser espelhado com M na planta. Medidas em mm.
 */

const M = 'madeira_macica';

export const FAMILIA_MESA_ESCRITORIO_L: Familia = (() => {
  const pts: Array<[string, string]> = [['0', '0'], ['L', '0'], ['L', 'P'], ['L - wR', 'P'], ['L - wR', 'dP'], ['0', 'dP']];
  const tampos = TIPOS_TAMPO.map(([t]) => chapaZ(`tampo_${t}`, `Tampo em L (${t})`, 'tampo', '0', '0', 'hB', 'L', 'P', 'espT', MATERIAL_TAMPO[t]!, {
    quando: `tipoTampo == "${t}"`, contorno: { tipo: 'poligono', pontos: pts }, fita: { n: FITA_PVC }, veio: 'a',
  }));
  return nova({
    id: 'fam_mesa_escritorio_l',
    nome: 'Mesa de escritório em L',
    categoria: 'mobiliario',
    descricao: 'Mesa de escritório em L (740 mm): bancada frontal e retorno nos fundos, tampo poligonal em madeira, vidro, mármore ou quartzo e 5 pés. Use M para espelhar o retorno.',
    parametros: [
      comprimento('L', 'Largura total', 1600, 1200, 2400),
      comprimento('A', 'Altura', 740, 700, 780),
      comprimento('P', 'Profundidade total', 1400, 1000, 2000),
      comprimento('dP', 'Profundidade da bancada frontal', 650, 500, 800, 10),
      comprimento('wR', 'Largura do retorno', 600, 450, 800, 10),
      enumerado('tipoTampo', 'Tipo de tampo', 'madeira', TIPOS_TAMPO),
      derivado('espT', 'Espessura do tampo', ESP_TAMPO),
      derivado('hB', 'Altura dos pés', 'A - espT'),
      derivado('eP', 'Espessura do pé', '50'),
      derivado('iR', 'Recuo dos pés', '40'),
    ],
    pecas: [
      ...tampos,
      bloco('pe1', 'Pé frontal esquerdo', 'iR', 'iR', '0', 'eP', 'eP', 'hB', M),
      bloco('pe2', 'Pé esquerdo da bancada', 'iR', 'dP - iR - eP', '0', 'eP', 'eP', 'hB', M),
      bloco('pe3', 'Pé frontal direito', 'L - iR - eP', 'iR', '0', 'eP', 'eP', 'hB', M),
      bloco('pe4', 'Pé traseiro direito', 'L - iR - eP', 'P - iR - eP', '0', 'eP', 'eP', 'hB', M),
      bloco('pe5', 'Pé do canto interno', 'L - wR + iR', 'dP - iR - eP', '0', 'eP', 'eP', 'hB', M),
    ],
    ferragens: [
      { id: 'pe', nome: 'Pé regulável', quantidade: '5' },
      { id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '10' },
    ],
    tipos: [
      { id: 'l160', nome: 'Em L 1,60 × 1,40 m', valores: { L: 1600, P: 1400, dP: 650, wR: 600 } },
      { id: 'l180', nome: 'Em L 1,80 × 1,50 m', valores: { L: 1800, P: 1500, dP: 700, wR: 650 } },
      { id: 'l140', nome: 'Em L compacta 1,40 × 1,20 m', valores: { L: 1400, P: 1200, dP: 600, wR: 500 } },
    ],
    tipoPadrao: 'l160',
  });
})();

/** Escritório com gaveteiro de 3 gavetas à esquerda e dois pés à direita. */
export const FAMILIA_MESA_ESCRITORIO_GAVETAS: Familia = (() => {
  const tampos = TIPOS_TAMPO.map(([t]) => chapaZ(`tampo_${t}`, `Tampo (${t})`, 'tampo', '0', '0', 'hB', 'L', 'P', 'espT', MATERIAL_TAMPO[t]!, {
    quando: `tipoTampo == "${t}"`, fita: { n: FITA_PVC }, veio: 'a',
  }));
  const F = { fita: { n: FITA_PVC }, veio: 'b' as const };
  return nova({
    id: 'fam_mesa_escritorio_gavetas',
    nome: 'Mesa de escritório com gavetas',
    categoria: 'mobiliario',
    descricao: 'Mesa de escritório de 740 mm com gaveteiro de 3 gavetas em chapa à esquerda e dois pés à direita; tampo em madeira, vidro, mármore ou quartzo.',
    parametros: [
      comprimento('L', 'Largura', 1400, 1000, 2000),
      comprimento('A', 'Altura', 740, 700, 780),
      comprimento('P', 'Profundidade', 700, 550, 850),
      comprimento('gW', 'Largura do gaveteiro', 450, 350, 600, 10),
      chapa('corpo', 'Chapa do corpo', 'mdf18', ['mdf15', 'mdf18', 'mdf25']),
      enumerado('tipoTampo', 'Tipo de tampo', 'madeira', TIPOS_TAMPO),
      derivado('esp', 'Espessura do corpo', 'corpo.esp'),
      derivado('espT', 'Espessura do tampo', ESP_TAMPO),
      derivado('hB', 'Altura do corpo', 'A - espT'),
      derivado('hF', 'Altura de cada frente', '(hB - 4 * 3) / 3'),
      derivado('eP', 'Espessura do pé', '50'),
    ],
    pecas: [
      ...tampos,
      placaX('latGE', 'Lateral externa do gaveteiro', 'lateral', '0', '18', '0', 'P - 24', 'hB', 'esp', 'corpo', F),
      placaX('latGD', 'Lateral interna do gaveteiro', 'lateral', 'gW - esp', '18', '0', 'P - 24', 'hB', 'esp', 'corpo', F),
      chapaZ('baseG', 'Base do gaveteiro', 'base', 'esp', '18', '0', 'gW - 2 * esp', 'P - 24', 'esp', 'corpo', F),
      placaY('fundoG', 'Fundo do gaveteiro', 'fundo', 'esp', 'P - 6', 'esp', 'gW - 2 * esp', 'hB - esp', '6', 'corpo'),
      placaY('frenteG', 'Frente de gaveta', 'frente_gaveta', '2', '0', '3 + (i - 1) * (hF + 3)', 'gW - 4', 'hF', '18', 'mat_porta', { repetir: '3', fita: { n: FITA_PVC } }),
      bloco('peD1', 'Pé direito frontal', 'L - 40 - eP', '40', '0', 'eP', 'eP', 'hB', M),
      bloco('peD2', 'Pé direito traseiro', 'L - 40 - eP', 'P - 40 - eP', '0', 'eP', 'eP', 'hB', M),
      placaY('modest', 'Painel de fundo da mesa', 'fundo', 'gW', 'P - 18', 'hB * 0.45', 'L - gW - 40 - eP', 'hB * 0.55', '18', M),
    ],
    ferragens: [
      { id: 'corredica', nome: 'Corrediça telescópica 450', quantidade: '3' },
      { id: 'puxador', nome: 'Puxador 128 mm', quantidade: '3' },
      { id: 'minifix', nome: 'Parafuso minifix', quantidade: '8' },
      { id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '12' },
    ],
    tipos: [
      { id: 'g140', nome: 'Com gavetas 1,40 m (1400 × 700)', valores: { L: 1400, P: 700, gW: 450 } },
      { id: 'g160', nome: 'Com gavetas 1,60 m (1600 × 750)', valores: { L: 1600, P: 750, gW: 450 } },
      { id: 'g120', nome: 'Com gavetas 1,20 m (1200 × 600)', valores: { L: 1200, P: 600, gW: 400 } },
    ],
    tipoPadrao: 'g140',
  });
})();

export const MESAS_ESCRITORIO: Familia[] = [FAMILIA_MESA_ESCRITORIO_L, FAMILIA_MESA_ESCRITORIO_GAVETAS];
