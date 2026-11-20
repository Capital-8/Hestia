import { projectView3DPoints, sectionTitleOf, type Project, type SheetViewSource } from '@hestia/model';
import { t, type Lang } from './i18n.ts';
import { planKey, viewKey } from './viewIdentity.ts';

/**
 * Lista de vistas da janela "Inserir vistas": o que o projeto oferece, agrupado por tipo (plantas dos níveis, cortes,
 * elevações e 3D), e a faixa de linhas que cabe numa lista de altura fixa com rolagem própria. Sem tela: a janela só
 * desenha o que sai daqui.
 */

export type TipoFonteVista = 'plan' | 'section' | 'elevation' | '3d';

export interface FonteVista {
  /** Chave estável da marcação: `plan:<nível>`, `section:<vista>`, `3d:<ponto>` ou `3d` (enquadramento padrão). */
  key: string;
  /** Nome legível: o do nível, o da vista ou o do ponto de vista salvo. */
  label: string;
  view: SheetViewSource;
}

export interface GrupoVistas {
  tipo: TipoFonteVista;
  titulo: string;
  fontes: FonteVista[];
}

/** Linha da lista rolável: cabeçalho de grupo ou uma vista marcável. */
export type LinhaVistas = { kind: 'grupo'; titulo: string } | { kind: 'vista'; fonte: FonteVista };

/** Grupos na ordem: plantas, cortes, elevações e 3D. Grupo vazio some (o 3D sempre tem o enquadramento padrão). */
export function gruposDeVistas(p: Project, lang: Lang): GrupoVistas[] {
  const plantas: FonteVista[] = p.levels.map((l) => ({ key: planKey(l.id), label: l.name, view: { kind: 'plan', levelId: l.id } }));
  const porTipo = (kind: 'section' | 'elevation'): FonteVista[] =>
    p.views
      .filter((v) => (kind === 'elevation' ? v.kind === 'elevation' : v.kind !== 'elevation'))
      .map((v) => ({ key: viewKey({ kind: 'section', viewId: v.id }), label: sectionTitleOf(v), view: { kind: 'section', sectionId: v.id } }));
  const modelos: FonteVista[] = [
    ...projectView3DPoints(p).map((ponto) => ({ key: `3d:${ponto.id}`, label: ponto.name, view: { kind: '3d' as const, pointId: ponto.id } })),
    { key: '3d', label: t(lang, 'dlc_src_3d_default'), view: { kind: '3d' } },
  ];
  const grupos: GrupoVistas[] = [
    { tipo: 'plan', titulo: t(lang, 'cvs_ins_group_plan'), fontes: plantas },
    { tipo: 'section', titulo: t(lang, 'cvs_ins_group_section'), fontes: porTipo('section') },
    { tipo: 'elevation', titulo: t(lang, 'cvs_ins_group_elevation'), fontes: porTipo('elevation') },
    { tipo: '3d', titulo: t(lang, 'cvs_ins_group_3d'), fontes: modelos },
  ];
  return grupos.filter((g) => g.fontes.length > 0);
}

/** Uma lista só, com o cabeçalho de cada grupo antes das vistas dele. */
export function linhasDeVistas(grupos: readonly GrupoVistas[]): LinhaVistas[] {
  return grupos.flatMap((g): LinhaVistas[] => [{ kind: 'grupo', titulo: g.titulo }, ...g.fontes.map((fonte): LinhaVistas => ({ kind: 'vista', fonte }))]);
}

/**
 * Índices (inclusivos) das linhas que aparecem numa lista de altura fixa, com `linhaPx` por linha, rolada até
 * `rolagemPx` e com `alturaPx` de janela. `folga` linhas a mais de cada lado evitam espaço vazio ao rolar. Lista vazia:
 * primeira 0 e última -1.
 */
export function faixaVisivel(total: number, linhaPx: number, rolagemPx: number, alturaPx: number, folga = 4): { primeira: number; ultima: number } {
  if (total <= 0) return { primeira: 0, ultima: -1 };
  const primeira = Math.min(Math.max(Math.floor(rolagemPx / linhaPx) - folga, 0), total - 1);
  const ultima = Math.min(Math.max(Math.ceil((rolagemPx + alturaPx) / linhaPx) + folga - 1, primeira), total - 1);
  return { primeira, ultima };
}
