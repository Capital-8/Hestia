import {
  buildOpeningModel,
  partTransformed,
  CLOSED,
  type OpeningGeometry,
  type OpeningModel,
  type OpeningPart,
  type PartMaterial,
  type PartProfile,
  type PartRole,
  type WallFrame,
} from '@hestia/engine';
import { openingTypeById, openingAngle3d, openingDetail3d, type Id, type Opening, type OpeningType, type Project } from '@hestia/model';

/**
 * Peça da esquadria no 3D, em coordenadas locais do vão: x ao longo da parede, y na profundidade (0 = eixo da
 * parede), z acima do peitoril. A cena transforma cada peça em caixa e a põe no grupo do vão. `material` é o papel
 * lógico do modelo único; `materialId` já é o material do projeto (`frameMaterialId`, vidro, concreto ou metal).
 */
export interface OpeningPiece {
  w: number;
  d: number;
  h: number;
  x: number;
  y: number;
  z: number;
  materialId: Id;
  material: PartMaterial;
  /** Papel da peça no modelo (batente, folha, vidro, alizar, verga, ...). */
  role: PartRole;
  /**
   * Dobradiça da folha aberta: eixo `z` em (x = at, y = atS) ou eixo `x` em (y = atS, z = at). Ausente = peça fixa.
   * `angle` já vem do `angle3d` do tipo (radianos) com o sinal do movimento do modelo.
   */
  hinge?: { axis: 'x' | 'z'; at: number; atS?: number; angle: number };
  /** Deslocamento do estado aberto (correr), em metros, no sistema local do vão. */
  slide?: { dx: number; dy: number; dz: number };
  /** Seção do modelo (batente em peça única): a peça vira um prisma extrudado, não uma caixa. */
  profile?: PartProfile;
  /** Peças do mesmo `group` formam UMA peça física (alizar): o desenho une os contornos. */
  group?: string;
}

/**
 * Papéis que cada nível de detalhe 3D mostra (o modelo é a fonte; o detalhe só filtra o que desenhar). Ferragens (maçaneta,
 * fechadura e dobradiça) só no nível completo; a soleira aparece em todos os níveis.
 */
function mostraNoDetalhe(part: OpeningPart, detail: ReturnType<typeof openingDetail3d>): boolean {
  if (detail === 'off') return false;
  // A baguete (`bead`) é divisão do vidro, como o `muntin`: some no esquemático.
  if (detail === 'schematic') return part.role !== 'handle' && part.role !== 'leafPanel' && part.role !== 'muntin' && part.role !== 'bead' && part.role !== 'hinge';
  if (detail === 'simple') return part.role !== 'handle' && part.role !== 'leafPanel' && part.role !== 'hinge';
  return true;
}

/** Material do projeto para o papel lógico da peça: esquadria, folha, vidro, concreto ou metal. */
function materialIdOf(part: OpeningPart, p: Project, frameId: Id, glassId: Id, leafId: Id): Id {
  if (part.material === 'glass') return glassId;
  if (part.material === 'leaf') return leafId;
  if (part.material === 'concrete') return p.materials['mat_concreto'] ? 'mat_concreto' : frameId;
  if (part.material === 'metal') {
    if (p.materials['mat_aco']) return 'mat_aco';
    if (p.materials['mat_perfil']) return 'mat_perfil';
    return frameId;
  }
  // 'frame' (batente, montantes, travessas, baguetes) e 'casing' usam o material do batente do tipo.
  return frameId;
}

/**
 * Adaptador fino do modelo único para o 3D: cada `OpeningPart` vira uma peça centrada no sistema local do vão (caixa ou,
 * com `profile`, um prisma extrudado), com a dobradiça (`hinge`) ou o deslocamento (`slide`) do movimento do modelo.
 * `open` liga o estado aberto com o `angle3d`
 * do tipo (graus → rad) e `partTransformed`; o detalhe 3D (`detail3d`) só filtra os papéis que a vista mostra.
 */
export function openingPieces(p: Project, o: Opening, g: OpeningGeometry, f: WallFrame, H: number, open: boolean): OpeningPiece[] {
  const t = openingTypeById(p, o.typeId);
  if (!t) return [];
  // A altura das peças é limitada pela parede, como antes (o modelo usa a altura nominal do tipo).
  const geom = g.height > H - g.sill ? { ...g, height: H - g.sill } : g;
  return pecasDoModelo(p, t, buildOpeningModel(p, o, geom, f), open);
}

/**
 * Adaptador do modelo já montado (o mesmo de `buildOpeningModel`): cada `OpeningPart` vira uma `OpeningPiece`, com a
 * seção (`profile`) e o grupo físico (`group`) copiados. Exposto para os testes validarem o caminho do batente em L
 * antes de o motor de FR1 ser integrado; a vista usa sempre o modelo real.
 */
export function pecasDoModelo(p: Project, t: OpeningType, model: OpeningModel, open: boolean): OpeningPiece[] {
  const detail = openingDetail3d(t);
  if (detail === 'off') return [];
  // A veneziana tem limite próprio de 70° (spec E §3.5); o padrão do tipo é 45°.
  const abertura = t.plan === 'louver' ? Math.min(70, openingAngle3d(t)) : openingAngle3d(t);
  const angle = open ? (abertura * Math.PI) / 180 : 0;
  const state = { angle, slide: open ? 1 : 0 };
  const out: OpeningPiece[] = [];
  for (const part of model.parts) {
    if (!mostraNoDetalhe(part, detail)) continue;
    const b = part.box;
    const piece: OpeningPiece = {
      w: b.t1 - b.t0,
      d: b.s1 - b.s0,
      h: b.z1 - b.z0,
      x: (b.t0 + b.t1) / 2,
      y: (b.s0 + b.s1) / 2,
      z: (b.z0 + b.z1) / 2,
      materialId: materialIdOf(part, p, t.frameMaterialId, t.glassMaterialId, t.leafMaterialId ?? t.frameMaterialId),
      material: part.material,
      role: part.role,
      ...(part.profile ? { profile: part.profile } : {}),
      ...(part.group ? { group: part.group } : {}),
    };
    if (open && part.motion) {
      if (part.motion.kind === 'rotate') {
        piece.hinge =
          part.motion.axis === 'z'
            ? { axis: 'z', at: part.motion.t, atS: part.motion.s, angle: part.motion.sign * angle }
            : { axis: 'x', at: part.motion.z, atS: part.motion.s, angle: part.motion.sign * angle };
      } else if (part.motion.kind === 'fold') {
        // A cadeia dobrável gira em torno de uma dobradiça que anda com os painéis anteriores. A cena aceita um pivô
        // só, então o centro da caixa é recuado pela rotação inversa: pivô em (at, atS) + giro `phi` devolve o centro
        // exato de `partTransformed`.
        const m = part.motion;
        let at = m.tAnchor;
        let atS = m.s;
        for (let j = 0; j < m.index; j++) {
          const a = (j % 2 === 0 ? 1 : -1) * m.sign * angle;
          at += m.panelWidth * m.dir * Math.cos(a);
          atS += m.panelWidth * Math.sin(a);
        }
        const alpha = (m.index % 2 === 0 ? 1 : -1) * m.sign * angle;
        const phi = m.dir * alpha;
        const depois = partTransformed(part, state);
        const cos = Math.cos(phi);
        const sin = Math.sin(phi);
        const dt = depois.center.t - at;
        const ds = depois.center.s - atS;
        piece.x = at + dt * cos + ds * sin;
        piece.y = atS - dt * sin + ds * cos;
        piece.z = depois.center.z;
        piece.hinge = { axis: 'z', at, atS, angle: phi };
      } else {
        const antes = partTransformed(part, CLOSED);
        const depois = partTransformed(part, state);
        piece.slide = {
          dx: depois.center.t - antes.center.t,
          dy: depois.center.s - antes.center.s,
          dz: depois.center.z - antes.center.z,
        };
      }
    }
    out.push(piece);
  }
  return out;
}
