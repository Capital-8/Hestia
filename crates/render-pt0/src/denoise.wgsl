// Redução de ruído (fase 6, crates/render-pt0): filtro À-Trous guiado pelo G-buffer do primeiro acerto
// (gravado por `pt0.wgsl` no passe 0). Espelho em CPU: `denoise.rs::filtrar_cpu`, mesma aritmética.
//
// Modos (`dimensao.w`):
//   0: desmodulação. Média do acumulado (soma / contagem) e divisão pela média de R do pixel, nos pixels
//      filtráveis.
//   1: passo do À-Trous, com passo `dimensao.z` (1, 2, 4, ...), B3 5x5 dilatado.
//   2: último passo. Mesmo filtro, e depois remodulação pela média de R do pixel. Saída com alfa 1.
// A média de R vem do acumulado de R (soma por amostra e contagem), não de uma amostra no centro: a textura
// dentro do pixel entra na média (ver denoise.rs).
// Flag != 0 (fundo, vidro, metal liso, borda): o pixel é copiado sem filtro, e vizinhos com flag != 0 não entram.
// Pesos: geometria (distância ao plano tangente do centro, em pegadas do pixel), normal (potência do
// produto escalar) e luminância (diferença sobre o desvio local 3x3 do passo de entrada).

struct Parametros {
    // x: largura; y: altura; z: passo do À-Trous; w: modo (0, 1 ou 2).
    dimensao: vec4<u32>,
    // x: expoente da normal; y: tolerância do plano (pegadas); z: tolerância de luminância (desvios);
    // w: abertura do pixel (rad).
    sigmas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> p: Parametros;
@group(0) @binding(1) var entrada: texture_2d<f32>;
@group(0) @binding(2) var gb_geo: texture_2d<f32>;
@group(0) @binding(3) var gb_normal: texture_2d<f32>;
@group(0) @binding(4) var acumulado_r: texture_2d<f32>;
@group(0) @binding(5) var saida: texture_storage_2d<rgba32float, write>;

const EPS_LUMINANCIA: f32 = 1.0e-3;
const EPS_PLANO: f32 = 1.0e-9;

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// B3 de 1D (1, 4, 6, 4, 1) / 16 para o desvio i em -2..=2.
fn peso_b3(i: i32) -> f32 {
    let a = abs(i);
    if (a == 0) {
        return 0.375;
    }
    if (a == 1) {
        return 0.25;
    }
    return 0.0625;
}

fn dentro(q: vec2<i32>) -> bool {
    return q.x >= 0 && q.y >= 0 && q.x < i32(p.dimensao.x) && q.y < i32(p.dimensao.y);
}

// Média do fator R do pixel: soma das amostras sobre a contagem (alfa do acumulado de R).
fn r_medio(c: vec2<i32>) -> vec3<f32> {
    let a = textureLoad(acumulado_r, c, 0);
    return a.rgb / max(a.a, 1.0);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= p.dimensao.x || id.y >= p.dimensao.y) {
        return;
    }
    let c = vec2<i32>(i32(id.x), i32(id.y));
    let geo = textureLoad(gb_geo, c, 0);
    let flag = geo.w;
    let entrada_c = textureLoad(entrada, c, 0);

    if (p.dimensao.w == 0u) {
        var v = entrada_c.rgb / max(entrada_c.a, 1.0);
        if (flag == 0.0) {
            v = v / r_medio(c);
        }
        textureStore(saida, c, vec4<f32>(v, 1.0));
        return;
    }

    let x_c = entrada_c.rgb;
    if (flag != 0.0) {
        textureStore(saida, c, vec4<f32>(x_c, 1.0));
        return;
    }

    let pos_p = geo.xyz;
    let gn = textureLoad(gb_normal, c, 0);
    let n_p = gn.xyz;
    let passo = i32(p.dimensao.z);
    let pegada = gn.w * p.sigmas.w * f32(passo);
    let lum_p = lum(x_c);

    // Desvio local da luminância: vizinhança 3x3 do mesmo tipo (filtrável), no passo de entrada.
    var s1 = 0.0;
    var s2 = 0.0;
    var nv = 0.0;
    for (var dy = -1; dy <= 1; dy = dy + 1) {
        for (var dx = -1; dx <= 1; dx = dx + 1) {
            let q = c + vec2<i32>(dx, dy);
            if (!dentro(q) || textureLoad(gb_geo, q, 0).w != 0.0) {
                continue;
            }
            let l = lum(textureLoad(entrada, q, 0).rgb);
            s1 = s1 + l;
            s2 = s2 + l * l;
            nv = nv + 1.0;
        }
    }
    let media_l = s1 / nv;
    let desvio = sqrt(max(s2 / nv - media_l * media_l, 0.0));
    let tol_l = p.sigmas.z * desvio + EPS_LUMINANCIA;
    let tol_p = p.sigmas.y * pegada + EPS_PLANO;

    var acum = vec3<f32>(0.0);
    var total = 0.0;
    for (var dy = -2; dy <= 2; dy = dy + 1) {
        for (var dx = -2; dx <= 2; dx = dx + 1) {
            let q = c + vec2<i32>(dx, dy) * passo;
            if (!dentro(q)) {
                continue;
            }
            let gq = textureLoad(gb_geo, q, 0);
            if (gq.w != 0.0) {
                continue;
            }
            let nq = textureLoad(gb_normal, q, 0).xyz;
            let xq = textureLoad(entrada, q, 0).rgb;
            let dp = gq.xyz - pos_p;
            let dplano = 0.5 * (abs(dot(n_p, dp)) + abs(dot(nq, dp)));
            let wz = exp(-dplano / tol_p);
            let wn = pow(max(dot(n_p, nq), 1.0e-6), p.sigmas.x);
            let wl = exp(-abs(lum(xq) - lum_p) / tol_l);
            let w = peso_b3(dx) * peso_b3(dy) * wz * wn * wl;
            acum = acum + w * xq;
            total = total + w;
        }
    }

    var resultado = acum / total;
    if (p.dimensao.w == 2u) {
        resultado = resultado * r_medio(c);
    }
    textureStore(saida, c, vec4<f32>(resultado, 1.0));
}
