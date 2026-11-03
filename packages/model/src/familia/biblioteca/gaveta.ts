import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia, type Parametro } from '../tipos.ts';

/*
 * Gaveta: módulo reutilizável (caixa de chapa com frente, 2 laterais, traseira e fundo), usado como família aninhada em bases, cômodas
 * e paneleiros. Origem no canto frontal esquerdo inferior da FRENTE. L = largura da frente (o vão), A = altura da frente, P = profundidade
 * da caixa. Folga de 13 mm de cada lado para a corrediça; a caixa fica 25 mm acima e abaixo da borda da frente. Medidas em mm; valores
 * PROPOSTOS pelo Hestia, a validar com fabricante de corrediça (ADR 0049 R5).
 */

const comp = (id: string, nome: string, padrao: number, min: number, max: number, passo: number): Parametro =>
  ({ id, nome, tipo: 'comprimento', escopo: 'instancia', padrao, min, max, passo, grupo: 'Dimensões' });
const derivado = (id: string, nome: string, formula: string): Parametro => ({ id, nome, tipo: 'numero', escopo: 'tipo', padrao: 0, formula, grupo: 'Derivados' });

export const FAMILIA_GAVETA: Familia = {
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_gaveta',
  nome: 'Gaveta',
  categoria: 'marcenaria',
  descricao: 'Caixa de gaveta com frente, laterais, traseira e fundo, e corrediça telescópica.',
  unidade: 'mm',
  hospedagem: 'nivel',
  origem: 'canto',
  parametros: [
    comp('L', 'Largura da frente', 600, 250, 1200, 10),
    comp('A', 'Altura da frente', 150, 80, 400, 10),
    comp('P', 'Profundidade da caixa', 500, 250, 600, 10),
    { id: 'corpo', nome: 'Chapa da caixa', tipo: 'chapa', escopo: 'tipo', padrao: 'mdf15', grupo: 'Material', opcoes: [{ valor: 'mdf15', rotulo: 'MDF 15 mm', esp: 15 }, { valor: 'mdf18', rotulo: 'MDF 18 mm', esp: 18 }] },
    derivado('esp', 'Espessura da caixa', 'corpo.esp'),
    derivado('folga', 'Folga lateral da corrediça', '13'),
    derivado('pc', 'Profundidade útil da caixa', 'P - 50'),
    derivado('hc', 'Altura da caixa', 'A - 50'),
    derivado('li', 'Largura interna da caixa', 'L - 2 * folga - 2 * esp'),
  ],
  planos: [],
  pecas: [
    { id: 'frente', nome: 'Frente', papel: 'frente_gaveta', eixo: 'y', origem: ['0', '-18', '0'], tamanho: ['L', 'A'], espessura: '18', material: 'mat_porta', fita: { n: 'fita_pvc', s: 'fita_pvc', l: 'fita_pvc', o: 'fita_pvc' }, veio: 'a' },
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['folga', '0', '25'], tamanho: ['pc', 'hc'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' }, veio: 'a' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - folga - esp', '0', '25'], tamanho: ['pc', 'hc'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' }, veio: 'a' },
    { id: 'traseira', nome: 'Traseira', papel: 'painel', eixo: 'y', origem: ['folga + esp', 'pc - esp', '25'], tamanho: ['li', 'hc'], espessura: 'esp', material: 'corpo', veio: 'a' },
    { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'z', origem: ['folga + esp', '0', '33'], tamanho: ['li', 'pc - esp'], espessura: '6', material: 'mat_fundo', veio: 'livre' },
  ],
  aninhados: [],
  ferragens: [
    { id: 'corredica', nome: 'Corrediça telescópica', quantidade: '1' },
    { id: 'puxador', nome: 'Puxador', quantidade: '1' },
  ],
  tipos: [
    { id: 'baixa', nome: 'Gaveta baixa (150)', valores: { A: 150 } },
    { id: 'alta', nome: 'Gaveta alta (250)', valores: { A: 250 } },
  ],
  tipoPadrao: 'baixa',
};
