import type { Familia, Peca, Tipo } from '../tipos.ts';
import { PECAS_BASE } from './cozinhaBases.ts';
import { conectoresDe } from './conectores.ts';
import { chapaCorpo, comprimento, derivado, enumerado, familia, FITA } from './cozinhaComum.ts';

/*
 * Torres de cozinha (ficha E7-cozinha): torre de forno e paneleiro. Medidas em milímetros; as folgas e as cotas do nicho
 * são PROPOSTAS do Hestia, a validar com marceneiro ou fabricante do forno (ADR 0049 R5).
 */

const TAMPAS = [
  { valor: 'sem', rotulo: 'Sem tampo' },
  { valor: 'comum', rotulo: 'Comum (25 mm)' },
  { valor: 'engrossado', rotulo: 'Engrossado (38 mm)' },
];

const PECAS_TORRE_FORNO: Peca[] = [
  { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zBase'], tamanho: ['P', 'A - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
  { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zBase'], tamanho: ['P', 'A - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
  { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', 'rodape'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
  { id: 'topo', nome: 'Topo', papel: 'topo', eixo: 'z', origem: ['esp', '0', 'A - esp'], tamanho: ['L - 2 * esp', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
  { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'yFundo', 'zBase'], tamanho: ['L - 2 * esp', 'A - esp - zBase'], espessura: '6', material: 'mat_fundo', veio: 'livre' },
  { id: 'rodap', nome: 'Rodapé', papel: 'rodape', eixo: 'y', origem: ['esp', '50', '0'], tamanho: ['L - 2 * esp', 'rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a', quando: 'rodape > 0' },
  { id: 'divBaixa', nome: 'Divisória inferior do forno', papel: 'divisoria', eixo: 'z', origem: ['esp', '0', 'zNicho - esp'], tamanho: ['L - 2 * esp', 'yFundo'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
  { id: 'divAlta', nome: 'Divisória superior do forno', papel: 'divisoria', eixo: 'z', origem: ['esp', '0', 'zFornoTopo'], tamanho: ['L - 2 * esp', 'yFundo'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
  { id: 'portaBaixa', nome: 'Porta inferior', papel: 'porta', eixo: 'y', origem: ['2', '-18', 'zBase + 2'], tamanho: ['L - 4', 'hBaixo - 4'], espessura: '18', material: 'mat_porta', fita: { n: FITA, s: FITA, l: FITA, o: FITA }, veio: 'b' },
  { id: 'portaAlta', nome: 'Porta superior', papel: 'porta', eixo: 'y', origem: ['2', '-18', 'zFornoTopo + esp'], tamanho: ['L - 4', 'hCima - esp - 2'], espessura: '18', material: 'mat_porta', fita: { n: FITA, s: FITA, l: FITA, o: FITA }, veio: 'b' },
];

const TIPOS_TORRE_FORNO: Tipo[] = [
  { id: 'T60', nome: 'Torre de forno 60', valores: { L: 600 } },
  { id: 'T70', nome: 'Torre de forno 70', valores: { L: 700 } },
];

/** Torre alta com nicho de forno aberto, porta inferior e porta superior. */
export const FAMILIA_TORRE_FORNO: Familia = familia({
  id: 'fam_torre_forno',
  nome: 'Torre de forno',
  descricao: 'Torre alta de cozinha com nicho de forno sem porta, armário inferior e armário superior.',
  parametros: [
    comprimento('L', 'Largura', 600, 600, 700, 10),
    comprimento('A', 'Altura', 2100, 1800, 2400, 10),
    comprimento('P', 'Profundidade', 580, 520, 650, 10),
    comprimento('hForno', 'Altura do nicho do forno', 600, 500, 700, 10, 'tipo'),
    comprimento('rodape', 'Altura do rodapé', 100, 80, 120, 10, 'tipo'),
    chapaCorpo(),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
    derivado('zBase', 'Cota do topo da base', 'rodape + esp'),
    derivado('interior', 'Altura interna entre base e topo', 'A - esp - zBase'),
    derivado('hBaixo', 'Altura do compartimento inferior', 'clamp(interior * 0.25, 300, 800)'),
    derivado('zNicho', 'Cota do fundo do nicho do forno', 'zBase + hBaixo'),
    derivado('zFornoTopo', 'Cota do topo do nicho do forno', 'zNicho + hForno'),
    derivado('hCima', 'Altura do compartimento superior', 'A - esp - zFornoTopo'),
    derivado('yFundo', 'Face frontal do fundo (Y)', 'P - 21'),
  ],
  pecas: PECAS_TORRE_FORNO,
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '4' },
    { id: 'puxador', nome: 'Puxador', quantidade: '2' },
  ],
  conectores: conectoresDe('torre'),
  tipos: TIPOS_TORRE_FORNO,
  tipoPadrao: 'T60',
});

const TIPOS_PANELEIRO: Tipo[] = [
  { id: 'PL40', nome: 'Paneleiro 40', valores: { L: 400 } },
  { id: 'PL50', nome: 'Paneleiro 50', valores: { L: 500 } },
];

/** Torre baixa com quatro gavetas altas e carcaça completa. */
export const FAMILIA_PANELEIRO: Familia = familia({
  id: 'fam_paneleiro',
  nome: 'Paneleiro',
  descricao: 'Torre baixa de cozinha com carcaça completa e quatro gavetas altas empilhadas.',
  parametros: [
    comprimento('L', 'Largura', 400, 400, 500, 10),
    comprimento('A', 'Altura', 900, 800, 1000, 10),
    comprimento('P', 'Profundidade', 560, 500, 650, 10),
    comprimento('rodape', 'Altura do rodapé', 100, 80, 120, 10, 'tipo'),
    chapaCorpo(),
    enumerado('tampo', 'Tampo', 'comum', TAMPAS),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
    derivado('tampoEsp', 'Espessura do tampo', 'tampo == "sem" ? 0 : (tampo == "comum" ? 25 : 38)'),
    derivado('hCorpo', 'Altura do corpo', 'A - tampoEsp'),
    derivado('zBase', 'Cota do topo da base', 'rodape + esp'),
    derivado('vao', 'Vão interno útil', 'hCorpo - zBase'),
    derivado('yFundo', 'Face frontal do fundo (Y)', 'P - 21'),
    derivado('li', 'Largura interna', 'L - 2 * esp'),
    derivado('pg', 'Profundidade da gaveta', 'P - 30'),
    derivado('hG', 'Altura de cada gaveta', 'floor(vao / 4)'),
  ],
  pecas: PECAS_BASE,
  aninhados: [
    {
      id: 'gaveta',
      nome: 'Gaveta',
      familiaId: 'fam_gaveta',
      tipoId: 'alta',
      valores: { L: 'li', A: 'hG', P: 'pg' },
      origem: ['esp', '0', 'zBase + (i - 1) * hG'],
      repetir: '4',
    },
  ],
  ferragens: [
    { id: 'corredica', nome: 'Corrediça telescópica', quantidade: '4' },
    { id: 'puxador', nome: 'Puxador', quantidade: '4' },
  ],
  conectores: conectoresDe('torre'),
  tipos: TIPOS_PANELEIRO,
  tipoPadrao: 'PL40',
});

