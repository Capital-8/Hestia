import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia, type Parametro, type Peca } from './tipos.ts';
import { conectoresDe } from './biblioteca/conectores.ts';
import { comEscolhas } from './biblioteca/escolhas.ts';

/*
 * Família de exemplo (armário baixo de marcenaria) usada pelos testes e pela interface. Os nomes de parâmetros, papéis e
 * regras de montagem são PROPOSTA do Hestia, a validar com marceneiro ou fabricante (ADR 0049 R5). Medidas em mm.
 */

const comprimento = (id: string, nome: string, padrao: number, min: number, max: number, passo: number, escopo: 'tipo' | 'instancia'): Parametro =>
  ({ id, nome, tipo: 'comprimento', escopo, padrao, min, max, passo, grupo: 'Dimensões' });
const derivado = (id: string, nome: string, formula: string): Parametro => ({ id, nome, tipo: 'numero', escopo: 'tipo', padrao: 0, formula, grupo: 'Derivados' });

const SOBRE = 'montagem == "laterais_sobre_base" ? zBase : rodape';

const PARAMETROS: Parametro[] = [
  comprimento('L', 'Largura', 800, 300, 1200, 10, 'instancia'),
  comprimento('A', 'Altura', 720, 600, 900, 10, 'instancia'),
  comprimento('P', 'Profundidade', 560, 300, 700, 10, 'instancia'),
  { id: 'corpo', nome: 'Chapa do corpo', tipo: 'chapa', escopo: 'tipo', padrao: 'mdf18', grupo: 'Material', opcoes: [{ valor: 'mdf15', rotulo: 'MDF 15 mm', esp: 15 }, { valor: 'mdf18', rotulo: 'MDF 18 mm', esp: 18 }, { valor: 'mdf25', rotulo: 'MDF 25 mm', esp: 25 }] },
  { id: 'montagem', nome: 'Montagem', tipo: 'enum', escopo: 'tipo', padrao: 'laterais_sobre_base', grupo: 'Construção', opcoes: [{ valor: 'laterais_sobre_base', rotulo: 'Laterais sobre a base' }, { valor: 'base_entre_laterais', rotulo: 'Base entre as laterais' }] },
  { id: 'fundo', nome: 'Fundo', tipo: 'enum', escopo: 'tipo', padrao: 'encaixado', grupo: 'Construção', opcoes: [{ valor: 'sem', rotulo: 'Sem fundo' }, { valor: 'pregado', rotulo: 'Pregado' }, { valor: 'encaixado', rotulo: 'Encaixado' }] },
  { id: 'tampo', nome: 'Tampo', tipo: 'enum', escopo: 'tipo', padrao: 'comum', grupo: 'Construção', opcoes: [{ valor: 'sem', rotulo: 'Sem tampo' }, { valor: 'comum', rotulo: 'Comum (25 mm)' }, { valor: 'engrossado', rotulo: 'Engrossado (38 mm)' }] },
  { id: 'nPrat', nome: 'Prateleiras', tipo: 'inteiro', escopo: 'tipo', padrao: 1, min: 0, max: 6, passo: 1, grupo: 'Construção' },
  { id: 'nPortas', nome: 'Portas', tipo: 'inteiro', escopo: 'tipo', padrao: 2, min: 0, max: 2, passo: 1, grupo: 'Construção' },
  comprimento('rodape', 'Altura do rodapé', 100, 0, 150, 10, 'tipo'),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('zBase', 'Cota do topo da base', 'rodape + esp'),
  derivado('tampoEsp', 'Espessura do tampo', 'tampo == "sem" ? 0 : (tampo == "comum" ? 25 : 38)'),
  derivado('hCorpo', 'Altura do corpo', 'A - tampoEsp'),
  derivado('fundoEsp', 'Espessura do fundo', 'fundo == "sem" ? 0 : 6'),
  derivado('profL', 'Profundidade da lateral', 'P - (fundo == "pregado" ? fundoEsp : 0)'),
  derivado('vao', 'Vão interno útil', 'hCorpo - esp - zBase'),
  derivado('yFundo', 'Face frontal do fundo (Y)', 'fundo == "sem" ? P : (fundo == "pregado" ? P - fundoEsp : P - fundoEsp - 15)'),
];

const FITA = 'fita_pvc';
const PECAS: Peca[] = [
  { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', SOBRE], tamanho: ['profL', 'hCorpo - zLateral'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
  { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', SOBRE], tamanho: ['profL', 'hCorpo - zLateral'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
  { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['montagem == "base_entre_laterais" ? esp : 0', '0', 'rodape'], tamanho: ['montagem == "base_entre_laterais" ? L - 2 * esp : L', 'profL'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
  { id: 'trF', nome: 'Travessa frontal', papel: 'travessa', eixo: 'z', origem: ['esp', '0', 'hCorpo - esp'], tamanho: ['L - 2 * esp', '80'], espessura: 'esp', material: 'corpo', veio: 'a' },
  { id: 'trT', nome: 'Travessa traseira', papel: 'travessa', eixo: 'z', origem: ['esp', 'yFundo - 80', 'hCorpo - esp'], tamanho: ['L - 2 * esp', '80'], espessura: 'esp', material: 'corpo', veio: 'a' },
  { id: 'prat', nome: 'Prateleira', papel: 'prateleira', eixo: 'z', origem: ['esp', '20', 'zBase + i * (vao - esp * nPrat) / (nPrat + 1) + (i - 1) * esp'], tamanho: ['L - 2 * esp', 'yFundo - 20'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a', repetir: 'nPrat' },
  { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['fundo == "pregado" ? 0 : esp', 'yFundo', 'fundo == "pregado" ? rodape : zBase'], tamanho: ['fundo == "pregado" ? L : L - 2 * esp', 'hCorpo - (fundo == "pregado" ? rodape : zBase)'], espessura: 'fundoEsp', material: 'mat_fundo', veio: 'livre', quando: 'fundo != "sem"' },
  { id: 'porta', nome: 'Porta', papel: 'porta', eixo: 'y', origem: ['(i - 1) * (L / nPortas) + 2', '-18', 'rodape + 2'], tamanho: ['L / nPortas - 4', 'hCorpo - rodape - 4'], espessura: '18', material: 'mat_porta', fita: { n: FITA, s: FITA, l: FITA, o: FITA }, veio: 'b', repetir: 'nPortas', quando: 'nPortas > 0' },
  { id: 'rodap', nome: 'Rodapé', papel: 'rodape', eixo: 'y', origem: ['esp', '50', '0'], tamanho: ['L - 2 * esp', 'rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a', quando: 'rodape > 0' },
  { id: 'tampo', nome: 'Tampo', papel: 'tampo', eixo: 'z', origem: ['0', '-20', 'hCorpo'], tamanho: ['L', 'P + 20'], espessura: 'tampoEsp', material: 'mat_tampo', fita: { n: FITA }, veio: 'a', quando: 'tampo != "sem"' },
];

export const FAMILIA_ARMARIO: Familia = comEscolhas({
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_armario_baixo',
  nome: 'Armário baixo',
  categoria: 'marcenaria',
  descricao: 'Armário base de cozinha com laterais, base, travessas, prateleiras, fundo, portas, rodapé e tampo.',
  unidade: 'mm',
  hospedagem: 'nivel',
  origem: 'canto',
  parametros: [...PARAMETROS, derivado('zLateral', 'Cota inferior da lateral', SOBRE)],
  planos: [
    { id: 'pEsq', nome: 'Esquerda', eixo: 'x', posicao: '0' },
    { id: 'pDir', nome: 'Direita', eixo: 'x', posicao: 'L' },
    { id: 'pFrente', nome: 'Frente', eixo: 'y', posicao: '0' },
  ],
  pecas: PECAS,
  aninhados: [],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '(hCorpo - rodape - 4 <= 900 ? 2 : hCorpo - rodape - 4 <= 1600 ? 3 : hCorpo - rodape - 4 <= 2200 ? 4 : 5) * nPortas', quando: 'nPortas > 0' },
    { id: 'puxador', nome: 'Puxador', quantidade: 'nPortas', quando: 'nPortas > 0' },
    { id: 'pino', nome: 'Pino de prateleira', quantidade: '4 * nPrat', quando: 'nPrat > 0' },
  ],
  conectores: conectoresDe('base'),
  tipos: [
    { id: 'A60', nome: 'Armário 60 (1 porta)', valores: { L: 600, nPortas: 1 } },
    { id: 'A80', nome: 'Armário 80 (2 portas)', valores: { L: 800, nPortas: 2 } },
    { id: 'A100', nome: 'Armário 100 (2 portas)', valores: { L: 1000, montagem: 'base_entre_laterais', fundo: 'pregado', tampo: 'engrossado', nPortas: 2 } },
    { id: 'A120', nome: 'Armário 120 aberto', valores: { L: 1200, corpo: 'mdf25', fundo: 'sem', nPrat: 2, nPortas: 0, rodape: 80 } },
  ],
  tipoPadrao: 'A80',
});
