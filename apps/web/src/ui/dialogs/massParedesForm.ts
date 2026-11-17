/**
 * Lógica pura do diálogo "Paredes da massa" (ficha D2): os tipos de parede do projeto, a regra de quando o botão Gerar fica desligado e a
 * nota do aviso 4 do kernel (face lateral inclinada). A massa única e os níveis dentro dela vêm de `massPisosForm.ts`. Não importa React.
 */
import type { AvisoMassaProjeto, DerivacaoParedesTorcidas, ModoParedesTorcidas } from '@hestia/engine';
import { WALL_TILT_MAX, curtainWallTypes, isCurtainType, type Id, type Project, type WallType } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';

/** Limite superior da tolerância de simplificação (m): acima disso o contorno some (A.7 deixa o padrão em 5 cm). */
export const TOLERANCIA_MAXIMA_PAREDE = 0.5;
/** Limite superior do segmento mínimo (m): acima disso quase nenhuma parede sobra. */
export const SEGMENTO_MINIMO_MAXIMO = 5;
/** Código do aviso 4 do kernel (A.4 regra 12): face lateral com inclinação maior que 5° da vertical. */
export const CODIGO_AVISO_FACE_INCLINADA = 4;

/** Tipos de parede do projeto, na ordem dele. */
export function tiposDeParede(p: Project): Array<{ id: Id; name: string }> {
  return Object.values(p.wallTypes).map((x) => ({ id: x.id, name: x.name }));
}

/** Desvio máximo permitido no formulário (m). */
export const DESVIO_MAXIMO_FORMULARIO = 1;
/** Passos máximos por nível permitidos no formulário. */
export const PASSOS_MAXIMOS_FORMULARIO = 64;
/** Passo de cortina menor que isto (m) avisa: a grade da cortina não cabe em faixas tão baixas. */
export const PASSO_MINIMO_CORTINA = 0.6;

/** Uma opção do seletor de tipo de parede: do projeto, ou um modelo de cortina de vidro que ainda não está no projeto (entra ao gerar). */
export interface OpcaoTipoParede {
  id: Id;
  name: string;
  grupo: 'projeto' | 'cortina';
  cortina: boolean;
  /** Tipo a incluir no projeto ao gerar (só os modelos de cortina que ainda não estão nele). */
  novo?: WallType;
}

/** Tipos do projeto (alvenaria e cortina) e, depois, os modelos de cortina de vidro que o projeto ainda não tem. */
export function opcoesDeTipoParede(p: Project, lang: Parameters<typeof curtainWallTypes>[0] = 'pt'): OpcaoTipoParede[] {
  const doProjeto: OpcaoTipoParede[] = Object.values(p.wallTypes).map((x) => ({ id: x.id, name: x.name, grupo: 'projeto', cortina: isCurtainType(x) }));
  const modelos: OpcaoTipoParede[] = curtainWallTypes(lang)
    .filter((x) => !p.wallTypes[x.id])
    .map((x) => ({ id: x.id, name: x.name, grupo: 'cortina', cortina: true, novo: x }));
  return [...doProjeto, ...modelos];
}

/** Fachada (quadrante da normal externa): N = +Y, L = +X, S = −Y, O = −X; a normal externa é a esquerda de a→b (cadeia horária). */
export type Fachada = 'n' | 'l' | 's' | 'o';
export const FACHADAS: readonly Fachada[] = ['n', 'l', 's', 'o'];

export function fachadaDe(a: Vec2, b: Vec2): Fachada {
  const nx = -(b.y - a.y);
  const ny = b.x - a.x;
  const ang = (Math.atan2(ny, nx) * 180) / Math.PI; // (-180, 180]
  if (ang >= 45 && ang < 135) return 'n';
  if (ang >= -45 && ang < 45) return 'l';
  if (ang >= -135 && ang < -45) return 's';
  return 'o';
}

/** Tipo de cada parede de uma cadeia (índice i = segmento de `pontos[i]` a `pontos[i+1]`) pela fachada da sua normal externa. */
export function tiposPorFachada(pontos: readonly Vec2[], porFachada: Readonly<Record<Fachada, Id>>): Id[] {
  return pontos.map((a, i) => porFachada[fachadaDe(a, pontos[(i + 1) % pontos.length]!)]);
}

/** Avisos de uma derivação (chaves de texto e argumentos), para o diálogo mostrar. */
export interface AvisoDialogoParedes {
  chave: string;
  args?: Record<string, string | number>;
}

export function avisosDaDerivacao(d: DerivacaoParedesTorcidas, usaCortina: boolean, modo: ModoParedesTorcidas, aberturas: number): AvisoDialogoParedes[] {
  const out: AvisoDialogoParedes[] = [];
  if (d.avisos.limiteDePassos > 0) out.push({ chave: 'ui_mw_warn_limite', args: { n: d.avisos.limiteDePassos } });
  if (d.avisos.inclinacaoLimitada > 0) out.push({ chave: 'ui_mw_warn_incl', args: { n: d.avisos.inclinacaoLimitada, max: WALL_TILT_MAX } });
  if (d.avisos.segmentosFundidos > 0) out.push({ chave: 'ui_mw_warn_fund', args: { n: d.avisos.segmentosFundidos } });
  if (usaCortina && d.avisos.inclinacaoLimitada > 0) out.push({ chave: 'ui_mw_warn_cortina_limite', args: { max: WALL_TILT_MAX } });
  if (usaCortina && modo === 'porTolerancia' && d.porNivel.some((n) => n.passos.some((ps) => ps.altura < PASSO_MINIMO_CORTINA - 1e-9 && ps.cadeias.some((c) => c.tilts.some((t) => t !== 0)))))
    out.push({ chave: 'ui_mw_warn_cortina_passo', args: { min: PASSO_MINIMO_CORTINA } });
  if (aberturas > 0) out.push({ chave: 'ui_mw_warn_aberturas', args: { n: aberturas } });
  return out;
}

export interface FormularioParedesMassa {
  /** Níveis marcados (ids de nível do projeto). */
  niveis: readonly Id[];
  /** Tipo de parede escolhido. */
  typeId: Id;
  /** Tolerância de simplificação em metros. */
  tolerancia: number;
  /** Segmento mínimo em metros. */
  segmentoMinimo: number;
  /** Desvio máximo (m) do modo por tolerância; ausente = não valida. */
  desvioMax?: number;
  /** Passos máximos por nível; ausente = não valida. */
  maxPassos?: number;
}

/** Chave de texto do motivo pelo qual Gerar não pode rodar, ou `null` se pode. */
export type MotivoNaoGerarParedes = 'ui_mw_no_mass' | 'ui_mw_no_levels' | 'ui_mw_no_type' | 'ui_mw_bad_tol' | 'ui_mw_bad_min' | 'ui_mw_bad_desvio' | 'ui_mw_bad_passos';

export function motivoNaoGerarParedes(f: FormularioParedesMassa, temMassa: boolean): MotivoNaoGerarParedes | null {
  if (!temMassa) return 'ui_mw_no_mass';
  if (f.niveis.length === 0) return 'ui_mw_no_levels';
  if (!f.typeId) return 'ui_mw_no_type';
  if (!Number.isFinite(f.tolerancia) || f.tolerancia < 0 || f.tolerancia > TOLERANCIA_MAXIMA_PAREDE) return 'ui_mw_bad_tol';
  if (!Number.isFinite(f.segmentoMinimo) || f.segmentoMinimo <= 0 || f.segmentoMinimo > SEGMENTO_MINIMO_MAXIMO) return 'ui_mw_bad_min';
  if (f.desvioMax !== undefined && (!Number.isFinite(f.desvioMax) || f.desvioMax <= 0 || f.desvioMax > DESVIO_MAXIMO_FORMULARIO)) return 'ui_mw_bad_desvio';
  if (f.maxPassos !== undefined && (!Number.isInteger(f.maxPassos) || f.maxPassos < 1 || f.maxPassos > PASSOS_MAXIMOS_FORMULARIO)) return 'ui_mw_bad_passos';
  return null;
}

/**
 * Nota do aviso 4 para a massa: a chave do texto quando o kernel acusa face inclinada nela (em qualquer pavimento), ou `null`. Sem kernel
 * (`avisos` é `null`) não há nota.
 */
export function notaDaFaceInclinada(avisos: readonly AvisoMassaProjeto[] | null, massaId: Id): 'ui_mw_face_note' | null {
  return (avisos ?? []).some((a) => a.massaId === massaId && a.codigo === CODIGO_AVISO_FACE_INCLINADA) ? 'ui_mw_face_note' : null;
}
