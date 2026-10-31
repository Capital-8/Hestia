import type { Vec2 } from '@hestia/geom';
import { levelElevation, openingHeight, openingSill, openingType, wallType, type Element, type Id, type Opening, type Project, type Wall } from '@hestia/model';
import { buildFrame, pointAt, type WallFrame } from './frame.ts';
import { caixaDe, empacotarAnel, geometriaVazia, type GeometriaEmpacotada } from './fluxoGeometria.ts';
import { nivelDoElemento, type AlteracaoProjeto, type ElementoGeometrico, type PatchProvisorio } from './fluxoPatch.ts';

/**
 * Resposta imediata de uma edição (passo 2 do fluxo, ver `fluxoPatch.ts`): a geometria provisória do que mudou, sem
 * junção e sem resolver nível. É só o contorno do elemento, calculado do próprio elemento: a parede vira o retângulo do
 * eixo com a espessura do tipo (arco, uma poligonal), a abertura o retângulo do vão sobre a parede, e piso, laje, forro e
 * telhado o próprio contorno. O custo é proporcional ao número de elementos editados, não ao do nível.
 */

/** Trechos de um arco na geometria provisória: o bastante para parecer curva durante o arrasto. */
const TRECHOS_DE_ARCO = 12;

/** Contorno de uma parede sobre o quadro dela: retângulo no reto, poligonal ao longo do arco. */
function contornoDaParede(f: WallFrame): Vec2[] {
  const n = f.arc ? TRECHOS_DE_ARCO : 1;
  const lado = (s: number): Vec2[] => Array.from({ length: n + 1 }, (_, i) => pointAt(f, (f.length * i) / n, s));
  return [...lado(f.sLo), ...lado(f.sHi).reverse()];
}

/** Retângulo do vão sobre a parede hospedeira (a largura do tipo, a espessura inteira da parede). */
function contornoDaAbertura(p: Project, o: Opening, f: WallFrame): Vec2[] {
  const meia = openingType(p, o).width / 2;
  const t0 = Math.max(0, o.offset - meia);
  const t1 = Math.min(f.length, o.offset + meia);
  return [pointAt(f, t0, f.sLo), pointAt(f, t1, f.sLo), pointAt(f, t1, f.sHi), pointAt(f, t0, f.sHi)];
}

const comoElemento = (e: Element, nivelCota: number, z0: number, z1: number, geometria: GeometriaEmpacotada): ElementoGeometrico => ({
  id: e.id,
  kind: e.kind,
  provisorio: true,
  z0: nivelCota + z0,
  z1: nivelCota + z1,
  geometria,
  caixa: caixaDe(geometria),
});

/** Geometria provisória de um elemento do projeto, ou `null` quando ele não tem contorno (escada, ambiente) ou está incompleto. */
export function elementoProvisorio(p: Project, e: Element, nivel: Id): ElementoGeometrico | null {
  const cota = levelElevation(p, nivel);
  try {
    if (e.kind === 'wall') {
      const f = buildFrame(e, wallType(p, e));
      if (!f) return null;
      const alto = e.topLevelId ? levelElevation(p, e.topLevelId) + e.topOffset - cota : e.height;
      return comoElemento(e, cota, e.baseOffset, alto, empacotarAnel(contornoDaParede(f)));
    }
    if (e.kind === 'door' || e.kind === 'window') {
      const parede = p.elements[e.hostId] as Wall | undefined;
      if (!parede || parede.kind !== 'wall') return null;
      const f = buildFrame(parede, wallType(p, parede));
      if (!f) return null;
      const t = openingType(p, e);
      const peitoril = openingSill(t, e);
      return comoElemento(e, cota, parede.baseOffset + peitoril, parede.baseOffset + peitoril + openingHeight(t, e), empacotarAnel(contornoDaAbertura(p, e, f)));
    }
    if ('boundary' in e && Array.isArray(e.boundary) && e.boundary.length >= 3) {
      const deslocamento = 'heightOffset' in e ? e.heightOffset : 0;
      return comoElemento(e, cota, deslocamento, deslocamento, empacotarAnel(e.boundary));
    }
  } catch {
    // Tipo ausente ou elemento incoerente durante a edição: sem provisório, o exato corrige.
  }
  return null;
}

/**
 * Patches provisórios por nível para uma alteração. `antes` serve para achar o nível do que foi removido. Vazio quando
 * a alteração é global (`niveis === 'todos'`): nesse caso a interface recarrega tudo e não há o que mostrar de barato.
 * Cada patch traz também os elementos que a edição fez sair (`removidos`).
 */
export function patchesProvisorios(antes: Project, depois: Project, alteracao: AlteracaoProjeto): PatchProvisorio[] {
  if (alteracao.niveis === 'todos') return [];
  const porNivel = new Map<Id, PatchProvisorio>();
  const patchDe = (nivel: Id): PatchProvisorio => {
    let patch = porNivel.get(nivel);
    if (!patch) {
      patch = { nivel, versao: alteracao.versao, elementos: [], removidos: [] };
      porNivel.set(nivel, patch);
    }
    return patch;
  };
  for (const id of [...alteracao.adicionados, ...alteracao.alterados]) {
    const nivel = nivelDoElemento(depois, id);
    if (nivel === null) continue;
    const e = depois.elements[id]!;
    const prov = elementoProvisorio(depois, e, nivel);
    patchDe(nivel).elementos.push(prov ?? semContorno(e));
  }
  for (const id of alteracao.removidos) {
    const nivel = nivelDoElemento(antes, id);
    if (nivel !== null) patchDe(nivel).removidos.push(id);
  }
  return [...porNivel.values()];
}

/** Elemento sem contorno barato (escada, ambiente): a interface sabe que mudou e espera o exato. */
const semContorno = (e: Element): ElementoGeometrico => ({ id: e.id, kind: e.kind, provisorio: true, z0: 0, z1: 0, geometria: geometriaVazia(), caixa: new Float64Array(4) });
