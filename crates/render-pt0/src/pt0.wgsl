// Protótipo de rastreamento de caminhos, fase 3 (crates/render-pt0).
//
// Um passe = uma amostra por pixel do tile. Cada pixel lança um raio primário pela câmera e
// percorre o caminho em `radiancia_caminho`: em cada vértice (até q.modo.x vértices) soma a
// emissão, a luz direta do sol (difuso e, se ligado, Blinn-Phong da referência), o ambiente
// (q.opcoes.x) e, se houver próximo vértice, sorteia um rebote por cosseno com peso = albedo.
// A fórmula é a do render-core (tracer.rs); ver o comentário de `radiancia_caminho` e
// crates/render-pt0/src/referencia.rs, onde ela está escrita por extenso.
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
    // x: ambiente (0 nenhum, 1 SH9 legado, 2 referência 0,3 * céu); y: 1 especular Blinn-Phong;
    // z: diagnóstico (bit 0 = sem raio de sombra; bit 1 = força bruta, sem BVH); w: não usado.
    opcoes: vec4<u32>,
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
};

struct Hit {
    ok: bool,
    t: f32,
    u: f32,
    v: f32,
    triangulo: u32,
};

// Superfície no ponto acertado. `albedo` é a fração difusa: cor * (1 - metálico).
struct Superficie {
    ponto: vec3<f32>,
    normal: vec3<f32>,
    albedo: vec3<f32>,
    emissao: vec3<f32>,
    cor: vec3<f32>,
    metal: f32,
    rugosidade: f32,
};

@group(0) @binding(0) var<uniform> q: Quadro;
@group(0) @binding(1) var<storage, read> nos: array<No>;
@group(0) @binding(2) var<storage, read> tris: array<Triangulo>;
@group(0) @binding(3) var<storage, read> materiais: array<Material>;
@group(0) @binding(4) var acumulado_entrada: texture_2d<f32>;
@group(0) @binding(5) var acumulado_saida: texture_storage_2d<rgba32float, write>;

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
    let cos_t = 1.0 - u1 * (1.0 - cos(raio));
    let sen_t = sqrt(max(0.0, 1.0 - cos_t * cos_t));
    let phi = 2.0 * PI * u2;
    let ajuda = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(s.z) < 0.999);
    let t1 = normalize(cross(ajuda, s));
    let t2 = cross(s, t1);
    return normalize(t1 * (sen_t * cos(phi)) + t2 * (sen_t * sin(phi)) + s * cos_t);
}

// Superfície do acerto: normal voltada para quem olha (dupla face) e material do triângulo.
fn superficie(o: vec3<f32>, d: vec3<f32>, acerto: Hit) -> Superficie {
    let tri = tris[acerto.triangulo];
    let w0 = 1.0 - acerto.u - acerto.v;
    var normal = normalize(tri.n0.xyz * w0 + tri.n1.xyz * acerto.u + tri.n2.xyz * acerto.v);
    if (dot(normal, d) > 0.0) {
        normal = -normal;
    }
    let material = materiais[tri.material.x];
    var s: Superficie;
    s.ponto = o + d * acerto.t;
    s.normal = normal;
    s.albedo = material.cor.rgb * (1.0 - material.cor.w);
    s.emissao = material.emissao.rgb;
    s.cor = material.cor.rgb;
    s.metal = material.cor.w;
    s.rugosidade = material.propriedades.x;
    return s;
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
// Diferenças conhecidas em relação ao render-core: sem vidro, sem metal (reflexão especular de
// rebote) e sem disco solar nesta medição (raio = 0).
fn radiancia_caminho(o0: vec3<f32>, d0: vec3<f32>, estado: ptr<function, u32>) -> vec3<f32> {
    let profundidade = q.modo.x;
    let ambiente = q.opcoes.x;
    let com_especular = q.opcoes.y == 1u;
    var radiancia = vec3<f32>(0.0);
    var peso = vec3<f32>(1.0);
    var o = o0;
    var d = d0;
    for (var k = 0u; k < profundidade; k = k + 1u) {
        let acerto = intersecta(o, d, T_MINIMO, T_INFINITO);
        if (!acerto.ok) {
            radiancia = radiancia + peso * ceu_de_fuga(d, k == 0u);
            break;
        }
        let s = superficie(o, d, acerto);
        radiancia = radiancia + peso * s.emissao;
        let irradiancia_sol = sol_direto(s.ponto, s.normal, estado);
        var refletancia = s.albedo / PI;
        if (com_especular) {
            refletancia = refletancia + especular_sol(s.normal, q.sol.xyz, -d, s.cor, s.metal, s.rugosidade);
        }
        radiancia = radiancia + peso * (refletancia * irradiancia_sol);
        // SH legado (fase 2): só no último vértice. Com um rebote, o céu do ponto primário chega pelo
        // rebote (ceu_de_fuga), então somar SH também no primário contaria o céu duas vezes.
        if (ambiente == 1u && k + 1u == profundidade) {
            radiancia = radiancia + peso * (s.albedo / PI) * irradiancia_do_ceu(s.normal);
        } else if (ambiente == 2u) {
            radiancia = radiancia + peso * (AMBIENTE_REFERENCIA * s.albedo * ceu_sem_disco(s.normal));
        }
        if (k + 1u == profundidade) {
            break;
        }
        d = direcao_cosseno(s.normal, estado);
        o = s.ponto + s.normal * DESLOCAMENTO_SOMBRA;
        peso = peso * s.albedo;
    }
    return radiancia;
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
