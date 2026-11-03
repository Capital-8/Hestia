import type { Peca } from '../tipos.ts';
import { chapaCorpo, comprimento, criarFamilia, derivado } from './salaAreasComum.ts';

/*
 * Gabinete de banheiro suspenso: base, laterais, fundo, duas portas e tampo de 25 mm com recorte central da cuba. A cota
 * de fixação (`zFixacao`) é a altura da face inferior da base. Medidas em mm.
 */

const ESP_TAMPO = '25';

const PARAMETROS = [
  comprimento('L', 'Largura', 800, 600, 1000),
  comprimento('A', 'Altura', 500, 400, 700),
  comprimento('P', 'Profundidade', 450, 350, 600),
  comprimento('zFixacao', 'Cota de fixação', 450, 300, 1500),
  comprimento('cubaL', 'Largura da cuba', 400, 200, 500, 10, 'tipo'),
  comprimento('cubaP', 'Profundidade da cuba', 300, 150, 400, 10, 'tipo'),
  chapaCorpo(),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('zBase', 'Cota do topo da base', 'zFixacao + esp'),
  derivado('hLateral', 'Altura interna entre base e tampo', `A - esp - ${ESP_TAMPO}`),
  derivado('hPorta', 'Altura das portas', 'hLateral - 4'),
  derivado('cubaLUsada', 'Largura útil do recorte', 'clamp(cubaL, 100, L - 40)'),
  derivado('cubaPUsada', 'Profundidade útil do recorte', 'clamp(cubaP, 100, P - 40)'),
  derivado('cubaX', 'Posição X do recorte', '(L - cubaLUsada) / 2'),
  derivado('cubaY', 'Posição Y do recorte', '(P - cubaPUsada) / 2'),
];

const PECAS: Peca[] = [
  { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', 'zFixacao'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zBase'], tamanho: ['P', 'hLateral'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zBase'], tamanho: ['P', 'hLateral'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - 6', 'zBase'], tamanho: ['L - 2 * esp', 'hLateral'], espessura: '6', material: 'mat_fundo' },
  {
    id: 'porta', nome: 'Porta', papel: 'porta', eixo: 'y', repetir: '2',
    origem: ['(i - 1) * (L / 2) + 2', '-18', 'zBase + 2'],
    tamanho: ['L / 2 - 4', 'hPorta'], espessura: '18', material: 'mat_porta',
    fita: { n: 'fita_pvc', s: 'fita_pvc', l: 'fita_pvc', o: 'fita_pvc' },
  },
  {
    id: 'tampo', nome: 'Tampo com recorte da cuba', papel: 'tampo', eixo: 'z',
    origem: ['0', '0', `zFixacao + A - ${ESP_TAMPO}`], tamanho: ['L', 'P'], espessura: ESP_TAMPO, material: 'mat_tampo',
    fita: { n: 'fita_pvc' },
    usinagens: [
      {
        id: 'cuba', tipo: 'recorte', face: 'a',
        posicao: ['cubaX', 'cubaY'],
        largura: 'cubaPUsada', comprimento: 'cubaLUsada',
        profundidade: 'passante',
      },
    ],
  },
];

export const FAMILIA_GABINETE_BANHEIRO = criarFamilia({
  id: 'fam_gabinete_banheiro',
  nome: 'Gabinete de banheiro',
  descricao: 'Gabinete suspenso de banheiro com duas portas e tampo com recorte central para a cuba.',
  parametros: PARAMETROS,
  planos: [],
  pecas: PECAS,
  aninhados: [],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '4' },
    { id: 'puxador', nome: 'Puxador', quantidade: '2' },
  ],
  tipos: [
    { id: 'gab60', nome: 'Gabinete 60', valores: { L: 600 } },
    { id: 'gab80', nome: 'Gabinete 80', valores: { L: 800 } },
    { id: 'gab100', nome: 'Gabinete 100', valores: { L: 1000 } },
  ],
  tipoPadrao: 'gab80',
});
