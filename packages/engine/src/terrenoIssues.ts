/**
 * Avisos do terreno (A.4 regra 14, A.6): o Rust devolve MEDIDAS (`terreno_avisos`) e aqui o TS decide texto, severidade e o elemento do "Ir para".
 * Nunca bloqueiam. `terreno-sem-kernel` e `terreno-invalido` são só do TS: com o kernel desligado ou recusando os dados, o terreno aparece só pela borda
 * (ou pela envoltória das fontes) e um destes avisos. Números pela unidade do projeto (`formatQuantity`).
 *
 * Os textos ficam neste arquivo (pt e en; os demais idiomas caem em pt), no molde de `guardaCorpoIssues.ts` e `cortinaIssues.ts`, para não tocar o
 * dicionário do modelo; migram para `md_tn_*` quando a frente da interface fechar.
 */
import { formatQuantity, isTerrain, isTerrainRegion, unitsOf, type Id, type Project, type ValidationIssue } from '@hestia/model';
import type { Lang } from './i18nMessages.ts';
import { agruparAvisosGuardaCorpo } from './guardaCorpoIssues.ts';
import { AVISO_TN, ID_AUSENTE_TN, PASSO_ID_TERRENO } from './kernelTerreno.ts';

/** Medida devolvida por `terreno_avisos` (decodificada, ids do projeto). */
export interface MedidaAvisoTN {
  terrenoId: Id;
  codigo: number;
  /** Região do aviso (3, 4 e 6); `null` nos demais. */
  regiaoId: Id | null;
  /** Aviso 3: a outra região que se sobrepõe. */
  outraRegiaoId: Id | null;
  /** Aviso 1: posição do vértice descartado na ordem canônica das fontes. Aviso 2: posição da linha (curvas, depois quebras). `null` nos demais. */
  indice: number | null;
  medido: number;
  limite: number;
  x: number;
  y: number;
  z: number;
}

/** Código numérico de `terreno_avisos` -> código textual. */
export const CODIGO_AVISO_TN: Record<number, string> = {
  [AVISO_TN.cotasDiferentes]: 'terreno-pontos-coincidentes',
  [AVISO_TN.linhaCruza]: 'terreno-linha-cruza',
  [AVISO_TN.regioesSobrepostas]: 'terreno-regioes-sobrepostas',
  [AVISO_TN.precisaoReduzida]: 'terreno-precisao-reduzida',
  [AVISO_TN.semTriangulos]: 'terreno-sem-triangulos',
  [AVISO_TN.regiaoFora]: 'terreno-regiao-fora',
};

/** `avisos` `[terreno_num, codigo, regiao_num, indice]` e `valores` `[medido, limite, x, y, z]`. Código ou terreno desconhecido é ignorado. */
export function decodificarAvisosTN(avisos: ArrayLike<number>, valores: ArrayLike<number>, terrenoIdDe: (n: number) => Id | undefined, regiaoIdDe: (n: number) => Id | undefined): MedidaAvisoTN[] {
  const out: MedidaAvisoTN[] = [];
  for (let i = 0; i < Math.floor(avisos.length / 4); i++) {
    const terrenoNum = avisos[4 * i]!;
    const terrenoId = terrenoIdDe(terrenoNum);
    const codigo = avisos[4 * i + 1]!;
    if (terrenoId === undefined || !CODIGO_AVISO_TN[codigo]) continue;
    const regiaoNum = avisos[4 * i + 2]!;
    const indiceBruto = avisos[4 * i + 3]!;
    const comRegiao = codigo === AVISO_TN.regioesSobrepostas || codigo === AVISO_TN.precisaoReduzida || codigo === AVISO_TN.regiaoFora;
    out.push({
      terrenoId,
      codigo,
      regiaoId: comRegiao && regiaoNum !== ID_AUSENTE_TN ? (regiaoIdDe(regiaoNum) ?? null) : null,
      outraRegiaoId: codigo === AVISO_TN.regioesSobrepostas && indiceBruto !== ID_AUSENTE_TN ? (regiaoIdDe(indiceBruto) ?? null) : null,
      indice: (codigo === AVISO_TN.cotasDiferentes || codigo === AVISO_TN.linhaCruza) && indiceBruto !== ID_AUSENTE_TN ? indiceBruto - terrenoNum * PASSO_ID_TERRENO : null,
      medido: valores[5 * i]!,
      limite: valores[5 * i + 1]!,
      x: valores[5 * i + 2]!,
      y: valores[5 * i + 3]!,
      z: valores[5 * i + 4]!,
    });
  }
  return out;
}

const MSG = {
  pt: {
    'terreno-sem-kernel': 'Terreno {nome}: o kernel de geometria não está ligado; só a borda é mostrada.',
    'terreno-invalido': 'Terreno {nome}: o kernel recusou os dados do terreno ({detalhe}); só a borda é mostrada.',
    'terreno-pontos-coincidentes': 'Terreno {nome}: pontos no mesmo lugar com cotas diferentes (diferença de {medido}); vale o primeiro.',
    'terreno-linha-cruza': 'Terreno {nome}: uma linha cruza outra perto de ({x}, {y}); o trecho foi ignorado.',
    'terreno-regioes-sobrepostas': 'Terreno {nome}: as regiões {a} e {b} se sobrepõem; vale a de maior ordem.',
    'terreno-precisao-reduzida': 'Terreno {nome}: a região {a} é grande demais para o passo pedido; a malha usa passo de {medido} em vez de {limite}.',
    'terreno-sem-triangulos': 'Terreno {nome}: faltam pontos para formar a superfície (são precisos ao menos 3, não alinhados).',
    'terreno-regiao-fora': 'Terreno {nome}: {medido} do contorno da região {a} fica fora do terreno.',
  },
  en: {
    'terreno-sem-kernel': 'Terrain {nome}: the geometry kernel is off; only the boundary is shown.',
    'terreno-invalido': 'Terrain {nome}: the kernel rejected the terrain data ({detalhe}); only the boundary is shown.',
    'terreno-pontos-coincidentes': 'Terrain {nome}: points at the same place have different elevations ({medido} apart); the first one wins.',
    'terreno-linha-cruza': 'Terrain {nome}: a line crosses another near ({x}, {y}); the segment was ignored.',
    'terreno-regioes-sobrepostas': 'Terrain {nome}: regions {a} and {b} overlap; the one with the higher order wins.',
    'terreno-precisao-reduzida': 'Terrain {nome}: region {a} is too large for the requested step; the mesh uses a {medido} step instead of {limite}.',
    'terreno-sem-triangulos': 'Terrain {nome}: not enough points to form the surface (at least 3, not in a line).',
    'terreno-regiao-fora': 'Terrain {nome}: {medido} of the outline of region {a} lies outside the terrain.',
  },
} as const;
type Codigo = keyof (typeof MSG)['pt'];

/** Códigos dos avisos do terreno (os dois do TS e os seis do kernel). */
export const CODIGOS_AVISO_TERRENO = Object.keys(MSG.pt) as Codigo[];

const texto = (lang: Lang, code: Codigo, args: Record<string, string>): string => (lang === 'en' ? MSG.en : MSG.pt)[code].replace(/\{(\w+)\}/g, (w, n: string) => args[n] ?? w);

const terrenosOrdenados = (p: Project): Array<{ id: Id; name: string }> =>
  Object.values(p.elements)
    .filter(isTerrain)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

/** `terreno-sem-kernel`: um aviso por terreno enquanto o kernel não está pronto. */
export function terrenoAvisosSemKernel(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  return terrenosOrdenados(p).map((t) => ({ severity: 'warning', code: 'terreno-sem-kernel', message: texto(lang, 'terreno-sem-kernel', { nome: t.name }), elementId: t.id, ids: [t.id] }));
}

/** `terreno-invalido`: o kernel está ligado mas falhou ao receber ou responder (`detalhe` é a mensagem do erro). Um aviso por terreno. */
export function terrenoAvisosInvalido(p: Project, detalhe: string, lang: Lang = 'pt'): ValidationIssue[] {
  return terrenosOrdenados(p).map((t) => ({ severity: 'warning', code: 'terreno-invalido', message: texto(lang, 'terreno-invalido', { nome: t.name, detalhe }), elementId: t.id, ids: [t.id] }));
}

/** Avisos do kernel (medidas) -> avisos do projeto, iguais agrupados com a contagem. Vazio quando `medidas` é nulo (sem kernel). */
export function terrenoAvisosDeGeometria(p: Project, medidas: readonly MedidaAvisoTN[] | null, lang: Lang = 'pt'): ValidationIssue[] {
  const units = unitsOf(p, lang === 'en' ? 'en' : 'pt');
  const len = (v: number): string => formatQuantity(units, 'length', v);
  const out: ValidationIssue[] = [];
  const nomeDe = (id: Id | null): string => {
    const e = id === null ? undefined : p.elements[id];
    return e && isTerrainRegion(e) ? e.name : '?';
  };
  for (const m of medidas ?? []) {
    const terreno = p.elements[m.terrenoId];
    const code = CODIGO_AVISO_TN[m.codigo] as Codigo | undefined;
    if (!terreno || !isTerrain(terreno) || !code) continue;
    const message = texto(lang, code, {
      nome: terreno.name,
      medido: m.codigo === AVISO_TN.regiaoFora ? formatQuantity(units, 'slope', m.medido) : len(m.medido),
      limite: len(m.limite),
      x: len(m.x),
      y: len(m.y),
      a: nomeDe(m.regiaoId),
      b: nomeDe(m.outraRegiaoId),
    });
    const alvo = m.regiaoId ?? m.terrenoId;
    out.push({ severity: 'warning', code, message, elementId: alvo, ids: [alvo] });
  }
  return agruparAvisosGuardaCorpo(out, lang);
}
