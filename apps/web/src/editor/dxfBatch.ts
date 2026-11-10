import { floorViewId, planViewsOf, sectionGraphicsOf, sectionTitleOf, viewGraphicsOf, type Id, type Project } from '@hestia/model';
import type { DxfBatchFile, DxfBatchOptions, DxfBatchRenderers, DxfBatchResult, DxfBatchSkip, DxfBatchTarget } from './dxfBatch.types.ts';
import { t as tr, useI18n, type Lang } from './i18n.ts';
import { vistaDeArea } from './vistaDeArea.ts';

/** Idioma ativo (fora do React); `options.lang` manda quando presente. */
const activeLang = (): Lang => useI18n.getState().lang;

/**
 * Lote de exportação DXF (fase 4): a lista de documentos do projeto, o nome de cada arquivo, o manifest e o pacote que o
 * diálogo transforma em ZIP. Funções puras, sem React: os renderizadores entram por parâmetro (a prancha vem do compositor
 * da folha, que não é acoplado aqui).
 */

/** Nome de arquivo seguro: sem acento (NFD), espaço e demais caracteres viram '-', sobra só [A-Za-z0-9._-]. */
export function dxfSanitizeName(text: string, lang: Lang = 'pt'): string {
  const limpo = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/^-+|-+$/g, '');
  return limpo || tr(lang, 'io_batch_no_name');
}

/** Documentos exportáveis do projeto, na ordem do diálogo: plantas, áreas, cortes/elevações e pranchas. */
export function dxfBatchTargetsOf(p: Project): DxfBatchTarget[] {
  return [
    ...p.levels.map((l): DxfBatchTarget => ({ kind: 'plan', key: `plan:${l.id}`, levelId: l.id, label: l.name, group: 'plantas' })),
    ...planViewsOf(p).filter((v) => v.kind === 'area').map((a): DxfBatchTarget => ({ kind: 'area', key: `area:${a.id}`, planId: a.id, label: a.name, group: 'areas' })),
    ...p.views.map(
      (v): DxfBatchTarget => ({ kind: 'section', key: `section:${v.id}`, viewId: v.id, label: sectionTitleOf(v), group: 'cortes', elevation: v.kind === 'elevation' }),
    ),
    ...(p.sheets ?? []).map((s): DxfBatchTarget => ({ kind: 'sheet', key: `sheet:${s.id}`, sheetId: s.id, label: `${s.number} ${s.name}`, group: 'pranchas' })),
  ];
}

/** Data local no formato AAAA-MM-DD. */
function dataLocal(d: Date): string {
  const aaaa = String(d.getFullYear()).padStart(4, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${aaaa}-${mm}-${dd}`;
}

/** Nome do ZIP do lote: `<prefixo>-DXF-AAAA-MM-DD.zip`, com o prefixo sanitizado e a data local. */
export function dxfBatchZipName(p: Project, date: Date = new Date(), prefix = p.name, lang: Lang = 'pt'): string {
  const nome = prefix.trim() || p.name.trim() || tr(lang, 'io_batch_default_project');
  return `${dxfSanitizeName(nome, lang)}-DXF-${dataLocal(date)}.zip`;
}

/** Pasta de cada alvo no ZIP (elevação vai em ELEVACOES/). */
function pastaOf(t: DxfBatchTarget, lang: Lang): string {
  if (t.kind === 'plan') return `${tr(lang, 'io_batch_folder_plans')}/`;
  if (t.kind === 'area') return `${tr(lang, 'io_batch_folder_areas')}/`;
  if (t.kind === 'section') return `${tr(lang, t.elevation ? 'io_batch_folder_elevations' : 'io_batch_folder_sections')}/`;
  return `${tr(lang, 'io_batch_folder_sheets')}/`;
}

/** Tipo do documento, como sai no nome do arquivo e no manifest. */
function tipoOf(t: DxfBatchTarget, lang: Lang): string {
  if (t.kind === 'plan') return tr(lang, 'io_batch_type_plan');
  if (t.kind === 'area') return tr(lang, 'io_batch_type_area');
  if (t.kind === 'section') return tr(lang, t.elevation ? 'io_batch_type_elevation' : 'io_batch_type_section');
  return tr(lang, 'io_batch_type_sheet');
}

/** Nome do nível de um id, ou vazio. */
function nivelDe(p: Project, levelId: Id): string {
  return p.levels.find((l) => l.id === levelId)?.name ?? '';
}

/** Planta de área (vista) pelo id, ou undefined. */
function areaPlanDe(p: Project, planId: Id) {
  return vistaDeArea(p, planId);
}

/** Valores dos tokens do modelo de nome. */
function tokensOf(p: Project, t: DxfBatchTarget, options: DxfBatchOptions, lang: Lang): Record<string, string> {
  const projeto = options.prefix.trim() || p.name;
  if (t.kind === 'plan') return { projeto, tipo: tr(lang, 'io_batch_type_plan'), nome: t.label, nivel: t.label, prancha: '' };
  if (t.kind === 'area') {
    const plan = areaPlanDe(p, t.planId);
    return { projeto, tipo: tr(lang, 'io_batch_type_area'), nome: t.label, nivel: plan ? nivelDe(p, plan.levelId) : '', prancha: '' };
  }
  if (t.kind === 'section') return { projeto, tipo: tr(lang, t.elevation ? 'io_batch_type_elevation' : 'io_batch_type_section'), nome: t.label, nivel: '', prancha: '' };
  // O nome da prancha já leva o número: o modelo padrão (`{tipo}-{nome}`) não perde a identificação da folha.
  return { projeto, tipo: tr(lang, 'io_batch_type_sheet'), nome: t.label, nivel: '', prancha: t.label };
}

/** Aplica o modelo de nome (tokens `{projeto}`, `{tipo}`, `{nome}`, `{nivel}`, `{prancha}`) e sanitiza o resultado. */
function nomeDe(p: Project, t: DxfBatchTarget, options: DxfBatchOptions, lang: Lang): string {
  const modelo = options.pattern.trim() || '{tipo}-{nome}';
  const tokens = tokensOf(p, t, options, lang);
  const bruto = modelo.replace(/\{(projeto|tipo|nome|nivel|prancha)\}/g, (_, token: string) => tokens[token] ?? '');
  return dxfSanitizeName(bruto, lang);
}

/** Escala de papel do alvo, no formato `1:<denominador>`; prancha fica vazia (a escala é da folha). */
function escalaDe(p: Project, t: DxfBatchTarget): string {
  if (t.kind === 'plan') return `1:${viewGraphicsOf(p, floorViewId(t.levelId)).scale}`;
  if (t.kind === 'area') {
    const plan = areaPlanDe(p, t.planId);
    return plan?.area ? `1:${plan.area.scale}` : '';
  }
  if (t.kind === 'section') return `1:${sectionGraphicsOf(p).scale}`;
  return '';
}

/** Nível do alvo no manifest (corte/elevação e prancha não têm nível natural). */
function nivelDoAlvo(p: Project, t: DxfBatchTarget): string {
  if (t.kind === 'plan') return t.label;
  if (t.kind === 'area') {
    const plan = areaPlanDe(p, t.planId);
    return plan ? nivelDe(p, plan.levelId) : '';
  }
  return '';
}

/** Caminho livre dentro da pasta: colisão ganha `-2`, `-3`… antes de `.dxf`. */
function caminhoLivre(pasta: string, nome: string, usados: Set<string>): string {
  for (let n = 1; ; n++) {
    const caminho = `${pasta}${nome}${n === 1 ? '' : `-${n}`}.dxf`;
    if (!usados.has(caminho.toLowerCase())) {
      usados.add(caminho.toLowerCase());
      return caminho;
    }
  }
}

/** Campo do CSV: com `;`, aspas ou quebra de linha, sai entre aspas (aspas dobradas). */
function campoCsv(valor: string): string {
  return /[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/** Texto do LEIA-ME: formato, unidade, data, contagem e a ressalva das pranchas. */
function leiaMeDe(options: DxfBatchOptions, contagem: number, lang: Lang): string {
  return [
    tr(lang, 'io_batch_readme_title'),
    tr(lang, 'io_batch_readme_format'),
    tr(lang, 'io_batch_readme_unit', { unit: options.units }),
    tr(lang, 'io_batch_readme_date', { date: dataLocal(new Date()) }),
    tr(lang, 'io_batch_readme_count', { n: contagem }),
    '',
    tr(lang, 'io_batch_readme_note'),
    '',
  ].join('\r\n');
}

/** Renderiza um alvo pelo renderizador do tipo. Lança se o renderizador lançar. */
function renderizar(p: Project, t: DxfBatchTarget, options: DxfBatchOptions, renderers: DxfBatchRenderers, lang: Lang): string {
  if (t.kind === 'plan') return renderers.plan(p, t.levelId, options);
  if (t.kind === 'area') return renderers.area(p, t.planId, options);
  if (t.kind === 'section') return renderers.section(p, t.viewId, options);
  const sheet = renderers.sheet;
  if (!sheet) throw new Error(tr(lang, 'io_batch_skip_no_sheet_renderer'));
  return sheet(p, t.sheetId, options);
}

/**
 * Monta o lote dos alvos marcados, na ordem de `dxfBatchTargetsOf`: um DXF por alvo (com a pasta do grupo e o nome do
 * modelo), o `manifest.csv` e o `LEIA-ME.txt`. Alvo que falha não derruba o lote: entra em `skipped` com o motivo.
 */
export function buildDxfBatch(p: Project, selected: readonly string[], options: DxfBatchOptions, renderers: DxfBatchRenderers): DxfBatchResult {
  const lang = options.lang ?? activeLang();
  const alvos = dxfBatchTargetsOf(p);
  const porKey = new Map(alvos.map((t) => [t.key, t]));
  const marcados = new Set(selected);
  const skipped: DxfBatchSkip[] = [];

  // Alvo marcado que não existe mais no projeto (documento apagado com o diálogo aberto).
  for (const key of selected) {
    if (!porKey.has(key)) skipped.push({ key, label: key, reason: tr(lang, 'io_batch_skip_missing_target') });
  }

  const files: DxfBatchFile[] = [];
  const linhas: string[] = [];
  const usados = new Set<string>();

  for (const t of alvos) {
    if (!marcados.has(t.key)) continue;
    if (t.kind === 'sheet' && !renderers.sheet) {
      skipped.push({ key: t.key, label: t.label, reason: tr(lang, 'io_batch_skip_no_sheet_renderer') });
      continue;
    }
    let data: string;
    try {
      data = renderizar(p, t, options, renderers, lang);
    } catch (erro) {
      skipped.push({ key: t.key, label: t.label, reason: erro instanceof Error ? erro.message : String(erro) });
      continue;
    }
    const caminho = caminhoLivre(pastaOf(t, lang), nomeDe(p, t, options, lang), usados);
    files.push({ path: caminho, data });
    const prancha = t.kind === 'sheet' ? t.label : '';
    linhas.push([caminho, tipoOf(t, lang), t.label, nivelDoAlvo(p, t), escalaDe(p, t), prancha].map(campoCsv).join(';'));
  }

  const manifest = [tr(lang, 'io_batch_manifest_header'), ...linhas].join('\r\n') + '\r\n';
  files.push({ path: 'manifest.csv', data: manifest });
  files.push({ path: 'LEIA-ME.txt', data: leiaMeDe(options, linhas.length, lang) });

  return { files, manifest, skipped, zipName: dxfBatchZipName(p, new Date(), options.prefix, lang) };
}
