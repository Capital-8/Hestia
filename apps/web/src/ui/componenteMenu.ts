import { caixaLocalDoComponente } from '@hestia/engine';
import type { Vec2 } from '@hestia/geom';
import {
  componentesDoGrupo,
  familiaDoComponente,
  newId,
  normalizarAngulo,
  type Component,
  type Familia,
  type Id,
  type Project,
} from '@hestia/model';
import { agruparSelecao, desagruparSelecao, type ToolEnv } from '@hestia/tools';
import type { ContextMenuCtx, MenuEntry, MenuLang } from '../editor/contextMenu.ts';
import { componentesDaSelecao } from './componentPropAcoes.ts';

/*
 * Entradas de COMPONENTE no menu de contexto da planta e do 3D, no mesmo espírito de `perimeter/perimeterEditavel.ts`:
 * `comComponente` (função pura) acrescenta o grupo quando a seleção é só de componentes e `executarComandoDeComponente`
 * aplica o comando escolhido em UMA transação — um passo de desfazer por comando.
 */

/** Passo de rotação dos itens "Girar" (90°). */
const PASSO = Math.PI / 2;

/** Prefixo comum dos ids tratados por este arquivo. */
export const PREFIXO_COMPONENTE = 'comp:';

const ID_GIRAR = `${PREFIXO_COMPONENTE}rot90`;
const ID_GIRAR_MENOS = `${PREFIXO_COMPONENTE}rotm90`;
const ID_ESPELHAR = `${PREFIXO_COMPONENTE}mirror`;
const ID_DUPLICAR = `${PREFIXO_COMPONENTE}dup`;
const ID_TIPO = `${PREFIXO_COMPONENTE}tipo`;
const ID_TIPO_FILHO = `${ID_TIPO}:`;
const ID_AGRUPAR = `${PREFIXO_COMPONENTE}group`;
const ID_DESAGRUPAR = `${PREFIXO_COMPONENTE}ungroup`;

/** Textos PT-BR e EN, no padrão de `editor/contextMenu.ts`. */
const TEXTOS = {
  girar: ['Girar 90°', 'Rotate 90°'],
  girarMenos: ['Girar −90°', 'Rotate −90°'],
  espelhar: ['Espelhar', 'Mirror'],
  duplicar: ['Duplicar ao lado', 'Duplicate to the Side'],
  tipo: ['Tipo', 'Type'],
  tipoSemFamilia: ['Selecione componentes de uma só família', 'Select components of one family only'],
  agrupar: ['Agrupar', 'Group'],
  agruparMotivo: ['Selecione ao menos dois componentes soltos', 'Select at least two loose components'],
  desagrupar: ['Desagrupar', 'Ungroup'],
  desagruparMotivo: ['Nenhum componente selecionado está em um conjunto', 'No selected component is in a group'],
} as const;

type Chave = keyof typeof TEXTOS;

/** Devolve a função de rótulo no idioma pedido. */
function rotulos(lang: MenuLang): (k: Chave) => string {
  const i = lang === 'pt' ? 0 : 1;
  return (k: Chave): string => TEXTOS[k][i];
}

/** A seleção é inteira de componentes (e tem ao menos um)? */
function soComponentes(ctx: ContextMenuCtx, componentes: readonly Component[]): boolean {
  return componentes.length > 0 && ctx.selectionKinds.length === componentes.length
    && ctx.selectionKinds.every((k) => k === 'component');
}

/** Família comum a todos os selecionados; `null` com famílias diferentes ou ausentes. */
function familiaComum(componentes: readonly Component[], familias: Project['componentFamilies']): Familia | null {
  if (!familias) return null;
  const primeira = familiaDoComponente({ componentFamilies: familias }, componentes[0]!);
  if (!primeira) return null;
  return componentes.every((c) => familiaDoComponente({ componentFamilies: familias }, c)?.id === primeira.id) ? primeira : null;
}

/** `typeId` comum (ou `null` quando todos são o padrão da família); a constante `MISTO` quando diferem. */
const MISTO = Symbol('tipos diferentes');
function tipoComum(componentes: readonly Component[]): Id | null | typeof MISTO {
  const primeiro = componentes[0]!.typeId;
  return componentes.every((c) => c.typeId === primeiro) ? primeiro : MISTO;
}

/** "Tipo ▸" com uma entrada por tipo da família, marcando o atual; desabilitado sem família comum. */
function entradaTipo(componentes: readonly Component[], familias: Project['componentFamilies'], T: (k: Chave) => string): MenuEntry {
  const familia = familiaComum(componentes, familias);
  if (!familia || familia.tipos.length === 0) {
    return { id: ID_TIPO, label: T('tipo'), disabled: true, hint: T('tipoSemFamilia'), children: [] };
  }
  const atual = tipoComum(componentes);
  return {
    id: ID_TIPO,
    label: T('tipo'),
    children: familia.tipos.map((t) => ({ id: `${ID_TIPO_FILHO}${t.id}`, label: t.nome, checked: atual !== MISTO && atual === t.id })),
  };
}

/** "Agrupar": dois ou mais componentes soltos. */
function entradaAgrupar(componentes: readonly Component[], T: (k: Chave) => string): MenuEntry {
  const pode = componentes.length >= 2 && componentes.every((c) => c.groupId === undefined);
  return { id: ID_AGRUPAR, label: T('agrupar'), disabled: !pode, hint: pode ? undefined : T('agruparMotivo') };
}

/** "Desagrupar": ao menos um componente que esteja em conjunto. */
function entradaDesagrupar(componentes: readonly Component[], T: (k: Chave) => string): MenuEntry {
  const pode = componentes.some((c) => c.groupId !== undefined);
  return { id: ID_DESAGRUPAR, label: T('desagrupar'), disabled: !pode, hint: pode ? undefined : T('desagruparMotivo') };
}

/**
 * Acrescenta o grupo de entradas de componente (girar, espelhar, duplicar, tipo e agrupar/desagrupar) antes de
 * "Excluir", separado por linha. Sem seleção de componentes, devolve `entradas` sem cópia.
 */
export function comComponente(
  entradas: MenuEntry[],
  ctx: ContextMenuCtx,
  lang: MenuLang,
  componentes: readonly Component[],
  familias: Project['componentFamilies'],
): MenuEntry[] {
  if (!soComponentes(ctx, componentes)) return entradas;
  const T = rotulos(lang);
  const grupo: MenuEntry[] = [
    { id: ID_GIRAR, label: T('girar'), separatorBefore: true },
    { id: ID_GIRAR_MENOS, label: T('girarMenos') },
    { id: ID_ESPELHAR, label: T('espelhar') },
    { id: ID_DUPLICAR, label: T('duplicar') },
    entradaTipo(componentes, familias, T),
    entradaAgrupar(componentes, T),
    entradaDesagrupar(componentes, T),
  ];
  const idx = entradas.findIndex((e) => e.id === 'delete');
  if (idx < 0) return [...entradas, ...grupo];
  return [...entradas.slice(0, idx), ...grupo, ...entradas.slice(idx)];
}

/** Centro do conjunto: média dos pontos de inserção dos membros (conjunto de um membro gira no próprio ponto). */
function centroDoConjunto(p: Project, id: Id): Vec2 {
  const membros = componentesDoGrupo(p, id);
  if (membros.length === 0) return { x: 0, y: 0 };
  const soma = membros.reduce((a, c) => ({ x: a.x + c.x, y: a.y + c.y }), { x: 0, y: 0 });
  return { x: soma.x / membros.length, y: soma.y / membros.length };
}

/**
 * ±90°: cada componente solto gira em torno do próprio ponto de inserção (só muda `rotation`); quem está em conjunto
 * gira o conjunto inteiro em torno do centro dele, levando os membros e a linha junto.
 */
function girar(componentes: readonly Component[], env: ToolEnv, angulo: number): void {
  env.transaction('Girar componentes', () => {
    const grupos = new Set<Id>();
    for (const c of componentes) {
      if (c.groupId !== undefined && env.project().componentGroups?.[c.groupId]) grupos.add(c.groupId);
      else env.exec({ type: 'updateComponent', id: c.id, patch: { rotation: normalizarAngulo(c.rotation + angulo) } });
    }
    for (const id of grupos) env.exec({ type: 'rotateComponentGroup', id, centro: centroDoConjunto(env.project(), id), angulo });
  });
}

/** Espelhar do menu: inverte `mirrored` de cada selecionado (não é o comando de espelho geométrico, que também move). */
function espelhar(componentes: readonly Component[], env: ToolEnv): void {
  env.transaction('Espelhar componentes', () => {
    for (const c of componentes) env.exec({ type: 'updateComponent', id: c.id, patch: { mirrored: !c.mirrored } });
  });
}

/** Largura (m) da caixa local do componente; zero quando a família não resolve peças. */
function larguraLocal(p: Project, c: Component): number {
  const caixa = caixaLocalDoComponente(p, c);
  return caixa ? caixa.max[0]! - caixa.min[0]! : 0;
}

/** Cópia de cada selecionado ao lado: deslocada pela largura no eixo x local (girado pela rotação), solta, sem marca e selecionada. */
function duplicarAoLado(componentes: readonly Component[], env: ToolEnv): void {
  const novos: Id[] = [];
  env.transaction('Duplicar componente', () => {
    for (const c of componentes) {
      const d = larguraLocal(env.project(), c);
      const copia: Omit<Component, 'order'> = {
        id: newId('cm'),
        kind: 'component',
        familyId: c.familyId,
        typeId: c.typeId,
        levelId: c.levelId,
        x: c.x + d * Math.cos(c.rotation),
        y: c.y + d * Math.sin(c.rotation),
        z: c.z,
        rotation: c.rotation,
        mirrored: c.mirrored,
        values: c.values === undefined ? undefined : { ...c.values },
        mark: '',
      };
      env.exec({ type: 'addComponent', component: copia });
      novos.push(copia.id);
    }
  });
  if (novos.length > 0) env.setSelection(novos);
}

/** Aplica o tipo da família a cada selecionado cuja família o tem; os demais ficam como estão. */
function trocarTipo(componentes: readonly Component[], typeId: Id, env: ToolEnv): void {
  env.transaction('Trocar tipo do componente', () => {
    for (const c of componentes) {
      const familia = familiaDoComponente(env.project(), c);
      if (!familia?.tipos.some((t) => t.id === typeId)) continue;
      env.exec({ type: 'updateComponent', id: c.id, patch: { typeId } });
    }
  });
}

/** Executa o comando `comp:*` escolhido no menu. Ids de fora deste arquivo são ignorados. */
export function executarComandoDeComponente(id: string, env: ToolEnv): void {
  if (!id.startsWith(PREFIXO_COMPONENTE)) return;
  if (id === ID_AGRUPAR) { agruparSelecao(env); return; }
  if (id === ID_DESAGRUPAR) { desagruparSelecao(env); return; }
  const componentes = componentesDaSelecao(env.project(), env.selection());
  if (componentes.length === 0) return;
  if (id === ID_GIRAR) girar(componentes, env, PASSO);
  else if (id === ID_GIRAR_MENOS) girar(componentes, env, -PASSO);
  else if (id === ID_ESPELHAR) espelhar(componentes, env);
  else if (id === ID_DUPLICAR) duplicarAoLado(componentes, env);
  else if (id.startsWith(ID_TIPO_FILHO)) trocarTipo(componentes, id.slice(ID_TIPO_FILHO.length), env);
}
