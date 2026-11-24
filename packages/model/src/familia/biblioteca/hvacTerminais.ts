import type { Familia } from '../tipos.ts';
import type { Verificacao } from '../tiposRepresentacao.ts';
import { bloco, comprimento } from './novosApoio.ts';
import { corpoHvac, familiaHvac, ligacaoAr, ligacaoArRedonda, ligacaoRefrigerante, MATERIAL_SPLIT, parametroCapacidade, parametroEspessura, retanguloPlanta } from './hvacApoio.ts';

/*
 * Terminais de ar e split (ficha F8, ADR 0061). Os difusores têm colarinho de altura A na origem (z = 0 no teto) e ligação de ar
 * no topo (z = A), saindo para +Z, para receber o duto. Difusores e grelha de seção quadrada usam P = L (verificação de erro).
 * A grelha de retorno é de parede: a face em y = 0 e a ligação de retorno no fundo (y = P). O split é a evaporadora de parede:
 * linhas de líquido e gás na traseira e a saída de ar na frente, embaixo; a capacidade é do tipo (BTU/h).
 */

const VERIFICA_QUADRADO: Verificacao = { id: 'ladoIgual', severidade: 'erro', condicao: 'P != L', mensagem: 'Terminal quadrado: P deve ser igual a L.' };
const VERIFICA_REDONDO: Verificacao = { id: 'diametroIgual', severidade: 'erro', condicao: 'P != L', mensagem: 'Terminal redondo: P deve ser igual a L (diâmetro).' };

// ───────────────────────── difusor quadrado de teto ─────────────────────────

export const FAMILIA_DIFUSOR_QUADRADO: Familia = familiaHvac({
  id: 'fam_difusor_quadrado',
  nome: 'Difusor quadrado de teto',
  categoria: 'terminal_ar',
  descricao: 'Difusor quadrado de teto: aro de face L × P com espessura e e colarinho de altura A. Ligação de insuflamento no topo do colarinho. CONFERIR: vazões e a face do aro por fabricante.',
  parametros: [comprimento('L', 'Lado', 600, 200, 1200, 10), comprimento('A', 'Altura do colarinho', 150, 50, 400, 5), comprimento('P', 'Lado (= L)', 600, 200, 1200, 10), comprimento('e', 'Espessura do aro', 10, 2, 30, 1)],
  corpos: [corpoHvac('aro', 'Aro', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'L', altura: 'P', espessura: 'e' }, comprimento: 'A' }, { origem: ['L / 2', 'P / 2', '0'] })],
  ligacoes: [ligacaoAr('ar', 'Entrada de ar (topo do colarinho)', 'ar_insuflamento', 'entrada', ['L / 2', 'P / 2', 'A'], ['0', '0', '1'], 'L - 2 * e', 'P - 2 * e')],
  simbolos: [{ id: 'planta', nome: 'Planta do difusor quadrado', vistas: ['planta'], plano: 'xy', substituiGeometria: true, primitivos: [retanguloPlanta('0', '0', 'L', 'P'), retanguloPlanta('e', 'e', 'L - e', 'P - e')] }],
  verificacoes: [VERIFICA_QUADRADO],
  tipos: [
    { id: 'q600', nome: 'Difusor quadrado 600 × 600 × 150', valores: { L: 600, A: 150, P: 600, e: 10 } },
    { id: 'q450', nome: 'Difusor quadrado 450 × 450 × 150', valores: { L: 450, A: 150, P: 450, e: 10 } },
    { id: 'q300', nome: 'Difusor quadrado 300 × 300 × 120', valores: { L: 300, A: 120, P: 300, e: 8 } },
  ],
  tipoPadrao: 'q600',
  ifc: 'IFCAIRTERMINAL',
});

// ───────────────────────── difusor redondo de teto ─────────────────────────

export const FAMILIA_DIFUSOR_REDONDO: Familia = familiaHvac({
  id: 'fam_difusor_redondo',
  nome: 'Difusor redondo de teto',
  categoria: 'terminal_ar',
  descricao: 'Difusor redondo de teto: aro de diâmetro L (P repete L) com espessura e e colarinho de altura A. Ligação de insuflamento no topo, com o diâmetro interno do colarinho. CONFERIR: vazões por fabricante.',
  parametros: [comprimento('L', 'Diâmetro', 250, 100, 500, 10), comprimento('A', 'Altura do colarinho', 150, 50, 400, 5), comprimento('P', 'Diâmetro (= L)', 250, 100, 500, 10), comprimento('e', 'Espessura do aro', 5, 2, 20, 1)],
  corpos: [corpoHvac('aro', 'Aro', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'anel', diametroExterno: 'L', diametroInterno: 'L - 2 * e' }, comprimento: 'A' }, { origem: ['L / 2', 'L / 2', '0'] })],
  ligacoes: [ligacaoArRedonda('ar', 'Entrada de ar (topo do colarinho)', 'ar_insuflamento', 'entrada', ['L / 2', 'L / 2', 'A'], ['0', '0', '1'], 'L - 2 * e')],
  simbolos: [
    {
      id: 'planta',
      nome: 'Planta do difusor redondo',
      vistas: ['planta'],
      plano: 'xy',
      substituiGeometria: true,
      primitivos: [
        { tipo: 'circulo', centro: ['L / 2', 'L / 2'], raio: 'L / 2' },
        { tipo: 'circulo', centro: ['L / 2', 'L / 2'], raio: 'L / 2 - e' },
      ],
    },
  ],
  verificacoes: [VERIFICA_REDONDO],
  tipos: [
    { id: 'r250', nome: 'Difusor redondo Ø250 × 150', valores: { L: 250, A: 150, P: 250, e: 5 } },
    { id: 'r300', nome: 'Difusor redondo Ø300 × 150', valores: { L: 300, A: 150, P: 300, e: 8 } },
    { id: 'r400', nome: 'Difusor redondo Ø400 × 200', valores: { L: 400, A: 200, P: 400, e: 10 } },
  ],
  tipoPadrao: 'r250',
  ifc: 'IFCAIRTERMINAL',
});

// ───────────────────────── grelha de retorno ─────────────────────────

export const FAMILIA_GRELHA: Familia = familiaHvac({
  id: 'fam_grelha',
  nome: 'Grelha de retorno de parede',
  categoria: 'terminal_ar',
  descricao: 'Grelha de retorno de parede: quadro de L × A com espessura e, com P de profundidade até o duto. Ligação de retorno no fundo (y = P). CONFERIR: a área livre e as lâminas por fabricante.',
  hospedagem: 'parede',
  parametros: [comprimento('L', 'Largura', 400, 150, 1000, 10), comprimento('A', 'Altura', 200, 100, 600, 10), comprimento('P', 'Profundidade até o duto', 150, 50, 400, 10), parametroEspessura(5, 1, 10)],
  corpos: [corpoHvac('quadro', 'Quadro da grelha', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'L', altura: 'A', espessura: 'e' }, comprimento: 'P' }, { origem: ['L / 2', '0', 'A / 2'], rotacao: ['-90', '0', '0'] })],
  ligacoes: [ligacaoAr('retorno', 'Retorno ao duto (fundo)', 'ar_retorno', 'saida', ['L / 2', 'P', 'A / 2'], ['0', '1', '0'], 'L - 2 * e', 'A - 2 * e')],
  simbolos: [
    {
      id: 'planta',
      nome: 'Planta da grelha',
      vistas: ['planta'],
      plano: 'xy',
      substituiGeometria: true,
      primitivos: [retanguloPlanta('0', '0', 'L', 'P'), { tipo: 'linha', de: ['0', 'P / 3'], ate: ['L', 'P / 3'] }, { tipo: 'linha', de: ['0', '2 * P / 3'], ate: ['L', '2 * P / 3'] }],
    },
  ],
  tipos: [
    { id: 'g400x200', nome: 'Grelha de retorno 400 × 200', valores: { L: 400, A: 200, P: 150, e: 5 } },
    { id: 'g600x150', nome: 'Grelha de retorno 600 × 150', valores: { L: 600, A: 150, P: 150, e: 5 } },
    { id: 'g300x300', nome: 'Grelha de retorno 300 × 300', valores: { L: 300, A: 300, P: 120, e: 4 } },
  ],
  tipoPadrao: 'g400x200',
});

// ───────────────────────── split de parede (evaporadora) ─────────────────────────

export const FAMILIA_SPLIT_EVAPORADORA: Familia = familiaHvac({
  id: 'fam_split_evaporadora',
  nome: 'Split de parede (evaporadora)',
  categoria: 'equipamento',
  descricao: 'Unidade evaporadora de split de parede: caixa L × A × P com a base em hInst. Linhas de líquido e gás (refrigerante) na traseira e saída de ar na frente, embaixo. Capacidade em BTU/h por tipo. CONFERIR: dimensões e tubulação por fabricante.',
  hospedagem: 'parede',
  parametros: [
    comprimento('L', 'Largura', 900, 600, 1200, 10),
    comprimento('A', 'Altura', 290, 200, 400, 5),
    comprimento('P', 'Profundidade', 200, 150, 300, 5),
    comprimento('hInst', 'Altura de instalação (piso → base)', 1900, 0, 2700, 10),
    parametroCapacidade(12000),
  ],
  pecas: [bloco('corpo', 'Unidade interna', '0', '0', 'hInst', 'L', 'P', 'A', MATERIAL_SPLIT)],
  ligacoes: [
    ligacaoRefrigerante('liquido', 'Linha de líquido', ['L - 80', 'P', 'hInst + A - 60'], ['0', '1', '0'], '6.35'),
    ligacaoRefrigerante('gas', 'Linha de gás', ['L - 50', 'P', 'hInst + A - 60'], ['0', '1', '0'], '12.7'),
    { ...ligacaoAr('ar', 'Saída de ar (frente)', 'ar_insuflamento', 'saida', ['L / 2', '0', 'hInst'], ['0', '-1', '0'], 'L * 0.8', '40'), propriedades: { capacidade: 'capacidade' } },
  ],
  simbolos: [{ id: 'planta', nome: 'Planta do split', vistas: ['planta'], plano: 'xy', substituiGeometria: true, primitivos: [retanguloPlanta('0', '0', 'L', 'P')] }],
  tipos: [
    { id: 'btu9000', nome: 'Split parede 9000 BTU (800 × 250 × 190)', valores: { L: 800, A: 250, P: 190, hInst: 1900, capacidade: 9000 } },
    { id: 'btu12000', nome: 'Split parede 12000 BTU (900 × 290 × 200)', valores: { L: 900, A: 290, P: 200, hInst: 1900, capacidade: 12000 } },
    { id: 'btu18000', nome: 'Split parede 18000 BTU (1000 × 320 × 210)', valores: { L: 1000, A: 320, P: 210, hInst: 1900, capacidade: 18000 } },
  ],
  tipoPadrao: 'btu12000',
});

/** Terminais de ar e split da ficha F8. */
export const HVAC_TERMINAIS: Familia[] = [FAMILIA_DIFUSOR_QUADRADO, FAMILIA_DIFUSOR_REDONDO, FAMILIA_GRELHA, FAMILIA_SPLIT_EVAPORADORA];
