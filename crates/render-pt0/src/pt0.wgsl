// Protótipo de rastreamento de caminhos, fase 4 (crates/render-pt0).
//
// Um passe = uma amostra por pixel do tile. Cada pixel lança um raio primário pela câmera e
// percorre o caminho em `radiancia_caminho`. Em cada vértice difuso soma a emissão, a luz direta
// do sol (difuso e, conforme q.opcoes.y, Blinn-Phong da referência ou GGX), o ambiente (q.opcoes.x)
// e um rebote: por cosseno, ou reflexo com dispersão se o material é metal (como o render-core).
// Vidro (transmissão, opacidade < 1 ou tipo 6) não recebe luz direta nem ambiente: Fresnel de
// Schlick escolhe entre reflexo e refração de Snell (IOR do material), e cada vértice de vidro dá
// dois vértices extras ao caminho. A fórmula da referência está em crates/render-pt0/src/referencia.rs.
//
// A travessia espelha bvh.rs (mesma ordem, mesma aritmética f32). A acumulação é ping-pong
// entre duas texturas RGBA32F: a textura de entrada é lida, a de saída é escrita.
// O céu (radiancia_ceu, halo_sol) vem de ceu.wgsl, concatenado antes deste arquivo.

const PI: f32 = 3.14159265358979;
const T_MINIMO: f32 = 1.0e-4;
const DESLOCAMENTO_SOMBRA: f32 = 3.0e-4;
const DIRECAO_MINIMA: f32 = 1.0e-8;
const DETERMINANTE_MINIMO: f32 = 1.0e-12;
const PILHA: u32 = 64u;
const T_INFINITO: f32 = 1.0e30;
// Fator do ambiente da referência (tracer.rs: `* 0.3`).
const AMBIENTE_REFERENCIA: f32 = 0.3;
// Vértices extras que cada vértice de vidro acrescenta ao limite do caminho.
const VERTICES_EXTRAS_VIDRO: u32 = 2u;
// Limite absoluto de iterações do caminho (profundidade + extras de vidro), para o laço ter fim.
const VERTICES_ABSOLUTOS: u32 = 12u;

struct Quadro {
    inv_vp: mat4x4<f32>,
    // xyz: direção para o sol (normalizada); w: intensidade do sol.
    sol: vec4<f32>,
    // rgb: cor do sol; w: raio angular do disco solar em radianos (0 = sol pontual).
    cor_sol: vec4<f32>,
    // rgb: fundo linear; w: 1 se há cor de fundo, 0 se o fundo é preto.
    fundo: vec4<f32>,
    // x, y: canto do tile (coordenadas absolutas); z, w: tamanho do tile.
    tile: vec4<u32>,
    // x, y: tamanho da imagem; z: índice da amostra; w: semente.
    dimensao: vec4<u32>,
    // x: profundidade (vértices do caminho, 1..4); y: 1 se o sol está acima do horizonte;
    // z: 1 se o céu é a cor uniforme do fundo (como o render-core), 0 se é o gradiente do motor.
    modo: vec4<u32>,
    // Irradiância SH9 do céu, sem disco e sem halo, já convoluída (ver ceu.rs). Só o ambiente SH usa.
    irradiancia: array<vec4<f32>, 9>,
    // x: ambiente (0 nenhum, 1 SH9 legado, 2 referência 0,3 * céu); y: especular (0 nenhum,
    // 1 Blinn-Phong da referência, 2 GGX); z: diagnóstico (bit 0 = sem raio de sombra; bit 1 =
    // força bruta, sem BVH); w: não usado.
    opcoes: vec4<u32>,
    // Texturas (fase 5): x, abertura do pixel (rad); y, lado comum das texturas (texels); z, níveis
    // de mip; w, não usado.
    textura: vec4<f32>,
};

struct No {
    caixa_min: vec3<f32>,
    a: u32,
    caixa_max: vec3<f32>,
    n: u32,
};

struct Triangulo {
    v0: vec4<f32>,
    v1: vec4<f32>,
    v2: vec4<f32>,
    n0: vec4<f32>,
    n1: vec4<f32>,
    n2: vec4<f32>,
    material: vec4<u32>,
};

struct Material {
    // rgb: cor base linear; w: metálico.
    cor: vec4<f32>,
    // rgb: emissão linear.
    emissao: vec4<f32>,
    // x: rugosidade.
    propriedades: vec4<f32>,
    // x: transmissão; y: IOR; z: opacidade; w: tipo procedural (6 = vidro).
    vidro: vec4<f32>,
    // Camada de cada mapa (albedo, normal, rugosidade, metálico); SEM_CAMADA = sem mapa.
    texturas: vec4<u32>,
    // rgb: média linear do albedo da textura (divisor); w: escala do padrão (metros por repetição).
    media_escala: vec4<f32>,
};

struct Hit {
    ok: bool,
    t: f32,
    u: f32,
    v: f32,
    triangulo: u32,
};

// Superfície no ponto acertado. `albedo` é a fração difusa: cor * (1 - metálico). `normal` aponta
// para quem olha; `frente` é verdadeiro se o raio chega pelo lado da normal geométrica (entra no
// vidro). `vidro`, `ior` e `transmissao` vêm do material.
struct Superficie {
    ponto: vec3<f32>,
    normal: vec3<f32>,
    albedo: vec3<f32>,
    emissao: vec3<f32>,
    cor: vec3<f32>,
    metal: f32,
    rugosidade: f32,
    vidro: bool,
    frente: bool,
    ior: f32,
};

@group(0) @binding(0) var<uniform> q: Quadro;
@group(0) @binding(1) var<storage, read> nos: array<No>;
@group(0) @binding(2) var<storage, read> tris: array<Triangulo>;
@group(0) @binding(3) var<storage, read> materiais: array<Material>;
@group(0) @binding(4) var acumulado_entrada: texture_2d<f32>;
@group(0) @binding(5) var acumulado_saida: texture_storage_2d<rgba32float, write>;
// Texturas de material (fase 5): amostrador de repetição com mip linear e um array por mapa, uma
// camada por textura da cena (ver `texturas.rs` e a seção de texturas, mais abaixo).
@group(0) @binding(6) var amostrador_textura: sampler;
@group(0) @binding(7) var texturas_albedo: texture_2d_array<f32>;
@group(0) @binding(8) var texturas_normal: texture_2d_array<f32>;
@group(0) @binding(9) var texturas_rugosidade: texture_2d_array<f32>;
@group(0) @binding(10) var texturas_metalico: texture_2d_array<f32>;

// Camada marcada para "este mapa não usa textura" (igual a `SEM_CAMADA` em texturas.rs).
const SEM_CAMADA: u32 = 0xffffffffu;
// Mesmo limite de escala de render-engine (shader.wgsl): escala mínima do padrão em metros.
const ESCALA_MINIMA_TEXTURA: f32 = 0.001;

// Hash PCG: gerador de uma linha, sem estado global.
fn pcg(v: u32) -> u32 {
    let estado = v * 747796405u + 2891336453u;
    let palavra = ((estado >> ((estado >> 28u) + 4u)) ^ estado) * 277803737u;
    return (palavra >> 22u) ^ palavra;
}

fn aleatorio(estado: ptr<function, u32>) -> f32 {
    *estado = pcg(*estado);
    return f32(*estado) * (1.0 / 4294967296.0);
}

fn inverso_seguro(d: vec3<f32>) -> vec3<f32> {
    var seguro = d;
    if (abs(d.x) < DIRECAO_MINIMA) { seguro.x = select(-DIRECAO_MINIMA, DIRECAO_MINIMA, d.x >= 0.0); }
    if (abs(d.y) < DIRECAO_MINIMA) { seguro.y = select(-DIRECAO_MINIMA, DIRECAO_MINIMA, d.y >= 0.0); }
    if (abs(d.z) < DIRECAO_MINIMA) { seguro.z = select(-DIRECAO_MINIMA, DIRECAO_MINIMA, d.z >= 0.0); }
    return 1.0 / seguro;
}

fn caixa_atinge(no: No, o: vec3<f32>, inv: vec3<f32>, tmin: f32, tmax: f32) -> bool {
    let t1 = (no.caixa_min - o) * inv;
    let t2 = (no.caixa_max - o) * inv;
    let menor = min(t1, t2);
    let maior = max(t1, t2);
    let entrada = max(tmin, max(menor.x, max(menor.y, menor.z)));
    let saida = min(tmax, min(maior.x, min(maior.y, maior.z)));
    return entrada <= saida;
}

// Möller-Trumbore. Devolve (t, u, v, 1) em acerto e (0, 0, 0, 0) caso contrário.
fn triangulo_atinge(tri: Triangulo, o: vec3<f32>, d: vec3<f32>, tmin: f32, tmax: f32) -> vec4<f32> {
    let v0 = tri.v0.xyz;
    let e1 = tri.v1.xyz - v0;
    let e2 = tri.v2.xyz - v0;
    let p = cross(d, e2);
    let det = dot(e1, p);
    if (abs(det) < DETERMINANTE_MINIMO) {
        return vec4<f32>(0.0);
    }
    let inv_det = 1.0 / det;
    let s = o - v0;
    let u = dot(s, p) * inv_det;
    if (u < 0.0 || u > 1.0) {
        return vec4<f32>(0.0);
    }
    let qv = cross(s, e1);
    let v = dot(d, qv) * inv_det;
    if (v < 0.0 || u + v > 1.0) {
        return vec4<f32>(0.0);
    }
    let t = dot(e2, qv) * inv_det;
    if (t > tmin && t < tmax) {
        return vec4<f32>(t, u, v, 1.0);
    }
    return vec4<f32>(0.0);
}

// Acerto mais próximo no intervalo (tmin, tmax). Pilha local de tamanho fixo, sem recursão.
// Com DIAG_FORCA_BRUTA (diagnóstico de custo), testa todos os triângulos e não usa a pilha.
fn intersecta(o: vec3<f32>, d: vec3<f32>, tmin: f32, tmax: f32) -> Hit {
    var melhor = Hit(false, tmax, 0.0, 0.0, 0u);
    if ((q.opcoes.z & 2u) != 0u) {
        let total = arrayLength(&tris);
        for (var i = 0u; i < total; i = i + 1u) {
            let r = triangulo_atinge(tris[i], o, d, tmin, melhor.t);
            if (r.w > 0.0) {
                melhor = Hit(true, r.x, r.y, r.z, i);
            }
        }
        return melhor;
    }
    let inv = inverso_seguro(d);
    var pilha: array<u32, 64>;
    var topo = 0u;
    var atual = 0u;
    loop {
        let no = nos[atual];
        if (caixa_atinge(no, o, inv, tmin, melhor.t)) {
            if (no.n > 0u) {
                for (var i = 0u; i < no.n; i = i + 1u) {
                    let indice = no.a + i;
                    let r = triangulo_atinge(tris[indice], o, d, tmin, melhor.t);
                    if (r.w > 0.0) {
                        melhor = Hit(true, r.x, r.y, r.z, indice);
                    }
                }
            } else {
                pilha[topo] = no.a;
                topo = topo + 1u;
                atual = atual + 1u;
                continue;
            }
        }
        if (topo == 0u) {
            break;
        }
        topo = topo - 1u;
        atual = pilha[topo];
    }
    return melhor;
}

// Existe algum acerto no intervalo? Para no primeiro (raio de sombra).
fn ocluso(o: vec3<f32>, d: vec3<f32>, tmin: f32, tmax: f32) -> bool {
    if ((q.opcoes.z & 2u) != 0u) {
        let total = arrayLength(&tris);
        for (var i = 0u; i < total; i = i + 1u) {
            if (triangulo_atinge(tris[i], o, d, tmin, tmax).w > 0.0) {
                return true;
            }
        }
        return false;
    }
    let inv = inverso_seguro(d);
    var pilha: array<u32, 64>;
    var topo = 0u;
    var atual = 0u;
    loop {
        let no = nos[atual];
        if (caixa_atinge(no, o, inv, tmin, tmax)) {
            if (no.n > 0u) {
                for (var i = 0u; i < no.n; i = i + 1u) {
                    let r = triangulo_atinge(tris[no.a + i], o, d, tmin, tmax);
                    if (r.w > 0.0) {
                        return true;
                    }
                }
            } else {
                pilha[topo] = no.a;
                topo = topo + 1u;
                atual = atual + 1u;
                continue;
            }
        }
        if (topo == 0u) {
            break;
        }
        topo = topo - 1u;
        atual = pilha[topo];
    }
    return false;
}

// Direção do sol para uma amostra. Sol pontual: sempre a mesma. Disco: amostra uniforme no cone.
fn direcao_sol(estado: ptr<function, u32>) -> vec3<f32> {
    let s = q.sol.xyz;
    let raio = q.cor_sol.w;
    if (raio <= 0.0) {
        return s;
    }
    let u1 = aleatorio(estado);
    let u2 = aleatorio(estado);
    // 1 - cos(raio) = 2 sen²(raio/2): estável em f32 para discos pequenos (0,25 grau).
    let meio_seno = sin(0.5 * raio);
    let cos_t = 1.0 - u1 * (2.0 * meio_seno * meio_seno);
    let sen_t = sqrt(max(0.0, 1.0 - cos_t * cos_t));
    let phi = 2.0 * PI * u2;
    let ajuda = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(s.z) < 0.999);
    let t1 = normalize(cross(ajuda, s));
    let t2 = cross(s, t1);
    return normalize(t1 * (sen_t * cos(phi)) + t2 * (sen_t * sin(phi)) + s * cos_t);
}

// Superfície do acerto: normal voltada para quem olha (dupla face) e material do triângulo.
// `distancia` é o caminho do raio desde a câmera até o acerto (nível de mip das texturas).
fn superficie(o: vec3<f32>, d: vec3<f32>, acerto: Hit, distancia: f32) -> Superficie {
    let tri = tris[acerto.triangulo];
    let w0 = 1.0 - acerto.u - acerto.v;
    var normal = normalize(tri.n0.xyz * w0 + tri.n1.xyz * acerto.u + tri.n2.xyz * acerto.v);
    let frente = dot(normal, d) < 0.0;
    if (dot(normal, d) > 0.0) {
        normal = -normal;
    }
    let material = materiais[tri.material.x];
    var s: Superficie;
    s.ponto = o + d * acerto.t;
    s.normal = normal;
    s.emissao = material.emissao.rgb;
    s.cor = material.cor.rgb;
    s.metal = material.cor.w;
    s.rugosidade = material.propriedades.x;
    s.vidro = e_vidro(material);
    s.frente = frente;
    s.ior = material.vidro.y;
    // Vidro não recebe textura (como o motor: `fs_vidro` não amostra os mapas).
    if (!s.vidro) {
        aplicar_mapas(&s, material, distancia);
    }
    s.albedo = s.cor * (1.0 - s.metal);
    return s;
}

// Vidro: transmissão > 0, opacidade < 1 ou tipo 6 (vidro). Mesmo critério de `e_vidro` em gpu.rs.
fn e_vidro(m: Material) -> bool {
    return m.vidro.x > 0.0 || m.vidro.z < 1.0 || m.vidro.w == 6.0;
}

// ---- Texturas de material (fase 5) ----
// Mesma regra do motor de rasterização (render-engine, shader.wgsl): triplanar em espaço do mundo com
// pesos |n|^4, uma repetição a cada `escala` metros, albedo = cor do material * (textura linear / média),
// whiteout triplanar para a normal de mapa, e rugosidade e metálico pelo canal R. Diferença: compute não
// tem derivadas, então o nível de mip vem da distância do raio (`lod_da_distancia`, espelho de
// texturas.rs), com `textureSampleLevel`. Sem anisotropia (a rasterização usa 8x quando o adaptador tem).
// `q.opcoes.w`: bit 0 liga albedo, rugosidade e metálico; bit 1 liga a normal de mapa.

// Nível de mip pela distância: log2(max(1, distancia * abertura_do_pixel / tamanho_do_texel)), até o último
// nível. `tamanho_texel` é escala / lado comum das texturas (metros por texel).
fn lod_da_distancia(distancia: f32, tamanho_texel: f32) -> f32 {
    let razao = max(distancia * q.textura.x / max(tamanho_texel, 1.0e-9), 1.0);
    return min(log2(razao), q.textura.z - 1.0);
}

// Pesos triplanares: |normal|^4 normalizado (como render-engine, EXPOENTE_TRIPLANAR = 4).
fn pesos_triplanares(normal: vec3<f32>) -> vec3<f32> {
    let a = pow(abs(normal), vec3<f32>(4.0));
    return a / max(a.x + a.y + a.z, 1.0e-6);
}

// sRGB para linear (curva exata), canal a canal.
fn linear_de_srgb(c: vec3<f32>) -> vec3<f32> {
    let baixo = c / 12.92;
    let alto = pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
    return select(alto, baixo, c <= vec3<f32>(0.04045));
}

// Coordenadas triplanares: uv de cada eixo (X, Y, Z) e o sinal da normal em cada eixo (orienta a
// projeção para a face). Em V, o topo da imagem aponta para +Z (paredes) ou +Y (planos horizontais).
struct Triplanar {
    uv: array<vec2<f32>, 3>,
    sinal: vec3<f32>,
};

fn triplanar_de(mundo: vec3<f32>, normal: vec3<f32>, escala: f32) -> Triplanar {
    let p = mundo / escala;
    let sx = select(-1.0, 1.0, normal.x >= 0.0);
    let sy = select(-1.0, 1.0, normal.y >= 0.0);
    let sz = select(-1.0, 1.0, normal.z >= 0.0);
    var t: Triplanar;
    t.uv = array<vec2<f32>, 3>(
        vec2<f32>(sx * p.y, -p.z),
        vec2<f32>(-sy * p.x, -p.z),
        vec2<f32>(sz * p.x, -p.y),
    );
    t.sinal = vec3<f32>(sx, sy, sz);
    return t;
}

struct AmostrasEixos {
    x: vec4<f32>,
    y: vec4<f32>,
    z: vec4<f32>,
};

// Uma camada de um array amostrada nos três eixos, no nível de mip `lod`.
fn amostrar_eixos(tex: texture_2d_array<f32>, camada: u32, t: Triplanar, lod: f32) -> AmostrasEixos {
    var r: AmostrasEixos;
    r.x = textureSampleLevel(tex, amostrador_textura, t.uv[0], camada, lod);
    r.y = textureSampleLevel(tex, amostrador_textura, t.uv[1], camada, lod);
    r.z = textureSampleLevel(tex, amostrador_textura, t.uv[2], camada, lod);
    return r;
}

// Whiteout (Golus) num eixo: `t` é a normal do mapa em espaço tangente e `nf` a normal base nesse
// referencial (tangente, binormal, eixo). Soma os xy e multiplica o z.
fn whiteout(t: vec3<f32>, nf: vec3<f32>, tangente: vec3<f32>, binormal: vec3<f32>, eixo: vec3<f32>) -> vec3<f32> {
    let c = normalize(vec3<f32>(t.xy + nf.xy, nf.z * t.z));
    return tangente * c.x + binormal * c.y + eixo * c.z;
}

// Normal de mapa para o mundo, com a orientação de tangente de triplanar_de (copiada de render-engine):
// eixo X (T = sx*Y, B = Z), eixo Y (T = -sy*X, B = Z) e eixo Z (T = sz*X, B = Y).
fn normal_de_mapa(mapa: AmostrasEixos, t: Triplanar, normal: vec3<f32>, peso: vec3<f32>) -> vec3<f32> {
    let sx = t.sinal.x;
    let sy = t.sinal.y;
    let sz = t.sinal.z;
    let tx = mapa.x.rgb * 2.0 - vec3<f32>(1.0);
    let ty = mapa.y.rgb * 2.0 - vec3<f32>(1.0);
    let tz = mapa.z.rgb * 2.0 - vec3<f32>(1.0);
    let wx = whiteout(
        tx,
        vec3<f32>(sx * normal.y, normal.z, sx * normal.x),
        vec3<f32>(0.0, sx, 0.0),
        vec3<f32>(0.0, 0.0, 1.0),
        vec3<f32>(sx, 0.0, 0.0)
    );
    let wy = whiteout(
        ty,
        vec3<f32>(-sy * normal.x, normal.z, sy * normal.y),
        vec3<f32>(-sy, 0.0, 0.0),
        vec3<f32>(0.0, 0.0, 1.0),
        vec3<f32>(0.0, sy, 0.0)
    );
    let wz = whiteout(
        tz,
        vec3<f32>(sz * normal.x, normal.y, sz * normal.z),
        vec3<f32>(sz, 0.0, 0.0),
        vec3<f32>(0.0, 1.0, 0.0),
        vec3<f32>(0.0, 0.0, sz)
    );
    return normalize(wx * peso.x + wy * peso.y + wz * peso.z);
}

// Mapas de material de uma superfície difusa: albedo de textura (cor * textura / média), rugosidade e
// metálico pelo canal R, e a normal de mapa. O triplanar usa a normal geométrica do acerto (antes do
// mapa). `distancia` é o caminho do raio até o ponto.
fn aplicar_mapas(s: ptr<function, Superficie>, m: Material, distancia: f32) {
    let mapas_ligados = (q.opcoes.w & 1u) != 0u;
    let normal_ligada = (q.opcoes.w & 2u) != 0u;
    if (!mapas_ligados && !normal_ligada) {
        return;
    }
    let tex = m.texturas;
    let escala = max(m.media_escala.w, ESCALA_MINIMA_TEXTURA);
    let lod = lod_da_distancia(distancia, escala / q.textura.y);
    let normal = (*s).normal;
    let tri = triplanar_de((*s).ponto, normal, escala);
    let peso = pesos_triplanares(normal);
    if (mapas_ligados && tex.x != SEM_CAMADA) {
        let a = amostrar_eixos(texturas_albedo, tex.x, tri, lod);
        let textura = linear_de_srgb(a.x.rgb) * peso.x
            + linear_de_srgb(a.y.rgb) * peso.y
            + linear_de_srgb(a.z.rgb) * peso.z;
        (*s).cor = (*s).cor * (textura / max(m.media_escala.rgb, vec3<f32>(1.0e-4)));
    }
    if (normal_ligada && tex.y != SEM_CAMADA) {
        (*s).normal = normal_de_mapa(amostrar_eixos(texturas_normal, tex.y, tri, lod), tri, normal, peso);
    }
    if (mapas_ligados && tex.z != SEM_CAMADA) {
        let r = amostrar_eixos(texturas_rugosidade, tex.z, tri, lod);
        (*s).rugosidade = clamp(r.x.r * peso.x + r.y.r * peso.y + r.z.r * peso.z, 0.04, 1.0);
    }
    if (mapas_ligados && tex.w != SEM_CAMADA) {
        let mt = amostrar_eixos(texturas_metalico, tex.w, tri, lod);
        (*s).metal = clamp(mt.x.r * peso.x + mt.y.r * peso.y + mt.z.r * peso.z, 0.0, 1.0);
    }
}

// Luz direta do sol num ponto, com uma amostra de sombra por raio. Devolve a irradiância
// E = cor_sol * I * max(n.s, 0) * visibilidade (sem o 1/pi do difuso, que quem chama aplica).
fn sol_direto(ponto: vec3<f32>, normal: vec3<f32>, estado: ptr<function, u32>) -> vec3<f32> {
    let ndl = dot(normal, q.sol.xyz);
    if (ndl <= 0.0) {
        return vec3<f32>(0.0);
    }
    let para_sol = direcao_sol(estado);
    if (dot(normal, para_sol) <= 0.0) {
        return vec3<f32>(0.0);
    }
    if ((q.opcoes.z & 1u) == 0u && ocluso(ponto + normal * DESLOCAMENTO_SOMBRA, para_sol, T_MINIMO, T_INFINITO)) {
        return vec3<f32>(0.0);
    }
    return q.cor_sol.rgb * q.sol.w * ndl;
}

// Blinn-Phong da referência (tracer.rs, luz_direta). `s` é a direção para o sol, `v` a direção
// para quem olha (menos o raio que chega). Devolve o fator que multiplica a irradiância do sol:
// f0 * ndh^expoente * normalizacao * (0,25 + 0,75 (1 - r)), com f0 = 0,04 (1 - m) + cor * m.
fn especular_sol(n: vec3<f32>, s: vec3<f32>, v: vec3<f32>, cor: vec3<f32>, metal: f32, rugosidade: f32) -> vec3<f32> {
    let meio_bruto = s + v;
    if (dot(meio_bruto, meio_bruto) < 1.0e-12) {
        return vec3<f32>(0.0);
    }
    let ndh = max(dot(n, normalize(meio_bruto)), 0.0);
    if (ndh <= 0.0) {
        return vec3<f32>(0.0);
    }
    let lacuna = 1.0 - rugosidade;
    let expoente = 8.0 + lacuna * lacuna * 500.0;
    let normalizacao = (expoente + 8.0) / (8.0 * PI);
    let f0 = vec3<f32>(0.04 * (1.0 - metal)) + cor * metal;
    return f0 * (pow(ndh, expoente) * normalizacao * (0.25 + 0.75 * (1.0 - rugosidade)));
}

// GGX (segunda opção de especular, q.opcoes.y == 2): BRDF de microfacetas com distribuição de
// Trowbridge-Reitz, sombreamento de Smith e Fresnel de Schlick. Devolve a BRDF (sem o cosseno do
// sol, que já está em `irradiancia_sol`). Sem conservação de energia do difuso (medido como opção).
fn especular_ggx(n: vec3<f32>, s: vec3<f32>, v: vec3<f32>, cor: vec3<f32>, metal: f32, rugosidade: f32) -> vec3<f32> {
    let ndl = dot(n, s);
    let ndv = dot(n, v);
    if (ndl <= 0.0 || ndv <= 0.0) {
        return vec3<f32>(0.0);
    }
    let meio_bruto = s + v;
    if (dot(meio_bruto, meio_bruto) < 1.0e-12) {
        return vec3<f32>(0.0);
    }
    let h = normalize(meio_bruto);
    let ndh = max(dot(n, h), 0.0);
    let vdh = max(dot(v, h), 0.0);
    let a = max(rugosidade * rugosidade, 0.002);
    let a2 = a * a;
    let den = ndh * ndh * (a2 - 1.0) + 1.0;
    let dist = a2 / (PI * den * den);
    let g1l = 2.0 * ndl / (ndl + sqrt(a2 + (1.0 - a2) * ndl * ndl));
    let g1v = 2.0 * ndv / (ndv + sqrt(a2 + (1.0 - a2) * ndv * ndv));
    let f0 = vec3<f32>(0.04 * (1.0 - metal)) + cor * metal;
    let fresnel = f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - vdh, 5.0);
    return fresnel * (dist * g1l * g1v / (4.0 * ndl * ndv));
}

// Fresnel de Schlick: f0 + (1 - f0) (1 - cos)^5, com cos em [0, 1].
fn fresnel_schlick(cos_t: f32, f0: f32) -> f32 {
    let m = clamp(1.0 - cos_t, 0.0, 1.0);
    let m2 = m * m;
    return f0 + (1.0 - f0) * m2 * m2 * m;
}

// Refração de Snell, vetorial. `n` aponta para quem olha (dot(n, d) < 0). Devolve (direção, 1), ou
// (0, 0, 0, 0) na reflexão interna total (sen_t > 1). Mesma conta de `optica::refratar`.
fn refratar(d: vec3<f32>, n: vec3<f32>, eta: f32) -> vec4<f32> {
    let cos_i = -dot(d, n);
    let k = 1.0 - eta * eta * (1.0 - cos_i * cos_i);
    if (k < 0.0) {
        return vec4<f32>(0.0);
    }
    let v = eta * d + (eta * cos_i - sqrt(k)) * n;
    return vec4<f32>(normalize(v), 1.0);
}

// Irradiância difusa do céu na normal n: E(n) = soma de E_k * Y_k(n), 9 termos de SH.
fn irradiancia_do_ceu(n: vec3<f32>) -> vec3<f32> {
    return irradiancia_em(q.irradiancia, n);
}

// Céu visto pelo raio primário que não acerta: fundo explícito, ou o céu do motor com disco e
// halo do Sol (ambos só quando o ambiente está ligado; ver `ceu_de_fuga`).
fn ceu_primario(d: vec3<f32>) -> vec3<f32> {
    if (q.modo.z == 1u) {
        return q.fundo.rgb;
    }
    let com_disco = q.modo.y == 1u;
    var cor = radiancia_ceu(d, q.sol.xyz, q.sol.w, com_disco);
    if (com_disco) {
        cor = cor + vec3<f32>(halo_sol(d, q.sol.xyz, q.sol.w));
    }
    return cor;
}

// Céu sem disco e sem halo: o termo de ambiente da referência (`ceu(cena, normal)` do render-core)
// e a fuga de raios secundários. O sol já entra por amostragem explícita em cada vértice.
fn ceu_sem_disco(d: vec3<f32>) -> vec3<f32> {
    if (q.modo.z == 1u) {
        return q.fundo.rgb;
    }
    return radiancia_ceu(d, q.sol.xyz, q.sol.w, false);
}

// Radiância que o raio vê ao sair da cena. No primário sem ambiente (fase 1), o fundo; com
// ambiente, o céu. Nos vértices seguintes, sempre o céu sem disco.
fn ceu_de_fuga(d: vec3<f32>, primario: bool) -> vec3<f32> {
    if (primario) {
        if (q.opcoes.x == 0u) {
            return q.fundo.rgb * q.fundo.w;
        }
        return ceu_primario(d);
    }
    return ceu_sem_disco(d);
}

// Direção de rebote: amostragem por cosseno na normal. A densidade cos/pi cancela o 1/pi do
// difuso, por isso o peso do rebote é só o albedo.
fn direcao_cosseno(normal: vec3<f32>, estado: ptr<function, u32>) -> vec3<f32> {
    let u1 = aleatorio(estado);
    let u2 = aleatorio(estado);
    let raio = sqrt(u1);
    let phi = 2.0 * PI * u2;
    let local = vec3<f32>(raio * cos(phi), raio * sin(phi), sqrt(max(0.0, 1.0 - u1)));
    let ajuda = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(normal.z) < 0.999);
    let t1 = normalize(cross(ajuda, normal));
    let t2 = cross(normal, t1);
    return normalize(t1 * local.x + t2 * local.y + normal * local.z);
}

// Caminho de um raio primário. Mesma soma de tracer.rs (render-core), vértice a vértice, com
// `peso` = throughput (produto dos albedos dos vértices anteriores):
//   L = soma_k peso_k * [ emissao_k + E_k * (albedo_k / pi + espec_k) + ambiente_k ]
//   E_k = cor_sol * I * max(n.s, 0) * visivel(sombra)   (sol direto, pelo ponto, com sombra)
//   espec_k = Blinn-Phong da referência (so se q.opcoes.y), com o ponto de vista -d_k
//   ambiente_k = 0,3 * albedo_k * ceu(n_k)              (Referencia, em todo vértice)
//              ou (1/pi) albedo_k E_sky(n_k) (Sh, legado da fase 2, só no último vértice)
//   fuga: se o raio sai da cena no vértice k, soma peso_k * ceu(d_k)
// Um vértice tem luz direta; o próximo é um rebote por cosseno com peso = albedo_k (o cosseno
// cancela o pdf). Não há roleta russa: o limite é fixo (`profundidade`, no máximo 4, como no render-core).
// Metal (transmissão ausente, metálico > 0,5): o rebote é o reflexo com dispersão do tracer.rs, e a
// fração difusa é zero. Vidro: Fresnel de Schlick e Snell, sem absorção volumétrica e sem luz direta
// dentro dele. Diferenças conhecidas em relação ao render-core: o vidro dele atravessa reto (tinge
// pela cor, sem refração), e o sol da referência é pontual (o disco solar só existe aqui).
// Texturas de material (fase 5): o albedo, a normal, a rugosidade e o metálico vêm de `aplicar_mapas`,
// dentro de `superficie`.
fn radiancia_caminho(o0: vec3<f32>, d0: vec3<f32>, estado: ptr<function, u32>) -> vec3<f32> {
    let ambiente = q.opcoes.x;
    let especular = q.opcoes.y;
    // Vértices permitidos: começa em q.modo.x e cresce VERTICES_EXTRAS_VIDRO a cada vértice de vidro.
    var orcamento = q.modo.x;
    var radiancia = vec3<f32>(0.0);
    var peso = vec3<f32>(1.0);
    var o = o0;
    var d = d0;
    // Caminho acumulado desde a câmera (nível de mip das texturas; ver `lod_da_distancia`).
    var distancia = 0.0;
    for (var k = 0u; k < VERTICES_ABSOLUTOS; k = k + 1u) {
        let acerto = intersecta(o, d, T_MINIMO, T_INFINITO);
        if (!acerto.ok) {
            radiancia = radiancia + peso * ceu_de_fuga(d, k == 0u);
            break;
        }
        distancia = distancia + acerto.t;
        let s = superficie(o, d, acerto, distancia);
        radiancia = radiancia + peso * s.emissao;
        if (s.vidro) {
            // Vidro: sem luz direta nem ambiente. Fresnel de Schlick sorteia o reflexo ou a refração
            // (o sorteio é não-viesado: reflexo tem peso 1 com probabilidade F; refração, peso = cor).
            orcamento = orcamento + VERTICES_EXTRAS_VIDRO;
            let cos_i = clamp(dot(-d, s.normal), 0.0, 1.0);
            let f0 = fresnel_schlick_f0(s.ior);
            let fresnel = fresnel_schlick(cos_i, f0);
            let eta = select(s.ior, 1.0 / s.ior, s.frente);
            let refrai = refratar(d, s.normal, eta);
            let sorteio = aleatorio(estado);
            if (refrai.w < 0.5 || sorteio < fresnel) {
                d = d - 2.0 * dot(d, s.normal) * s.normal;
                o = s.ponto + s.normal * DESLOCAMENTO_SOMBRA;
            } else {
                d = refrai.xyz;
                o = s.ponto - s.normal * DESLOCAMENTO_SOMBRA;
                peso = peso * s.cor;
            }
        } else {
            let irradiancia_sol = sol_direto(s.ponto, s.normal, estado);
            var refletancia = s.albedo / PI;
            if (especular == 1u) {
                refletancia = refletancia + especular_sol(s.normal, q.sol.xyz, -d, s.cor, s.metal, s.rugosidade);
            } else if (especular == 2u) {
                refletancia = refletancia + especular_ggx(s.normal, q.sol.xyz, -d, s.cor, s.metal, s.rugosidade);
            }
            radiancia = radiancia + peso * (refletancia * irradiancia_sol);
            // SH legado (fase 2): só no último vértice. Com um rebote, o céu do ponto primário chega pelo
            // rebote (ceu_de_fuga), então somar SH também no primário contaria o céu duas vezes.
            if (ambiente == 1u && k + 1u == orcamento) {
                radiancia = radiancia + peso * (s.albedo / PI) * irradiancia_do_ceu(s.normal);
            } else if (ambiente == 2u) {
                radiancia = radiancia + peso * (AMBIENTE_REFERENCIA * s.albedo * ceu_sem_disco(s.normal));
            }
            if (k + 1u >= orcamento) {
                break;
            }
            if (s.metal > 0.5) {
                // Metal (como tracer.rs): reflexo com dispersão de rugosidade * 0,5; peso = cor * m + 0,04 (1 - m).
                let refletido = d - 2.0 * dot(d, s.normal) * s.normal;
                let dispersao = (vec3<f32>(aleatorio(estado), aleatorio(estado), aleatorio(estado)) * 2.0 - vec3<f32>(1.0))
                    * (s.rugosidade * 0.5);
                var nova = refletido + dispersao;
                if (dot(nova, nova) < 1.0e-12) {
                    nova = refletido;
                }
                d = normalize(nova);
                o = s.ponto + s.normal * DESLOCAMENTO_SOMBRA;
                peso = peso * (s.cor * s.metal + vec3<f32>(0.04 * (1.0 - s.metal)));
            } else {
                d = direcao_cosseno(s.normal, estado);
                o = s.ponto + s.normal * DESLOCAMENTO_SOMBRA;
                peso = peso * s.albedo;
            }
        }
    }
    return radiancia;
}

// Fator de Fresnel no ângulo normal: ((1 - ior) / (1 + ior))^2.
fn fresnel_schlick_f0(ior: f32) -> f32 {
    let r = (1.0 - ior) / (1.0 + ior);
    return r * r;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= q.tile.z || id.y >= q.tile.w) {
        return;
    }
    let px = q.tile.x + id.x;
    let py = q.tile.y + id.y;
    var estado = pcg(px ^ pcg(py ^ pcg(q.dimensao.z ^ pcg(q.dimensao.w))));
    let jx = aleatorio(&estado);
    let jy = aleatorio(&estado);

    // Raio primário: desprojeção do centro jitterizado do pixel, como o tracer de CPU.
    let largura = f32(q.dimensao.x);
    let altura = f32(q.dimensao.y);
    let ndc = vec2<f32>(
        ((f32(px) + jx) / largura) * 2.0 - 1.0,
        1.0 - ((f32(py) + jy) / altura) * 2.0,
    );
    let perto = q.inv_vp * vec4<f32>(ndc, -1.0, 1.0);
    let longe = q.inv_vp * vec4<f32>(ndc, 1.0, 1.0);
    let p0 = perto.xyz / perto.w;
    let p1 = longe.xyz / longe.w;
    let radiancia = radiancia_caminho(p0, normalize(p1 - p0), &estado);

    let coordenada = vec2<i32>(i32(px), i32(py));
    let anterior = textureLoad(acumulado_entrada, coordenada, 0);
    textureStore(acumulado_saida, coordenada, anterior + vec4<f32>(radiancia, 1.0));
}
