import { isGuardaCorpo, normaDe, type GuardaCorpo, type Id, type LimitesNormaGC, type PerfilNorma, type Project, type TipoGuardaCorpo, type ValidationIssue } from '@hestia/model';
import type { Lang } from './i18nMessages.ts';

/** Aviso de guarda-corpo (molde de `StairIssueItem`). Nunca bloqueia; 'error' só para modelo inválido. */
export interface GuardaCorpoIssueItem {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  guardaId: Id;
  trecho?: number;
  ids?: string[];
}

/** Medida devolvida por `guarda_avisos` (decodificada). */
export interface MedidaAvisoGC {
  guardaId: Id;
  codigo: number;
  trecho: number;
  indice: number;
  medido: number;
  limite: number;
  x: number;
  y: number;
  z: number;
}

/** Código numérico de `guarda_avisos` (igual a `gc_avisos.rs`) para o código textual. */
export const CODIGO_AVISO_GC: Record<number, string> = {
  1: 'gc-vao-grande',
  2: 'gc-vao-inferior',
  3: 'gc-corrimao-altura',
  4: 'gc-corrimao-extensao',
  5: 'gc-altura-baixa',
  // Geometria degenerada (ADR 0055, §23): o texto não depende de norma.
  6: 'gc-hospedeiro-descontinuo',
  7: 'gc-deslocamento-excede-largura',
  8: 'gc-trecho-curto',
  9: 'gc-caminho-repetido',
  10: 'gc-caminho-nulo',
  11: 'gc-sem-borda',
  12: 'gc-perfil-auto-intersecta',
  13: 'gc-padrao-nao-cabe',
  14: 'gc-padrao-comprimido',
  15: 'gc-vao-sem-espaco',
  16: 'gc-poste-sobra-curta',
  17: 'gc-montante-fora-do-piso',
};

/** Códigos de geometria degenerada: nunca bloqueiam e não têm limite de norma (sem "a conferir"). */
export const CODIGOS_GEOMETRIA_GC = [
  'gc-hospedeiro-descontinuo',
  'gc-deslocamento-excede-largura',
  'gc-trecho-curto',
  'gc-caminho-repetido',
  'gc-caminho-nulo',
  'gc-sem-borda',
  'gc-perfil-auto-intersecta',
  'gc-padrao-nao-cabe',
  'gc-padrao-comprimido',
  'gc-vao-sem-espaco',
  'gc-poste-sobra-curta',
  'gc-montante-fora-do-piso',
] as const;
export type CodigoGeometriaGC = (typeof CODIGOS_GEOMETRIA_GC)[number];
const EH_GEOMETRIA = new Set<string>(CODIGOS_GEOMETRIA_GC);

// Textos dos avisos de geometria nos sete idiomas. {medido} e {limite} vêm do Rust (metros; no `gc-caminho-repetido`, a contagem).
const GEO: Record<Lang, Record<CodigoGeometriaGC, string>> = {
  pt: {
    'gc-hospedeiro-descontinuo': 'O hospedeiro tem uma folga de {medido} m entre dois trechos (tolerância {limite} m): o guarda-corpo foi aberto em dois caminhos.',
    'gc-deslocamento-excede-largura': 'O deslocamento de {medido} m passa da largura disponível: este trecho não foi desenhado.',
    'gc-trecho-curto': 'O trecho é curto demais ({medido} m) e vira um ponto: não foi desenhado.',
    'gc-caminho-repetido': 'O caminho manual tem {medido} vértice(s) repetido(s): foram ignorados.',
    'gc-caminho-nulo': 'O caminho manual não tem segmento (menos de dois vértices distintos): nada foi desenhado.',
    'gc-sem-borda': 'O hospedeiro não tem borda no lado pedido: nada foi desenhado nesse lado.',
    'gc-perfil-auto-intersecta': 'Curva apertada: o perfil recua {medido} m por dentro e o menor segmento tem {limite} m; as peças podem se sobrepor.',
    'gc-padrao-nao-cabe': 'O padrão de balaústres não cabe no vão de {medido} m: só entram os elementos que cabem.',
    'gc-padrao-comprimido': 'O período do padrão foi comprimido para {medido} m, menos da metade do pedido.',
    'gc-vao-sem-espaco': 'O vão de {medido} m não tem espaço para balaústres nem painel.',
    'gc-poste-sobra-curta': 'A sobra de {medido} m no fim do trecho é curta demais para um poste.',
    'gc-montante-fora-do-piso': "O montante por degrau não cabe inteiro sobre o piso de {medido} m de pisada (invadiria o espelho ou o bocel): os que não cabem não foram desenhados.",
  },
  en: {
    'gc-hospedeiro-descontinuo': 'The host has a {medido} m gap between two segments (tolerance {limite} m): the railing was split into two paths.',
    'gc-deslocamento-excede-largura': 'The {medido} m offset exceeds the available width: this segment was not drawn.',
    'gc-trecho-curto': 'The segment is too short ({medido} m) and collapses to a point: it was not drawn.',
    'gc-caminho-repetido': 'The manual path has {medido} repeated vertex(es): they were ignored.',
    'gc-caminho-nulo': 'The manual path has no segment (fewer than two distinct vertices): nothing was drawn.',
    'gc-sem-borda': 'The host has no edge on the requested side: nothing was drawn on that side.',
    'gc-perfil-auto-intersecta': 'Tight bend: the profile recedes {medido} m on the inside and the shortest segment is {limite} m; the parts may overlap.',
    'gc-padrao-nao-cabe': 'The baluster pattern does not fit the {medido} m bay: only the elements that fit are placed.',
    'gc-padrao-comprimido': 'The pattern period was squeezed to {medido} m, less than half of the requested one.',
    'gc-vao-sem-espaco': 'The {medido} m bay has no room for balusters or a panel.',
    'gc-poste-sobra-curta': 'The {medido} m left at the end of the segment is too short for a post.',
    'gc-montante-fora-do-piso': "The per-tread baluster does not fit entirely on the {medido} m tread (it would hit the riser or the nosing): those that do not fit were not drawn.",
  },
  es: {
    'gc-hospedeiro-descontinuo': 'El anfitrión tiene una holgura de {medido} m entre dos tramos (tolerancia {limite} m): la barandilla se abrió en dos caminos.',
    'gc-deslocamento-excede-largura': 'El desplazamiento de {medido} m supera el ancho disponible: este tramo no se dibujó.',
    'gc-trecho-curto': 'El tramo es demasiado corto ({medido} m) y se reduce a un punto: no se dibujó.',
    'gc-caminho-repetido': 'El camino manual tiene {medido} vértice(s) repetido(s): se ignoraron.',
    'gc-caminho-nulo': 'El camino manual no tiene segmento (menos de dos vértices distintos): no se dibujó nada.',
    'gc-sem-borda': 'El anfitrión no tiene borde en el lado pedido: no se dibujó nada en ese lado.',
    'gc-perfil-auto-intersecta': 'Curva cerrada: el perfil retrocede {medido} m por dentro y el segmento más corto mide {limite} m; las piezas pueden superponerse.',
    'gc-padrao-nao-cabe': 'El patrón de balaustres no cabe en el vano de {medido} m: solo entran los elementos que caben.',
    'gc-padrao-comprimido': 'El período del patrón se comprimió a {medido} m, menos de la mitad del pedido.',
    'gc-vao-sem-espaco': 'El vano de {medido} m no tiene espacio para balaustres ni panel.',
    'gc-poste-sobra-curta': 'Los {medido} m que sobran al final del tramo son demasiado cortos para un poste.',
    'gc-montante-fora-do-piso': "El balaustre por peldaño no cabe entero sobre la huella de {medido} m (chocaría con la contrahuella o el borde): los que no caben no se dibujaron.",
  },
  de: {
    'gc-hospedeiro-descontinuo': 'Das Trägerbauteil hat {medido} m Lücke zwischen zwei Abschnitten (Toleranz {limite} m): das Geländer wurde in zwei Pfade geteilt.',
    'gc-deslocamento-excede-largura': 'Der Versatz von {medido} m überschreitet die verfügbare Breite: dieser Abschnitt wurde nicht gezeichnet.',
    'gc-trecho-curto': 'Der Abschnitt ist zu kurz ({medido} m) und wird zu einem Punkt: er wurde nicht gezeichnet.',
    'gc-caminho-repetido': 'Der manuelle Pfad hat {medido} doppelte(n) Eckpunkt(e): sie wurden ignoriert.',
    'gc-caminho-nulo': 'Der manuelle Pfad hat kein Segment (weniger als zwei verschiedene Eckpunkte): es wurde nichts gezeichnet.',
    'gc-sem-borda': 'Das Trägerbauteil hat auf der gewünschten Seite keine Kante: auf dieser Seite wurde nichts gezeichnet.',
    'gc-perfil-auto-intersecta': 'Enge Kurve: das Profil weicht innen um {medido} m zurück und das kürzeste Segment misst {limite} m; die Teile können sich überschneiden.',
    'gc-padrao-nao-cabe': 'Das Stabmuster passt nicht in das Feld von {medido} m: nur die passenden Elemente werden gesetzt.',
    'gc-padrao-comprimido': 'Die Musterperiode wurde auf {medido} m gestaucht, weniger als die Hälfte des Gewünschten.',
    'gc-vao-sem-espaco': 'Das Feld von {medido} m hat keinen Platz für Stäbe oder Füllung.',
    'gc-poste-sobra-curta': 'Der Rest von {medido} m am Ende des Abschnitts ist für einen Pfosten zu kurz.',
    'gc-montante-fora-do-piso': "Der Stab je Stufe passt nicht ganz auf die Trittfläche von {medido} m (er würde Setzstufe oder Vorderkante berühren): nicht passende wurden nicht gezeichnet.",
  },
  fr: {
    'gc-hospedeiro-descontinuo': "L'hôte présente un jeu de {medido} m entre deux tronçons (tolérance {limite} m) : le garde-corps a été scindé en deux chemins.",
    'gc-deslocamento-excede-largura': "Le décalage de {medido} m dépasse la largeur disponible : ce tronçon n'a pas été dessiné.",
    'gc-trecho-curto': "Le tronçon est trop court ({medido} m) et se réduit à un point : il n'a pas été dessiné.",
    'gc-caminho-repetido': 'Le chemin manuel compte {medido} sommet(s) répété(s) : ils ont été ignorés.',
    'gc-caminho-nulo': "Le chemin manuel n'a aucun segment (moins de deux sommets distincts) : rien n'a été dessiné.",
    'gc-sem-borda': "L'hôte n'a pas de bord du côté demandé : rien n'a été dessiné de ce côté.",
    'gc-perfil-auto-intersecta': "Courbe serrée : le profil recule de {medido} m à l'intérieur et le plus petit segment mesure {limite} m ; les pièces peuvent se chevaucher.",
    'gc-padrao-nao-cabe': 'Le motif de barreaux ne tient pas dans la travée de {medido} m : seuls les éléments qui tiennent sont posés.',
    'gc-padrao-comprimido': 'La période du motif a été comprimée à {medido} m, moins de la moitié de la valeur demandée.',
    'gc-vao-sem-espaco': "La travée de {medido} m n'a pas de place pour des barreaux ni un panneau.",
    'gc-poste-sobra-curta': 'Les {medido} m restants en fin de tronçon sont trop courts pour un poteau.',
    'gc-montante-fora-do-piso': "Le balustre par marche ne tient pas entièrement sur le giron de {medido} m (il toucherait la contremarche ou le nez de marche) : ceux qui ne tiennent pas n'ont pas été dessinés.",
  },
  it: {
    'gc-hospedeiro-descontinuo': "L'ospite ha un gioco di {medido} m tra due tratti (tolleranza {limite} m): il parapetto è stato aperto in due percorsi.",
    'gc-deslocamento-excede-largura': 'Lo scostamento di {medido} m supera la larghezza disponibile: questo tratto non è stato disegnato.',
    'gc-trecho-curto': 'Il tratto è troppo corto ({medido} m) e si riduce a un punto: non è stato disegnato.',
    'gc-caminho-repetido': 'Il percorso manuale ha {medido} vertice/i ripetuto/i: sono stati ignorati.',
    'gc-caminho-nulo': 'Il percorso manuale non ha segmenti (meno di due vertici distinti): non è stato disegnato nulla.',
    'gc-sem-borda': "L'ospite non ha bordo sul lato richiesto: su quel lato non è stato disegnato nulla.",
    'gc-perfil-auto-intersecta': "Curva stretta: il profilo arretra di {medido} m all'interno e il segmento più corto misura {limite} m; i pezzi possono sovrapporsi.",
    'gc-padrao-nao-cabe': 'Il motivo dei balaustri non entra nella campata di {medido} m: entrano solo gli elementi che ci stanno.',
    'gc-padrao-comprimido': 'Il periodo del motivo è stato compresso a {medido} m, meno della metà del richiesto.',
    'gc-vao-sem-espaco': 'La campata di {medido} m non ha spazio per balaustri né pannello.',
    'gc-poste-sobra-curta': 'I {medido} m avanzati a fine tratto sono troppo corti per un montante.',
    'gc-montante-fora-do-piso': "Il balaustro per gradino non sta interamente sulla pedata di {medido} m (urterebbe l'alzata o il bordo): quelli che non ci stanno non sono stati disegnati.",
  },
  pl: {
    'gc-hospedeiro-descontinuo': 'Element nośny ma przerwę {medido} m między dwoma odcinkami (tolerancja {limite} m): balustradę podzielono na dwie ścieżki.',
    'gc-deslocamento-excede-largura': 'Przesunięcie {medido} m przekracza dostępną szerokość: ten odcinek nie został narysowany.',
    'gc-trecho-curto': 'Odcinek jest zbyt krótki ({medido} m) i zamienia się w punkt: nie został narysowany.',
    'gc-caminho-repetido': 'Ścieżka ręczna ma {medido} powtórzonych wierzchołków: zostały pominięte.',
    'gc-caminho-nulo': 'Ścieżka ręczna nie ma odcinka (mniej niż dwa różne wierzchołki): nic nie narysowano.',
    'gc-sem-borda': 'Element nośny nie ma krawędzi po żądanej stronie: po tej stronie nic nie narysowano.',
    'gc-perfil-auto-intersecta': 'Ciasny łuk: profil cofa się o {medido} m od wewnątrz, a najkrótszy odcinek ma {limite} m; elementy mogą się nakładać.',
    'gc-padrao-nao-cabe': 'Wzór tralek nie mieści się w przęśle {medido} m: umieszczono tylko mieszczące się elementy.',
    'gc-padrao-comprimido': 'Okres wzoru został ściśnięty do {medido} m, mniej niż połowa żądanego.',
    'gc-vao-sem-espaco': 'Przęsło {medido} m nie ma miejsca na tralki ani panel.',
    'gc-poste-sobra-curta': 'Pozostałe {medido} m na końcu odcinka to za mało na słupek.',
    'gc-montante-fora-do-piso': "Słupek na stopień nie mieści się w całości na stopnicy {medido} m (uderzyłby w podstopnicę lub krawędź): te, które się nie mieszczą, nie zostały narysowane.",
  },
};

// Estas mensagens ficam aqui, em pt e en (os demais idiomas caem em pt), para não tocar o dicionário `egb_` espelhado no app.
const MSG = {
  pt: {
    conferir: ' (norma a conferir)',
    'gc-altura-baixa': 'Guarda-corpo com {medido} m de altura; a norma pede no mínimo {limite} m.',
    'gc-vao-grande': 'Abertura em que passa esfera de {medido} m; o máximo é {limite} m.',
    'gc-vao-inferior': 'Folga inferior de {medido} m; o máximo é {limite} m.',
    'gc-corrimao-altura': 'Topo do corrimão a {medido} m; o limite mais próximo é {limite} m.',
    'gc-corrimao-extensao': 'Extensão do corrimão de {medido} m; o mínimo é {limite} m.',
    'gc-corrimao-diametro': 'Corrimão com {medido} m de diâmetro; a faixa é de {min} a {max} m.',
    'gc-corrimao-forma': 'Corrimão de seção não circular: confira a preensão.',
    'gc-corrimao-afastamento': 'Afastamento do corrimão de {medido} m; o mínimo é {limite} m.',
    'gc-carga-nao-declarada': 'O tipo não declara carga {carga} de pelo menos {limite} {unidade}.',
  },
  en: {
    conferir: ' (code to be checked)',
    'gc-altura-baixa': 'Railing is {medido} m high; the code asks for at least {limite} m.',
    'gc-vao-grande': 'Opening lets a {medido} m sphere through; the maximum is {limite} m.',
    'gc-vao-inferior': 'Bottom gap of {medido} m; the maximum is {limite} m.',
    'gc-corrimao-altura': 'Handrail top at {medido} m; the nearest limit is {limite} m.',
    'gc-corrimao-extensao': 'Handrail extension of {medido} m; the minimum is {limite} m.',
    'gc-corrimao-diametro': 'Handrail diameter {medido} m; the range is {min} to {max} m.',
    'gc-corrimao-forma': 'Non-circular handrail section: check the grip.',
    'gc-corrimao-afastamento': 'Handrail clearance of {medido} m; the minimum is {limite} m.',
    'gc-carga-nao-declarada': 'The type does not declare a {carga} load of at least {limite} {unidade}.',
  },
} as const;
type Chave = Exclude<keyof (typeof MSG)['pt'], 'conferir'>;

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);
function msg(lang: Lang, key: Chave, args: Record<string, string | number>, conferir: boolean): string {
  const d = lang === 'en' ? MSG.en : MSG.pt;
  const base = d[key].replace(/\{(\w+)\}/g, (w, n: string) => {
    const v = args[n];
    return v === undefined ? w : typeof v === 'number' ? fmt(v) : v;
  });
  return conferir ? base + d.conferir : base;
}

/** Mensagem de um aviso de geometria no idioma pedido. */
export function mensagemGeometria(lang: Lang, code: CodigoGeometriaGC, medido: number, limite: number): string {
  return GEO[lang][code].replace(/\{(\w+)\}/g, (_, n: string) => fmt(n === 'medido' ? medido : limite));
}

// Sufixo de contagem quando o mesmo problema se repete (por lado, por ponta ou por trecho): um aviso só, com quantas vezes aparece.
const REPETICOES: Record<Lang, string> = {
  pt: ' ({n} ocorrências)',
  en: ' ({n} occurrences)',
  es: ' ({n} ocurrencias)',
  de: ' ({n} Vorkommen)',
  fr: ' ({n} occurrences)',
  it: ' ({n} occorrenze)',
  pl: ' ({n} wystąpień)',
};

/**
 * Junta os avisos iguais (mesmo guarda-corpo, mesmo código e mesmo texto) num só, com a contagem no fim da mensagem. Um problema distinto continua
 * sendo um aviso distinto; a ordem da primeira aparição é mantida.
 */
export function agruparAvisosGuardaCorpo(avisos: readonly ValidationIssue[], lang: Lang = 'pt'): ValidationIssue[] {
  const grupos = new Map<string, { aviso: ValidationIssue; n: number }>();
  for (const a of avisos) {
    const chave = `${a.elementId ?? ''}|${a.code}|${a.message}`;
    const g = grupos.get(chave);
    if (g) g.n += 1;
    else grupos.set(chave, { aviso: a, n: 1 });
  }
  return [...grupos.values()].map(({ aviso, n }) => (n > 1 ? { ...aviso, message: aviso.message + REPETICOES[lang].replace('{n}', String(n)) } : aviso));
}

/**
 * Avisos que o kernel mede (geometria degenerada e norma: vão, altura, corrimão), no formato da lista de avisos do projeto, que é onde o painel de
 * avisos e a barra de status os mostram. Cada problema distinto sai uma vez, com a contagem quando se repete. Vazio sem kernel pronto (`medidas` nulo).
 */
export function guardaCorpoAvisosDeGeometria(p: Project, medidas: readonly MedidaAvisoGC[] | null, lang: Lang = 'pt'): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const m of medidas ?? []) {
    const g = p.elements[m.guardaId];
    if (!g || !isGuardaCorpo(g)) continue;
    const tipo = p.tiposGuardaCorpo[g.typeId];
    if (!tipo) continue;
    const [aviso] = guardaCorpoMedidasParaAvisos([m], normaDe(p, g.sobrescritas?.normaId ? { normaId: g.sobrescritas.normaId } : tipo), lang);
    if (aviso) out.push({ severity: 'warning', code: aviso.code, message: aviso.message, elementId: m.guardaId, ids: [m.guardaId] });
  }
  return agruparAvisosGuardaCorpo(out, lang);
}

/** O limite ainda precisa ser conferido: a fonte do campo não é verificada ou, sem fonte, o perfil inteiro não é. */
export function precisaConferir(norma: PerfilNorma, campo: keyof LimitesNormaGC): boolean {
  const f = norma.fontes[campo];
  return f ? !f.verificado : !norma.verificado;
}

function item(g: Id, code: string, message: string, trecho?: number): GuardaCorpoIssueItem {
  const i: GuardaCorpoIssueItem = { code, severity: 'warning', message, guardaId: g, ids: [g] };
  if (trecho !== undefined) i.trecho = trecho;
  return i;
}

/** Regras que dependem só da configuração (tipo, instância e norma); não esperam o Rust. */
export function guardaCorpoRegrasDoTipo(g: GuardaCorpo, tipo: TipoGuardaCorpo, norma: PerfilNorma, lang: Lang = 'pt'): GuardaCorpoIssueItem[] {
  const out: GuardaCorpoIssueItem[] = [];
  const l = norma.limites;
  const altura = g.altura ?? tipo.altura;
  if (l.alturaMinima !== undefined && altura < l.alturaMinima - 1e-9) {
    out.push(item(g.id, 'gc-altura-baixa', msg(lang, 'gc-altura-baixa', { medido: altura, limite: l.alturaMinima }, precisaConferir(norma, 'alturaMinima'))));
  }
  for (const c of tipo.corrimaos) {
    if (c.funcao !== 'corrimao') continue;
    const { corrimaoDiametroMin: min, corrimaoDiametroMax: max } = l;
    if (c.perfil.forma === 'circular') {
      if ((min !== undefined && c.perfil.largura < min - 1e-9) || (max !== undefined && c.perfil.largura > max + 1e-9)) {
        out.push(item(g.id, 'gc-corrimao-diametro', msg(lang, 'gc-corrimao-diametro', { medido: c.perfil.largura, min: min ?? 0, max: max ?? 'sem limite' }, precisaConferir(norma, 'corrimaoDiametroMin'))));
      }
    } else if (min !== undefined || max !== undefined) {
      out.push(item(g.id, 'gc-corrimao-diametro', msg(lang, 'gc-corrimao-forma', {}, false)));
    }
    if (l.corrimaoAfastamentoMin !== undefined && c.afastamento < l.corrimaoAfastamentoMin - 1e-9) {
      out.push(item(g.id, 'gc-corrimao-afastamento', msg(lang, 'gc-corrimao-afastamento', { medido: c.afastamento, limite: l.corrimaoAfastamentoMin }, precisaConferir(norma, 'corrimaoAfastamentoMin'))));
    }
  }
  const carga = (campo: 'cargaLinear' | 'cargaArea' | 'cargaPontual', lim: number | undefined, limCampo: keyof LimitesNormaGC, unidade: string): void => {
    if (lim === undefined) return;
    const v = tipo[campo];
    if (v === null || v < lim) out.push(item(g.id, 'gc-carga-nao-declarada', msg(lang, 'gc-carga-nao-declarada', { carga: campo, limite: lim, unidade }, precisaConferir(norma, limCampo))));
  };
  carga('cargaLinear', l.cargaLinearHorizontal, 'cargaLinearHorizontal', 'N/m');
  carga('cargaArea', l.cargaAreaHorizontal, 'cargaAreaHorizontal', 'kPa');
  carga('cargaPontual', l.cargaPontualGuarda, 'cargaPontualGuarda', 'N');
  return out;
}

const CAMPO_DO_CODIGO: Record<string, keyof LimitesNormaGC> = {
  'gc-altura-baixa': 'alturaMinima',
  'gc-vao-grande': 'esferaMaxima',
  'gc-vao-inferior': 'folgaInferiorMaxima',
  'gc-corrimao-altura': 'corrimaoAlturaMin',
  'gc-corrimao-extensao': 'corrimaoExtensaoMin',
};

/** Traduz as medidas do Rust em avisos (texto e sufixo "a conferir"). Código desconhecido é ignorado. */
export function guardaCorpoMedidasParaAvisos(medidas: readonly MedidaAvisoGC[], norma: PerfilNorma, lang: Lang = 'pt'): GuardaCorpoIssueItem[] {
  const out: GuardaCorpoIssueItem[] = [];
  for (const m of medidas) {
    const code = CODIGO_AVISO_GC[m.codigo];
    if (code && EH_GEOMETRIA.has(code)) {
      out.push(item(m.guardaId, code, mensagemGeometria(lang, code as CodigoGeometriaGC, m.medido, m.limite), m.trecho));
      continue;
    }
    const campo = code ? CAMPO_DO_CODIGO[code] : undefined;
    if (!code || !campo) continue;
    out.push(item(m.guardaId, code, msg(lang, code as Chave, { medido: m.medido, limite: m.limite }, precisaConferir(norma, campo)), m.trecho));
  }
  return out;
}

/** Avisos de configuração do projeto (cada guarda-corpo contra a norma do seu tipo ou da sua instância). Ordem estável. */
export function guardaCorpoIssues(p: Project, lang: Lang = 'pt'): GuardaCorpoIssueItem[] {
  const out: GuardaCorpoIssueItem[] = [];
  const gs = Object.values(p.elements).filter(isGuardaCorpo).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const g of gs) {
    const tipo = p.tiposGuardaCorpo[g.typeId];
    if (!tipo) continue;
    const alvo = g.sobrescritas?.normaId ? { normaId: g.sobrescritas.normaId } : tipo;
    out.push(...guardaCorpoRegrasDoTipo(g, tipo, normaDe(p, alvo), lang));
  }
  return out;
}
