import { malhaDosCorpos, type CorpoResolvido, type Malha } from '@hestia/engine';
import * as THREE from 'three';
import { corDoCorpo, corpoVisivel3d, esferaDaMalhaDosCorpos } from './corposVisual.ts';
import { geometriaDaMalha, type NivelDetalhe3d } from './logica.ts';
import { malhaDaPeca } from './visualizadorPecas.ts';

/*
 * Malhas dos corpos na cena do editor (ficha B2). Um `Mesh` por corpo, com normais suaves (vêm prontas de `malhaDosCorpos`).
 * Corpos não são selecionáveis nem explodem: só aparecem junto das peças. Sem WebGL nos testes; a lógica pura está em `./corposVisual.ts`.
 */

interface CorpoNaCena {
  corpo: CorpoResolvido;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  geometria: THREE.BufferGeometry;
}

/** Opacidade do corpo vazio (fantasma), igual à da peça vazia. */
const OPACIDADE_VAZIO = 0.35;

function criarMaterialCorpo(corpo: CorpoResolvido, materiais: Readonly<Record<string, string>>, opacidadePadrao: number): THREE.MeshStandardMaterial {
  const vazio = corpo.vazio;
  const opacidade = vazio ? OPACIDADE_VAZIO : opacidadePadrao;
  return new THREE.MeshStandardMaterial({
    color: corDoCorpo(corpo, materiais),
    metalness: 0.02,
    roughness: 0.72,
    side: THREE.DoubleSide,
    transparent: vazio || opacidade < 1,
    opacity: opacidade,
    depthWrite: !vazio,
  });
}

export class CorposNaCena {
  readonly grupo = new THREE.Group();
  private visuais: CorpoNaCena[] = [];
  private malhas: Malha[] = [];

  /** Recria as malhas dos corpos. Lista vazia: não chama `malhaDosCorpos` (custo zero para famílias sem corpos). */
  definir(corpos: readonly CorpoResolvido[], materiais: Readonly<Record<string, string>>, opacidade: number, detalhe: NivelDetalhe3d): void {
    this.limpar();
    if (corpos.length === 0) return;
    const { solidas, vazios } = malhaDosCorpos([...corpos]);
    corpos.forEach((corpo, indice) => {
      const malha = malhaDaPeca(corpo.vazio ? vazios : solidas, indice);
      if (malha.indices.length === 0) return;
      const geometria = geometriaDaMalha(malha);
      const material = criarMaterialCorpo(corpo, materiais, opacidade);
      const mesh = new THREE.Mesh(geometria, material);
      mesh.name = `${corpo.nome} #${corpo.indice}`;
      mesh.visible = corpoVisivel3d(corpo, detalhe);
      this.grupo.add(mesh);
      this.visuais.push({ corpo, mesh, material, geometria });
      this.malhas.push(malha);
    });
  }

  /** Há alguma malha de corpo na cena? */
  temMalha(): boolean {
    return this.visuais.length > 0;
  }

  /** Esfera de enquadramento dos corpos visíveis na cena, ou `null` sem malha. */
  esfera(): { centro: [number, number, number]; raio: number } | null {
    return esferaDaMalhaDosCorpos(this.malhas);
  }

  /** Opacidade 0.1..1 dos corpos sólidos (o fantasma vazio fica em 0,35). */
  definirOpacidade(opacidade: number): void {
    for (const visual of this.visuais) {
      if (visual.corpo.vazio) continue;
      visual.material.opacity = opacidade;
      visual.material.transparent = opacidade < 1;
      visual.material.depthWrite = opacidade >= 1;
      visual.material.needsUpdate = true;
    }
  }

  definirDetalhe(detalhe: NivelDetalhe3d): void {
    for (const visual of this.visuais) visual.mesh.visible = corpoVisivel3d(visual.corpo, detalhe);
  }

  /** Remove e libera as malhas atuais. */
  limpar(): void {
    for (const visual of this.visuais) {
      this.grupo.remove(visual.mesh);
      visual.geometria.dispose();
      visual.material.dispose();
    }
    this.visuais = [];
    this.malhas = [];
  }

  destruir(): void {
    this.limpar();
  }
}
