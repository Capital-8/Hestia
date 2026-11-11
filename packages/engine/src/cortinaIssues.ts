/**
 * Avisos da parede cortina (decisão 0056, §5.8): o Rust devolve MEDIDAS (`cortina_avisos`) e aqui o TS decide texto, severidade e o elemento do
 * "Ir para". Nunca bloqueiam. `cortina-sem-kernel` é só do TS: com o kernel desligado a cortina aparece como eixo e este aviso.
 *
 * Os textos ficam neste arquivo (pt e en; os demais idiomas caem em pt), no molde de `guardaCorpoIssues.ts`, para não tocar o dicionário `md_ct_*`
 * do modelo, que é da frente da interface (aba "Cortina"); migram para lá quando essa frente fechar.
 */
import type { Id, Project, ValidationIssue } from '@hestia/model';
import type { Lang } from './i18nMessages.ts';
import { AVISO_CORTINA } from './kernelCortinaTabelas.ts';
import type { AvisoCortinaProjeto } from './kernelCortinaServico.ts';
import { paredesCortina } from './cortinaProjeto.ts';

/** Código textual de cada código numérico de `cortina_avisos` (`AVISO_CORTINA`). */
export const CODIGO_AVISO_CORTINA: Record<number, string> = {
  [AVISO_CORTINA.celulaPequena]: 'cortina-celula-pequena',
  [AVISO_CORTINA.montanteSobreposto]: 'cortina-montante-sobreposto',
  [AVISO_CORTINA.sobraFundida]: 'cortina-sobra-fundida',
  [AVISO_CORTINA.posicaoFora]: 'cortina-posicao-fora',
  [AVISO_CORTINA.profundidadeMenorQuePerfil]: 'cortina-profundidade-menor-que-perfil',
  [AVISO_CORTINA.arcoNaoSuportado]: 'cortina-arco-nao-suportado',
  // Fase 2: as três órfãs (célula, linha, segmento) são um só código para o usuário; a posição aproximada vai no texto.
  [AVISO_CORTINA.orfaoCelula]: 'cortina-override-orfao',
  [AVISO_CORTINA.orfaoLinha]: 'cortina-override-orfao',
  [AVISO_CORTINA.orfaoSegmento]: 'cortina-override-orfao',
  [AVISO_CORTINA.celulaNaoRetangular]: 'cortina-celula-nao-retangular',
};

/** Informativos (a cortina continua correta): sobra fundida e posição manual fora do vão. Os demais são avisos. */
const INFORMATIVOS = new Set<string>(['cortina-sobra-fundida', 'cortina-posicao-fora']);

type Chave = keyof (typeof MSG)['pt'];

const MSG = {
  pt: {
    'cortina-celula-pequena': 'Parede cortina: há uma célula com lado livre de {medido} m, menor que o mínimo de {limite} m.',
    'cortina-montante-sobreposto': 'Parede cortina: dois montantes ficam a {medido} m um do outro, menos que a largura do perfil ({limite} m).',
    'cortina-sobra-fundida': 'Parede cortina: a sobra de {medido} m (menor que {limite} m) foi fundida à célula vizinha.',
    'cortina-posicao-fora': 'Parede cortina: a posição manual de {medido} m cai fora do vão e foi ignorada.',
    'cortina-profundidade-menor-que-perfil': 'Parede cortina: o perfil do montante tem {medido} m de profundidade e o sistema tem só {limite} m.',
    'cortina-arco-nao-suportado': 'Parede cortina em arco: o arco ainda não é suportado nesta versão; só o eixo é mostrado.',
    'cortina-sem-kernel': 'Parede cortina: o kernel de geometria não está ligado; só o eixo é mostrado.',
    'cortina-override-orfao': 'Parede cortina: uma sobrescrita (célula, linha ou segmento) ficou sem lugar depois de mudar a grade, perto de {medido} m do início e {limite} m da base. Foi ignorada; a próxima edição da parede a remove.',
    'cortina-celula-nao-retangular': 'Parede cortina: remover este segmento deixaria uma região de {medido} células que não é retângulo (o retângulo teria {limite}). A remoção foi ignorada.',
  },
  en: {
    'cortina-celula-pequena': 'Curtain wall: a cell has a free side of {medido} m, smaller than the {limite} m minimum.',
    'cortina-montante-sobreposto': 'Curtain wall: two mullions are {medido} m apart, less than the profile width ({limite} m).',
    'cortina-sobra-fundida': 'Curtain wall: the {medido} m remainder (under {limite} m) was merged into the neighbouring cell.',
    'cortina-posicao-fora': 'Curtain wall: the manual position of {medido} m falls outside the span and was ignored.',
    'cortina-profundidade-menor-que-perfil': 'Curtain wall: the mullion profile is {medido} m deep and the system is only {limite} m.',
    'cortina-arco-nao-suportado': 'Arched curtain wall: arcs are not supported in this version yet; only the axis is shown.',
    'cortina-sem-kernel': 'Curtain wall: the geometry kernel is off; only the axis is shown.',
    'cortina-override-orfao': 'Curtain wall: an override (cell, line or segment) has no place after the grid changed, near {medido} m from the start and {limite} m from the base. It was ignored; the next edit of the wall removes it.',
    'cortina-celula-nao-retangular': 'Curtain wall: removing this segment would leave a {medido}-cell region that is not a rectangle (the rectangle would have {limite}). The removal was ignored.',
  },
} as const;

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

function texto(lang: Lang, codigo: Chave, medido = 0, limite = 0): string {
  const d = lang === 'en' ? MSG.en : MSG.pt;
  return d[codigo].replaceAll('{medido}', fmt(medido)).replaceAll('{limite}', fmt(limite));
}

/** Avisos de geometria (medidas do Rust) -> avisos do projeto. Código desconhecido é ignorado (contrato novo, texto ainda não existe). */
export function cortinaAvisosDeGeometria(medidas: readonly AvisoCortinaProjeto[] | null, lang: Lang = 'pt'): ValidationIssue[] {
  if (!medidas) return [];
  const out: ValidationIssue[] = [];
  for (const m of medidas) {
    const codigo = CODIGO_AVISO_CORTINA[m.codigo];
    if (!codigo) continue;
    out.push({ severity: INFORMATIVOS.has(codigo) ? 'info' : 'warning', code: codigo, message: texto(lang, codigo as Chave, m.medido, m.limite), elementId: m.wallId });
  }
  return out;
}

/** `cortina-sem-kernel`: um aviso por cortina enquanto o kernel não está pronto. */
export function cortinaAvisosSemKernel(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  return paredesCortina(p).map((c) => ({ severity: 'warning', code: 'cortina-sem-kernel', message: texto(lang, 'cortina-sem-kernel'), elementId: c.wall.id as Id }));
}
