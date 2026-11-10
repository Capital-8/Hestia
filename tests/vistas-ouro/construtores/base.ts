import {
  DEFAULT_AREA_GRAPHICS,
  DEFAULT_TAG_FIELDS,
  ProjectStore,
  buildTemplate,
  makeRoom,
  makeWall,
  type AreaPlan,
  type Command,
  type Project,
  type RoomTag,
  type TemplateId,
} from '@hestia/model';

/**
 * Peças comuns dos construtores dos projetos do ouro. Os construtores usam só comandos e fábricas do modelo (as mesmas
 * dos testes existentes) e o resultado é gravado em JSON (`tests/vistas-ouro/projetos/`): o JSON é a fonte do ouro.
 */

/** Loja de edição sobre um projeto-modelo do repositório (`buildTemplate`). */
export function lojaDoModelo(id: TemplateId): ProjectStore {
  return new ProjectStore(buildTemplate(id));
}

/** Executa os comandos em ordem; qualquer recusa do modelo interrompe a geração (nada de ouro com projeto inválido). */
export function rodar(s: ProjectStore, cmds: Command[]): void {
  for (const c of cmds) s.exec(c);
}

/** Planta de área com os gráficos padrão e escala 1:50; `over` sobrescreve. */
export function plantaDeArea(over: Partial<AreaPlan> & Pick<AreaPlan, 'id' | 'levelId'>): AreaPlan {
  return {
    name: `Planta de área ${over.id}`,
    scale: 50,
    graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } },
    tags: [],
    ...over,
  };
}

/** Etiqueta de ambiente de uma planta de área. */
export function etiquetaDeAmbiente(id: string, planId: string, roomId: string, at: { x: number; y: number }): RoomTag {
  return { id, planId, roomId, at, orientation: 'horizontal', leader: 'straight', fields: [...DEFAULT_TAG_FIELDS], visible: true };
}

/** Quatro paredes externas retangulares num nível (sentido horário, como as dos modelos). */
export function perimetro(levelId: string, prefixo: string, w: number, h: number, typeId = 'wt_ext19'): Command[] {
  const pts: Array<[number, number]> = [[0, 0], [0, h], [w, h], [w, 0]];
  return pts.map(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    return { type: 'addWall', wall: makeWall({ id: `${prefixo}${i}`, typeId, levelId, a: { x, y }, b: { x: x2, y: y2 } }) } satisfies Command;
  });
}

/** Ambientes da casa de 10 x 7 m (`house2`), um por circuito de paredes. */
export function ambientesDaCasa2(): Command[] {
  const r = (id: string, name: string, number: string, categoryId: string, x: number, y: number): Command => ({
    type: 'addRoom',
    room: makeRoom({ id, levelId: 'lv_0', name, number, categoryId, point: { x, y } }),
  });
  return [
    r('r_sala', 'Sala', '101', 'rc_sala', 7, 4.7),
    r('r_quarto1', 'Quarto 1', '102', 'rc_quarto', 2, 1.7),
    r('r_quarto2', 'Quarto 2', '103', 'rc_quarto', 2, 5.2),
    r('r_cozinha', 'Cozinha', '104', 'rc_cozinha', 5.5, 1.2),
    r('r_banho', 'Banheiro', '105', 'rc_banho', 8.5, 1.2),
  ];
}

/** Projeto da casa de 10 x 7 m com os ambientes e o segundo nível com paredes externas. */
export function casa2ComAmbientes(): ProjectStore {
  const s = lojaDoModelo('house2');
  rodar(s, [...ambientesDaCasa2(), ...perimetro('lv_1', 'u_', 10, 7)]);
  return s;
}

/** Ambientes do térreo da casa de alto padrão (casa premium), nos cômodos da ala oeste. */
export function ambientesDaCasaPremium(): Command[] {
  const r = (id: string, name: string, number: string, categoryId: string, x: number, y: number): Command => ({
    type: 'addRoom',
    room: makeRoom({ id, levelId: 'lv_0', name, number, categoryId, point: { x, y } }),
  });
  return [
    r('r_estar', 'Estar', '001', 'rc_sala', 2.7, 2.7),
    r('r_jantar', 'Jantar', '002', 'rc_sala', 2.7, 7.5),
    r('r_cozinha', 'Cozinha', '003', 'rc_cozinha', 2.7, 10.5),
    r('r_servico', 'Serviço', '004', 'rc_servico', 2.7, 12.7),
  ];
}

export type { Project };
