import * as THREE from 'three';
import { view3dOf, type GraphicsCategory, type Material, type View3DSettings } from '@hestia/model';
import { mix } from '../plan/color.ts';
import { obterTexturasAcabamento } from './texturasMobiliario.ts';

/** Cor do papel nas linhas ocultas: branco no claro e cinza escuro no escuro (a cor do chão escuro). */
const PAPER = { light: 0xffffff, dark: 0x2a2f36 };
const TRIPLANAR_ESCALA = 1.35;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Injeta projeção box/triplanar no vertex shader usando `transformed` e `objectNormal` (em metros),
 * permitindo usar `map` e `bumpMap` em geometrias sem atributo `uv` (ex.: `SolidBatch`).
 */
export function aplicarMapeamentoTriplanar<T extends THREE.Material>(mat: T): T {
  mat.customProgramCacheKey = () => 'triplanar-v1';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vec4 triPos = vec4( transformed, 1.0 );
vec3 triNorm = objectNormal;
#ifdef USE_INSTANCING
  triPos = instanceMatrix * triPos;
  triNorm = mat3( instanceMatrix ) * triNorm;
#endif
vec3 absTriNorm = abs( triNorm );
vec2 triUv;
if ( absTriNorm.z >= absTriNorm.x && absTriNorm.z >= absTriNorm.y ) {
  triUv = triPos.xy;
} else if ( absTriNorm.y >= absTriNorm.x ) {
  triUv = triPos.xz;
} else {
  triUv = triPos.yz;
}
triUv *= ${TRIPLANAR_ESCALA.toFixed(2)}; // units-ok: escala UV de shader GLSL
#ifdef USE_MAP
  vMapUv = ( mapTransform * vec3( triUv, 1.0 ) ).xy;
#endif
#ifdef USE_BUMPMAP
  vBumpMapUv = ( bumpMapTransform * vec3( triUv, 1.0 ) ).xy;
#endif`,
    );
  };
  return mat;
}

/** O que define o tipo dos materiais: a vista 3D e o tema. */
export interface MarcoMateriais {
  view: View3DSettings;
  dark: boolean;
}

/**
 * Materiais da cena 3D por chave (estilo, tema, categoria, transparência, meio-tom, material). A atualização marca as chaves
 * que usa (`used`); as que ninguém usou saem (`descartarNaoUsados`). Um nível reaproveitado não chama os materiais de novo:
 * marca as chaves que usou quando foi montado (ver `scene3d.ts`, `montarNivel`).
 */
export class Materiais3D {
  private mats = new Map<string, THREE.Material>();
  /** Chaves usadas desde o começo da atualização corrente. */
  used = new Set<string>();
  /** Chaves usadas na montagem do nível em curso (null fora da montagem). */
  noNivel: Set<string> | null = null;
  marco: MarcoMateriais = { view: view3dOf({}), dark: false };

  /** Material em cache com a chave dada; marca a chave como usada nesta atualização (e no nível em montagem). */
  cached<T extends THREE.Material>(key: string, make: () => T): T {
    this.used.add(key);
    this.noNivel?.add(key);
    let mat = this.mats.get(key) as T | undefined;
    if (!mat) {
      mat = make();
      this.mats.set(key, mat);
    }
    return mat;
  }

  /**
   * Material de uma face. Estilo realista: luz solar e brilho. Sombreado: cor do material com luz simples. Cores
   * consistentes: cor do material sem luz. Linhas ocultas: papel, com polygonOffset para as arestas não vazarem.
   * A substituição da categoria (cor, transparência, meio-tom) entra na chave: cada categoria tem seu material.
   */
  face(m: Material | undefined, cat: GraphicsCategory, fallback = '#999999'): THREE.Material {
    const { view, dark } = this.marco;
    const style = view.style;
    const ov = view.overrides[cat];
    const t = clamp01(ov.transparency);
    if (style === 'hiddenLine') {
      return this.cached(`${style}|${dark}|${cat}|${t}`, () => new THREE.MeshBasicMaterial({
        color: dark ? PAPER.dark : PAPER.light,
        transparent: t > 0,
        opacity: 1 - t,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }));
    }
    const tex = m?.id ? obterTexturasAcabamento(m.id) : null;
    const gloss = m?.gloss ?? 0.1;
    const base = tex?.opacity ?? m?.opacity ?? 1;
    const colorOf = ov.color ?? m?.color ?? fallback;
    const color = ov.halftone ? mix(colorOf, '#ffffff', 0.5) : colorOf;
    const usarMapa = Boolean(tex?.map && !ov.color && !ov.halftone && (style === 'realistic' || style === 'shaded'));
    const key = [style, dark, cat, t, ov.color ?? '', ov.halftone, m?.id ?? '', m?.color ?? '', gloss, base, fallback, usarMapa ? 'tex' : ''].join('|');
    return this.cached(key, () => {
      const opacity = base * (1 - t);
      const corFinal = usarMapa ? 0xffffff : color;
      const props = {
        color: new THREE.Color(corFinal),
        transparent: opacity < 1,
        opacity,
        side: THREE.FrontSide,
        ...(m?.id === 'comp_vidro_fume' ? { depthWrite: false } : {}),
      };
      if (style === 'realistic') {
        if (usarMapa && tex) {
          return aplicarMapeamentoTriplanar(new THREE.MeshStandardMaterial({
            ...props,
            ...(tex.map ? { map: tex.map } : {}),
            ...(tex.bumpMap ? { bumpMap: tex.bumpMap, bumpScale: 0.002 } : {}),
            roughness: tex.roughness,
            metalness: tex.metalness,
          }));
        }
        return new THREE.MeshStandardMaterial({ ...props, roughness: tex ? tex.roughness : 1 - gloss * 0.75, metalness: tex ? tex.metalness : (m && m.id === 'mat_aluminio' ? 0.5 : 0) });
      }
      if (style === 'shaded') {
        if (usarMapa && tex?.map) {
          return aplicarMapeamentoTriplanar(new THREE.MeshLambertMaterial({ ...props, map: tex.map }));
        }
        return new THREE.MeshLambertMaterial(props);
      }
      return new THREE.MeshBasicMaterial(props);
    });
  }

  /** Material das arestas (claro: quase preto; escuro: quase branco), meio transparente. */
  edge(): THREE.LineBasicMaterial {
    const dark = this.marco.dark;
    return this.cached(`edge|${dark}`, () => new THREE.LineBasicMaterial({ color: dark ? 0xd7dde5 : 0x1c2026, transparent: true, opacity: 0.5 }));
  }

  /** Libera (dispose) e tira do cache os materiais que a atualização não usou. */
  descartarNaoUsados(): void {
    for (const [k, m] of this.mats) {
      if (this.used.has(k)) continue;
      m.dispose();
      this.mats.delete(k);
    }
  }

  /** Libera todos os materiais (ao descartar a cena). */
  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}
