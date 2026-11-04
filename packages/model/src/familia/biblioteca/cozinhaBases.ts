import type { Aninhado, Familia, Ferragem, Peca, Tipo } from '../tipos.ts';
import { conectoresDe } from './conectores.ts';
import { chapaCorpo, comprimento, derivado, enumerado, familia, FITA, inteiro } from './cozinhaComum.ts';

/*
 * Bases de cozinha (ficha E7-cozinha): gavetas, pia e cooktop. Carcaça de laterais sobre base, tampo e fundo encaixado;
 * medidas em milímetros. As folgas e a montagem são PROPOSTAS do Hestia, a validar com marceneiro (ADR 0049 R5).
 */

const TAMPAS = [
  { valor: 'sem', rotulo: 'Sem tampo' },
  { valor: 'comum', rotulo: 'Comum (25 mm)' },
  { valor: 'engrossado', rotulo: 'Engrossado (38 mm)' },
];

const PARAMETROS_BASE = [
  comprimento('L', 'Largura', 800, 600, 1200, 10),
  comprimento('A', 'Altura', 720, 650, 900, 10),
  comprimento('P', 'Profundidade', 560, 500, 650, 10),
  comprimento('rodape', 'Altura do rodapé', 100, 80, 120, 10, 'tipo'),
  chapaCorpo(),
  enumerado('tampo', 'Tampo', 'comum', TAMPAS),
];

const DERIVADOS_BASE = [
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('tampoEsp', 'Espessura do tampo', 'tampo == "sem" ? 0 : (tampo == "comum" ? 25 : 38)'),
  derivado('hCorpo', 'Altura do corpo', 'A - tampoEsp'),
  derivado('zBase', 'Cota do topo da base', 'rodape + esp'),
  derivado('vao', 'Vão interno útil', 'hCorpo - zBase'),
  derivado('yFundo', 'Face frontal do fundo (Y)', 'P - 21'),
  derivado('li', 'Largura interna', 'L - 2 * esp'),
  derivado('pg', 'Profundidade da gaveta', 'P - 30'),
];

export const PECAS_BASE: Peca[] = [
  { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zBase'], tamanho: ['P', 'hCorpo - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
  { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zBase'], tamanho: ['P', 'hCorpo - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
  { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', 'rodape'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
  { id: 'trF', nome: 'Travessa frontal', papel: 'travessa', eixo: 'z', origem: ['esp', '0', 'hCorpo - esp'], tamanho: ['L - 2 * esp', '80'], espessura: 'esp', material: 'corpo', veio: 'a' },
  { id: 'trT', nome: 'Travessa traseira', papel: 'travessa', eixo: 'z', origem: ['esp', 'yFundo - 80', 'hCorpo - esp'], tamanho: ['L - 2 * esp', '80'], espessura: 'esp', material: 'corpo', veio: 'a' },
  { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'yFundo', 'zBase'], tamanho: ['L - 2 * esp', 'hCorpo - zBase'], espessura: '6', material: 'mat_fundo', veio: 'livre' },
  { id: 'rodap', nome: 'Rodapé', papel: 'rodape', eixo: 'y', origem: ['esp', '50', '0'], tamanho: ['L - 2 * esp', 'rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a', quando: 'rodape > 0' },
  { id: 'tampo', nome: 'Tampo', papel: 'tampo', eixo: 'z', origem: ['0', '-20', 'hCorpo'], tamanho: ['L', 'P + 20'], espessura: 'tampoEsp', material: 'mat_tampo', fita: { n: FITA }, veio: 'a', quando: 'tampo != "sem"' },
];

const TIPOS_GAVETAS: Tipo[] = [
  { id: 'G60', nome: 'Base 60 (3 gavetas)', valores: { L: 600 } },
  { id: 'G80', nome: 'Base 80 (3 gavetas)', valores: { L: 800 } },
  { id: 'G100', nome: 'Base 100 (3 gavetas)', valores: { L: 1000 } },
];

const GAVETAS: Aninhado[] = [
  {
    id: 'gaveta',
    nome: 'Gaveta',
    familiaId: 'fam_gaveta',
    valores: { L: 'li', A: 'hG', P: 'pg' },
    origem: ['esp', '0', 'zBase + (i - 1) * hG'],
    repetir: '3',
  },
];

const FERRAGENS_GAVETAS: Ferragem[] = [
  { id: 'corredica', nome: 'Corrediça telescópica', quantidade: '3' },
  { id: 'puxador', nome: 'Puxador', quantidade: '3' },
];

/** Base com carcaça completa e três gavetas empilhadas (módulos `fam_gaveta`). */
export const FAMILIA_BASE_GAVETAS: Familia = familia({
  id: 'fam_base_gavetas',
  nome: 'Base com gavetas',
  descricao: 'Base de cozinha com carcaça completa e três gavetas empilhadas com corrediça telescópica.',
  parametros: [...PARAMETROS_BASE, ...DERIVADOS_BASE, derivado('hG', 'Altura de cada gaveta', 'floor(vao / 3)')],
  pecas: PECAS_BASE,
  aninhados: GAVETAS,
  ferragens: FERRAGENS_GAVETAS,
  conectores: conectoresDe('base'),
  tipos: TIPOS_GAVETAS,
  tipoPadrao: 'G80',
});

const PARAMETROS_PIA = [
  comprimento('L', 'Largura', 800, 700, 1300, 10),
  comprimento('A', 'Altura', 720, 650, 900, 10),
  comprimento('P', 'Profundidade', 560, 500, 650, 10),
  comprimento('cubaL', 'Largura da cuba', 500, 400, 600, 10, 'tipo'),
  comprimento('cubaP', 'Profundidade da cuba', 400, 350, 450, 10, 'tipo'),
  comprimento('rodape', 'Altura do rodapé', 100, 80, 120, 10, 'tipo'),
  chapaCorpo(),
  inteiro('nPortas', 'Portas', 2, 0, 2),
];

const DERIVADOS_PIA = [
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('zBase', 'Cota do topo da base', 'rodape + esp'),
  derivado('hCorpo', 'Altura do corpo', 'A - 25'),
  derivado('yFundo', 'Face frontal do fundo (Y)', 'P - 21'),
];

const PECAS_PIA: Peca[] = [
  { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zBase'], tamanho: ['P', 'hCorpo - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
  { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zBase'], tamanho: ['P', 'hCorpo - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
  { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', 'rodape'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
  { id: 'trF', nome: 'Travessa frontal', papel: 'travessa', eixo: 'z', origem: ['esp', '0', 'hCorpo - esp'], tamanho: ['L - 2 * esp', '80'], espessura: 'esp', material: 'corpo', veio: 'a' },
  { id: 'trT', nome: 'Travessa traseira', papel: 'travessa', eixo: 'z', origem: ['esp', 'yFundo - 80', 'hCorpo - esp'], tamanho: ['L - 2 * esp', '80'], espessura: 'esp', material: 'corpo', veio: 'a' },
  { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'yFundo', 'zBase'], tamanho: ['L - 2 * esp', 'hCorpo - zBase'], espessura: '6', material: 'mat_fundo', veio: 'livre' },
  { id: 'porta', nome: 'Porta', papel: 'porta', eixo: 'y', origem: ['(i - 1) * (L / nPortas) + 2', '-18', 'rodape + 2'], tamanho: ['L / nPortas - 4', 'hCorpo - rodape - 4'], espessura: '18', material: 'mat_porta', fita: { n: FITA, s: FITA, l: FITA, o: FITA }, veio: 'b', repetir: 'nPortas', quando: 'nPortas > 0' },
  { id: 'rodap', nome: 'Rodapé', papel: 'rodape', eixo: 'y', origem: ['esp', '50', '0'], tamanho: ['L - 2 * esp', 'rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a', quando: 'rodape > 0' },
  {
    id: 'tampo',
    nome: 'Tampo com recorte da cuba',
    papel: 'tampo',
    eixo: 'z',
    origem: ['0', '-20', 'hCorpo'],
    tamanho: ['L', 'P + 20'],
    espessura: '25',
    material: 'mat_tampo',
    fita: { n: FITA },
    veio: 'a',
    usinagens: [
      {
        id: 'cuba',
        tipo: 'recorte',
        face: 'b',
        posicao: ['(L - cubaL) / 2', '(P + 20 - cubaP) / 2'],
        largura: 'cubaP',
        comprimento: 'cubaL',
        profundidade: '10',
      },
    ],
  },
];

const TIPOS_PIA: Tipo[] = [
  { id: 'P80', nome: 'Base de pia 80', valores: { L: 800 } },
  { id: 'P100', nome: 'Base de pia 100', valores: { L: 1000 } },
  { id: 'P120', nome: 'Base de pia 120', valores: { L: 1200 } },
];

/** Base de pia com duas portas e tampo recortado para a cuba. */
export const FAMILIA_BASE_PIA: Familia = familia({
  id: 'fam_base_pia',
  nome: 'Base de pia',
  descricao: 'Base de cozinha com duas portas, sem prateleira, e tampo recortado para a cuba.',
  parametros: [...PARAMETROS_PIA, ...DERIVADOS_PIA],
  pecas: PECAS_PIA,
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '(hCorpo - rodape - 4 <= 900 ? 2 : hCorpo - rodape - 4 <= 1600 ? 3 : hCorpo - rodape - 4 <= 2200 ? 4 : 5) * nPortas', quando: 'nPortas > 0' },
    { id: 'puxador', nome: 'Puxador', quantidade: 'nPortas', quando: 'nPortas > 0' },
  ],
  conectores: conectoresDe('base'),
  tipos: TIPOS_PIA,
  tipoPadrao: 'P100',
});

const PARAMETROS_COOKTOP = [
  comprimento('L', 'Largura', 600, 600, 800, 10),
  comprimento('A', 'Altura', 720, 650, 900, 10),
  comprimento('P', 'Profundidade', 560, 560, 650, 10),
  comprimento('recorteL', 'Largura do recorte', 560, 460, 560, 10, 'tipo'),
  comprimento('recorteP', 'Profundidade do recorte', 490, 390, 490, 10, 'tipo'),
  comprimento('rodape', 'Altura do rodapé', 100, 80, 120, 10, 'tipo'),
  chapaCorpo(),
];

const DERIVADOS_COOKTOP = [
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('hCorpo', 'Altura do corpo', 'A - 25'),
  derivado('zBase', 'Cota do topo da base', 'rodape + esp'),
  derivado('vao', 'Vão interno útil', 'hCorpo - zBase'),
  derivado('yFundo', 'Face frontal do fundo (Y)', 'P - 21'),
  derivado('li', 'Largura interna', 'L - 2 * esp'),
  derivado('pg', 'Profundidade da gaveta', 'P - 30'),
  derivado('gavA', 'Altura do gavetão', 'min(250, vao - 20)'),
];

const PECAS_COOKTOP: Peca[] = PECAS_BASE.map((p) =>
  p.id === 'tampo'
    ? {
        ...p,
        nome: 'Tampo com recorte do cooktop',
        espessura: '25',
        quando: undefined,
        usinagens: [
          {
            id: 'cooktop',
            tipo: 'recorte',
            face: 'b',
            posicao: ['(L - recorteL) / 2', '(P + 20 - recorteP) / 2'],
            largura: 'recorteP',
            comprimento: 'recorteL',
            profundidade: '10',
          },
        ],
      }
    : p,
);

const TIPOS_COOKTOP: Tipo[] = [
  { id: 'C60', nome: 'Base de cooktop 60', valores: { L: 600 } },
  { id: 'C80', nome: 'Base de cooktop 80', valores: { L: 800 } },
];

/** Base de cooktop com gavetão alto, vão livre e tampo recortado. */
export const FAMILIA_BASE_COOKTOP: Familia = familia({
  id: 'fam_base_cooktop',
  nome: 'Base de cooktop',
  descricao: 'Base de cozinha com gavetão alto, vão livre acima e tampo recortado para o cooktop.',
  parametros: [...PARAMETROS_COOKTOP, ...DERIVADOS_COOKTOP],
  pecas: PECAS_COOKTOP,
  aninhados: [
    {
      id: 'gavetao',
      nome: 'Gavetão',
      familiaId: 'fam_gaveta',
      tipoId: 'alta',
      valores: { L: 'li', A: 'gavA', P: 'pg' },
      origem: ['esp', '0', 'zBase'],
    },
  ],
  ferragens: [
    { id: 'corredica', nome: 'Corrediça telescópica', quantidade: '1' },
    { id: 'puxador', nome: 'Puxador', quantidade: '1' },
  ],
  conectores: conectoresDe('base'),
  tipos: TIPOS_COOKTOP,
  tipoPadrao: 'C60',
});
