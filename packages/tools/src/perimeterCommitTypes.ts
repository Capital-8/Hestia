import type { SketchIssue, SkeletonStep, Vec2 } from '@hestia/geom';
import type { Command, Id } from '@hestia/model';
import type { SketchOrigin } from './perimeterSession.ts';

/** Opções da barra do modo de perímetro, lidas de um elemento (mesmos campos da barra da interface). */
export interface PerimeterBarOptions {
  /** Balanço padrão do beiral (m). Só telhado. */
  overhang: number;
  /** Inclinação padrão das arestas (%). Só telhado. */
  slopePct: number;
  /** Estender até o núcleo da parede. Piso e laje. */
  extendToCore: boolean;
  /** Deslocamento do nível (m). */
  heightOffset: number;
  /** Vincular às paredes (piso e laje): o contorno está vinculado à origem `perimeter`. Ausente = desmarcada. */
  linkToWalls?: boolean;
  /** Acompanhar o ambiente (forro): o forro segue o contorno do ambiente. Ausente = desmarcada. */
  followRoom?: boolean;
}

/** Opções de `commitPerimeter`. Ausente = o elemento guarda o seu valor (ao editar) ou o padrão do tipo (ao criar). */
export interface CommitPerimeterOptions {
  /** Criando: tipo do elemento; ausente ou inexistente = o primeiro do projeto para o alvo. Ao editar, o tipo não muda. */
  typeId?: Id;
  /** Criando: nível onde o elemento nasce (obrigatório). Ao editar, o nível não muda. */
  levelId?: Id;
  /** Balanço padrão (m), só telhado. Substitui o padrão do rascunho. */
  overhang?: number;
  /** Inclinação padrão (%), só telhado. Substitui o padrão do rascunho. */
  slopePct?: number;
  /** Estender até o núcleo (piso e laje): marca a origem do contorno como face do núcleo. */
  extendToCore?: boolean;
  /** Deslocamento do nível (m): piso, laje, forro e cota do beiral do telhado. */
  heightOffset?: number;
  /**
   * Gravidade (ficha G1): cota do terreno proposto (z do projeto) no ponto; ausente ou null = sem gravidade. Ao criar piso ou laje com
   * `heightOffset` 0 ou ausente, o primeiro ponto do contorno dá o valor inicial (cota do terreno menos a elevação do nível). Sem vínculo.
   */
  cotaDoTerreno?: (x: number, y: number) => number | null;
  /** Só telhado: eixo da cumeeira ou da subida. Ausente = lado maior da pegada ao criar; ao editar, mantém o atual. */
  axis?: Vec2;
  /** Vincular às paredes (piso e laje). Só vincula quando o esboço veio de "Por perímetro" (`origin.walls`). */
  linkToWalls?: boolean;
  /** Acompanhar o ambiente (forro). Usa o ambiente de `origin.roomId` quando o esboço tem o contorno dele. */
  followRoom?: boolean;
  /** De onde veio o esboço (ver `SketchOrigin`). Ausente = desenhado à mão. */
  origin?: SketchOrigin;
  mark?: string;
  comments?: string;
}

/** Resultado de `commitPerimeter`. Quando `ok` é falso, nenhum comando é gerado: o motivo vai em `message`. */
export type CommitPerimeterResult =
  | { ok: true; id: Id; commands: Command[]; message: string; steps?: SkeletonStep[] }
  | { ok: false; message: string; issues?: SketchIssue[] };
