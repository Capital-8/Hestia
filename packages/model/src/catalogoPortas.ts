import { ot } from './catalogoAberturasBase.ts';
import { openingName, type Lang } from './i18n.ts';
import type { OpeningType } from './openingTypes.ts';

/**
 * Catálogo brasileiro de portas (NBR 15930: "80 x 210" é a FOLHA, não o vão). Os tipos daqui têm `nominalRef: 'leaf'`:
 * a largura e a altura são da folha (para folha dupla, o conjunto) e o vão sai do motor. O portão de garagem usa o vão
 * como medida, então não tem `nominalRef`. Códigos a partir de P-12: P-01 a P-11 e V-01 estão em defaults.ts, com os
 * ids que os projetos salvos já referenciam.
 */

type Base = Pick<OpeningType, 'id' | 'code' | 'name' | 'width' | 'leaves' | 'plan'>;
type Extra = Partial<
  Omit<OpeningType, 'id' | 'kind' | 'name' | 'code' | 'width' | 'height' | 'sill' | 'leaves' | 'plan' | 'frameMaterialId' | 'glassMaterialId' | 'closure'>
>;

/** Porta pela folha: altura de 2,10 m, sem peitoril, referência nominal na folha. */
const porta = (b: Base, extra: Extra = {}, frame = 'mat_madeira'): OpeningType =>
  ot({ ...b, kind: 'door', height: 2.1, sill: 0, nominalRef: 'leaf', ...extra }, frame);

/** Porta de vidro temperado (blindex): folha de vidro, sem caixilho (`block`), puxador. */
const blindex = (b: Base, mm: 8 | 10): OpeningType =>
  porta(b, { leafStyle: 'glass', frameStyle: 'block', glassKind: 'tempered', glassThickness: mm / 1000, handle: 'pull' }, 'mat_vidro');

/** Corta-fogo: classe no campo `fireRating` (PF-30 ... PF-120), folha de 80 ou 90 cm, batente de aço. */
const CORTA_FOGO = ['PF-30', 'PF-60', 'PF-90', 'PF-120'];
const cortaFogo: OpeningType[] = CORTA_FOGO.flatMap((classe) =>
  [80, 90].map((cm) =>
    porta(
      { id: `ot_${classe.toLowerCase().replace('-', '')}_${cm}`, code: `${classe}-${cm}`, name: `Porta corta-fogo ${classe} ${cm} x 210`, width: cm / 100, leaves: 1, plan: 'swing' },
      { handle: 'lever', leafStyle: 'flush', fireRating: classe },
      'mat_aco',
    ),
  ),
);

/** Giro de uma folha (80, 90 ou 100 cm de folha): maçaneta de alavanca. Os de 60 e 70 são lisos. */
const giro = (cm: number, code: string): OpeningType =>
  porta(
    { id: `ot_pgiro${cm}`, code, name: `Porta de giro 1 folha ${cm} x 210`, width: cm / 100, leaves: 1, plan: 'swing' },
    { handle: 'lever', leafStyle: cm <= 70 ? 'flush' : 'panel' },
  );

/** Giro de duas folhas (símbolo `double`). A largura é o conjunto das duas folhas. */
const giroDupla = (b: Base, extra: Extra = {}): OpeningType => porta(b, { handle: 'lever', leafStyle: 'panel', ...extra });

const CATALOGO_PORTAS_BR_PT: OpeningType[] = [
  giro(60, 'P-12'),
  giro(70, 'P-13'),
  giro(80, 'P-14'),
  giro(90, 'P-15'),
  giro(100, 'P-16'),
  giroDupla({ id: 'ot_pgiro2_120', code: 'P-17', name: 'Porta de giro 2 folhas 120 x 210', width: 1.2, leaves: 2, plan: 'double' }),
  giroDupla({ id: 'ot_pgiro2_140', code: 'P-18', name: 'Porta de giro 2 folhas 140 x 210', width: 1.4, leaves: 2, plan: 'double' }),
  giroDupla({ id: 'ot_pgiro2_160', code: 'P-19', name: 'Porta de giro 2 folhas 160 x 210', width: 1.6, leaves: 2, plan: 'double' }),
  giroDupla({ id: 'ot_pgiro2_180', code: 'P-20', name: 'Porta de giro 2 folhas 180 x 210', width: 1.8, leaves: 2, plan: 'double' }),
  // Porta-balcão: duas folhas com veneziana e vidro (vidro na metade de cima, `glassRatio`). Só há duas folhas na família.
  giroDupla(
    { id: 'ot_pbalcao120', code: 'P-21', name: 'Porta-balcão 2 folhas 120 x 210', width: 1.2, leaves: 2, plan: 'double' },
    { leafStyle: 'louver', glassRatio: 0.5 },
  ),
  giroDupla(
    { id: 'ot_pbalcao150', code: 'P-22', name: 'Porta-balcão 2 folhas 150 x 210', width: 1.5, leaves: 2, plan: 'double' },
    { leafStyle: 'louver', glassRatio: 0.5 },
  ),
  giroDupla(
    { id: 'ot_pbalcao200', code: 'P-23', name: 'Porta-balcão 2 folhas 200 x 210', width: 2.0, leaves: 2, plan: 'double' },
    { leafStyle: 'louver', glassRatio: 0.5 },
  ),
  // Correr aparente: o conjunto das duas folhas (1,60 = folhas de 80; 1,80 = folhas de 90).
  porta({ id: 'ot_pcorrer160', code: 'P-24', name: 'Porta de correr 2 folhas 160 x 210 (folhas de 80)', width: 1.6, leaves: 2, plan: 'sliding' }, { leafStyle: 'flush' }),
  porta({ id: 'ot_pcorrer180', code: 'P-25', name: 'Porta de correr 2 folhas 180 x 210 (folhas de 90)', width: 1.8, leaves: 2, plan: 'sliding' }, { leafStyle: 'flush' }),
  porta({ id: 'ot_pembutir80', code: 'P-26', name: 'Porta de embutir 1 folha 80 x 210', width: 0.8, leaves: 1, plan: 'pocket' }, { leafStyle: 'flush', handle: 'pull' }),
  porta({ id: 'ot_pembutir90', code: 'P-27', name: 'Porta de embutir 1 folha 90 x 210', width: 0.9, leaves: 1, plan: 'pocket' }, { leafStyle: 'flush', handle: 'pull' }),
  porta({ id: 'ot_ppiv100', code: 'P-28', name: 'Porta pivotante 100 x 210', width: 1.0, leaves: 1, plan: 'pivot' }, { leafStyle: 'flush', handle: 'pull' }),
  porta({ id: 'ot_ppiv120', code: 'P-29', name: 'Porta pivotante 120 x 210', width: 1.2, leaves: 1, plan: 'pivot' }, { leafStyle: 'flush', handle: 'pull' }),
  // Camarão: folhas articuladas que dobram para um lado (família dobrável, 2 ou 4 folhas).
  porta({ id: 'ot_pcamarao2_160', code: 'P-30', name: 'Porta camarão 2 folhas 160 x 210', width: 1.6, leaves: 2, plan: 'bifold' }, { leafStyle: 'flush', handle: 'pull' }),
  porta({ id: 'ot_pcamarao4_240', code: 'P-31', name: 'Porta camarão 4 folhas 240 x 210', width: 2.4, leaves: 4, plan: 'bifold' }, { leafStyle: 'flush', handle: 'pull' }),
  porta({ id: 'ot_pvai80', code: 'P-32', name: 'Porta vai-e-vem 80 x 210', width: 0.8, leaves: 1, plan: 'dblact' }, { leafStyle: 'flush', handle: 'pull' }),
  porta({ id: 'ot_pvai90', code: 'P-33', name: 'Porta vai-e-vem 90 x 210', width: 0.9, leaves: 1, plan: 'dblact' }, { leafStyle: 'flush', handle: 'pull' }),
  porta({ id: 'ot_pvai100', code: 'P-34', name: 'Porta vai-e-vem 100 x 210', width: 1.0, leaves: 1, plan: 'dblact' }, { leafStyle: 'flush', handle: 'pull' }),
  // Sanfonada de PVC: lâminas articuladas com batente de PVC.
  porta({ id: 'ot_psanf60', code: 'P-35', name: 'Porta sanfonada PVC 60 x 210', width: 0.6, leaves: 1, plan: 'accordion' }, {}, 'mat_pvc'),
  porta({ id: 'ot_psanf70', code: 'P-36', name: 'Porta sanfonada PVC 70 x 210', width: 0.7, leaves: 1, plan: 'accordion' }, {}, 'mat_pvc'),
  porta({ id: 'ot_psanf80', code: 'P-37', name: 'Porta sanfonada PVC 80 x 210', width: 0.8, leaves: 1, plan: 'accordion' }, {}, 'mat_pvc'),
  porta({ id: 'ot_psanf90', code: 'P-38', name: 'Porta sanfonada PVC 90 x 210', width: 0.9, leaves: 1, plan: 'accordion' }, {}, 'mat_pvc'),
  blindex({ id: 'ot_pvid72_8', code: 'P-39', name: 'Porta de vidro temperado 8 mm 72 x 210', width: 0.72, leaves: 1, plan: 'swing' }, 8),
  blindex({ id: 'ot_pvid72_10', code: 'P-40', name: 'Porta de vidro temperado 10 mm 72 x 210', width: 0.72, leaves: 1, plan: 'swing' }, 10),
  blindex({ id: 'ot_pvid82_8', code: 'P-41', name: 'Porta de vidro temperado 8 mm 82 x 210', width: 0.82, leaves: 1, plan: 'swing' }, 8),
  blindex({ id: 'ot_pvid82_10', code: 'P-42', name: 'Porta de vidro temperado 10 mm 82 x 210', width: 0.82, leaves: 1, plan: 'swing' }, 10),
  blindex({ id: 'ot_pvid92_8', code: 'P-43', name: 'Porta de vidro temperado 8 mm 92 x 210', width: 0.92, leaves: 1, plan: 'swing' }, 8),
  blindex({ id: 'ot_pvid92_10', code: 'P-44', name: 'Porta de vidro temperado 10 mm 92 x 210', width: 0.92, leaves: 1, plan: 'swing' }, 10),
  ...cortaFogo,
  // Portões de garagem: medida do vão (sem `nominalRef`). Basculante e enrolar usam a família do seccionado (símbolo garage).
  ot({ id: 'ot_pbasc250', kind: 'door', name: 'Portão de garagem basculante 250 x 210', code: 'P-45', width: 2.5, height: 2.1, sill: 0, leaves: 1, plan: 'garage' }, 'mat_aco'),
  ot({ id: 'ot_penrol280', kind: 'door', name: 'Portão de enrolar 280 x 225', code: 'P-46', width: 2.8, height: 2.25, sill: 0, leaves: 1, plan: 'garage' }, 'mat_aco'),
];

/** Catálogo de portas no idioma pedido (nomes são gerados na criação). */
export function catalogoPortas(lang: Lang = 'pt'): OpeningType[] {
  return CATALOGO_PORTAS_BR_PT.map((x) => ({ ...x, name: openingName(x.name, lang) }));
}

/** Catálogo de portas em PT (compatibilidade); use `catalogoPortas(lang)` para o idioma ativo. */
export const CATALOGO_PORTAS_BR: OpeningType[] = catalogoPortas('pt');
