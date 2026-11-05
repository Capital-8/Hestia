import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HOME_VIEW, OrbitCamera, POLE_ELEVATION, aplicarCameraNaOrbita, cameraBasis, easeInOut, enquadrarCamera, wrapAngle } from './orbit.ts';
import { clipPlanes } from './cameraClip.ts';

const DEG = Math.PI / 180;

/** Projeta um ponto do mundo para pixels de tela (CSS, origem no canto superior esquerdo). */
function toScreen(cam: OrbitCamera, w: number, h: number, p: THREE.Vector3): { x: number; y: number } {
  const v = p.clone().project(cam.camera);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
}

function setup(az: number, el: number, dist: number, w = 800, h = 600): OrbitCamera {
  const o = new OrbitCamera();
  o.setAspect(w, h);
  o.target.set(3, -2, 1);
  o.azimuth = az;
  o.elevation = el;
  o.distance = dist;
  o.apply();
  return o;
}

const AZIMUTHS = [0, 45, 90, 135, 180, 225, 270, 315];
// -30° não é alcançável pela órbita (clamp em -0.05 rad), mas o pan não depende do clamp.
const ELEVATIONS = [-30, -2, 0, 10, 30, 60, 85];
const DISTANCES = [2, 40];
const DRAGS: [number, number][] = [
  [60, 0],
  [0, 60],
  [-80, 35],
  [40, -50],
];

describe('OrbitCamera.pan: a cena acompanha o cursor em qualquer ângulo', () => {
  for (const az of AZIMUTHS) {
    for (const el of ELEVATIONS) {
      for (const dist of DISTANCES) {
        it(`azimute ${az}°, elevação ${el}°, distância ${dist} m`, () => {
          for (const [dx, dy] of DRAGS) {
            const o = setup(az * DEG, el * DEG, dist);
            const anchor = o.target.clone();
            const c0 = toScreen(o, 800, 600, anchor);
            expect(c0.x).toBeCloseTo(400, 0);
            expect(c0.y).toBeCloseTo(300, 0);

            o.pan(dx, dy);

            const c1 = toScreen(o, 800, 600, anchor);
            expect(Math.abs(c1.x - (400 + dx))).toBeLessThanOrEqual(1);
            expect(Math.abs(c1.y - (300 + dy))).toBeLessThanOrEqual(1);
          }
        });
      }
    }
  }
});

describe('OrbitCamera.pan: escala depende da altura da tela', () => {
  it('o mesmo arrasto em px move o ponto âncora pela mesma quantidade em tela, qualquer resolução', () => {
    for (const [w, h] of [
      [800, 600],
      [1280, 900],
      [400, 1000],
    ] as const) {
      for (const az of AZIMUTHS) {
        const o = setup(az * DEG, 30 * DEG, 14, w, h);
        const anchor = o.target.clone();
        o.pan(50, -20);
        const c = toScreen(o, w, h, anchor);
        expect(Math.abs(c.x - (w / 2 + 50))).toBeLessThanOrEqual(1);
        expect(Math.abs(c.y - (h / 2 - 20))).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('OrbitCamera.pan: arrastos sucessivos e órbita não quebram o acompanhamento', () => {
  it('após órbita e vários pans, o ponto âncora continua acompanhando o cursor', () => {
    const o = setup(-Math.PI / 4, 0.5, 14);
    o.orbit(120, -40);
    o.pan(30, 10);
    o.orbit(-200, 90);
    const anchor = o.target.clone();
    o.pan(-45, 25);
    const c = toScreen(o, 800, 600, anchor);
    expect(Math.abs(c.x - (400 - 45))).toBeLessThanOrEqual(1);
    expect(Math.abs(c.y - (300 + 25))).toBeLessThanOrEqual(1);
  });
});

describe('OrbitCamera: projeção ortogonal', () => {
  it('mantém o enquadramento: pontos no plano do alvo caem nas mesmas posições em perspectiva e ortogonal', () => {
    for (const az of AZIMUTHS) {
      for (const el of ELEVATIONS) {
        for (const dist of DISTANCES) {
          const p = setup(az * DEG, el * DEG, dist);
          const q = setup(az * DEG, el * DEG, dist);
          q.setOrtho(true);
          const { right, up } = cameraBasis(az * DEG, el * DEG);
          // Ponto no plano perpendicular à vista, pelo alvo: a perspectiva e a ortogonal têm a mesma escala ali.
          const pt = q.target.clone().addScaledVector(right, 0.3 * dist).addScaledVector(up, -0.2 * dist);
          const a = toScreen(p, 800, 600, pt);
          const b = toScreen(q, 800, 600, pt);
          expect(b.x).toBeCloseTo(a.x, 1);
          expect(b.y).toBeCloseTo(a.y, 1);
        }
      }
    }
  });

  it('a câmera ativa muda com setOrtho e os ângulos e o alvo ficam', () => {
    const o = setup(0.7, 0.4, 9);
    expect(o.camera).toBe(o.perspective);
    o.setOrtho(true);
    expect(o.ortho).toBe(true);
    expect(o.camera).toBe(o.orthographic);
    expect(o.azimuth).toBe(0.7);
    expect(o.elevation).toBe(0.4);
    o.setOrtho(false);
    expect(o.camera).toBe(o.perspective);
  });

  it('a meia altura visível da ortogonal é distância·tan(fov/2), e o zoom a acompanha', () => {
    const o = setup(0.3, 0.5, 10, 800, 600);
    o.setOrtho(true);
    const half = (d: number): number => d * Math.tan((o.perspective.fov * Math.PI) / 360);
    expect(o.orthographic.top).toBeCloseTo(half(10), 9);
    expect(o.orthographic.right).toBeCloseTo(half(10) * (800 / 600), 9);
    o.zoom(-500);
    expect(o.orthographic.top).toBeCloseTo(half(o.distance), 9);
    expect(o.distance).toBeLessThan(10);
  });

  it('zoom e pan funcionam na ortogonal: a âncora continua acompanhando o cursor', () => {
    const o = setup(-Math.PI / 4, 0.5, 14);
    o.setOrtho(true);
    o.zoom(-200);
    o.pan(40, -25);
    const anchor = o.target.clone();
    o.pan(-30, 12);
    const c = toScreen(o, 800, 600, anchor);
    expect(Math.abs(c.x - (400 - 30))).toBeLessThanOrEqual(1);
    expect(Math.abs(c.y - (300 + 12))).toBeLessThanOrEqual(1);
  });
});

describe('OrbitCamera: animateTo', () => {
  it('sai da vista atual, passa pelo meio e termina na vista destino, então para', () => {
    const o = setup(0, 0.2, 10);
    o.animateTo({ azimuth: 1, elevation: 0.8, distance: 20 }, 300);
    expect(o.animating).toBe(true);
    expect(o.step(1000)).toBe(true); // primeiro passo marca o início
    expect(o.azimuth).toBeCloseTo(0, 9);
    expect(o.elevation).toBeCloseTo(0.2, 9);
    expect(o.step(1150)).toBe(true); // metade do tempo: ease-in-out vale 0,5
    expect(o.azimuth).toBeCloseTo(0.5, 9);
    expect(o.elevation).toBeCloseTo(0.5, 9);
    expect(o.distance).toBeCloseTo(15, 9);
    expect(o.step(1300)).toBe(false);
    expect(o.azimuth).toBeCloseTo(1, 9);
    expect(o.elevation).toBeCloseTo(0.8, 9);
    expect(o.distance).toBeCloseTo(20, 9);
    expect(o.animating).toBe(false);
    expect(o.step(1400)).toBe(false);
  });

  it('o azimute percorre o menor arco (não dá a volta de 350°)', () => {
    const o = setup(Math.PI - 0.1, 0.3, 10);
    o.animateTo({ azimuth: -Math.PI + 0.1, elevation: 0.3 }, 200);
    o.step(0);
    o.step(100); // metade: deve estar em π (o caminho curto atravessa π)
    expect(Math.abs(Math.cos(o.azimuth) + 1)).toBeLessThan(1e-9);
    o.step(200);
    expect(o.azimuth).toBeCloseTo(-Math.PI + 0.1, 9);
  });

  it('easeInOut é simétrico, vai de 0 a 1 e é monótono', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
    for (const k of [0.1, 0.25, 0.4]) expect(easeInOut(k) + easeInOut(1 - k)).toBeCloseTo(1, 12);
    let prev = -1;
    for (let k = 0; k <= 1; k += 0.01) {
      expect(easeInOut(k)).toBeGreaterThanOrEqual(prev);
      prev = easeInOut(k);
    }
  });

  it('a elevação de topo é limitada ao polo (sem degenerar a câmera)', () => {
    const o = setup(0, 0.3, 10);
    o.animateTo({ azimuth: 0, elevation: Math.PI / 2 }, 100);
    o.step(0);
    o.step(100);
    expect(o.elevation).toBeCloseTo(POLE_ELEVATION, 12);
  });

  it('sem distância nem alvo, mantém distância e alvo', () => {
    const o = setup(0, 0.3, 7);
    const t = o.target.clone();
    o.animateTo({ azimuth: 2, elevation: 0.1 }, 50);
    o.step(0);
    o.step(50);
    expect(o.distance).toBe(7);
    expect(o.target.equals(t)).toBe(true);
  });

  it('com alvo, o alvo também é interpolado', () => {
    const o = setup(0, 0.3, 7);
    o.animateTo({ azimuth: 0, elevation: 0.3, target: new THREE.Vector3(10, 0, 1) }, 100);
    o.step(0);
    o.step(50);
    expect(o.target.x).toBeCloseTo(3 + 0.5 * 7, 9);
    o.step(100);
    expect(o.target.x).toBeCloseTo(10, 9);
  });

  it('um arrasto (órbita ou pan) ou um zoom cancela a animação na posição atual', () => {
    for (const interrupt of [(o: OrbitCamera) => o.orbit(10, 0), (o: OrbitCamera) => o.pan(5, 5), (o: OrbitCamera) => o.zoom(30)]) {
      const o = setup(0, 0.3, 10);
      o.animateTo({ azimuth: 2, elevation: 0.9 }, 300);
      o.step(0);
      o.step(100);
      interrupt(o);
      const az = o.azimuth;
      expect(o.animating).toBe(false);
      expect(o.step(400)).toBe(false);
      expect(o.azimuth).toBe(az);
    }
  });

  it('um novo animateTo substitui o anterior', () => {
    const o = setup(0, 0.3, 10);
    o.animateTo({ azimuth: 2, elevation: 0.3 }, 300);
    o.animateTo({ azimuth: -1, elevation: 0.3 }, 100);
    o.step(0);
    o.step(100);
    expect(o.azimuth).toBeCloseTo(-1, 9);
  });

  it('a vista inicial de Início é a padrão do app', () => {
    const o = new OrbitCamera();
    expect(o.azimuth).toBe(HOME_VIEW.azimuth);
    expect(o.elevation).toBe(HOME_VIEW.elevation);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
  });
});

describe('OrbitCamera: arrasto perto do polo e enquadramento', () => {
  it('o arrasto não passa de 1,5 rad, mas não salta de uma vista de topo', () => {
    const o = setup(0, 0.5, 14);
    o.orbit(0, 1000);
    expect(o.elevation).toBe(1.5);

    const top = setup(0, POLE_ELEVATION, 14);
    top.orbit(0, -10);
    expect(top.elevation).toBeCloseTo(POLE_ELEVATION - 0.06, 9);
    const again = setup(0, POLE_ELEVATION, 14);
    again.orbit(0, 100);
    expect(again.elevation).toBeCloseTo(POLE_ELEVATION, 9);
  });

  it('framing: alvo no centro da caixa e distância que cabe no campo; caixa vazia tem o padrão', () => {
    const o = new OrbitCamera();
    const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 2, 3));
    const f = o.framing(box);
    expect(f.target.x).toBeCloseTo(2, 9);
    expect(f.target.y).toBeCloseTo(1, 9);
    expect(f.target.z).toBeCloseTo(1.5, 9);
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    expect(f.distance).toBeCloseTo((r / Math.sin((38 * Math.PI) / 360)) * 1.05, 9);
    const empty = o.framing(new THREE.Box3());
    expect(empty.distance).toBe(14);
    expect(empty.target.z).toBe(1);
  });

  it('cameraBasis é ortonormal e aponta a câmera para cima', () => {
    for (const az of AZIMUTHS) {
      for (const el of ELEVATIONS) {
        const { toCamera, right, up } = cameraBasis(az * DEG, el * DEG);
        expect(right.length()).toBeCloseTo(1, 9);
        expect(up.length()).toBeCloseTo(1, 9);
        expect(right.dot(up)).toBeCloseTo(0, 9);
        expect(right.dot(toCamera)).toBeCloseTo(0, 9);
        expect(up.dot(toCamera)).toBeGreaterThanOrEqual(-1e-9);
        expect(up.z).toBeGreaterThan(0);
      }
    }
  });
});

describe('OrbitCamera: planos de recorte acompanham a distância', () => {
  it('ao aproximar, o plano próximo diminui; ao afastar, cresce (perspectiva e ortogonal)', () => {
    const o = setup(0.3, 0.4, 14);
    const near14 = o.perspective.near;
    o.zoom(-2000);
    expect(o.distance).toBeLessThan(1);
    expect(o.perspective.near).toBeLessThan(near14);
    expect(o.orthographic.near).toBe(o.perspective.near);
    o.zoom(1500);
    expect(o.perspective.near).toBeCloseTo(clipPlanes(o.distance).near, 12);
    expect(o.perspective.near).toBeGreaterThan(0.01);
    expect(o.orthographic.far).toBe(o.perspective.far);
  });

  it('o plano distante cobre o raio do modelo quando ele é grande', () => {
    const o = setup(0, 0.4, 14);
    o.sceneRadius = 1500;
    o.apply();
    expect(o.perspective.far).toBeGreaterThanOrEqual(1500);
    expect(o.perspective.far / o.perspective.near).toBeLessThanOrEqual(2e5);
  });
});

describe('OrbitCamera.zoom: não atravessa a parede no eixo de visão', () => {
  // Parede plana em x = 3, de frente para a câmera quando ela está do lado x > 3.
  const wall = new THREE.Plane(new THREE.Vector3(1, 0, 0), -3);
  const probe = (origin: THREE.Vector3, dir: THREE.Vector3): number | null => new THREE.Ray(origin, dir).distanceToPlane(wall);
  /** Alvo do lado de dentro (x < 3), câmera a `d` m, de frente para a parede (azimute 0, elevação 0). */
  const facing = (d: number): OrbitCamera => {
    const o = setup(0, 0, d);
    o.target.set(0, 0, 1);
    o.apply();
    return o;
  };

  it('aproximar para na folga antes da parede, sem entrar nela', () => {
    const o = facing(10);
    o.obstacle = probe;
    o.zoom(-5000);
    const eyeX = o.perspective.position.x;
    expect(eyeX).toBeGreaterThanOrEqual(3 + 0.2 - 1e-9);
    expect(eyeX).toBeLessThan(3.5);
  });

  it('afastar da parede segue livre, e aproximar de novo para na mesma folga', () => {
    const o = facing(10);
    o.obstacle = probe;
    o.zoom(-5000);
    o.zoom(3000);
    expect(o.distance).toBeGreaterThan(5);
    o.zoom(-5000);
    expect(o.perspective.position.x).toBeGreaterThanOrEqual(3 + 0.2 - 1e-9);
  });

  it('sem parede no eixo, o zoom só respeita a distância mínima (0,5 m)', () => {
    const o = facing(10);
    o.obstacle = () => null;
    o.zoom(-10000);
    expect(o.distance).toBeCloseTo(0.5, 9);
  });

  it('uma sequência de rodas nunca deixa a câmera mais perto da parede que a folga', () => {
    const o = facing(10);
    o.elevation = 0.1;
    o.apply();
    o.obstacle = probe;
    const steps = [-120, -300, -40, -800, 200, -90, -600, 50, -1000];
    for (let i = 0; i < 40; i++) {
      o.zoom(steps[i % steps.length]!);
      // A folga é ao longo do eixo de visão (elevação 0,1 rad): na direção x ela vale 0,2·cos(elevação).
      expect(o.perspective.position.x - 3).toBeGreaterThanOrEqual(0.2 * Math.cos(o.elevation) - 1e-6);
    }
  });
});

/** Fração do quadro (0 a 1) ocupada pelos pontos na largura e na altura, projetados pela câmera devolvida (a mesma montagem do render). */
function ocupacaoDePontos(pontos: THREE.Vector3[], cam: ReturnType<typeof enquadrarCamera>, aspecto: number): { horizontal: number; vertical: number } {
  const o = new OrbitCamera();
  aplicarCameraNaOrbita(o, cam);
  o.setAspect(aspecto, 1);
  o.apply();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pontos) {
    const v = p.clone().project(o.camera);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
    y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { horizontal: (x1 - x0) / 2, vertical: (y1 - y0) / 2 };
}

/** Os 8 cantos de uma caixa, como pontos. */
function cantosDaCaixa(caixa: THREE.Box3): THREE.Vector3[] {
  const { min, max } = caixa;
  const pontos: THREE.Vector3[] = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) pontos.push(new THREE.Vector3(x, y, z));
  return pontos;
}

describe('enquadrarCamera (imagem final sem câmera do usuário)', () => {
  const caixa = new THREE.Box3(new THREE.Vector3(-5, -5, 0), new THREE.Vector3(5, 5, 6));

  it('caixa 10x10x6 m em 16:9 ocupa 70 a 85 % do quadro na dimensão que domina, e cabe inteira', () => {
    const cam = enquadrarCamera(caixa, -Math.PI / 4, 0.5, 38, 16 / 9);
    const occ = ocupacaoDePontos(cantosDaCaixa(caixa), cam, 16 / 9);
    const dominante = Math.max(occ.horizontal, occ.vertical);
    expect(dominante).toBeGreaterThanOrEqual(0.7);
    expect(dominante).toBeLessThanOrEqual(0.85);
    expect(dominante).toBeCloseTo(0.78, 2);
    expect(occ.horizontal).toBeLessThanOrEqual(1);
    expect(occ.vertical).toBeLessThanOrEqual(1);
    // Esta caixa é mais alta que larga na projeção (o eixo vertical domina); a horizontal fica menor.
    expect(occ.vertical).toBeGreaterThan(occ.horizontal);
  });

  it('mantém a direção de vista e põe o alvo no centro da caixa', () => {
    const cam = enquadrarCamera(caixa, -Math.PI / 4, 0.5, 38, 16 / 9);
    expect(cam.azimuth).toBe(-Math.PI / 4);
    expect(cam.elevation).toBe(0.5);
    expect(cam.ortho).toBe(false);
    expect(cam.target).toEqual({ x: 0, y: 0, z: 3 });
    // A distância fica além do raio da caixa (a câmera nunca entra nela).
    expect(cam.distance).toBeGreaterThan(new THREE.Vector3(5, 5, 3).length());
  });

  it('vale para outras proporções e ocupações: a dimensão que domina bate com a ocupação pedida', () => {
    for (const [proporcao, ocupacao] of [[1, 0.5], [4 / 3, 0.6], [16 / 9, 0.9]] as const) {
      const cam = enquadrarCamera(caixa, 0.3, 0.9, 38, proporcao, ocupacao);
      const occ = ocupacaoDePontos(cantosDaCaixa(caixa), cam, proporcao);
      expect(Math.abs(Math.max(occ.horizontal, occ.vertical) - ocupacao)).toBeLessThan(0.01);
    }
  });

  it('com os pontos do modelo (volume em L, cantos vazios), a ocupação medida nos pontos é a pedida, não a da caixa', () => {
    // Volume com os dois cantos que definem a vertical na projeção vazios (o alto e afastado, e o baixo e próximo):
    // os pontos ocupam menos altura que a caixa, então a caixa superestima o modelo.
    const pontos: THREE.Vector3[] = [];
    for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) for (const z of [0, 1.5, 3, 4.5, 6]) {
      const noCantoAlto = x < -2 && y > 2 && z > 3;
      const noCantoBaixo = x > 2 && y < -2 && z < 3;
      if (!noCantoAlto && !noCantoBaixo) pontos.push(new THREE.Vector3(x, y, z));
    }
    const bruta = new Float32Array(pontos.flatMap((p) => [p.x, p.y, p.z]));
    const cam = enquadrarCamera(caixa, -Math.PI / 4, 0.5, 38, 16 / 9, 0.78, bruta);
    const occ = ocupacaoDePontos(pontos, cam, 16 / 9);
    expect(Math.abs(Math.max(occ.horizontal, occ.vertical) - 0.78)).toBeLessThan(0.01);
    // Sem os pontos, a mesma caixa dá outra distância: a caixa superestima o volume em L.
    expect(enquadrarCamera(caixa, -Math.PI / 4, 0.5, 38, 16 / 9).distance).toBeGreaterThan(cam.distance);
  });

  it('caixa vazia: a vista padrão do modelo vazio (alvo em z = 1 m, 14 m), como OrbitCamera.framing', () => {
    const cam = enquadrarCamera(new THREE.Box3(), HOME_VIEW.azimuth, HOME_VIEW.elevation, 38, 16 / 9);
    expect(cam.target).toEqual({ x: 0, y: 0, z: 1 });
    expect(cam.distance).toBe(14);
  });
});
