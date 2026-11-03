import type { Familia, Peca, Tipo } from '../tipos.ts';
import { chapaCorpo, comprimento, derivado, familia, FITA, inteiro } from './cozinhaComum.ts';

/*
 * Armários aéreos de cozinha (ficha E7-cozinha). Ficam suspensos: a cota inferior é `zFixacao` e não há rodapé nem tampo.
 * Medidas em milímetros; as folgas são PROPOSTAS do Hestia, a validar com marceneiro (ADR 0049 R5).
 */

const PECAS_CAIXA = (comPrateleiras: boolean): Peca[] => [
  { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zFixacao'], tamanho: ['P', 'A'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
  { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zFixacao'], tamanho: ['P', 'A'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
  { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['esp', '0', 'zFixacao'], tamanho: ['L - 2 * esp', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
  { id: 'topo', nome: 'Topo', papel: 'topo', eixo: 'z', origem: ['esp', '0', 'zFixacao + A - esp'], tamanho: ['L - 2 * esp', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
  { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - 6', 'zFixacao + esp'], tamanho: ['L - 2 * esp', 'A - 2 * esp'], espessura: '6', material: 'mat_fundo', veio: 'livre' },
  ...(comPrateleiras
    ? [{
        id: 'prateleira',
        nome: 'Prateleira',
        papel: 'prateleira' as const,
        eixo: 'z' as const,
        origem: ['esp', '0', 'zFixacao + esp + i * (vao - esp * nPrat) / (nPrat + 1) + (i - 1) * esp'] as [string, string, string],
        tamanho: ['L - 2 * esp', 'P - 6'] as [string, string],
        espessura: 'esp',
        material: 'corpo',
        fita: { n: FITA },
        veio: 'a' as const,
        repetir: 'nPrat',
        quando: 'nPrat > 0',
      }]
    : []),
  {
    id: 'porta',
    nome: 'Porta',
    papel: 'porta',
    eixo: 'y',
    origem: ['(i - 1) * (L / nPortas) + 2', '-18', 'zFixacao + 2'],
    tamanho: ['L / nPortas - 4', 'A - 4'],
    espessura: '18',
    material: 'mat_porta',
    fita: { n: FITA, s: FITA, l: FITA, o: FITA },
    veio: 'b',
    repetir: 'nPortas',
    quando: 'nPortas > 0',
  },
];

const DERIVADOS_AEREO = [
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('vao', 'Vão interno útil', 'A - 2 * esp'),
];

const TIPOS_AEREO: Tipo[] = [
  { id: 'A40', nome: 'Aéreo 40 (1 porta)', valores: { L: 400, nPortas: 1 } },
  { id: 'A60', nome: 'Aéreo 60 (2 portas)', valores: { L: 600, nPortas: 2 } },
  { id: 'A80', nome: 'Aéreo 80 (2 portas)', valores: { L: 800, nPortas: 2 } },
];

/** Aéreo com 1 ou 2 portas e prateleiras reguláveis. */
export const FAMILIA_AEREO: Familia = familia({
  id: 'fam_aereo',
  nome: 'Armário aéreo',
  descricao: 'Armário aéreo de cozinha com portas, prateleiras e fundo, fixado acima do tampo.',
  parametros: [
    comprimento('L', 'Largura', 600, 400, 900, 10),
    comprimento('A', 'Altura', 700, 400, 900, 10),
    comprimento('P', 'Profundidade', 320, 250, 400, 10),
    comprimento('zFixacao', 'Cota de fixação (fundo do móvel)', 1400, 1000, 2000, 10),
    inteiro('nPortas', 'Portas', 2, 0, 2),
    inteiro('nPrat', 'Prateleiras', 2, 0, 4),
    chapaCorpo(),
    ...DERIVADOS_AEREO,
  ],
  pecas: PECAS_CAIXA(true),
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '2 * nPortas', quando: 'nPortas > 0' },
    { id: 'puxador', nome: 'Puxador', quantidade: 'nPortas', quando: 'nPortas > 0' },
    { id: 'pino', nome: 'Pino de prateleira', quantidade: '4 * nPrat', quando: 'nPrat > 0' },
  ],
  tipos: TIPOS_AEREO,
  tipoPadrao: 'A60',
});

const DERIVADOS_BASCULANTE = [
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
];

const PECAS_BASCULANTE: Peca[] = [
  ...PECAS_CAIXA(false).filter((p) => p.id !== 'porta'),
  {
    id: 'porta',
    nome: 'Porta basculante',
    papel: 'porta',
    eixo: 'y',
    origem: ['2', '-18', 'zFixacao + 2'],
    tamanho: ['L - 4', 'A - 4'],
    espessura: '18',
    material: 'mat_porta',
    fita: { n: FITA, s: FITA, l: FITA, o: FITA },
    veio: 'b',
  },
];

const TIPOS_BASCULANTE: Tipo[] = [
  { id: 'B60', nome: 'Basculante 60', valores: { L: 600 } },
  { id: 'B80', nome: 'Basculante 80', valores: { L: 800 } },
  { id: 'B100', nome: 'Basculante 100', valores: { L: 1000 } },
];

/** Aéreo basculante com porta única e duas dobradiças. */
export const FAMILIA_AEREO_BASCULANTE: Familia = familia({
  id: 'fam_aereo_basculante',
  nome: 'Aéreo basculante',
  descricao: 'Armário aéreo basculante de cozinha com porta única, duas dobradiças e fundo.',
  parametros: [
    comprimento('L', 'Largura', 800, 600, 1000, 10),
    comprimento('A', 'Altura', 400, 300, 500, 10),
    comprimento('P', 'Profundidade', 320, 250, 400, 10),
    comprimento('zFixacao', 'Cota de fixação (fundo do móvel)', 1400, 1000, 2000, 10),
    chapaCorpo(),
    ...DERIVADOS_BASCULANTE,
  ],
  pecas: PECAS_BASCULANTE,
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '2' },
    { id: 'puxador', nome: 'Puxador', quantidade: '1' },
  ],
  tipos: TIPOS_BASCULANTE,
  tipoPadrao: 'B80',
});
