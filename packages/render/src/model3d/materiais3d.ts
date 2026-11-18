import * as THREE from 'three';
import { view3dOf, type GraphicsCategory, type Material, type View3DSettings } from '@hestia/model';
import { mix } from '../plan/color.ts';
import { aplicarTexturaTriplanar, chaveDaTextura, type TexturasProvedor3D } from './texturas3d.ts';

/** Cor do papel nas linhas ocultas: branco no claro e cinza escuro no escuro (a cor do chão escuro). */
const PAPER = { light: 0xffffff, dark: 0x2a2f36 };

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

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
    const gloss = m?.gloss ?? 0.1;
    const base = m?.opacity ?? 1;
    const colorOf = ov.color ?? m?.color ?? fallback;
    const color = ov.halftone ? mix(colorOf, '#ffffff', 0.5) : colorOf;
    const tx = style === 'realistic' ? chaveDaTextura(m, this.texturas) : '';
    const key = [style, dark, cat, t, ov.color ?? '', ov.halftone, m?.id ?? '', m?.color ?? '', gloss, base, fallback, tx, m?.aparencia?.metal ?? '', m?.aparencia?.rugosidade ?? ''].join('|');
    return this.cached(key, () => {
      const opacity = base * (1 - t);
      // `generic`: malha soldada sem normais por vértice; o sombreamento chapado sai das derivadas no shader.
      const props = { color: new THREE.Color(color), transparent: opacity < 1, opacity, side: THREE.FrontSide, ...(cat === 'generic' ? { flatShading: true } : {}) };
      if (style === 'realistic') {
        const mat = new THREE.MeshStandardMaterial({ ...props, roughness: m?.aparencia?.rugosidade ?? (1 - gloss * 0.75), metalness: m?.aparencia?.metal ?? (m && m.id === 'mat_aluminio' ? 0.5 : 0) });
        const textura = m?.aparencia?.textura;
        const mapas = tx && textura ? this.texturas?.obter(textura.imagemId) : undefined;
        return mapas && textura ? aplicarTexturaTriplanar(mat, mapas, textura) : mat;
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
