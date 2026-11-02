import type { Valor } from './expressao.ts';

/*
 * Família de exemplo do protótipo de interface (ADR 0049): um armário baixo de marcenaria. Os nomes de parâmetros, papéis
 * e regras de montagem são PROPOSTA do Hestia, a validar com marceneiro ou fabricante. Medidas em milímetros (como a
 * interface as mostra); o modelo real guarda metros. Tudo aqui é dado puro: a família é texto, a geometria sai da resolução.
 */

export interface Param {
  id: string;
  nome: string;
  tipo: 'comprimento' | 'chapa' | 'enum' | 'inteiro';
  escopo: 'tipo' | 'instância';
  ctl: 'num' | 'sel';
  min?: number;
  max?: number;
  step?: number;
  opts?: Array<string | number>;
}
export interface Derivado { id: string; nome: string; f: string }
export type Papel = 'lateral' | 'base' | 'travessa' | 'prateleira' | 'fundo' | 'porta' | 'rodape' | 'tampo';
export type Cor = 'corpo' | 'porta' | 'tampo' | 'fundo';
export type Eixo = 'x' | 'y' | 'z';
export type CampoFormula = 'ox' | 'oy' | 'oz' | 'a' | 'b' | 't' | 'n' | 'when';
export const CAMPOS: readonly CampoFormula[] = ['ox', 'oy', 'oz', 'a', 'b', 't', 'n', 'when'];

export interface Peca {
  id: string;
  nome: string;
  papel: Papel;
  cor: Cor;
  /** Direção da espessura (ADR §3.3): x → a=profundidade, b=altura; y → a=largura, b=altura; z → a=largura, b=profundidade. */
  eixo: Eixo;
  ox: string;
  oy: string;
  oz: string;
  a: string;
  b: string;
  t: string;
  fita: string;
  veio: string;
  usin: string;
  n?: string;
  when?: string;
}
export interface Tipo { id: string; nome: string; v: Record<string, Valor> }
export type Valores = Record<string, Valor>;

export const PARAMS: Param[] = [
  { id: 'L', nome: 'Largura (L)', tipo: 'comprimento', escopo: 'instância', ctl: 'num', min: 300, max: 1200, step: 10 },
  { id: 'A', nome: 'Altura (A)', tipo: 'comprimento', escopo: 'instância', ctl: 'num', min: 600, max: 900, step: 10 },
  { id: 'P', nome: 'Profundidade (P)', tipo: 'comprimento', escopo: 'instância', ctl: 'num', min: 300, max: 700, step: 10 },
  { id: 'corpo', nome: 'Chapa do corpo (mm)', tipo: 'chapa', escopo: 'tipo', ctl: 'sel', opts: [15, 18, 25] },
  { id: 'montagem', nome: 'Montagem', tipo: 'enum', escopo: 'tipo', ctl: 'sel', opts: ['laterais_sobre_base', 'base_entre_laterais'] },
  { id: 'fundo', nome: 'Fundo', tipo: 'enum', escopo: 'tipo', ctl: 'sel', opts: ['sem', 'pregado', 'encaixado'] },
  { id: 'tampo', nome: 'Tampo', tipo: 'enum', escopo: 'tipo', ctl: 'sel', opts: ['sem', 'comum', 'engrossado'] },
  { id: 'nPrat', nome: 'Prateleiras', tipo: 'inteiro', escopo: 'tipo', ctl: 'num', min: 0, max: 6, step: 1 },
  { id: 'nPortas', nome: 'Portas', tipo: 'inteiro', escopo: 'tipo', ctl: 'num', min: 0, max: 2, step: 1 },
  { id: 'rodape', nome: 'Altura do rodapé', tipo: 'comprimento', escopo: 'tipo', ctl: 'num', min: 0, max: 150, step: 10 },
];

export const DERIVADOS: Derivado[] = [
  { id: 'esp', nome: 'Espessura do corpo', f: 'corpo' },
  { id: 'zBase', nome: 'Cota do topo da base', f: 'rodape + esp' },
  { id: 'tampoEsp', nome: 'Espessura do tampo', f: 'tampo == "sem" ? 0 : (tampo == "comum" ? 25 : 38)' },
  { id: 'hCorpo', nome: 'Altura do corpo', f: 'A - tampoEsp' },
  { id: 'fundoEsp', nome: 'Espessura do fundo', f: 'fundo == "sem" ? 0 : 6' },
  { id: 'profL', nome: 'Profundidade da lateral', f: 'P - (fundo == "pregado" ? fundoEsp : 0)' },
  { id: 'vao', nome: 'Vão interno útil', f: 'hCorpo - esp - zBase' },
  { id: 'yFundo', nome: 'Face frontal do fundo (Y)', f: 'fundo == "sem" ? P : (fundo == "pregado" ? P - fundoEsp : P - fundoEsp - 15)' },
];

const SOBRE = 'montagem == "laterais_sobre_base" ? zBase : rodape';
export const PECAS_INICIAIS: Peca[] = [
  { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', cor: 'corpo', eixo: 'x', ox: '0', oy: '0', oz: SOBRE, a: 'profL', b: 'hCorpo - oz', t: 'esp', fita: 'frente', veio: 'altura', usin: '2 * nPrat + 4' },
  { id: 'latD', nome: 'Lateral direita', papel: 'lateral', cor: 'corpo', eixo: 'x', ox: 'L - esp', oy: '0', oz: SOBRE, a: 'profL', b: 'hCorpo - oz', t: 'esp', fita: 'frente', veio: 'altura', usin: '2 * nPrat + 4' },
  { id: 'base', nome: 'Base', papel: 'base', cor: 'corpo', eixo: 'z', ox: 'montagem == "base_entre_laterais" ? esp : 0', oy: '0', oz: 'rodape', a: 'montagem == "base_entre_laterais" ? L - 2 * esp : L', b: 'profL', t: 'esp', fita: 'frente', veio: 'largura', usin: '4' },
  { id: 'trF', nome: 'Travessa frontal', papel: 'travessa', cor: 'corpo', eixo: 'z', ox: 'esp', oy: '0', oz: 'hCorpo - esp', a: 'L - 2 * esp', b: '80', t: 'esp', fita: 'nenhuma', veio: 'largura', usin: '2' },
  { id: 'trT', nome: 'Travessa traseira', papel: 'travessa', cor: 'corpo', eixo: 'z', ox: 'esp', oy: 'yFundo - 80', oz: 'hCorpo - esp', a: 'L - 2 * esp', b: '80', t: 'esp', fita: 'nenhuma', veio: 'largura', usin: '2' },
  { id: 'prat', nome: 'Prateleira', papel: 'prateleira', cor: 'corpo', eixo: 'z', ox: 'esp', oy: '20', oz: 'zBase + i * (vao - esp * nPrat) / (nPrat + 1) + (i - 1) * esp', a: 'L - 2 * esp', b: 'yFundo - 20', t: 'esp', fita: 'frente', veio: 'largura', usin: '0', n: 'nPrat' },
  { id: 'fundo', nome: 'Fundo', papel: 'fundo', cor: 'fundo', eixo: 'y', ox: 'fundo == "pregado" ? 0 : esp', oy: 'yFundo', oz: 'fundo == "pregado" ? rodape : zBase', a: 'fundo == "pregado" ? L : L - 2 * esp', b: 'hCorpo - oz', t: 'fundoEsp', fita: 'nenhuma', veio: 'livre', usin: '0', when: 'fundo != "sem"' },
  { id: 'porta', nome: 'Porta', papel: 'porta', cor: 'porta', eixo: 'y', ox: '(i - 1) * (L / nPortas) + 2', oy: '-18', oz: 'rodape + 2', a: 'L / nPortas - 4', b: 'hCorpo - rodape - 4', t: '18', fita: '4 lados', veio: 'altura', usin: '4', n: 'nPortas', when: 'nPortas > 0' },
  { id: 'rodap', nome: 'Rodapé', papel: 'rodape', cor: 'corpo', eixo: 'y', ox: 'esp', oy: '50', oz: '0', a: 'L - 2 * esp', b: 'rodape', t: 'esp', fita: 'topo', veio: 'largura', usin: '0', when: 'rodape > 0' },
  { id: 'tampo', nome: 'Tampo', papel: 'tampo', cor: 'tampo', eixo: 'z', ox: '0', oy: '-20', oz: 'hCorpo', a: 'L', b: 'P + 20', t: 'tampoEsp', fita: 'frente', veio: 'largura', usin: '0', when: 'tampo != "sem"' },
];

export const TIPOS: Tipo[] = [
  { id: 'A60', nome: 'Armário 60 (1 porta)', v: { L: 600, A: 720, P: 560, corpo: 18, montagem: 'laterais_sobre_base', fundo: 'encaixado', tampo: 'comum', nPrat: 1, nPortas: 1, rodape: 100 } },
  { id: 'A80', nome: 'Armário 80 (2 portas)', v: { L: 800, A: 720, P: 560, corpo: 18, montagem: 'laterais_sobre_base', fundo: 'encaixado', tampo: 'comum', nPrat: 1, nPortas: 2, rodape: 100 } },
  { id: 'A100', nome: 'Armário 100 (2 portas)', v: { L: 1000, A: 720, P: 560, corpo: 18, montagem: 'base_entre_laterais', fundo: 'pregado', tampo: 'engrossado', nPrat: 1, nPortas: 2, rodape: 100 } },
  { id: 'A120', nome: 'Armário 120 aberto', v: { L: 1200, A: 720, P: 560, corpo: 25, montagem: 'laterais_sobre_base', fundo: 'sem', tampo: 'comum', nPrat: 2, nPortas: 0, rodape: 80 } },
];
