import type { Vec2 } from '@hestia/geom';
import { newId, type Id } from '@hestia/model';
import { ToolBase } from './base.ts';
import { furnitureFootprint, furniturePoseAt } from './furnitureFootprint.ts';
import type { PointerInfo } from './types.ts';

/**
 * Bloco pendente da ferramenta Móvel. A interface grava aqui o asset escolhido (Meus blocos ou logo após importar) e
 * ativa a ferramenta `furniture`; a ferramenta fica ativa para colocar várias cópias seguidas (Esc sai).
 */
let pendente: { assetId: Id; rotation: number; mirrored: boolean } | null = null;

export function setFurnitureToPlace(assetId: Id | null): void {
  pendente = assetId ? { assetId, rotation: pendente?.assetId === assetId ? pendente.rotation : 0, mirrored: false } : null;
}

export function furnitureToPlace(): Id | null {
  return pendente?.assetId ?? null;
}

/**
 * Colocar móvel importado: a prévia é o contorno do bloco seguindo o cursor (planta ou 3D, `pick3d`); cada clique grava
 * uma instância (`addFurniture`, um passo de desfazer) e a ferramenta continua ativa. Espaço gira 90°, Tab espelha.
 */
export class FurnitureTool extends ToolBase {
  readonly id = 'furniture';
  readonly label = 'Móvel';
  readonly pick3d = true;
  private copies = 0;
  private last: Vec2 | null = null;

  override get hint(): string {
    const a = pendente ? this.env.project().furniture?.assets[pendente.assetId] : undefined;
    return this.t('tl_hint_furniture', { name: a?.name ?? '' });
  }

  override start(): void {
    this.reset();
    this.copies = 0;
    if (!pendente || !this.env.project().furniture?.assets[pendente.assetId]) {
      this.env.say(this.t('tl_msg_furniture_none'));
      this.env.done();
      return;
    }
    this.env.say(this.hint);
  }

  protected reset(): void {
    this.items = [];
    this.inf = null;
    this.last = null;
  }

  /** Sem passo intermediário: o primeiro Esc já sai da ferramenta. */
  protected busy(): boolean {
    return false;
  }

  private draw(at: Vec2): void {
    this.items = [];
    const asset = pendente ? this.env.project().furniture?.assets[pendente.assetId] : undefined;
    if (!pendente || !asset) return;
    const pose = furniturePoseAt(asset, at, pendente.rotation, pendente.mirrored);
    this.items.push({ kind: 'polygon', ring: furnitureFootprint(pose, asset), dashed: true }, { kind: 'point', at });
  }

  override move(p: PointerInfo): void {
    const inf = this.snap(p);
    this.last = inf.point;
    this.draw(inf.point);
  }

  override space(): void {
    if (!pendente) return;
    pendente.rotation += Math.PI / 2;
    if (this.last) this.draw(this.last);
  }

  override tab(): void {
    if (!pendente) return;
    pendente.mirrored = !pendente.mirrored;
    if (this.last) this.draw(this.last);
  }

  override click(p: PointerInfo): void {
    const asset = pendente ? this.env.project().furniture?.assets[pendente.assetId] : undefined;
    if (!pendente || !asset) {
      this.env.done();
      return;
    }
    const inf = this.snap(p);
    const pose = furniturePoseAt(asset, inf.point, pendente.rotation, pendente.mirrored);
    const id = newId('fu');
    this.env.exec({
      type: 'addFurniture',
      furniture: { id, kind: 'furniture', assetId: asset.id, levelId: this.env.levelId(), ...pose, name: asset.name },
    });
    this.copies++;
    this.env.say(this.t('tl_msg_furniture_placed', { name: asset.name, n: this.copies }));
    this.last = inf.point;
    this.draw(inf.point);
  }
}
