import * as THREE from 'three';
import { apresentacaoDe, view3dOf, type Apresentacao, type GraphicsCategory, type Material, type View3DSettings } from '@hestia/model';
import { mix } from '../plan/color.ts';
import { aplicarTexturaTriplanar, chaveDaTextura, type TexturasProvedor3D } from './texturas3d.ts';
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

/** O que define o tipo dos materiais: a vista 3D, o tema e a apresentação por categoria (tom, clareamento e opacidade). */
export interface MarcoMateriais {
  view: View3DSettings;
  dark: boolean;
  apresentacoes?: Partial<Record<GraphicsCategory, Apresentacao>>;
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
  /** Texturas por imagem (só no estilo realista). Sem provedor ou com a textura ainda carregando, o material é o de sempre. */
  texturas: TexturasProvedor3D | null = null;

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
    // Apresentação da categoria (plano de UX de 2026-11-23): clareamento mistura a cor com o papel e a opacidade entra
    // junto da transparência da vista. A vista efetiva (`viewComTons`) já combina a opacidade na transparência; quando
    // isso acontece, o valor da apresentação não é aplicado duas vezes.
    const ap = this.marco.apresentacoes?.[cat] ? apresentacaoDe(this.marco.apresentacoes[cat]) : undefined;
    const clareamento = ap ? (ap.clareamento ?? (ap.tone === 'halftone' ? 0.5 : 0)) : ov.halftone ? 0.5 : 0;
    const opacidade = ap ? clamp01(ap.opacidade ?? 1) : 1;
    const transparenciaAp = 1 - opacidade;
    const tEfetiva = t + 1e-9 >= transparenciaAp ? t : 1 - (1 - t) * opacidade;
    const paper = dark ? '#2a2f36' : '#ffffff';
    if (style === 'hiddenLine') {
      return this.cached(`${style}|${dark}|${cat}|${t}|${clareamento}|${opacidade}`, () => new THREE.MeshBasicMaterial({
        color: dark ? PAPER.dark : PAPER.light,
        transparent: 1 - tEfetiva < 1,
        opacity: 1 - tEfetiva,
        side: THREE.FrontSide,
        ...(opacidade < 1 ? { depthWrite: false } : {}),
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }));
    }
    const tex = m?.id ? obterTexturasAcabamento(m.id) : null;
    const gloss = m?.gloss ?? 0.1;
    const base = tex?.opacity ?? m?.opacity ?? 1;
    const colorOf = ov.color ?? m?.color ?? fallback;
    const color = clareamento > 0 ? mix(colorOf, paper, clareamento) : colorOf;
    const tx = style === 'realistic' ? chaveDaTextura(m, this.texturas) : '';
    // Mapas procedurais do mobiliário (acabamentos de componentes): só quando o material não tem textura do catálogo.
    const usarMapa = Boolean(tex?.map && !tx && !ov.color && clareamento === 0 && (style === 'realistic' || style === 'shaded'));
    const key = [style, dark, cat, t, ov.color ?? '', ov.halftone, m?.id ?? '', m?.color ?? '', gloss, base, fallback, tx, m?.aparencia?.metal ?? '', m?.aparencia?.rugosidade ?? '', usarMapa ? 'tex' : '', clareamento, opacidade].join('|');
    return this.cached(key, () => {
      const opacity = base * (1 - tEfetiva);
      const corFinal = usarMapa ? 0xffffff : color;
      // `generic`: malha soldada sem normais por vértice; o sombreamento chapado sai das derivadas no shader.
      const props = {
        color: new THREE.Color(corFinal),
        transparent: opacity < 1,
        opacity,
        side: THREE.FrontSide,
        ...(cat === 'generic' ? { flatShading: true } : {}),
        ...(opacidade < 1 || m?.id?.startsWith('comp_vidro_') ? { depthWrite: false } : {}),
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
        const mat = new THREE.MeshStandardMaterial({ ...props, roughness: m?.aparencia?.rugosidade ?? (1 - gloss * 0.75), metalness: m?.aparencia?.metal ?? (m && m.id === 'mat_aluminio' ? 0.5 : 0) });
        const textura = m?.aparencia?.textura;
        const mapas = tx && textura ? this.texturas?.obter(textura.imagemId) : undefined;
        return mapas && textura ? aplicarTexturaTriplanar(mat, mapas, textura) : mat;
      }
      if (style === 'shaded' && usarMapa && tex?.map) {
        return aplicarMapeamentoTriplanar(new THREE.MeshLambertMaterial({ ...props, map: tex.map }));
      }
      if (style === 'shaded') return new THREE.MeshLambertMaterial(props);
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
