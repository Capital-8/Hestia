import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importSkp } from './skp';
import { simplifyMesh } from './simplify';
import { IMPORT_LIMITS, type ImportedModel } from './types';

const LIVRES = 'E:/tmp/blocos-teste/skp-livres/github-CoderAllan-SketchUpModels';
const BLOCOS = 'E:/PROGRAMAS/Clone Enscape/sket blocos';

function read(path: string) {
  const b = readFileSync(path);
  return { name: basename(path), bytes: new Uint8Array(b.buffer, b.byteOffset, b.byteLength) };
}

/** bbox mundial (m) das instancias. */
function worldBox(m: ImportedModel) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  const defs = new Map(m.defs.map((d) => [d.id, d]));
  for (const inst of m.instances) {
    const d = defs.get(inst.defId)!;
    const t = inst.transform;
    for (let k = 0; k < d.positions.length; k += 3) {
      const x = d.positions[k]!;
      const y = d.positions[k + 1]!;
      const z = d.positions[k + 2]!;
      const w = [
        t[0]! * x + t[4]! * y + t[8]! * z + t[12]!,
        t[1]! * x + t[5]! * y + t[9]! * z + t[13]!,
        t[2]! * x + t[6]! * y + t[10]! * z + t[14]!,
      ];
      for (let a = 0; a < 3; a++) {
        mn[a] = Math.min(mn[a]!, w[a]!);
        mx[a] = Math.max(mx[a]!, w[a]!);
      }
    }
  }
  return { size: mx.map((v, a) => v - mn[a]!), min: mn };
}

describe('importSkp: erros', () => {
  it('recusa arquivo acima de 50 MB sem ler', async () => {
    const big = { name: 'g.skp', bytes: { byteLength: IMPORT_LIMITS.refuseFileBytes + 1 } as unknown as Uint8Array };
    await expect(importSkp(big)).rejects.toThrow(/50 MB/);
  });
  it('arquivo invalido: erro claro em portugues', async () => {
    await expect(importSkp({ name: 'x.skp', bytes: new Uint8Array(500).fill(7) })).rejects.toThrow(/\.skp/);
  });
  it('respeita AbortSignal', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(importSkp({ name: 'x.skp', bytes: new Uint8Array(500) }, { signal: ctl.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

const sofaAntigo = `${LIVRES}/Sofa.skp`;
describe.skipIf(!existsSync(sofaAntigo))('importSkp: formato antigo', () => {
  it('Sofa.skp falha com mensagem clara sugerindo .dae/.glb', async () => {
    await expect(importSkp(read(sofaAntigo))).rejects.toThrow(/COLLADA \(\.dae\) ou glTF \(\.glb\)/);
  });
});

const livres = ['Diningroom table and chairs.skp', 'Sofa table.skp', 'Workshop table.skp'].map((f) => `${LIVRES}/${f}`);
describe('importSkp: livres (MIT)', () => {
  for (const p of livres) {
    it.skipIf(!existsSync(p))(basename(p), async () => {
      const t0 = performance.now();
      let m: ImportedModel;
      try {
        m = await importSkp(read(p));
      } catch (e) {
        // Arquivos antigos podem falhar com a mensagem clara.
        expect((e as Error).message).toMatch(/\.skp/);
        console.log(`[skp] ${basename(p)}: ${(e as Error).message.slice(0, 80)}`);
        return;
      }
      const b = worldBox(m);
      console.log(
        `[skp] ${m.sourceFileName} v=${m.stats.vertices} t=${m.stats.triangles} inst=${m.stats.instances} defs=${m.stats.definitions} ` +
          `bbox=${b.size.map((v) => v.toFixed(2)).join('x')} ms=${Math.round(performance.now() - t0)}`,
      );
      expect(m.stats.instances).toBeGreaterThan(0);
      expect(Math.max(...b.size)).toBeLessThan(20);
      expect(Math.max(...b.size)).toBeGreaterThan(0.2);
    }, 120000);
  }
});

const blocos: Array<[string, { minZ: number; maxZ: number }]> = [
  ['Group_229.skp', { minZ: 0.3, maxZ: 4 }],
  ['sofa.skp', { minZ: 0.4, maxZ: 1.2 }], // sofa: altura ~0,8 m no eixo Z
  ['cama+azul.skp', { minZ: 0.4, maxZ: 1.5 }],
  ['sofa+(2).skp', { minZ: 0.4, maxZ: 1.5 }],
];
describe('importSkp: blocos do usuario (somente leitura)', () => {
  for (const [f, lim] of blocos) {
    const p = `${BLOCOS}/${f}`;
    it.skipIf(!existsSync(p))(f, async () => {
      const file = read(p);
      const t0 = performance.now();
      const ev: Array<[number, string]> = [];
      const m = await importSkp(file, { onProgress: (fr, l) => ev.push([fr, l]) });
      const ms = Math.round(performance.now() - t0);
      const peakMB = Math.round(process.resourceUsage().maxRSS / 1024);
      const b = worldBox(m);
      const alvo = 30000;
      let lv = 0;
      let lt = 0;
      const t1 = performance.now();
      for (const d of m.defs) {
        const s = simplifyMesh(d, Math.max(4, Math.round((alvo * (d.indices.length / 3)) / m.stats.triangles)));
        lv += s.positions.length / 3;
        lt += s.indices.length / 3;
      }
      console.log(
        `[bloco] ${f} bytes=${file.bytes.length} v=${m.stats.vertices} t=${m.stats.triangles} inst=${m.stats.instances} defs=${m.stats.definitions} ` +
          `tex=${m.stats.textures} mats=${m.materials.length} bbox(m)=${b.size.map((v) => v.toFixed(2)).join('x')} ms=${ms} picoRSS=${peakMB}MB ` +
          `leve=${lt}tri/${lv}v em ${Math.round(performance.now() - t1)}ms avisos=${m.warnings.length}`,
      );
      expect(m.stats.vertices).toBeGreaterThan(1000);
      expect(m.stats.instances).toBeGreaterThan(0);
      // Z para cima: altura plausivel no eixo Z e nenhum eixo absurdo.
      expect(b.size[2]!).toBeGreaterThan(lim.minZ);
      expect(b.size[2]!).toBeLessThan(lim.maxZ);
      expect(Math.max(...b.size)).toBeLessThan(10);
      for (const t of m.textures) {
        expect(t.fileName).not.toMatch(/[\\/]/);
        expect(['image/png', 'image/jpeg']).toContain(t.mime);
      }
      for (const mat of m.materials) {
        expect(mat.opacity).toBeGreaterThan(0);
        if (mat.textureIndex !== undefined) {
          expect(mat.sizeM).toBeDefined();
          expect(mat.sizeM![0]).toBeGreaterThan(0);
        }
      }
      expect(lt).toBeLessThan(alvo * 1.4);
      expect(lt).toBeGreaterThan(alvo * 0.4);
      expect(ev.at(-1)![0]).toBe(1);
      for (let i = 1; i < ev.length; i++) expect(ev[i]![0]).toBeGreaterThanOrEqual(ev[i - 1]![0]);
    }, 180000);
  }
});
