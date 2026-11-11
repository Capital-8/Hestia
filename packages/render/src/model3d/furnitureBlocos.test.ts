import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { importSkp } from '@hestia/io/src/furniture/skp.ts';
import { buildFurnitureAsset, createEmptyProject, type Furniture } from '@hestia/model';
import { furnitureViewBudget } from './furnitureBudget.ts';
import { filaDeVersoesLeves } from './furnitureLod.ts';
import { buildFurnitureLevel, type ContextoMoveis } from './furnitureSolids.ts';

/** Blocos reais do usuário: SOMENTE LEITURA, fora do repositório. Sem a pasta, o teste é pulado. */
const PASTA = 'E:/PROGRAMAS/Clone Enscape/sket blocos';
const ARQUIVOS = ['Group_229.skp', 'sofa.skp', 'cama+azul.skp', 'sofa+(2).skp'];
const existe = existsSync(PASTA);

const ctx: ContextoMoveis = {
  material: () => new THREE.MeshBasicMaterial(),
  pick: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
};

describe.skipIf(!existe)('blocos reais (.skp do usuário, somente leitura)', () => {
  for (const nome of ARQUIVOS) {
    const caminho = `${PASTA}/${nome}`;
    it.skipIf(!existsSync(caminho))(`${nome}: 10 e 50 instâncias na versão leve`, async () => {
      const b = readFileSync(caminho);
      const model = await importSkp({ name: nome, bytes: new Uint8Array(b.buffer, b.byteOffset, b.byteLength) });
      const asset = buildFurnitureAsset({ ...model, name: nome, sourceFileName: nome, sourceFormat: 'skp', instances: model.instances }, `fa_${nome.replace(/\W/g, '')}`);
      const monta = (n: number) => {
        const p = createEmptyProject();
        p.furniture = { assets: { [asset.id]: asset } };
        for (let i = 0; i < n; i++) {
          const id = `mv_${i}`;
          p.elements[id] = { id, kind: 'furniture', assetId: asset.id, levelId: p.levels[0]!.id, x: (i % 10) * 3, y: Math.floor(i / 10) * 3, z: 0, rotation: i * 0.3, scale: 1, mirrored: i % 4 === 3, name: nome, order: i + 1 } as Furniture;
        }
        return p;
      };
      // Versão leve: gerada em fatias pela fila (o mesmo caminho da vista), medindo o tempo total.
      const p10 = monta(10);
      const t0 = performance.now();
      const caixa = buildFurnitureLevel(p10, 'lv_0', ctx)!;
      const msCaixa = performance.now() - t0;
      expect(caixa.plano.grupos.some((g) => g.qualidade === 'completo')).toBe(false);
      const t1 = performance.now();
      await filaDeVersoesLeves.esvaziar();
      const msFila = performance.now() - t1;
      const out: Record<string, number | string> = { arquivo: nome, defs: asset.defs.length, pecas: asset.parts?.length ?? 0, triBloco: asset.stats.triangles, msCaixa: Math.round(msCaixa), msSimplificar: Math.round(msFila) };
      for (const n of [10, 50]) {
        const p = monta(n);
        const t = performance.now();
        const r = buildFurnitureLevel(p, 'lv_0', ctx)!;
        const ms = performance.now() - t;
        const orc = furnitureViewBudget(p);
        const cheio = furnitureViewBudget(p, { qualidadePadrao: 'completo' });
        out[`ms${n}`] = Math.round(ms);
        out[`tri${n}`] = r.stats.triangulos;
        out[`triCompleto${n}`] = cheio.triangulos;
        out[`chamadas${n}`] = r.stats.chamadas;
        out[`geometrias${n}`] = r.stats.geometrias;
        expect(r.plano.grupos.every((g) => g.qualidade !== 'caixa')).toBe(true);
        expect(r.stats.geometrias).toBe(buildFurnitureLevel(monta(4), 'lv_0', ctx)!.stats.geometrias);
        expect(orc.triangulos).toBeLessThanOrEqual(n * 30_000 * 1.1 + n * 200);
      }
      console.log('MEDICAO ' + JSON.stringify(out));
    }, 300_000);
  }
});
