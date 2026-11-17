import { isOpening, openingHeight, openingTypeById, type OpeningType, type Project, type ValidationIssue } from '@hestia/model';
import { openingNormIssues, type PortaNormaInput } from './openingNormIssues.ts';

/** Vidro classificado como seguro (laminado ou temperado); `undefined` quando o tipo não informa o vidro. */
const vidroSeguroDe = (t: OpeningType): boolean | undefined => (t.glassKind === undefined ? undefined : t.glassKind === 'laminated' || t.glassKind === 'tempered');

/** Porta com painel de vidro: folha de vidro (`glass`, `fullglass`) ou porta com `glassRatio` informado. */
const comVidroDe = (t: OpeningType): boolean => t.leafStyle === 'glass' || t.leafStyle === 'fullglass' || t.glassRatio !== undefined;

/**
 * Dados normativos de cada PORTA do projeto, resolvidos do modelo (docs/estudo-esquadrias/24, §3). Vão livre = o próprio vão do tipo, SEM
 * descontar o batente (cota superior: porta 0,90 x 2,10 não avisa; descontar o batente faria todo vão 2,10 avisar, e o catálogo usa o
 * vão como medida nominal. A faixa de verificações do diálogo, `openingChecks`, é mais rigorosa). Soleira vem de `threshold`. A rota acessível não existe
 * no modelo: fica indefinida, então o aviso de soleira (NBR 9050) não dispara até haver esse dado. Vidro: sem `glassKind` não há aviso.
 */
export function portasParaNorma(p: Project): PortaNormaInput[] {
  const out: PortaNormaInput[] = [];
  for (const o of Object.values(p.elements)) {
    if (!isOpening(o)) continue;
    const t = openingTypeById(p, o.typeId);
    if (!t || t.kind !== 'door') continue;
    out.push({
      id: o.id,
      vaoLivreLarguraM: t.width,
      vaoLivreAlturaM: openingHeight(t, o),
      soleiraMm: t.threshold ? t.threshold.thickness * 1000 : null,
      comVidro: comVidroDe(t),
      vidroSeguro: vidroSeguroDe(t),
    });
  }
  return out;
}

/** Avisos normativos de porta do projeto (nunca bloqueiam; valores de resumo público). Ligado ao fluxo de avisos do editor. */
export const openingNormProjectIssues = (p: Project): ValidationIssue[] => openingNormIssues(portasParaNorma(p));
