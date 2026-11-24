import type { Familia, Parametro, Tipo } from '../tipos.ts';
import type { Corpo, Perfil, Ponto3 } from '../tiposCorpo.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import type { Primitivo2D, Simbolo2D } from '../tiposRepresentacao.ts';
import { corpoEletrico, deEletrico, ligacaoEletrica, parametroDnEletrico, parametroPotencia, parametroTensao } from './eletricaApoio.ts';
import { comprimento, nova } from './novosApoio.ts';

/*
 * Apoio das luminárias (ficha F6, ADR 0061): construtor próprio (a categoria `luminaria` não cabe em `familiaEletrica` da F5),
 * parâmetros de fotometria e símbolos de teto. Medidas em mm. Potência, fluxo e temperatura de cor são valores TÍPICOS de catálogo,
 * não confirmados: cada tabela tem CONFERIR. A luminária é desenhada com a origem no canto (X largura, Y profundidade, Z altura),
 * a face de fixação em z = `hInst` (teto) ou y = 0 (parede). O difusor é um corpo com papel `visor`.
 */

/** Material do corpo da luminária (alumínio do projeto). CONFERIR: acabamento de catálogo. */
export const MATERIAL_LUMINARIA = 'mat_aluminio';
/** Material do difusor. CONFERIR: o catálogo ainda não tem material emissivo; vidro leitoso até lá. */
export const MATERIAL_DIFUSOR = 'mat_vidro';
/** Espessura padrão do difusor (mm). CONFERIR. */
export const ESPESSURA_DIFUSOR = 3;

/** Parâmetro de fluxo luminoso (lm) do tipo. CONFERIR: valor de catálogo. */
export function parametroFluxo(padrao: number): Parametro {
  return { id: 'fluxoLuminoso', nome: 'Fluxo luminoso (lm)', tipo: 'numero', escopo: 'tipo', padrao, min: 0, max: 20000, passo: 10, grupo: 'Fotometria' };
}

/** Parâmetro de temperatura de cor (K) do tipo. CONFERIR. */
export function parametroTemperatura(padrao: number): Parametro {
  return { id: 'temperaturaCor', nome: 'Temperatura de cor (K)', tipo: 'numero', escopo: 'tipo', padrao, min: 2700, max: 6500, passo: 100, grupo: 'Fotometria' };
}

/** Altura de instalação (mm) da face de fixação: teto (base da luminária) ou parede (fundo da luminária). */
export function parametroHInst(padrao: number, max = 3000): Parametro {
  return comprimento('hInst', 'Altura de instalação', padrao, 0, max, 10);
}

/** Espessura do difusor `E` (mm), comprimento de instância. */
export function parametroEspessura(): Parametro {
  return comprimento('E', 'Espessura do difusor', ESPESSURA_DIFUSOR, 1, 50, 1);
}

/** Parâmetros fotométricos e elétricos do tipo, na ordem de apresentação. */
export function parametrosFotometria(potencia: number, fluxo: number, temperatura: number): Parametro[] {
  return [parametroPotencia(potencia), parametroFluxo(fluxo), parametroTemperatura(temperatura)];
}

/** Parâmetros comuns: DN (bitola do eletroduto de alimentação), diâmetro externo derivado e tensão. */
export function parametrosComuns(): Parametro[] {
  return [parametroDnEletrico([20, 25], 20), deEletrico(), parametroTensao()];
}

/** Ponto de força e eletroduto, com as propriedades elétricas do ponto (potência e tensão). */
export function ligacoesLuminaria(forca: { posicao: Ponto3; direcao: Ponto3 }, eletroduto: { posicao: Ponto3; direcao: Ponto3 }): Ligacao[] {
  return [
    ligacaoEletrica('forca', 'Ponto de força', 'eletrica_forca', forca.posicao, forca.direcao, { propriedades: { potencia: 'potencia', tensao: 'tensao' } }),
    ligacaoEletrica('eletroduto', 'Eletroduto de alimentação', 'eletroduto', eletroduto.posicao, eletroduto.direcao),
  ];
}

/** Corpo da luminária com o material do alumínio (papel `corpo`). */
export function corpoLuminaria(id: string, nome: string, forma: Corpo['forma'], quadro: Corpo['quadro']): Corpo {
  return { ...corpoEletrico(id, nome, 'corpo', forma, quadro), material: MATERIAL_LUMINARIA };
}

/** Difusor (papel `visor`) com o material do difusor. */
export function corpoDifusor(id: string, nome: string, forma: Corpo['forma'], quadro: Corpo['quadro']): Corpo {
  return { ...corpoEletrico(id, nome, 'visor', forma, quadro), material: MATERIAL_DIFUSOR };
}

/** Círculo de perfil de diâmetro `d` (mm). */
export function circuloPerfil(d: string): Perfil {
  return { tipo: 'circulo', diametro: d };
}

/** Retângulo centrado de perfil `largura × altura` (mm). */
export function retanguloPerfil(largura: string, altura: string): Perfil {
  return { tipo: 'retangulo', largura, altura };
}

/** Formata `base + r * c` sem sinal duplo: `c` é literal numérico (pode ser negativo). */
function somaComCoeficiente(base: string, r: string, c: number): string {
  const coef = Math.round(c * 1e6) / 1e6;
  if (coef === 0) return base;
  if (coef === 1) return `${base} + ${r}`;
  if (coef > 0) return `${base} + ${r} * ${coef}`;
  return `${base} - ${r} * ${-coef}`;
}

/** Símbolo de teto (círculo com raios) em planta: círculo de raio `P / 4` e oito raios de `P / 3` a `P / 2`, no centro. */
export function simboloTeto(): Simbolo2D {
  const cx = 'L / 2';
  const cy = 'P / 2';
  const primitivos: Primitivo2D[] = [{ tipo: 'circulo', centro: [cx, cy], raio: 'P / 4' }];
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI / 4) * k;
    const cos = Math.cos(a);
    const sen = Math.sin(a);
    primitivos.push({
      tipo: 'linha',
      de: [somaComCoeficiente(cx, 'P / 3', cos), somaComCoeficiente(cy, 'P / 3', sen)],
      ate: [somaComCoeficiente(cx, 'P / 2', cos), somaComCoeficiente(cy, 'P / 2', sen)],
    });
  }
  return { id: 'planta', nome: 'Planta de teto (círculo com raios)', vistas: ['planta'], plano: 'xy', substituiGeometria: true, primitivos };
}

/** Símbolo de planta de parede (arandela): retângulo L × P com linha central. */
export function simboloParede(): Simbolo2D {
  return {
    id: 'planta',
    nome: 'Planta da arandela',
    vistas: ['planta'],
    plano: 'xy',
    substituiGeometria: true,
    primitivos: [
      { tipo: 'polilinha', pontos: [['0', '0'], ['L', '0'], ['L', 'P'], ['0', 'P']], fechada: true },
      { tipo: 'linha', de: ['L / 2', '0'], ate: ['L / 2', 'P'] },
    ],
  };
}

/** Símbolo de planta da fita linear: retângulo L × P com linha central ao longo do comprimento. */
export function simboloLinear(): Simbolo2D {
  return {
    id: 'planta',
    nome: 'Planta da luminária linear',
    vistas: ['planta'],
    plano: 'xy',
    substituiGeometria: true,
    primitivos: [
      { tipo: 'polilinha', pontos: [['0', '0'], ['L', '0'], ['L', 'P'], ['0', 'P']], fechada: true },
      { tipo: 'linha', de: ['0', 'P / 2'], ate: ['L', 'P / 2'] },
    ],
  };
}

export interface DadosLuminaria {
  id: string;
  nome: string;
  descricao: string;
  hospedagem: 'nivel' | 'parede';
  parametros: Parametro[];
  corpos: Corpo[];
  ligacoes: Ligacao[];
  tipos: Tipo[];
  simbolos: Simbolo2D[];
}

/** Família de luminária: categoria `luminaria`, disciplina elétrica, IFC explícito `IFCLIGHTFIXTURE`, sem peças de marcenaria. */
export function familiaLuminaria(d: DadosLuminaria): Familia {
  const base = nova({
    id: d.id,
    nome: d.nome,
    categoria: 'luminaria',
    disciplina: 'eletrico',
    descricao: d.descricao,
    hospedagem: d.hospedagem,
    parametros: d.parametros,
    pecas: [],
    conectores: [],
    tipos: d.tipos,
    tipoPadrao: d.tipos[0]?.id ?? 'dn20',
  });
  return { ...base, corpos: d.corpos, ligacoes: d.ligacoes, ifc: { classe: 'IFCLIGHTFIXTURE' }, simbolos: d.simbolos };
}

/** Tipos por bitola (DN 20 e 25), com as mesmas dimensões nominais: a bitola muda só o eletroduto de alimentação. */
export function tiposLuminaria(valores: Record<string, number>): Tipo[] {
  return [20, 25].map((dn) => ({ id: `dn${dn}`, nome: `DN ${dn}`, valores: { DN: dn, ...valores } }));
}
