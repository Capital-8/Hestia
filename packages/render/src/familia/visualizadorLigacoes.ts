import type { LigacaoResolvida } from '@hestia/engine';
import * as THREE from 'three';
import { corDoDominio } from './corDoDominio.ts';

/*
 * Marcadores das ligações na cena do editor (ficha C2b): um disco na seção (redonda) ou uma placa (retangular), mais uma
 * seta na direção para fora, tudo na cor do domínio. A ligação selecionada no painel fica realçada (brilho próprio).
 * O tamanho sai da função pura `marcadorDaLigacao`, testável sem WebGL; a classe só monta e libera a geometria.
 */

/** Comprimento da seta (m). */
export const COMPRIMENTO_SETA_LIGACAO = 0.12;
/** Espessura do disco e da placa (m). */
export const ESPESSURA_MARCA_LIGACAO = 0.004;
/** Piso de raio/meia-medida (m): a ligação sempre aparece, mesmo com medida 0 resolvida. */
export const MINIMO_MARCA_LIGACAO = 0.01;
/** Brilho próprio (emissivo) da ligação selecionada. */
const BRILHO_REALCE = 0.6;

export interface MarcadorLigacao {
  forma: 'disco' | 'placa';
  /** Raio do disco (m); 0 na placa. */
  raio: number;
  /** Largura e altura da placa (m); 0 no disco. */
  largura: number;
  altura: number;
}

/** Forma e medidas (m) do marcador de uma ligação resolvida. */
export function marcadorDaLigacao(ligacao: LigacaoResolvida): MarcadorLigacao {
  if (ligacao.secao === 'retangular') {
    return {
      forma: 'placa',
      raio: 0,
      largura: Math.max(ligacao.largura, MINIMO_MARCA_LIGACAO),
      altura: Math.max(ligacao.altura, MINIMO_MARCA_LIGACAO),
    };
  }
  return { forma: 'disco', raio: Math.max(ligacao.diametro / 2, MINIMO_MARCA_LIGACAO), largura: 0, altura: 0 };
}

/** Libera um material ou a lista de materiais (o three aceita as duas formas). */
function descartarMateriais(material: THREE.Material | THREE.Material[]): void {
  for (const m of Array.isArray(material) ? material : [material]) m.dispose();
}

interface LigacaoNaCena {
  id: string;
  grupo: THREE.Group;
  marca: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  seta: THREE.ArrowHelper;
}

function criarVisual(ligacao: LigacaoResolvida): LigacaoNaCena {
  const marcador = marcadorDaLigacao(ligacao);
  const cor = corDoDominio(ligacao.dominio);
  const direcao = new THREE.Vector3(...ligacao.direcao).normalize();
  const grupo = new THREE.Group();
  grupo.name = `ligacao ${ligacao.id}`;
  grupo.position.set(...ligacao.posicao);

  const material = new THREE.MeshStandardMaterial({
    color: cor,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    metalness: 0.05,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  let marca: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  if (marcador.forma === 'disco') {
    // Cilindro de altura 1 (eixo Y) escalado para o raio e a espessura; o eixo Y vai para a direção.
    marca = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), material);
    marca.scale.set(marcador.raio, ESPESSURA_MARCA_LIGACAO, marcador.raio);
    marca.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direcao);
  } else {
    // Caixa unitária escalada para largura × altura × espessura; o eixo Z (espessura) vai para a direção.
    marca = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    marca.scale.set(marcador.largura, marcador.altura, ESPESSURA_MARCA_LIGACAO);
    marca.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direcao);
  }
  marca.name = `marca ${ligacao.id}`;
  grupo.add(marca);

  const seta = new THREE.ArrowHelper(direcao, new THREE.Vector3(0, 0, 0), COMPRIMENTO_SETA_LIGACAO, cor, COMPRIMENTO_SETA_LIGACAO * 0.3, COMPRIMENTO_SETA_LIGACAO * 0.2);
  seta.name = `seta ${ligacao.id}`;
  grupo.add(seta);

  return { id: ligacao.id, grupo, marca, seta };
}

/** Marcadores das ligações na cena (um grupo por ligação). Sem WebGL nos testes: só usa objetos do three. */
export class LigacoesNaCena {
  readonly grupo = new THREE.Group();
  private visuais: LigacaoNaCena[] = [];

  /** Recria os marcadores. Devolve quantas ligações entraram na cena. Lista vazia limpa. */
  definir(ligacoes: readonly LigacaoResolvida[], selecionada: string | null): number {
    this.limpar();
    for (const ligacao of ligacoes) {
      const visual = criarVisual(ligacao);
      this.grupo.add(visual.grupo);
      this.visuais.push(visual);
    }
    this.realcar(selecionada);
    return this.visuais.length;
  }

  /** Realça a ligação de `id` (brilho próprio); `null` tira o realce de todas. */
  realcar(id: string | null): void {
    for (const visual of this.visuais) {
      visual.marca.material.emissiveIntensity = visual.id === id ? BRILHO_REALCE : 0;
    }
  }

  /** Quantos marcadores estão na cena (para teste e conferência). */
  quantidade(): number {
    return this.visuais.length;
  }

  /** Remove e libera a geometria e os materiais dos marcadores atuais. */
  limpar(): void {
    for (const visual of this.visuais) {
      this.grupo.remove(visual.grupo);
      visual.marca.geometry.dispose();
      visual.marca.material.dispose();
      visual.seta.line.geometry.dispose();
      descartarMateriais(visual.seta.line.material);
      visual.seta.cone.geometry.dispose();
      descartarMateriais(visual.seta.cone.material);
    }
    this.visuais = [];
  }

  destruir(): void {
    this.limpar();
  }
}
