/**
 * Avisos da massa (plano de massa, A.5 e A.8 item 6): o kernel devolve MEDIDAS (consulta 145) e aqui o TS decide texto, severidade e o elemento do
 * "Ir para". Nunca bloqueiam. Três avisos são só do TS: `massa-sem-kernel` (kernel desligado ou indisponível), `massa-invalida` (o modelo recusa a
 * massa, ou o kernel recusou a entrada com ENTRADA) e os demais vêm do kernel com o código de `AVISO_MASSA`.
 *
 * Os textos ficam neste arquivo (pt e en; os demais idiomas caem em pt), no molde de `cortinaIssues.ts`.
 */
import { massIssue, type Id, type Project, type ValidationIssue } from '@hestia/model';
import type { Lang } from './i18nMessages.ts';
import { AVISO_MASSA } from './kernelMassa.ts';
import { entradaMassaDoProjeto } from './massaProjeto.ts';
import type { AvisoMassaProjeto, ServicoMassa } from './massaServico.ts';
import { CODIGOS } from '../../geom/src/kernel/v2/esquema.gerado.ts';

/** Código textual de cada código numérico da consulta 145 (`AVISO_MASSA`). */
export const CODIGO_AVISO_MASSA: Record<number, string> = {
  [AVISO_MASSA.anelAutointersecta]: 'massa-anel-autointersecta',
  [AVISO_MASSA.copiasSobrepostas]: 'massa-copias-sobrepostas',
  [AVISO_MASSA.limite]: 'massa-limite',
  [AVISO_MASSA.faceInclinada]: 'massa-face-inclinada',
};

/** Informativo (a massa continua correta): a face inclinada só diz que a parede vertical é aproximação. */
const INFORMATIVOS = new Set<string>(['massa-face-inclinada']);

type Chave = keyof (typeof MSG)['pt'];

const MSG = {
  pt: {
    'massa-anel-autointersecta': 'Massa: o contorno de uma seção se cruza {medido} vez(es) consigo mesmo; a área dela pode estar errada.',
    'massa-copias-sobrepostas': 'Massa: as cópias do arranjo se sobrepõem num pavimento; a área pode contar em dobro.',
    'massa-limite': 'Massa: o cálculo atingiu um limite de defesa ({medido} de {limite}); parte da massa pode não aparecer.',
    'massa-face-inclinada': 'Massa: uma face tem {medido}° de inclinação (acima de {limite}°); a parede vertical aproxima essa face.',
    'massa-sem-kernel': 'Massa: o kernel de geometria não está ligado; só o contorno da base é mostrado.',
    'massa-invalida': 'Massa: a geometria é inválida ({motivo}); ela não é calculada.',
    'massa-invalida-kernel': 'o kernel recusou as seções',
    'massa-invalida-nivel': 'o nível dela não existe no projeto',
  },
  en: {
    'massa-anel-autointersecta': 'Mass: the outline of a section crosses itself {medido} time(s); its area may be wrong.',
    'massa-copias-sobrepostas': 'Mass: the array copies overlap on a floor; the area may count twice.',
    'massa-limite': 'Mass: the calculation hit a kernel safety limit ({medido} of {limite}); part of the mass may not show.',
    'massa-face-inclinada': 'Mass: a face is inclined {medido}° (over {limite}°); the vertical wall only approximates that face.',
    'massa-sem-kernel': 'Mass: the geometry kernel is off; only the base outline is shown.',
    'massa-invalida': 'Mass: the geometry is invalid ({motivo}); it is not calculated.',
    'massa-invalida-kernel': 'the kernel refused the sections',
    'massa-invalida-nivel': 'its level does not exist in the project',
  },
} as const;

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

function texto(lang: Lang, codigo: Chave, vars: Record<string, number | string> = {}): string {
  const d = lang === 'en' ? MSG.en : MSG.pt;
  let s: string = d[codigo];
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, typeof v === 'number' ? fmt(v) : v);
  return s;
}

/** Medidas do kernel (consulta 145) -> avisos do projeto. Código desconhecido é ignorado (contrato novo sem texto ainda). */
export function massaAvisosDeGeometria(medidas: readonly AvisoMassaProjeto[] | null, lang: Lang = 'pt'): ValidationIssue[] {
  if (!medidas) return [];
  const out: ValidationIssue[] = [];
  for (const m of medidas) {
    const codigo = CODIGO_AVISO_MASSA[m.codigo];
    if (!codigo) continue;
    out.push({
      severity: INFORMATIVOS.has(codigo) ? 'info' : 'warning',
      code: codigo,
      message: texto(lang, codigo as Chave, { medido: m.medido, limite: m.limite }),
      elementId: m.massaId,
    });
  }
  return out;
}

/** `massa-sem-kernel`: um aviso por massa enviável enquanto o kernel não responde. */
function semKernel(ids: readonly Id[], lang: Lang): ValidationIssue[] {
  return ids.map((id) => ({ severity: 'warning', code: 'massa-sem-kernel', message: texto(lang, 'massa-sem-kernel'), elementId: id }));
}

function invalida(id: Id, motivo: string, lang: Lang): ValidationIssue {
  return { severity: 'warning', code: 'massa-invalida', message: texto(lang, 'massa-invalida', { motivo }), elementId: id };
}

/**
 * Todos os avisos da massa do projeto. Massas recusadas pelo modelo (ou em nível inexistente) sempre aparecem como `massa-invalida`, com ou sem
 * kernel. Com o kernel desligado ou indisponível, cada massa enviável ganha `massa-sem-kernel`. Se o kernel respondeu ENTRADA, as massas enviadas
 * ganham `massa-invalida` (o kernel não diz qual; a causa é comum a todas). Caso contrário, valem as medidas do kernel.
 */
export function massaAvisosDoProjeto(p: Project, srv: ServicoMassa, lang: Lang = 'pt'): ValidationIssue[] {
  const e = entradaMassaDoProjeto(p);
  const motivoDe = (id: Id): string => {
    const m = p.elements[id];
    if (m?.kind !== 'mass') return texto(lang, 'massa-invalida-nivel');
    return massIssue(m, lang) ?? texto(lang, 'massa-invalida-nivel');
  };
  const recusadas = e.invalidas.map((id) => invalida(id, motivoDe(id), lang));
  if (!srv.pronto()) return [...recusadas, ...semKernel(e.enviadas, lang)];
  const medidas = srv.avisos(p, null);
  if (medidas === null) {
    if (srv.ultimoErro() === CODIGOS.ENTRADA) return [...recusadas, ...e.enviadas.map((id) => invalida(id, texto(lang, 'massa-invalida-kernel'), lang))];
    return [...recusadas, ...semKernel(e.enviadas, lang)];
  }
  return [...recusadas, ...massaAvisosDeGeometria(medidas, lang)];
}
