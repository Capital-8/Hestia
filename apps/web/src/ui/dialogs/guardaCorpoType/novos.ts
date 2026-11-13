import type { CorrimaoGC, PainelGC, PreenchimentoGC, TipoGuardaCorpo, TrilhoGC } from '@hestia/model';

/** Perfil circular de diâmetro d (m); sem forma retangular nas listas, que só trocam o diâmetro. */
export const circ = (d: number): { forma: 'circular'; largura: number; altura: number } => ({ forma: 'circular', largura: d, altura: 0 });

/** Trilho novo, abaixo do corrimão e com o material padrão. */
export function novoTrilho(draft: TipoGuardaCorpo, materialId: string): TrilhoGC {
  return { nome: `Trilho ${draft.trilhos.length + 1}`, altura: draft.altura / 2, deslocamento: 0, perfil: circ(0.02), materialId };
}

/** Corrimão novo, sobre o eixo na altura do tipo. */
export function novoCorrimao(draft: TipoGuardaCorpo, materialId: string): CorrimaoGC {
  const nula = { estilo: 'nenhum' as const, comprimento: 0, maisPiso: false };
  return {
    nome: `Corrimão ${draft.corrimaos.length + 1}`,
    funcao: 'corrimao',
    posicao: 'eixo',
    altura: draft.altura,
    afastamento: 0,
    perfil: circ(0.045),
    materialId,
    extensaoInicio: nula,
    extensaoFim: nula,
    suportes: { layout: 'nenhum', espacamento: 0, numero: 0, justificacao: 'distribuir', perfil: circ(0.02), comprimento: 0.05, materialId },
    transicao: 'simples',
    juncao: 'esquadria',
    raioFilete: 0.05,
  };
}

/** Padrão de balaústres novo, com um balaústre redondo de 2 cm a cada 11 cm. */
export function novoBalaustre(nome: string, materialId: string): PreenchimentoGC {
  return {
    tipo: 'balaustres',
    nome,
    base: { de: 'hospedeiro' },
    topo: { de: 'corrimao', indice: 0 },
    elementos: [{ modelo: { perfil: circ(0.02), materialId }, distanciaAnterior: 0, deslocamentoLateral: 0, deslocamentoBase: 0, deslocamentoTopo: 0 }],
    periodo: 0.11,
    justificacao: 'distribuir',
    sobra: 'nenhuma',
    quebra: 'nunca',
    anguloQuebra: 0.5236,
    escopo: 'vao',
    porDegrau: { ativo: false, quantidade: 1, distanciaDoBocel: null, modelo: null },
  };
}

/** Painel novo de vidro entre postes. */
export function novoPainel(nome: string, materialId: string): PainelGC {
  return {
    tipo: 'painel',
    nome,
    familia: 'vidro',
    base: { de: 'hospedeiro' },
    topo: { de: 'corrimao', indice: 0 },
    deslocamentoBase: 0.01,
    deslocamentoTopo: 0,
    espessura: 0.012,
    folgaLateral: 0.005,
    larguraMaxima: 0,
    materialId,
  };
}
