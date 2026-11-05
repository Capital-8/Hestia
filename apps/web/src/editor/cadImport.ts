import type { Vec2 } from '@hestia/geom';
import { newId, type CadDrawing, type CadUnit, type Id } from '@hestia/model';
import { METROS_POR_UNIDADE, parseDxfText } from '@hestia/io';
import { useI18n, type Lang } from './i18n.ts';

/**
 * Importação de DXF pela interface: o `parseDxfText` do `@hestia/io` lê o arquivo (geometria em metros) e aqui a unidade
 * declarada, a escala, a rotação e o ponto de inserção são aplicados em todos os traços e textos. A função só devolve o
 * rascunho do `CadDrawing`; quem chama decide o comando, o nível e a ordem (não toca em store nem em controller).
 */

/** Opções da importação de um DXF. */
export interface CadImportOptions {
  levelId: Id;
  /** Unidade de saída; ausente = a detectada no arquivo (reescala a geometria se diferente). */
  unit?: CadUnit;
  /** Inserção em metros (mundo); ausente = (0,0). */
  at?: Vec2;
  /** Rotação em graus (anti-horário); ausente = 0. */
  rotation?: number;
  /** Escala de inserção; ausente = 1. */
  scale?: number;
  name?: string;
}

/** "planta.dxf" vira "planta"; sem nome aproveitável, "CAD". */
function nomeDoDesenho(nome: string): string {
  const base = nome.trim().replace(/\.[^.]+$/, '').trim();
  return base === '' ? 'CAD' : base;
}

/**
 * Importa o arquivo DXF e devolve o rascunho do desenho CAD (sem `order`). A geometria do parser está em metros; trocar a
 * unidade declarada reescala o desenho pelo fator entre a unidade pedida e a detectada no `$INSUNITS` (o `unit` guardado é
 * a unidade do arquivo, e a reexportação com ela devolve as mesmas coordenadas).
 */
export async function importCadFile(file: File, options: CadImportOptions, lang: Lang = useI18n.getState().lang): Promise<Omit<CadDrawing, 'order'>> {
  const nome = options.name ?? nomeDoDesenho(file.name);
  const dxf = parseDxfText(await file.text(), nome, lang);
  const unit = options.unit ?? dxf.unit;
  const fator = METROS_POR_UNIDADE[unit] / dxf.unitScale;
  const escala = (options.scale ?? 1) * fator;
  const graus = options.rotation ?? 0;
  const radianos = (graus * Math.PI) / 180;
  const cos = Math.cos(radianos);
  const sen = Math.sin(radianos);
  const at = options.at ?? { x: 0, y: 0 };

  /** Escala, gira em torno da origem e desloca até `at`. */
  const transformar = (p: Vec2): Vec2 => {
    const x = p.x * escala;
    const y = p.y * escala;
    return { x: x * cos - y * sen + at.x, y: x * sen + y * cos + at.y };
  };

  return {
    id: newId('cad'),
    kind: 'cad',
    levelId: options.levelId,
    name: nome,
    source: 'dxf',
    unit,
    visible: true,
    layers: dxf.layers,
    paths: dxf.paths.map((path) => ({ ...path, pts: path.pts.map(transformar) })),
    texts: dxf.texts.map((texto) => ({ ...texto, at: transformar(texto.at), height: texto.height * escala, rotation: texto.rotation + graus })),
  };
}
