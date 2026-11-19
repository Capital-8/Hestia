import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { encaixarNaParede } from './encaixeParede.ts';
import { retanguloNoMundo } from './encaixeColisao.ts';
import type { CaixaLocal, FaceDeParede, Pose } from './encaixeTipos.ts';

/*
 * Testes CEGOS de `encaixarNaParede`, escritos só a partir da especificação da ficha T-F2-parede. Cada valor esperado tem a conta
 * feita à mão no comentário ao lado; a função testada NUNCA é usada para calcular o esperado. Tolerância: 1e-9.
 *
 * Convenções (de `encaixeTipos.ts`): local x = largura, y = profundidade (frente em y = 0, fundo em y = profundidade), z = altura;
 * mundo = R(rotation)·E·local + (x, y); a face vai de a para b e a parte LIVRE fica à ESQUERDA de a→b.
 */

const TOL = 1e-9;
/** Caixa do caso base da ficha: 0,80 × 0,56 × 0,72 m. */
const CAIXA: CaixaLocal = { min: [0, 0, 0], max: [0.8, 0.56, 0.72] };

function pose(x: number, y: number, rotation = 0, mirrored = false, z = 0): Pose {
  return { x, y, rotation, mirrored, z };
}

function v2(x: number, y: number): Vec2 {
  return { x, y };
}

function centroDoRetangulo(c: readonly [Vec2, Vec2, Vec2, Vec2]): Vec2 {
  return { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 };
}

/** Face horizontal: a=(0,0)→b=(4,0), sólido em y<0 e livre em y>0. */
const FACE_Y0: FaceDeParede = { a: v2(0, 0), b: v2(4, 0) };

describe('encaixarNaParede', () => {
  it('caso base: fundo encosta em y=0, frente vai para y=0,56 e o centro ao longo da face não muda', () => {
    const antes = pose(2.0, 0.7, 0.1);
    const r = encaixarNaParede(antes, CAIXA, [FACE_Y0], 2.0);
    expect(r).not.toBeNull();
    if (r === null) return;

    // d=(1,0) → rotação = atan2(-0, -1) = -π, normalizada para π (intervalo (−π, π]).
    expect(r.pose.rotation).toBeCloseTo(Math.PI, 9);
    // Fundo local y=0,56 encostado em y=0 → pose.y = 0,56 (rotação π: 0,56 − 0,56).
    expect(r.pose.y).toBeCloseTo(0.56, 9);
    // Centro antes x = 2 + 0,4·cos 0,1 − 0,28·sen 0,1 = 2,370048309; com rotação π, centro x = pose.x − 0,4.
    expect(r.pose.x).toBeCloseTo(2.7700483094500985, 9);

    const c = retanguloNoMundo(r.pose, CAIXA);
    // Cantos de trás são os locais y=0,56 (índices 2 e 3): ficam em y = 0.
    expect(Math.abs(c[2]!.y)).toBeLessThan(TOL);
    expect(Math.abs(c[3]!.y)).toBeLessThan(TOL);
    // Cantos da frente são os locais y=0 (índices 0 e 1): ficam em y = profundidade = 0,56.
    expect(Math.abs(c[0]!.y - 0.56)).toBeLessThan(TOL);
    expect(Math.abs(c[1]!.y - 0.56)).toBeLessThan(TOL);
    // x do centro do retângulo igual ao de antes: 2,370048309 nos dois.
    expect(Math.abs(centroDoRetangulo(c).x - centroDoRetangulo(retanguloNoMundo(antes, CAIXA)).x)).toBeLessThan(TOL);
    expect(r.face).toBe(0);
  });

  it('mirrored continua true e a geometria encosta do mesmo jeito', () => {
    const r = encaixarNaParede(pose(2.0, 0.7, 0.1, true), CAIXA, [FACE_Y0], 2.0);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.pose.mirrored).toBe(true);
    // Espelhado: centro antes x = 2 − 0,4·cos 0,1 − 0,28·sen 0,1 = 1,574044977; pose.x = centro + 0,4 = 1,174044977.
    expect(r.pose.x).toBeCloseTo(1.1740449772276778, 9);
    expect(r.pose.y).toBeCloseTo(0.56, 9);
    const c = retanguloNoMundo(r.pose, CAIXA);
    expect(Math.abs(c[2]!.y)).toBeLessThan(TOL);
    expect(Math.abs(c[3]!.y)).toBeLessThan(TOL);
    expect(Math.abs(c[0]!.y - 0.56)).toBeLessThan(TOL);
    expect(Math.abs(c[1]!.y - 0.56)).toBeLessThan(TOL);
  });

  it('fundo a 0,5 m: null no padrão 0,30, encaixa com 0,60 e reporta a distância de antes', () => {
    // Rotação 0, pose.y = −0,06: fundo y = −0,06 + 0,56 = 0,50; centro y = −0,06 + 0,28 = 0,22 (livre).
    const p = pose(2.0, -0.06);
    expect(encaixarNaParede(p, CAIXA, [FACE_Y0])).toBeNull();
    const r = encaixarNaParede(p, CAIXA, [FACE_Y0], 0.6);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.distancia).toBeCloseTo(0.5, 9);
    // Centro antes x = 2 + 0,4 = 2,4; com rotação π, pose.x = 2,4 + 0,4 = 2,8.
    expect(r.pose.x).toBeCloseTo(2.8, 9);
    expect(r.pose.y).toBeCloseTo(0.56, 9);
    expect(r.pose.rotation).toBeCloseTo(Math.PI, 9);
  });

  it('duas faces: escolhe a mais próxima do fundo e devolve o índice dela', () => {
    // faces[0]: y=0 (livre y>0). faces[1]: a=(0,4)→b=(0,0) → d=(0,−1), livre x>0.
    // Pose (0,5; 2,0) rotação 0: centro (0,9; 2,28), fundo (0,9; 2,56).
    // Distâncias: a y=0 → 2,56; a x=0 → 0,90. Vence a face 1.
    const faces: FaceDeParede[] = [FACE_Y0, { a: v2(0, 4), b: v2(0, 0) }];
    const r = encaixarNaParede(pose(0.5, 2.0), CAIXA, faces, 3.0);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.face).toBe(1);
    expect(r.distancia).toBeCloseTo(0.9, 9);
    // d=(0,−1) → rotação = atan2(1, 0) = π/2; fundo local y=0,56 encosta em x=0 → pose.x = 0,56.
    expect(r.pose.rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(r.pose.x).toBeCloseTo(0.56, 9);
    // Projeção do centro em d preservada: −(pose.y + 0,4) = −2,28 → pose.y = 1,88.
    expect(r.pose.y).toBeCloseTo(1.88, 9);
    const c = retanguloNoMundo(r.pose, CAIXA);
    expect(Math.abs(c[2]!.x)).toBeLessThan(TOL);
    expect(Math.abs(c[3]!.x)).toBeLessThan(TOL);
  });

  it('centro do móvel no lado sólido da face é ignorado', () => {
    // Rotação 0, pose.y = −0,4: centro y = −0,4 + 0,28 = −0,12 (sólido); fundo y = 0,16 estaria no alcance.
    expect(encaixarNaParede(pose(2.0, -0.4), CAIXA, [FACE_Y0], 2.0)).toBeNull();
  });

  it('projeção do fundo fora do segmento é ignorada; no fim exato ainda encaixa', () => {
    // Fundo centrado em x = 4,2 + 0,4 = 4,6 > 4 + 0,001 → fora.
    expect(encaixarNaParede(pose(4.2, 0.2), CAIXA, [FACE_Y0], 2.0)).toBeNull();
    // 1,5 mm além do fim: 3,6015 + 0,4 = 4,0015 > 4,001 → fora.
    expect(encaixarNaParede(pose(3.6015, 0.2), CAIXA, [FACE_Y0], 2.0)).toBeNull();
    // Fim exato: 3,6 + 0,4 = 4,0 → dentro. Centro antes x = 3,6 + 0,4 = 4,0; pose.x = 4,0 + 0,4 = 4,4.
    const r = encaixarNaParede(pose(3.6, 0.2), CAIXA, [FACE_Y0], 2.0);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.pose.x).toBeCloseTo(4.4, 9);
    expect(r.pose.y).toBeCloseTo(0.56, 9);
  });

  it('idempotência: encaixar o resultado de novo devolve a mesma pose e distância ~0', () => {
    const r1 = encaixarNaParede(pose(2.0, 0.7, 0.1), CAIXA, [FACE_Y0], 2.0);
    expect(r1).not.toBeNull();
    if (r1 === null) return;
    const r2 = encaixarNaParede(r1.pose, CAIXA, [FACE_Y0], 2.0);
    expect(r2).not.toBeNull();
    if (r2 === null) return;
    expect(Math.abs(r2.pose.x - r1.pose.x)).toBeLessThan(TOL);
    expect(Math.abs(r2.pose.y - r1.pose.y)).toBeLessThan(TOL);
    expect(Math.abs(r2.pose.rotation - r1.pose.rotation)).toBeLessThan(TOL);
    expect(r2.pose.mirrored).toBe(r1.pose.mirrored);
    expect(r2.pose.z).toBe(r1.pose.z);
    expect(Math.abs(r2.distancia)).toBeLessThan(TOL);
  });

  it('z preservado e rotação sempre em (−π, π]', () => {
    const r = encaixarNaParede(pose(2.0, 0.7, 0.1, false, 0.4), CAIXA, [FACE_Y0], 2.0);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.pose.z).toBe(0.4);
    // O ângulo cru seria −π; a normalização manda para π.
    expect(r.pose.rotation).toBeCloseTo(Math.PI, 9);
    expect(r.pose.rotation).toBeGreaterThan(-Math.PI);
    expect(r.pose.rotation).toBeLessThanOrEqual(Math.PI);
    expect(r.pose.mirrored).toBe(false);
  });

  it('face diagonal (45°): rotação −3π/4 e fundo sobre a reta y = x', () => {
    // Face a=(0,0)→b=(4,4): d=(S,S), n=(−S,S) com S=√2/2; livre do lado x<y.
    // Pose (0; 1,0) rotação 0: centro (0,4; 1,28), fundo (0,4; 1,56).
    // Distância do fundo: (−0,4 + 1,56)·S = 1,16·S = 0,820243866.
    // Rotação: atan2(−S, −S) = −3π/4.
    // Conservando centro·d e fundo·n=0: pose.x = 0,726862915 e pose.y = 1,518822510.
    const S = Math.SQRT1_2;
    const r = encaixarNaParede(pose(0, 1.0), CAIXA, [{ a: v2(0, 0), b: v2(4, 4) }], 2.0);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.distancia).toBeCloseTo(1.16 * S, 9);
    expect(r.pose.rotation).toBeCloseTo((-3 * Math.PI) / 4, 9);
    expect(r.pose.x).toBeCloseTo(0.7268629150101523, 9);
    expect(r.pose.y).toBeCloseTo(1.5188225099390857, 9);
    const c = retanguloNoMundo(r.pose, CAIXA);
    // Fundo (índices 2 e 3) sobre a face y = x.
    expect(Math.abs(c[2]!.y - c[2]!.x)).toBeLessThan(TOL);
    expect(Math.abs(c[3]!.y - c[3]!.x)).toBeLessThan(TOL);
  });

  it('caixa com y mínimo negativo (frente que sobra): usa o fundo em y = max e o centro (min+max)/2', () => {
    // Caixa min y = −0,10, max y = 0,46: centro local y = 0,18; fundo local y = 0,46.
    // Pose (2; 1,18) rotação 0: centro y = 1,36 (livre), fundo y = 1,18 + 0,46 = 1,64.
    const caixaPorta: CaixaLocal = { min: [0, -0.1, 0], max: [0.8, 0.46, 0.72] };
    const r = encaixarNaParede(pose(2.0, 1.18), caixaPorta, [FACE_Y0], 2.0);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.distancia).toBeCloseTo(1.64, 9);
    // Centro antes x = 2 + 0,4 = 2,4; com rotação π, pose.x = 2,4 + 0,4 = 2,8.
    expect(r.pose.x).toBeCloseTo(2.8, 9);
    expect(r.pose.y).toBeCloseTo(0.46, 9);
    expect(r.pose.rotation).toBeCloseTo(Math.PI, 9);
    const c = retanguloNoMundo(r.pose, caixaPorta);
    expect(Math.abs(c[2]!.y)).toBeLessThan(TOL);
    expect(Math.abs(c[3]!.y)).toBeLessThan(TOL);
    // Frente local y = −0,10 → mundo y = 0,46 + 0,10 = 0,56.
    expect(Math.abs(c[0]!.y - 0.56)).toBeLessThan(TOL);
    expect(Math.abs(c[1]!.y - 0.56)).toBeLessThan(TOL);
  });

  it('simetria: espelhar a cena em x espelha a pose e mantém mirrored do móvel', () => {
    // Reflexão em x: face (0,0)→(4,0) vira (−4,0)→(0,0) (ordem invertida para o livre continuar y>0);
    // pose (2; 0,7; 0,1) vira (−2; 0,7; −0,1) com mirrored = true.
    const dir = encaixarNaParede(pose(2.0, 0.7, 0.1, false), CAIXA, [FACE_Y0], 2.0);
    const esq = encaixarNaParede(pose(-2.0, 0.7, -0.1, true), CAIXA, [{ a: v2(-4, 0), b: v2(0, 0) }], 2.0);
    expect(dir).not.toBeNull();
    expect(esq).not.toBeNull();
    if (dir === null || esq === null) return;
    // Valores à mão: 2,770048309 à direita e o espelho −2,770048309 à esquerda; y = 0,56 nos dois.
    expect(dir.pose.x).toBeCloseTo(2.7700483094500985, 9);
    expect(esq.pose.x).toBeCloseTo(-2.7700483094500985, 9);
    expect(esq.pose.y).toBeCloseTo(dir.pose.y, 9);
    expect(esq.pose.y).toBeCloseTo(0.56, 9);
    expect(esq.pose.rotation).toBeCloseTo(Math.PI, 9);
    expect(dir.pose.mirrored).toBe(false);
    expect(esq.pose.mirrored).toBe(true);
    expect(esq.face).toBe(0);
  });

  it('determinismo: a mesma entrada devolve exatamente o mesmo resultado', () => {
    const a = encaixarNaParede(pose(2.0, 0.7, 0.1), CAIXA, [FACE_Y0], 2.0);
    const b = encaixarNaParede(pose(2.0, 0.7, 0.1), CAIXA, [FACE_Y0], 2.0);
    expect(a).toEqual(b);
  });

  it('entradas vazias: sem faces, null', () => {
    expect(encaixarNaParede(pose(2.0, 0.7), CAIXA, [], 2.0)).toBeNull();
  });

  it('limite de distância: exatamente 0,30 ainda encaixa; 0,1 mm além já é null', () => {
    // Caixa rasa: profundidade 0,50. Rotação 0, pose.y = −0,20 → fundo y = 0,30 (= distanciaMax);
    // centro y = −0,20 + 0,25 = 0,05 (livre). Ao encaixar, pose.y = 0,50 (fundo local 0,50 em y=0).
    const caixaRasa: CaixaLocal = { min: [0, 0, 0], max: [0.8, 0.5, 0.72] };
    const dentro = encaixarNaParede(pose(2.0, -0.2), caixaRasa, [FACE_Y0]);
    expect(dentro).not.toBeNull();
    if (dentro === null) return;
    expect(dentro.distancia).toBeCloseTo(0.3, 9);
    expect(dentro.pose.y).toBeCloseTo(0.5, 9);
    // Centro antes x = 2 + 0,4 = 2,4; rotação π → pose.x = 2,8.
    expect(dentro.pose.x).toBeCloseTo(2.8, 9);
    // Fundo y = −0,1999 + 0,50 = 0,3001 > 0,30 → null.
    expect(encaixarNaParede(pose(2.0, -0.1999), caixaRasa, [FACE_Y0])).toBeNull();
  });

  it('fundo penetrando a parede (distância negativa) encosta e reporta 0 (contrato: ≥ 0)', () => {
    // Rotação π, pose.y = 0,4: fundo y = 0,4 − 0,56 = −0,16 (16 cm dentro da parede); centro y = 0,12 (livre).
    // Ao encaixar: fundo em y=0 → pose.y = 0,56; centro antes x = 2 − 0,4 = 1,6 → pose.x = 2,0.
    const r = encaixarNaParede(pose(2.0, 0.4, Math.PI), CAIXA, [FACE_Y0]);
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.distancia).toBeCloseTo(0, 9);
    expect(r.pose.y).toBeCloseTo(0.56, 9);
    expect(r.pose.x).toBeCloseTo(2.0, 9);
    expect(r.pose.rotation).toBeCloseTo(Math.PI, 9);
  });

  it.skip('empate exato entre duas faces: qual índice vence? — a especificação não define desempate', () => {
    // Ex.: móvel equidistante de duas faces perpendiculares; não dá para fixar o índice esperado.
  });

  it.skip('face degenerada (a = b): ignorar ou erro? — a especificação não cobre', () => {
    // A direção a→b é indefinida; não há valor esperado sem inventar uma convenção.
  });

  it.skip('tolerância de projeção exatamente 1 mm além do segmento: inclui ou exclui? — ambíguo', () => {
    // "tolerância 1 mm" não diz se o limite entra; por isso só testo dentro (fim exato) e 1,5 mm além.
  });
});
