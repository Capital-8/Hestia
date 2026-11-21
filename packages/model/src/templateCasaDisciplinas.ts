import { emptyPlanAnnotations } from './areaPlan.ts';
import { makeBeam } from './beam.ts';
import { makeColumn } from './column.ts';
import type { Command } from './commands.ts';
import { FAMILIA_AR_SPLIT } from './familia/biblioteca/equipamentosOutros.ts';
import {
  FAMILIA_DIFUSOR_TETO,
  FAMILIA_INTERRUPTOR,
  FAMILIA_LAVATORIO,
  FAMILIA_LUMINARIA_TETO,
  FAMILIA_QUADRO_DISTRIBUICAO,
  FAMILIA_RALO,
  FAMILIA_TOMADA,
  FAMILIA_VASO_SANITARIO,
} from './familia/biblioteca/disciplinasExemplo.ts';
import { makeFooting } from './footing.ts';
import { t, type Lang } from './i18n.ts';
import { makePlanView, type Discipline } from './planView.ts';
import { disciplineLabel } from './planViewCommands.ts';
import type { Component, Id } from './types.ts';
import { makeWall } from './wall.ts';

/**
 * Casa de teste das disciplinas (decisão 0060, adendo 1): térreo de 6 × 8 m com paredes externas, uma divisória e um
 * banheiro no canto sul, estrutura nativa (4 pilares, 2 vigas e 2 sapatas), componentes de exemplo de hidrossanitário,
 * elétrico e HVAC e uma planta adicional de cada disciplina (Estrutura, Hidrossanitário, Elétrico e HVAC).
 *
 * O modelo serve para exercitar as plantas por disciplina sem MEP: os componentes apontam para famílias que o próprio
 * projeto carrega (`upsertFamily`), com a disciplina no campo `Familia.disciplina`. Nenhuma planta grava tons: valem os
 * predefinidos da tabela §4.2. Convenções de parede em `docs/05 §3` (face externa à esquerda de a→b).
 */

const LEVEL = 'lv_0';
const EXT = 'wt_ext19';
const DIV = 'wt_alv14';

const parede = (id: Id, a: [number, number], b: [number, number], typeId: Id): Command => ({
  type: 'addWall',
  wall: makeWall({ id, typeId, levelId: LEVEL, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } }),
});

const abertura = (id: Id, hostId: Id, typeId: Id, offset: number, kind: 'door' | 'window'): Command => ({
  type: 'addOpening',
  opening: { id, kind, typeId, hostId, offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' },
});

const componente = (
  id: Id,
  familyId: Id,
  x: number,
  y: number,
  z: number,
  rotation: number,
  mark: string,
): Command => {
  const component: Omit<Component, 'order'> = {
    id,
    kind: 'component',
    familyId,
    typeId: null,
    levelId: LEVEL,
    x,
    y,
    z,
    rotation,
    mirrored: false,
    mark,
  };
  return { type: 'addComponent', component };
};

/** Planta de disciplina do térreo, com o nome padrão "<Nível> - <Disciplina>" e anotações vazias. */
const planta = (id: Id, discipline: Discipline, lang: Lang): Command => ({
  type: 'addPlanView',
  plan: makePlanView({
    id,
    levelId: LEVEL,
    discipline,
    name: `${t(lang, 'md_doc_level_ground')} - ${disciplineLabel(lang, discipline)}`,
    annotations: emptyPlanAnnotations(),
  }),
});

const FAMILIAS = [
  FAMILIA_VASO_SANITARIO,
  FAMILIA_LAVATORIO,
  FAMILIA_RALO,
  FAMILIA_TOMADA,
  FAMILIA_INTERRUPTOR,
  FAMILIA_LUMINARIA_TETO,
  FAMILIA_QUADRO_DISTRIBUICAO,
  FAMILIA_DIFUSOR_TETO,
  FAMILIA_AR_SPLIT,
];

const PAREDES: Command[] = [
  // Perímetro no sentido horário (face externa à esquerda): 6 × 8 m.
  parede('cd_w_s', [6, 0], [0, 0], EXT),
  parede('cd_w_w', [0, 0], [0, 8], EXT),
  parede('cd_w_n', [0, 8], [6, 8], EXT),
  parede('cd_w_e', [6, 8], [6, 0], EXT),
  // Divisória: faixa sul de 2,40 m é o banheiro.
  parede('cd_w_banho', [0, 2.4], [6, 2.4], DIV),
];

const ABERTURAS: Command[] = [
  abertura('cd_o_porta', 'cd_w_s', 'ot_p90', 3.0, 'door'),
  abertura('cd_o_banho', 'cd_w_banho', 'ot_p80', 4.6, 'door'),
  abertura('cd_j_n', 'cd_w_n', 'ot_j120', 3.0, 'window'),
  abertura('cd_j_banho', 'cd_w_w', 'ot_j60', 1.2, 'window'),
  abertura('cd_j_leste', 'cd_w_e', 'ot_j120', 3.0, 'window'),
];

const ESTRUTURA: Command[] = [
  { type: 'addColumn', column: makeColumn({ id: 'cd_col_so', typeId: 'ct_conc_20x40', levelId: LEVEL, at: { x: 0.2, y: 0.2 }, mark: 'PL-01' }) },
  { type: 'addColumn', column: makeColumn({ id: 'cd_col_se', typeId: 'ct_conc_20x40', levelId: LEVEL, at: { x: 5.8, y: 0.2 }, mark: 'PL-02' }) },
  { type: 'addColumn', column: makeColumn({ id: 'cd_col_no', typeId: 'ct_conc_20x40', levelId: LEVEL, at: { x: 0.2, y: 7.8 }, mark: 'PL-03' }) },
  { type: 'addColumn', column: makeColumn({ id: 'cd_col_ne', typeId: 'ct_conc_20x40', levelId: LEVEL, at: { x: 5.8, y: 7.8 }, mark: 'PL-04' }) },
  { type: 'addBeam', beam: makeBeam({ id: 'cd_v_sul', typeId: 'bt_conc_15x40', levelId: LEVEL, a: { x: 0.2, y: 0.2 }, b: { x: 5.8, y: 0.2 }, zOffset: 2.4, mark: 'VG-01' }) },
  { type: 'addBeam', beam: makeBeam({ id: 'cd_v_norte', typeId: 'bt_conc_15x40', levelId: LEVEL, a: { x: 0.2, y: 7.8 }, b: { x: 5.8, y: 7.8 }, zOffset: 2.4, mark: 'VG-02' }) },
  { type: 'addFooting', footing: makeFooting({ id: 'cd_sap_so', typeId: 'ft_iso_100x100', levelId: LEVEL, at: { x: 0.2, y: 0.2 }, columnId: 'cd_col_so', mark: 'SP-01' }) },
  { type: 'addFooting', footing: makeFooting({ id: 'cd_sap_se', typeId: 'ft_iso_100x100', levelId: LEVEL, at: { x: 5.8, y: 0.2 }, columnId: 'cd_col_se', mark: 'SP-02' }) },
];

const COMPONENTES: Command[] = [
  // Hidrossanitário no banheiro (faixa sul).
  componente('cd_c_vaso', FAMILIA_VASO_SANITARIO.id, 1.1, 0.85, 0, Math.PI, 'LS-01'),
  componente('cd_c_lavatorio', FAMILIA_LAVATORIO.id, 0.55, 1.55, 0, Math.PI / 2, 'LS-02'),
  componente('cd_c_ralo', FAMILIA_RALO.id, 2.5, 1.2, 0, 0, 'LS-03'),
  // Elétrico: três tomadas em paredes, um interruptor junto à porta do banheiro, duas luminárias de teto e o quadro.
  componente('cd_c_tomada_o1', FAMILIA_TOMADA.id, 0.18, 0.9, 0, -Math.PI / 2, 'T-01'),
  componente('cd_c_tomada_o2', FAMILIA_TOMADA.id, 0.18, 5.6, 0, -Math.PI / 2, 'T-02'),
  componente('cd_c_tomada_l', FAMILIA_TOMADA.id, 5.8, 5.0, 0, Math.PI / 2, 'T-03'),
  componente('cd_c_interruptor', FAMILIA_INTERRUPTOR.id, 3.8, 2.55, 0, 0, 'IN-01'),
  componente('cd_c_luminaria_sala', FAMILIA_LUMINARIA_TETO.id, 3.0, 6.0, 0, 0, 'L-01'),
  componente('cd_c_luminaria_banho', FAMILIA_LUMINARIA_TETO.id, 3.0, 1.2, 0, 0, 'L-02'),
  componente('cd_c_quadro', FAMILIA_QUADRO_DISTRIBUICAO.id, 0.15, 5.0, 0, -Math.PI / 2, 'QD-01'),
  // HVAC: difusor de teto na sala e evaporadora split na parede norte.
  componente('cd_c_difusor', FAMILIA_DIFUSOR_TETO.id, 2.5, 5.8, 0, 0, 'DIF-01'),
  componente('cd_c_split', FAMILIA_AR_SPLIT.id, 2.5, 7.8, 1.8, 0, 'AC-01'),
];

const DISCIPLINAS: Array<{ id: Id; discipline: Discipline }> = [
  { id: 'pv_casa_estrutura', discipline: 'estrutura' },
  { id: 'pv_casa_hidrossanitario', discipline: 'hidrossanitario' },
  { id: 'pv_casa_eletrico', discipline: 'eletrico' },
  { id: 'pv_casa_hvac', discipline: 'hvac' },
];

/** Monta a casa de teste das disciplinas como uma lista de comandos, no mesmo estilo dos outros modelos. */
export function casaDisciplinas(cmds: Command[], lang: Lang = 'pt'): void {
  for (const familia of FAMILIAS) cmds.push({ type: 'upsertFamily', family: familia });
  for (const c of PAREDES) cmds.push(c);
  for (const c of ABERTURAS) cmds.push(c);
  for (const c of ESTRUTURA) cmds.push(c);
  for (const c of COMPONENTES) cmds.push(c);
  for (const { id, discipline } of DISCIPLINAS) cmds.push(planta(id, discipline, lang));
}
