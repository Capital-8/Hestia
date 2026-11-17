//! SPIKE (docs/estudo-esquadrias/19-spike-rust-furo.md): furo de contorno livre numa parede em camadas,
//! por booleana 3D (`manifold-rust`, Rust puro). Função pura, sem consumidores no produto e sem
//! exportação na ABI do wasm.
//!
//! Referencial da parede: x ao longo da parede (0 a `comprimento`), y através da espessura
//! (a camada 0 ocupa `[0, e0]`, a camada 1 `[e0, e0 + e1]`, etc.), z para cima (0 a `altura`).
//! O contorno do vão está em [x, z] relativo à origem do vão (meio da base), anti-horário, aberto.
//!
//! O contorno tem de ser SIMPLES: sem pontos repetidos consecutivos, sem auto-interseção e com área
//! positiva. Côncavo simples é aceito. Tudo isso é validado antes da booleana, porque o `manifold-rust`
//! pode entrar em panic com contorno não simples (e o produto compila com `panic = "abort"`).

use manifold_rust::linalg::{Vec2, Vec3};
use manifold_rust::manifold::Manifold;
use manifold_rust::types::{Error as ErroManifold, OpType};

/// Folga (m) do cortador além das faces de cada camada, para não deixar faces coplanares em y.
const FOLGA_Y: f64 = 0.05;
/// Distância (m) abaixo da qual dois vértices consecutivos são o mesmo ponto (1 nm).
const DIST_PONTO: f64 = 1e-9;
/// Seno do ângulo (adimensional) abaixo do qual três pontos são tratados como colineares.
const EPS_SENO: f64 = 1e-12;
/// Área (m²) abaixo da qual o anel é tratado como degenerado.
const AREA_MINIMA: f64 = 1e-12;

/// Um vão: contorno + onde ele fica na parede.
#[derive(Debug, Clone)]
pub struct Vao {
    /// Anel [x, z] em metros, anti-horário, aberto, com a origem no meio da base do vão.
    pub contorno: Vec<[f64; 2]>,
    /// Posição (x) da origem do contorno ao longo da parede.
    pub x: f64,
    /// Cota (z) da origem do contorno (soleira ou peitoril).
    pub soleira: f64,
}

/// Malha de uma camada já furada.
#[derive(Debug, Clone, Default)]
pub struct MalhaCamada {
    pub y0: f64,
    pub y1: f64,
    /// x, y, z intercalados (m).
    pub vertices: Vec<f64>,
    /// Três índices por triângulo, anti-horário visto de fora.
    pub indices: Vec<u32>,
    pub volume: f64,
    /// Volume da camada sem furo (comprimento x espessura x altura).
    pub volume_sem_furo: f64,
}

#[derive(Debug, Clone, Default)]
pub struct ResultadoFuro {
    pub camadas: Vec<MalhaCamada>,
    pub volume: f64,
    pub volume_removido: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ErroFuro {
    ParedeInvalida,
    EspessuraInvalida(usize),
    /// Contorno com menos de 3 pontos, coordenada não finita, área nula/horária ou degenerada.
    ContornoInvalido(usize),
    /// Dois vértices consecutivos coincidem (inclui o último com o primeiro, por o anel ser aberto).
    PontoRepetido(usize),
    /// Contorno não simples: arestas não consecutivas se cruzam ou se tocam, ou arestas consecutivas se
    /// sobrepõem (gravata borboleta, vértice sobre aresta, espícula de ida e volta).
    AutoInterseccao(usize),
    /// O contorno sai da parede (caixa envolvente fora de [0, comprimento] x [0, altura]).
    VaoForaDaParede(usize),
    Manifold(String),
}

/// Área com sinal do anel (positiva = anti-horário).
pub fn area_com_sinal(anel: &[[f64; 2]]) -> f64 {
    let mut a = 0.0;
    for i in 0..anel.len() {
        let p = anel[i];
        let q = anel[(i + 1) % anel.len()];
        a += p[0] * q[1] - q[0] * p[1];
    }
    a / 2.0
}

/// Sinal de (b - a) x (c - a): -1, 0 (colineares, dentro de `EPS_SENO`) ou 1 (anti-horário).
/// A tolerância é relativa ao tamanho dos braços, então vale em qualquer escala.
fn sinal(a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> i8 {
    let (ux, uy) = (b[0] - a[0], b[1] - a[1]);
    let (vx, vy) = (c[0] - a[0], c[1] - a[1]);
    let cruz = ux * vy - uy * vx;
    let escala = ux.hypot(uy) * vx.hypot(vy);
    if cruz.abs() <= EPS_SENO * escala {
        0
    } else if cruz > 0.0 {
        1
    } else {
        -1
    }
}

/// `r` está na caixa envolvente de `p`-`q` (usado quando `r` é colinear com `p`-`q`).
fn dentro_da_caixa(p: [f64; 2], q: [f64; 2], r: [f64; 2]) -> bool {
    r[0] >= p[0].min(q[0]) && r[0] <= p[0].max(q[0]) && r[1] >= p[1].min(q[1]) && r[1] <= p[1].max(q[1])
}

/// Segmentos ab e cd se tocam (cruzamento próprio ou toque de vértice/encosto).
fn segmentos_se_tocam(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> bool {
    let (s1, s2, s3, s4) = (sinal(c, d, a), sinal(c, d, b), sinal(a, b, c), sinal(a, b, d));
    let propria = s1 * s2 < 0 && s3 * s4 < 0;
    propria
        || (s1 == 0 && dentro_da_caixa(c, d, a))
        || (s2 == 0 && dentro_da_caixa(c, d, b))
        || (s3 == 0 && dentro_da_caixa(a, b, c))
        || (s4 == 0 && dentro_da_caixa(a, b, d))
}

/// Duas arestas consecutivas que partem de `s` (para `u` e `w`) se sobrepõem: colineares e no mesmo sentido.
fn sobrepoe_em(s: [f64; 2], u: [f64; 2], w: [f64; 2]) -> bool {
    let produto = (u[0] - s[0]) * (w[0] - s[0]) + (u[1] - s[1]) * (w[1] - s[1]);
    sinal(s, u, w) == 0 && produto > 0.0
}

/// O anel aberto tem alguma auto-interseção. Pares de arestas não consecutivas contam se se tocam
/// (inclusive vértice sobre aresta); pares consecutivos contam só se se sobrepõem além do vértice comum.
/// O(n^2): quem chama limita o nº de pontos por anel (ver `LIMITE_PONTOS_POR_VAO` em `furo_contorno_abi`).
fn anel_se_cruza(anel: &[[f64; 2]]) -> bool {
    let n = anel.len();
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        for j in (i + 1)..n {
            let (c, d) = (anel[j], anel[(j + 1) % n]);
            if j == i + 1 {
                // a aresta i termina em b = c, onde a aresta j começa; compartilham b.
                if sobrepoe_em(b, a, d) {
                    return true;
                }
            } else if i == 0 && j == n - 1 {
                // a aresta n-1 termina em a, onde a aresta 0 começa; compartilham a.
                if sobrepoe_em(a, b, c) {
                    return true;
                }
            } else if segmentos_se_tocam(a, b, c, d) {
                return true;
            }
        }
    }
    false
}

/// Checa o anel de um vão, sem olhar a parede: finito, sem pontos repetidos, simples, com área positiva.
fn validar_anel(i: usize, anel: &[[f64; 2]]) -> Result<(), ErroFuro> {
    let n = anel.len();
    if n < 3 || anel.iter().any(|p| !p[0].is_finite() || !p[1].is_finite()) {
        return Err(ErroFuro::ContornoInvalido(i));
    }
    for k in 0..n {
        let (p, q) = (anel[k], anel[(k + 1) % n]);
        if (q[0] - p[0]).hypot(q[1] - p[1]) <= DIST_PONTO {
            return Err(ErroFuro::PontoRepetido(i));
        }
    }
    // Todos os pontos colineares: o anel é um segmento (área nula), não um polígono com auto-interseção.
    if anel.iter().all(|p| sinal(anel[0], anel[1], *p) == 0) {
        return Err(ErroFuro::ContornoInvalido(i));
    }
    if anel_se_cruza(anel) {
        return Err(ErroFuro::AutoInterseccao(i));
    }
    if area_com_sinal(anel) <= AREA_MINIMA {
        return Err(ErroFuro::ContornoInvalido(i));
    }
    Ok(())
}

fn validar(vaos: &[Vao], espessuras: &[f64], comprimento: f64, altura: f64) -> Result<(), ErroFuro> {
    if !(comprimento > 0.0 && altura > 0.0 && comprimento.is_finite() && altura.is_finite()) {
        return Err(ErroFuro::ParedeInvalida);
    }
    for (i, e) in espessuras.iter().enumerate() {
        if !(*e > 0.0 && e.is_finite()) {
            return Err(ErroFuro::EspessuraInvalida(i));
        }
    }
    for (i, v) in vaos.iter().enumerate() {
        if !v.x.is_finite() || !v.soleira.is_finite() {
            return Err(ErroFuro::ContornoInvalido(i));
        }
        validar_anel(i, &v.contorno)?;
        let (mut x0, mut x1, mut z0, mut z1) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
        for p in &v.contorno {
            x0 = x0.min(v.x + p[0]);
            x1 = x1.max(v.x + p[0]);
            z0 = z0.min(v.soleira + p[1]);
            z1 = z1.max(v.soleira + p[1]);
        }
        let e = 1e-9;
        if x0 < -e || x1 > comprimento + e || z0 < -e || z1 > altura + e {
            return Err(ErroFuro::VaoForaDaParede(i));
        }
    }
    Ok(())
}

/// Cortador: contorno extrudado ao longo de y, cobrindo `[y0 - FOLGA_Y, y1 + FOLGA_Y]`.
fn cortador(v: &Vao, y0: f64, y1: f64) -> Manifold {
    let anel: Vec<Vec2> = v.contorno.iter().map(|p| Vec2::new(p[0], p[1])).collect();
    let profundidade = (y1 - y0) + 2.0 * FOLGA_Y;
    // Extrusão em +z do plano XY; rotate(90, 0, 0) leva (x, y, z) a (x, -z, y): o contorno vira
    // x/z da parede e a extrusão ocupa y em [-profundidade, 0].
    Manifold::extrude(&vec![anel], profundidade, 0, 0.0, Vec2::new(1.0, 1.0))
        .rotate(90.0, 0.0, 0.0)
        .translate(Vec3::new(v.x, y1 + FOLGA_Y, v.soleira))
}

/// União em árvore balanceada (pares), em vez de sequencial.
fn unir(mut partes: Vec<Manifold>) -> Option<Manifold> {
    while partes.len() > 1 {
        let mut prox = Vec::with_capacity(partes.len().div_ceil(2));
        let mut it = partes.into_iter();
        while let Some(a) = it.next() {
            match it.next() {
                Some(b) => prox.push(a.boolean(&b, OpType::Add)),
                None => prox.push(a),
            }
        }
        partes = prox;
    }
    partes.pop()
}

/// Fura cada camada da pilha com a união dos cortadores de todos os vãos.
pub fn furar_parede(
    vaos: &[Vao],
    espessuras: &[f64],
    comprimento: f64,
    altura: f64,
) -> Result<ResultadoFuro, ErroFuro> {
    validar(vaos, espessuras, comprimento, altura)?;
    let mut res = ResultadoFuro::default();
    let mut y = 0.0;
    for &e in espessuras {
        let (y0, y1) = (y, y + e);
        y = y1;
        let placa = Manifold::cube(Vec3::new(comprimento, e, altura), false).translate(Vec3::new(0.0, y0, 0.0));
        let furada = match unir(vaos.iter().map(|v| cortador(v, y0, y1)).collect()) {
            Some(c) => placa.boolean(&c, OpType::Subtract),
            None => placa.clone(),
        };
        if furada.status() != ErroManifold::NoError {
            return Err(ErroFuro::Manifold(format!("{:?}", furada.status())));
        }
        let malha = furada.get_mesh_gl64(-1);
        let n_prop = malha.num_prop as usize;
        let mut vertices = Vec::with_capacity(malha.vert_properties.len() / n_prop.max(1) * 3);
        for v in malha.vert_properties.chunks(n_prop.max(3)) {
            vertices.extend_from_slice(&v[..3]);
        }
        let indices: Vec<u32> = malha.tri_verts.iter().map(|&i| i as u32).collect();
        let volume = furada.volume();
        let volume_sem_furo = comprimento * e * altura;
        res.volume += volume;
        res.volume_removido += volume_sem_furo - volume;
        res.camadas.push(MalhaCamada { y0, y1, vertices, indices, volume, volume_sem_furo });
    }
    Ok(res)
}
