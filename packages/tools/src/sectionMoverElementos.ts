import type { Vec2 } from '@hestia/geom';
import { hospedeiroDoGuardaCorpo, isFloor, isGuardaCorpo, isRamp, isRoof, isSlab, isStair, isTerrain, isTerrainRegion, isWall, type Command, type Id, type Project } from '@hestia/model';
import { guardaCorposBloqueados } from './guardaCorpoEdicao.ts';
import { makeIdMap, selectedMovables } from './edit.ts';
import { comandosCopiaTerreno, comandosVerticalTerreno } from './terrainHandles.ts';

/**
 * Mover e Alinhar nos cortes e elevações levam o elemento por (dt, dz) no plano da vista (decisão 0055 §25, contrato regra 3).
 * É o mesmo mecanismo para todo kind: o deslocamento horizontal ao longo da linha do corte vira um `transform` de translação em
 * planta (o mesmo comando da planta); o vertical vira o campo de cota do elemento. O guarda-corpo hospedado não entra: ele segue
 * a escada ou a rampa (e anda junto quando o hospedeiro anda).
 */

/** Kinds que o corte move: o que `selectedMovables` leva em planta e aparece no desenho (ambiente e CAD não aparecem). */
export function moveisDoCorte(p: Project, ids: readonly Id[]): Id[] {
  return selectedMovables(p, [...ids]).filter((id) => {
    const e = p.elements[id];
    return isWall(e) || isFloor(e) || isSlab(e) || isRoof(e) || isStair(e) || isRamp(e) || isGuardaCorpo(e) || isTerrain(e) || isTerrainRegion(e);
  });
}

/** O elemento aceita deslocamento vertical no corte (cota própria)? Parede ainda não: a base dela depende de nível e vínculos. */
export function aceitaVerticalNoCorte(p: Project, id: Id): boolean {
  const e = p.elements[id];
  if (isGuardaCorpo(e)) return hospedeiroDoGuardaCorpo(e) === null;
  // Terreno: soma o deslocamento a todas as cotas das fontes; a região plana leva a cota dela (a subdivisão não tem cota).
  if (isTerrain(e)) return true;
  if (isTerrainRegion(e)) return e.papel !== 'subdivisao';
  return isFloor(e) || isSlab(e) || isRoof(e) || isStair(e) || isRamp(e);
}

/** Comandos que levam a cota de `id` por `dz` (já na cota do novo id, no caso de cópia). */
function comandoVertical(p: Project, id: Id, alvo: Id, dz: number): Command | null {
  const e = p.elements[id];
  if (isGuardaCorpo(e)) return hospedeiroDoGuardaCorpo(e) === null ? { type: 'updateGuardaCorpo', id: alvo, patch: { cotaBase: e.cotaBase + dz } } : null;
  if (isStair(e) || isRamp(e)) return { type: 'updateElements', ids: [alvo], patch: { baseOffset: e.baseOffset + dz, topOffset: e.topOffset + dz } };
  if (isFloor(e) || isSlab(e) || isRoof(e)) return { type: 'updateElements', ids: [alvo], patch: { heightOffset: e.heightOffset + dz } };
  return null;
}

export interface MoverNoCorte {
  /** Comandos a executar numa só transação. Vazio quando nada se move. */
  commands: Command[];
  /** Guarda-corpos hospedados da seleção cujo hospedeiro não está nela: não se movem sozinhos. */
  bloqueados: Id[];
  /** Ids dos elementos novos (só em cópia). */
  copias: Id[];
  /** Elementos que o deslocamento vertical não alcança (parede). */
  semVertical: Id[];
}

/**
 * Comandos que levam `ids` por `dt` ao longo do corte (direção `u` em planta) e `dz` na vertical. Com `copiar`, cria cópias
 * (com as aberturas das paredes e os guarda-corpos das escadas e rampas) e leva só as cópias.
 */
export function comandosMoverNoCorte(p: Project, ids: readonly Id[], u: Vec2, dt: number, dz: number, copiar = false): MoverNoCorte {
  const movidos = moveisDoCorte(p, ids);
  const bloqueados = guardaCorposBloqueados(p, [...ids]);
  const commands: Command[] = [];
  const copias: Id[] = [];
  const doTerreno = (id: Id): boolean => isTerrain(p.elements[id]) || isTerrainRegion(p.elements[id]);
  // Em cópia, o terreno sai de `comandosCopiaTerreno` (regiões remapeadas para o terreno novo, cotas já somadas); o resto, do `transform`.
  const aMover = copiar ? movidos.filter((id) => !doTerreno(id)) : movidos;
  const idMap = copiar && aMover.length ? makeIdMap(p, aMover) : null;
  const d = { x: u.x * dt, y: u.y * dt };
  if (aMover.length && (Math.abs(dt) > 1e-6 || idMap)) {
    commands.push({ type: 'transform', ids: aMover, transform: { kind: 'translate', d }, ...(idMap ? { copy: { idMap } } : {}) });
  }
  if (idMap) for (const id of aMover) if (idMap[id]) copias.push(idMap[id]!);
  if (copiar) {
    const terreno = comandosCopiaTerreno(p, movidos, { kind: 'translate', d }, Math.abs(dz) > 1e-6 ? dz : 0);
    commands.push(...terreno.commands);
    for (const id of movidos) if (isTerrain(p.elements[id]) && terreno.idMap[id]) copias.push(terreno.idMap[id]!);
  }
  const semVertical: Id[] = [];
  if (Math.abs(dz) > 1e-6) {
    for (const id of aMover) {
      // Hospedado cujo hospedeiro anda junto: ele segue sozinho, sem comando próprio.
      const e = p.elements[id];
      if (isGuardaCorpo(e) && hospedeiroDoGuardaCorpo(e) !== null) continue;
      if (isTerrain(e) || isTerrainRegion(e)) {
        commands.push(...comandosVerticalTerreno(p, id, dz));
        continue;
      }
      const cmd = comandoVertical(p, id, idMap?.[id] ?? id, dz);
      if (cmd) commands.push(cmd);
      else if (isWall(e)) semVertical.push(id);
    }
  }
  return { commands, bloqueados, copias, semVertical };
}
