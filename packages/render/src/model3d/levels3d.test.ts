import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTemplate } from '@hestia/model';
import {
  buildLevels,
  disposeLevels,
  layoutLevels,
  levelPalette,
  type LevelsGroupData,
} from './levels3d.ts';
import { LEVEL_LINE_OFFSET, levelProjectBox } from './levelsData.ts';

/** Câmera olhando para o centro da obra; `forward` é a horizontal da câmera para o alvo. */
function cameraAt(
  x: number,
  y: number,
  z: number,
  aspect = 16 / 9,
): { camera: THREE.PerspectiveCamera; forward: THREE.Vector3 } {
  const alvo = new THREE.Vector3(5, 5, 1.5);
  const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(x, y, z);
  camera.lookAt(alvo);
  camera.updateMatrixWorld();
  const forward = alvo.clone().sub(camera.position).setZ(0).normalize();
  return { camera, forward };
}

/** Ângulo de uma reta no intervalo (−π/2, π/2], o mesmo usado pelo layout. */
function anguloLegivel(angulo: number): number {
  let a = angulo;
  while (a > Math.PI / 2) a -= Math.PI;
  while (a <= -Math.PI / 2) a += Math.PI;
  return a;
}

/** Ângulo da linha projetada, em pixels da tela: em NDC o x é esticado pelo aspecto. */
function anguloProjetado(a: THREE.Vector3, b: THREE.Vector3, aspect: number): number {
  return anguloLegivel(Math.atan2(b.y - a.y, (b.x - a.x) * aspect));
}

/** Luminância aproximada (0..255) de uma cor 0xrrggbb. */
function luminancia(cor: number): number {
  const r = (cor >> 16) & 0xff;
  const g = (cor >> 8) & 0xff;
  const b = cor & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const dados = (g: THREE.Group): LevelsGroupData => g.userData as LevelsGroupData;

describe('datum de nível no 3D (duas linhas)', () => {
  it('cria linha da esquerda, linha de trás, bolha e texto por nível', () => {
    const g = buildLevels(buildTemplate('house2'), null);
    const info = dados(g);
    expect(info.views).toHaveLength(2);
    expect(info.dimensions).toHaveLength(0);
    // 4 objetos por nível (2 linhas, bolha e texto), sem plano nem cota.
    expect(g.children).toHaveLength(8);
    const v = info.views[0]!;
    expect(v.line).toBeInstanceOf(THREE.Line);
    expect(v.lineBack).toBeInstanceOf(THREE.Line);
    expect(v.bubble).toBeInstanceOf(THREE.Sprite);
    expect(v.bubble.scale.x).toBeCloseTo(0.5, 6);
    expect(v.text).toBeInstanceOf(THREE.Sprite);
    expect(v.text.material.depthTest).toBe(false);
  });

  it('câmera a sudeste: canto NW, linha esquerda W, linha de trás N e bolha em SW', () => {
    const p = buildTemplate('house2');
    const b = levelProjectBox(p, LEVEL_LINE_OFFSET);
    const g = buildLevels(p, null);
    const { camera, forward } = cameraAt(20, -20, 15);
    layoutLevels(g, camera, forward);
    const info = dados(g);
    expect(info.layout).toMatchObject({ corner: 'NW', leftSide: 'W', bubbleEnd: 'a' });
    const v = info.views[0]!;
    expect(v.bubble.position.x).toBeCloseTo(b.minX, 6);
    expect(v.bubble.position.y).toBeCloseTo(b.minY, 6);
    const esq = v.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(esq.getX(0)).toBeCloseTo(b.minX, 6);
    expect(esq.getY(0)).toBeCloseTo(b.minY, 6);
    expect(esq.getX(1)).toBeCloseTo(b.minX, 6);
    expect(esq.getY(1)).toBeCloseTo(b.maxY, 6);
    const tras = v.lineBack.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(tras.getX(0)).toBeCloseTo(b.minX, 6);
    expect(tras.getY(0)).toBeCloseTo(b.maxY, 6);
    expect(tras.getX(1)).toBeCloseTo(b.maxX + 1.5, 6);
    expect(tras.getY(1)).toBeCloseTo(b.maxY, 6);
    // O texto segue a linha da esquerda no plano da tela (não fica deitado no chão).
    expect(Math.abs((v.text.material as THREE.SpriteMaterial).rotation)).toBeGreaterThan(0.01);
  });

  it('câmera a noroeste: canto SE, linha esquerda S, linha de trás E e bolha em SW', () => {
    const p = buildTemplate('house2');
    const b = levelProjectBox(p, LEVEL_LINE_OFFSET);
    const g = buildLevels(p, null);
    const { camera, forward } = cameraAt(-20, 20, 15);
    layoutLevels(g, camera, forward);
    const info = dados(g);
    expect(info.layout).toMatchObject({ corner: 'SE', leftSide: 'E', bubbleEnd: 'b' });
    const v = info.views[0]!;
    expect(v.bubble.position.x).toBeCloseTo(b.maxX, 6);
    expect(v.bubble.position.y).toBeCloseTo(b.maxY, 6);
    const tras = v.lineBack.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(tras.getX(0)).toBeCloseTo(b.maxX, 6);
    expect(tras.getY(0)).toBeCloseTo(b.minY, 6);
    expect(tras.getX(1)).toBeCloseTo(b.minX - 1.5, 6);
    expect(tras.getY(1)).toBeCloseTo(b.minY, 6);
  });

  it('nível selecionado ganha o plano entre as linhas e a cota no eixo das bolhas', () => {
    const p = buildTemplate('house2');
    const b = levelProjectBox(p);
    const g = buildLevels(p, 'lv_0');
    const info = dados(g);
    expect(info.dimensions).toHaveLength(1);
    const dim = info.dimensions[0]!;
    expect(dim.info.side).toBe('above');
    expect(dim.info.value).toBeCloseTo(3, 6);
    expect(dim.label.userData.dimension).toMatchObject({ levelId: 'lv_0', neighborId: 'lv_1', value: 3 });
    expect(dim.label.scale.x).toBeCloseTo(2.6, 6);
    const { camera, forward } = cameraAt(20, -20, 15);
    layoutLevels(g, camera, forward);
    const v = info.views[0]!;
    const pos = dim.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.getX(0)).toBeCloseTo(v.bubble.position.x - 0.6, 6);
    expect(pos.getZ(0)).toBeCloseTo(0, 6);
    expect(pos.getZ(1)).toBeCloseTo(3, 6);
    expect(dim.label.position.z).toBeCloseTo(1.5, 6);
    const plano = g.children.find((o) => (o as THREE.Mesh).userData?.levelsPlane === true) as THREE.Mesh;
    expect(plano).toBeInstanceOf(THREE.Mesh);
    const geo = plano.geometry as THREE.PlaneGeometry;
    expect(geo.parameters.width).toBeCloseTo(b.maxX - b.minX, 6);
    expect(geo.parameters.height).toBeCloseTo(b.maxY - b.minY, 6);
    expect(plano.position.x).toBeCloseTo((b.minX + b.maxX) / 2, 6);
    expect(plano.position.y).toBeCloseTo((b.minY + b.maxY) / 2, 6);
    expect(plano.position.z).toBeCloseTo(0, 6);
  });

  it('texto fica paralelo à linha da esquerda e legível em qualquer câmera', () => {
    const cameras = [
      ['sudeste', 20, -20, 15],
      ['noroeste', -20, 20, 15],
      ['quase vertical', 5.3, 4.7, 80],
      ['quase horizontal', 0, 5, 1.6],
      ['de frente para o lado W', 0.4, -20, 7],
      ['por trás, rasa', 18, 12, 2.2],
    ] as const;
    for (const [nome, x, y, z] of cameras) {
      const g = buildLevels(buildTemplate('house2'), null);
      const { camera, forward } = cameraAt(x, y, z);
      layoutLevels(g, camera, forward);
      const info = dados(g);
      for (const v of info.views) {
        const pos = v.line.geometry.getAttribute('position') as THREE.BufferAttribute;
        // As pontas visíveis da linha da esquerda, na elevação do próprio nível.
        const a = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0)).project(camera);
        const b = new THREE.Vector3(pos.getX(1), pos.getY(1), pos.getZ(1)).project(camera);
        const esperado = anguloProjetado(a, b, camera.aspect);
        const rotacao = (v.text.material as THREE.SpriteMaterial).rotation;
        expect(rotacao, nome).toBeCloseTo(esperado, 5);
        // Ângulo no intervalo (−π/2, π/2]: o texto nunca fica de cabeça para baixo.
        expect(rotacao, nome).toBeGreaterThan(-Math.PI / 2 - 1e-9);
        expect(rotacao, nome).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
      }
    }
  });

  it('texto tem pivô na borda esquerda e começa depois da bolha, seguindo a linha', () => {
    const g = buildLevels(buildTemplate('house2'), null);
    const { camera, forward } = cameraAt(20, -20, 15);
    layoutLevels(g, camera, forward);
    const info = dados(g);
    // LADO_BOLHA / 2 + GAP_TEXTO: o texto começa 0,25 m depois da borda da bolha.
    const inicio = 0.5;
    for (const v of info.views) {
      expect(v.text.center.x).toBe(0);
      expect(v.text.center.y).toBe(0.5);
      const pos = v.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const dx = pos.getX(1) - pos.getX(0);
      const dy = pos.getY(1) - pos.getY(0);
      const comprimento = Math.hypot(dx, dy);
      const deslocamento = {
        x: v.text.position.x - v.bubble.position.x,
        y: v.text.position.y - v.bubble.position.y,
      };
      // A posição inicial anda na mesma direção da linha, a partir da bolha.
      expect(Math.hypot(deslocamento.x, deslocamento.y)).toBeCloseTo(inicio, 6);
      expect(deslocamento.x).toBeCloseTo((dx / comprimento) * inicio, 6);
      expect(deslocamento.y).toBeCloseTo((dy / comprimento) * inicio, 6);
      // Sem deslocar em altura: o texto fica na elevação do nível, centrado na linha.
      expect(v.text.position.z).toBeCloseTo(v.datum.elevation, 6);
    }
  });

  it('paleta clara e escura são distintas e adequadas ao fundo', () => {
    const claro = levelPalette(false);
    const escuro = levelPalette(true);
    const chaves = [
      'line',
      'selected',
      'text',
      'bubble',
      'bubbleBorder',
      'dimension',
      'dimensionBorder',
      'dimensionText',
      'plane',
    ] as const;
    for (const chave of chaves) {
      expect(escuro[chave], chave).not.toBe(claro[chave]);
    }
    // Claro: visual atual do editor.
    expect(claro.line).toBe(0x374151);
    expect(claro.selected).toBe(0x1565c0);
    expect(claro.text).toBe(0x1f2937);
    // Escuro: linhas/texto claros, seleção azul clara, fundos escuros.
    expect(escuro.line).toBe(0xcbd5e1);
    expect(escuro.text).toBe(0xe5e7eb);
    expect(escuro.selected).toBe(0x60a5fa);
    expect(luminancia(escuro.line)).toBeGreaterThan(luminancia(escuro.bubble));
    expect(luminancia(escuro.text)).toBeGreaterThan(luminancia(escuro.dimension));
    expect(luminancia(claro.bubble)).toBeGreaterThan(luminancia(escuro.bubble));
    expect(luminancia(claro.dimension)).toBeGreaterThan(luminancia(escuro.dimension));
    // Cópia: mutar o retorno não contamina a paleta global.
    claro.line = 0;
    expect(levelPalette(false).line).toBe(0x374151);
  });

  it('buildLevels escuro aplica as cores da paleta nos materiais de linha, plano e cota', () => {
    const p = buildTemplate('house2');
    const claro = levelPalette(false);
    const escuro = levelPalette(true);
    const gClaro = buildLevels(p, 'lv_0');
    const gEscuro = buildLevels(p, 'lv_0', true);
    const normalClaro = dados(gClaro).views.find((v) => v.datum.levelId === 'lv_1')!;
    const normalEscuro = dados(gEscuro).views.find((v) => v.datum.levelId === 'lv_1')!;
    expect((normalClaro.line.material as THREE.LineDashedMaterial).color.getHex()).toBe(claro.line);
    expect((normalEscuro.line.material as THREE.LineDashedMaterial).color.getHex()).toBe(escuro.line);
    const selecionadoEscuro = dados(gEscuro).views.find((v) => v.datum.levelId === 'lv_0')!;
    expect((selecionadoEscuro.line.material as THREE.LineDashedMaterial).color.getHex()).toBe(escuro.selected);
    const plano = gEscuro.children.find((o) => (o as THREE.Mesh).userData?.levelsPlane === true) as THREE.Mesh;
    expect((plano.material as THREE.MeshBasicMaterial).color.getHex()).toBe(escuro.plane);
    const dim = dados(gEscuro).dimensions[0]!;
    expect((dim.line.material as THREE.LineBasicMaterial).color.getHex()).toBe(escuro.selected);
    // Sem canvas em Node: texturas nulas, mas os materiais já saem com a paleta certa.
    expect((normalEscuro.text.material as THREE.SpriteMaterial).map).toBeNull();
    disposeLevels(gClaro);
    disposeLevels(gEscuro);
  });

  it('em 360° de azimute e várias elevações, o texto fica sempre paralelo e legível', () => {
    const p = buildTemplate('house2');
    const alvo = new THREE.Vector3(5, 5, 1.5);
    const aspecto = 16 / 9;
    const legivel = (a: number): number => {
      let x = a;
      while (x > Math.PI / 2) x -= Math.PI;
      while (x <= -Math.PI / 2) x += Math.PI;
      return x;
    };
    for (let az = 0; az < 360; az += 10) {
      for (const elev of [5, 15, 30, 60, 80]) {
        const a = (az * Math.PI) / 180;
        const e = (elev * Math.PI) / 180;
        const r = 30;
        const camera = new THREE.PerspectiveCamera(38, aspecto, 0.1, 1000);
        camera.up.set(0, 0, 1);
        camera.position.set(5 + Math.cos(a) * Math.cos(e) * r, 5 + Math.sin(a) * Math.cos(e) * r, 1.5 + Math.sin(e) * r);
        camera.lookAt(alvo);
        camera.updateMatrixWorld();
        const forward = alvo.clone().sub(camera.position).setZ(0).normalize();
        const g = buildLevels(p, null);
        layoutLevels(g, camera, forward);
        const v = dados(g).views[0]!;
        const pos = v.line.geometry.getAttribute('position') as THREE.BufferAttribute;
        const p1 = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0)).project(camera);
        const p2 = new THREE.Vector3(pos.getX(1), pos.getY(1), pos.getZ(1)).project(camera);
        const esperado = legivel(Math.atan2(p2.y - p1.y, (p2.x - p1.x) * aspecto));
        const rotacao = (v.text.material as THREE.SpriteMaterial).rotation;
        expect(rotacao, `az=${az} elev=${elev}`).toBeCloseTo(esperado, 6);
        expect(Math.abs(rotacao), `az=${az} elev=${elev}`).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
        disposeLevels(g);
      }
    }
  });

  it('etiqueta da cota fica sobre a linha, no meio do intervalo entre os níveis', () => {
    const g = buildLevels(buildTemplate('house2'), 'lv_0');
    const { camera, forward } = cameraAt(-20, 20, 15);
    layoutLevels(g, camera, forward);
    const info = dados(g);
    const dim = info.dimensions[0]!;
    const pos = dim.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    // Sobre a linha de cota: mesma posição no plano (x, y) das duas pontas.
    expect(dim.label.position.x).toBeCloseTo(pos.getX(0), 6);
    expect(dim.label.position.y).toBeCloseTo(pos.getY(0), 6);
    expect(dim.label.position.x).toBeCloseTo(pos.getX(1), 6);
    expect(dim.label.position.y).toBeCloseTo(pos.getY(1), 6);
    // No meio do intervalo: entre as elevações dos dois níveis (0 e 3 m).
    expect(dim.label.position.z).toBeCloseTo((pos.getZ(0) + pos.getZ(1)) / 2, 6);
    expect(dim.label.position.z).toBeCloseTo(1.5, 6);
    // Continua com o tamanho que garante a área de clique.
    expect(dim.label.scale.x).toBeCloseTo(2.6, 6);
    expect(dim.label.scale.y).toBeCloseTo(0.8, 6);
  });

  it('dispose libera e esvazia o grupo', () => {
    const g = buildLevels(buildTemplate('house2'), 'lv_0');
    expect(g.children.length).toBeGreaterThan(0);
    disposeLevels(g);
    expect(g.children).toHaveLength(0);
  });
});
