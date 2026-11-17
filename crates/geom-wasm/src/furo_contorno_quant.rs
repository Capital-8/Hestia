//! Quantitativo do furo por contorno livre (docs/estudo-esquadrias/22-quantitativo-juncao-retorno.md).
//!
//! Continua `furo_contorno` (spike 19). Funções puras, sem consumidores no produto e sem exportação na ABI.
//!
//! 1. `quant_vao`: área e perímetro do contorno REAL do vão (não o retângulo W x H) para `Qto_*BaseQuantities`.
//! 2. `quantificar_parede`: área líquida de face e volume líquido por camada, medidos sobre a MALHA furada (divergência
//!    dos triângulos e área dos triângulos das faces), e conferidos contra o volume do kernel.
//! 3. `retorno_do_vao`: peça de retorno do acabamento que segue o contorno (o Lapin zera o retorno quando há forma),
//!    com espessura limitada à da camada de acabamento.
//!
//! Referencial: o de `furo_contorno` (x ao longo da parede, y na espessura, z para cima; contorno [x, z] relativo
//! à origem do vão, anti-horário, aberto).
//!
//! O retorno do cálculo atual (`a3b::retornos_do_vao` + `a3c`) é só de OMBREIRAS: dois retângulos laterais de largura
//! `t` somados à planta da camada nas faixas de altura que o vão atravessa (volume `2 t D H`, sem verga nem soleira).
//! `ModoRetorno::Ombreiras` reproduz isso para o retângulo (paridade testada); `ModoRetorno::Contorno` segue o
//! contorno inteiro (ombreiras, verga/arco e soleira), que é o que falta quando há forma.

use manifold_rust::linalg::{Vec2, Vec3};
use manifold_rust::manifold::Manifold;
use manifold_rust::types::{Error as ErroManifold, OpType};

use crate::furo_contorno::{area_com_sinal, ErroFuro, ResultadoFuro, Vao};
use crate::ops::{diferenca, interseccao, offset};
use crate::pintor::area_da_forma;
use crate::{MultiPoligono, Poligono};

/// Tolerância (m) para considerar um vértice sobre um plano y = const.
const EPS_Y: f64 = 1e-9;
/// Tolerância (m) para considerar um triângulo lateral do retorno sobre o contorno do vão.
const EPS_CONTORNO: f64 = 1e-6;

#[derive(Debug, Clone, PartialEq)]
pub enum ErroQuant {
    Furo(ErroFuro),
    /// Contorno com menos de 3 pontos, não finito ou horário/área nula.
    ContornoInvalido,
    /// Espessura pedida ou do acabamento não positiva/finita.
    EspessuraInvalida,
    /// Profundidade do retorno inválida (`y1 <= y0`).
    ProfundidadeInvalida,
    /// O retorno não cabe: o contorno recuado pela espessura some (2 t >= largura ou t >= altura, no mínimo).
    RetornoNaoCabe,
    /// Falha das booleanas 2D (`ops`), com o código de erro de lá.
    Geometria(u32),
    Manifold(String),
    /// Malha e kernel (ou área de face e volume/espessura) discordam além da tolerância.
    Inconsistente(&'static str),
}

impl From<ErroFuro> for ErroQuant {
    fn from(e: ErroFuro) -> Self {
        ErroQuant::Furo(e)
    }
}

// ---------------------------------------------------------------------------------------------------------
// 1. Contorno real do vão
// ---------------------------------------------------------------------------------------------------------

/// Quantidades do vão para `Qto_WindowBaseQuantities` / `Qto_DoorBaseQuantities` / `IfcOpeningElement`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct QuantVao {
    /// Largura e altura da caixa envolvente do contorno (`Width`, `Height`).
    pub largura: f64,
    pub altura: f64,
    /// Área do contorno real (m2). Para um retângulo vale `largura * altura`.
    pub area: f64,
    /// Perímetro do contorno real, base incluída (m): selante, espuma, comprimento de alizar/retorno.
    pub perimetro: f64,
    /// `largura * altura` (o que o Lapin grava em `Area`, para qualquer forma).
    pub area_envelope: f64,
}

/// Perímetro do anel fechado (soma dos lados, incluindo o de volta ao primeiro ponto).
pub fn perimetro_do_anel(anel: &[[f64; 2]]) -> f64 {
    let n = anel.len();
    (0..n)
        .map(|i| {
            let (p, q) = (anel[i], anel[(i + 1) % n]);
            ((q[0] - p[0]).powi(2) + (q[1] - p[1]).powi(2)).sqrt()
        })
        .sum()
}

fn contorno_valido(c: &[[f64; 2]]) -> bool {
    c.len() >= 3 && c.iter().all(|p| p[0].is_finite() && p[1].is_finite()) && area_com_sinal(c) > 1e-12
}

/// Área e perímetro do contorno real do vão.
pub fn quant_vao(contorno: &[[f64; 2]]) -> Result<QuantVao, ErroQuant> {
    if !contorno_valido(contorno) {
        return Err(ErroQuant::ContornoInvalido);
    }
    let (mut x0, mut x1, mut z0, mut z1) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
    for p in contorno {
        x0 = x0.min(p[0]);
        x1 = x1.max(p[0]);
        z0 = z0.min(p[1]);
        z1 = z1.max(p[1]);
    }
    let (largura, altura) = (x1 - x0, z1 - z0);
    Ok(QuantVao { largura, altura, area: area_com_sinal(contorno), perimetro: perimetro_do_anel(contorno), area_envelope: largura * altura })
}

// ---------------------------------------------------------------------------------------------------------
// 2. Parede furada: área líquida de face e volume líquido por camada
// ---------------------------------------------------------------------------------------------------------

/// Quantidades de uma camada medidas sobre a malha furada.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct QuantCamada {
    pub y0: f64,
    pub y1: f64,
    pub espessura: f64,
    /// Volume pela divergência dos triângulos da malha.
    pub volume_liquido: f64,
    /// `comprimento * espessura * altura`.
    pub volume_bruto: f64,
    pub volume_removido: f64,
    /// `comprimento * altura`.
    pub area_face_bruta: f64,
    /// Soma dos triângulos da face em `y = y0` (a face líquida: a bruta menos a área do contorno).
    pub area_face_liquida: f64,
    /// Idem na face em `y = y1`.
    pub area_face_oposta: f64,
    /// `area_face_bruta - area_face_liquida`: a área do contorno projetada na face.
    pub area_furo_na_face: f64,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct QuantParede {
    pub camadas: Vec<QuantCamada>,
    pub volume_liquido: f64,
    pub volume_removido: f64,
}

fn tri(v: &[f64], i: u32) -> [f64; 3] {
    let k = i as usize * 3;
    [v[k], v[k + 1], v[k + 2]]
}

fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn vetorial(u: [f64; 3], v: [f64; 3]) -> [f64; 3] {
    [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
}

/// Volume (divergência, em relação ao primeiro vértice: não perde precisão longe da origem) e áreas dos triângulos
/// que ficam inteiros nos planos `y = y0` e `y = y1`, de uma malha de triângulos `(vertices, indices)`.
fn medir_triangulos(vertices: &[f64], indices: &[u32], y0: f64, y1: f64) -> (f64, f64, f64) {
    let origem = if indices.is_empty() { [0.0; 3] } else { tri(vertices, indices[0]) };
    let (mut v6, mut a0, mut a1) = (0.0, 0.0, 0.0);
    for t in indices.chunks_exact(3) {
        let (a, b, c) = (tri(vertices, t[0]), tri(vertices, t[1]), tri(vertices, t[2]));
        let (ra, rb, rc) = (sub(a, origem), sub(b, origem), sub(c, origem));
        let bc = vetorial(rb, rc);
        v6 += ra[0] * bc[0] + ra[1] * bc[1] + ra[2] * bc[2];
        let n = vetorial(sub(b, a), sub(c, a));
        let area = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt() / 2.0;
        let todos_em = |y: f64| [a, b, c].iter().all(|p| (p[1] - y).abs() <= EPS_Y);
        if todos_em(y0) {
            a0 += area;
        } else if todos_em(y1) {
            a1 += area;
        }
    }
    (v6 / 6.0, a0, a1)
}

/// Quantidades por camada de uma parede furada por `furar_parede`. `comprimento` e `altura` são os mesmos da chamada.
/// Confere o volume da malha contra o do kernel e a área de face contra `volume / espessura`.
pub fn quantificar_parede(res: &ResultadoFuro, comprimento: f64, altura: f64) -> Result<QuantParede, ErroQuant> {
    let mut q = QuantParede::default();
    for c in &res.camadas {
        let espessura = c.y1 - c.y0;
        let (volume_liquido, a_y0, a_y1) = medir_triangulos(&c.vertices, &c.indices, c.y0, c.y1);
        let volume_bruto = comprimento * espessura * altura;
        let area_bruta = comprimento * altura;
        if (volume_liquido - c.volume).abs() > 1e-9 * volume_bruto.max(1.0) {
            return Err(ErroQuant::Inconsistente("volume da malha difere do kernel"));
        }
        if (a_y0 * espessura - volume_liquido).abs() > 1e-9 * volume_bruto.max(1.0) || (a_y1 - a_y0).abs() > 1e-9 * area_bruta.max(1.0) {
            return Err(ErroQuant::Inconsistente("área de face difere de volume / espessura"));
        }
        q.volume_liquido += volume_liquido;
        q.volume_removido += volume_bruto - volume_liquido;
        q.camadas.push(QuantCamada {
            y0: c.y0,
            y1: c.y1,
            espessura,
            volume_liquido,
            volume_bruto,
            volume_removido: volume_bruto - volume_liquido,
            area_face_bruta: area_bruta,
            area_face_liquida: a_y0,
            area_face_oposta: a_y1,
            area_furo_na_face: area_bruta - a_y0,
        });
    }
    Ok(q)
}

// ---------------------------------------------------------------------------------------------------------
// 3. Retorno do acabamento
// ---------------------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModoRetorno {
    /// Faixa de largura `t` ao longo de TODO o contorno (ombreiras, verga ou arco, soleira): contorno menos o contorno
    /// recuado `t` (offset para dentro). É o que segue a forma.
    Contorno,
    /// Só as ombreiras: contorno menos a interseção do contorno deslocado `+t` e `-t` em x (erosão horizontal). Para o
    /// retângulo é `2 t H`, igual ao retorno do cálculo atual. Vale para contornos em que cada corte horizontal é um
    /// único intervalo [I]; em arco, a faixa afina para zero no fecho.
    Ombreiras,
}

#[derive(Debug, Clone, Copy)]
pub struct EntradaRetorno {
    /// Espessura pedida (m).
    pub espessura_pedida: f64,
    /// Espessura da camada de acabamento (m): teto da espessura do retorno (o Lapin usa teto fixo de 25 mm).
    pub espessura_acabamento: f64,
    /// Faixa em y que o retorno ocupa (a profundidade do vão a revestir: a parede toda num lado só, a metade com os dois lados).
    pub y0: f64,
    pub y1: f64,
    pub modo: ModoRetorno,
}

/// Peça de retorno.
#[derive(Debug, Clone, Default)]
pub struct Retorno {
    /// Espessura efetiva `min(pedida, acabamento)`.
    pub espessura: f64,
    /// `true` se o teto da camada de acabamento reduziu a espessura pedida.
    pub limitada: bool,
    pub y0: f64,
    pub y1: f64,
    /// Área do retorno no plano x-z (m2).
    pub area_anel: f64,
    /// Área do vão livre depois do retorno: `area do contorno - area_anel` (m2).
    pub area_livre: f64,
    /// Volume da peça (kernel) = `area_anel * (y1 - y0)`.
    pub volume: f64,
    /// Superfície exposta ao vão livre (m2): triângulos laterais que não estão sobre o contorno. É a área de acabamento do retorno.
    pub area_exposta: f64,
    /// x, y, z intercalados (m), em coordenadas da parede (já com `x` e `soleira` do vão).
    pub vertices: Vec<f64>,
    pub indices: Vec<u32>,
}

fn multi_do_anel(anel: &[[f64; 2]]) -> MultiPoligono {
    vec![vec![anel.to_vec()]]
}

fn translada(m: &MultiPoligono, dx: f64) -> MultiPoligono {
    m.iter().map(|p| p.iter().map(|a| a.iter().map(|q| [q[0] + dx, q[1]]).collect()).collect()).collect()
}

/// Região do retorno no plano x-z, relativa à origem do vão.
fn regiao_do_retorno(contorno: &[[f64; 2]], t: f64, modo: ModoRetorno) -> Result<MultiPoligono, ErroQuant> {
    let c = multi_do_anel(contorno);
    let miolo = match modo {
        ModoRetorno::Contorno => offset(&c, -t).map_err(ErroQuant::Geometria)?,
        ModoRetorno::Ombreiras => interseccao(&translada(&c, t), &translada(&c, -t)).map_err(ErroQuant::Geometria)?,
    };
    if miolo.is_empty() {
        return Err(ErroQuant::RetornoNaoCabe);
    }
    diferenca(&[c, miolo]).map_err(ErroQuant::Geometria)
}

/// Extrusão de uma região x-z ao longo de y em `[y0, y1]`, posta em `(x, soleira)`. Mesma convenção do cortador de
/// `furo_contorno` (extrusão em +z, `rotate(90, 0, 0)` leva z a -y).
pub(crate) fn extrudar_regiao(regiao: &MultiPoligono, x: f64, soleira: f64, y0: f64, y1: f64) -> Manifold {
    let aneis: Vec<Vec<Vec2>> = regiao.iter().flat_map(|p: &Poligono| p.iter().map(|a| a.iter().map(|q| Vec2::new(q[0], q[1])).collect())).collect();
    Manifold::extrude(&aneis, y1 - y0, 0, 0.0, Vec2::new(1.0, 1.0)).rotate(90.0, 0.0, 0.0).translate(Vec3::new(x, y1, soleira))
}

/// Distância ao quadrado de um ponto a um segmento.
fn dist2_segmento(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
    let (vx, vy) = (b[0] - a[0], b[1] - a[1]);
    let len2 = vx * vx + vy * vy;
    let t = if len2 == 0.0 { 0.0 } else { (((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2).clamp(0.0, 1.0) };
    let (dx, dy) = (a[0] + t * vx - p[0], a[1] + t * vy - p[1]);
    dx * dx + dy * dy
}

/// Área dos triângulos laterais (normal sem componente em y) cuja projeção em x-z não cai sobre o contorno do vão.
fn area_exposta(vertices: &[f64], indices: &[u32], contorno: &[[f64; 2]], x: f64, soleira: f64) -> f64 {
    let n = contorno.len();
    let mut soma = 0.0;
    for t in indices.chunks_exact(3) {
        let p = |i: u32| [vertices[i as usize * 3], vertices[i as usize * 3 + 1], vertices[i as usize * 3 + 2]];
        let (a, b, c) = (p(t[0]), p(t[1]), p(t[2]));
        let nv = vetorial(sub(b, a), sub(c, a));
        let dobro = (nv[0] * nv[0] + nv[1] * nv[1] + nv[2] * nv[2]).sqrt();
        if dobro == 0.0 || (nv[1] / dobro).abs() > 1e-9 {
            continue; // degenerado ou face frontal (em y)
        }
        let cx = [(a[0] + b[0] + c[0]) / 3.0 - x, (a[2] + b[2] + c[2]) / 3.0 - soleira];
        let sobre = (0..n).any(|i| dist2_segmento(cx, contorno[i], contorno[(i + 1) % n]) <= EPS_CONTORNO * EPS_CONTORNO);
        if !sobre {
            soma += dobro / 2.0;
        }
    }
    soma
}

/// Peça de retorno do vão, seguindo o contorno, com a espessura limitada à da camada de acabamento.
pub fn retorno_do_vao(vao: &Vao, e: &EntradaRetorno) -> Result<Retorno, ErroQuant> {
    if !contorno_valido(&vao.contorno) || !vao.x.is_finite() || !vao.soleira.is_finite() {
        return Err(ErroQuant::ContornoInvalido);
    }
    if !(e.espessura_pedida > 0.0 && e.espessura_acabamento > 0.0 && e.espessura_pedida.is_finite() && e.espessura_acabamento.is_finite()) {
        return Err(ErroQuant::EspessuraInvalida);
    }
    if !(e.y1 > e.y0 && e.y0.is_finite() && e.y1.is_finite()) {
        return Err(ErroQuant::ProfundidadeInvalida);
    }
    let t = e.espessura_pedida.min(e.espessura_acabamento);
    let regiao = regiao_do_retorno(&vao.contorno, t, e.modo)?;
    let area_anel = area_da_forma(&regiao);
    if !(area_anel > 1e-12) {
        return Err(ErroQuant::RetornoNaoCabe);
    }
    let solido = extrudar_regiao(&regiao, vao.x, vao.soleira, e.y0, e.y1);
    if solido.status() != ErroManifold::NoError {
        return Err(ErroQuant::Manifold(format!("{:?}", solido.status())));
    }
    let malha = solido.get_mesh_gl64(-1);
    let n_prop = malha.num_prop as usize;
    let mut vertices = Vec::with_capacity(malha.vert_properties.len() / n_prop.max(1) * 3);
    for v in malha.vert_properties.chunks(n_prop.max(3)) {
        vertices.extend_from_slice(&v[..3]);
    }
    let indices: Vec<u32> = malha.tri_verts.iter().map(|&i| i as u32).collect();
    let exposta = area_exposta(&vertices, &indices, &vao.contorno, vao.x, vao.soleira);
    Ok(Retorno {
        espessura: t,
        limitada: e.espessura_pedida > e.espessura_acabamento,
        y0: e.y0,
        y1: e.y1,
        area_anel,
        area_livre: area_com_sinal(&vao.contorno) - area_anel,
        volume: solido.volume(),
        area_exposta: exposta,
        vertices,
        indices,
    })
}

/// Volume líquido da camada de acabamento com o retorno devolvido ao vão: `volume_liquido + volume do retorno`.
/// É a soma que o cálculo atual faz (`poly.extend(retorno)` na faixa do vão) para a camada que o retorno revestiu.
pub fn volume_com_retorno(camada: &QuantCamada, retorno: &Retorno) -> f64 {
    camada.volume_liquido + retorno.volume
}

/// Volume removido que o retorno não devolve: `volume_removido - volume do retorno`. Com o retorno na faixa de y da
/// própria camada, é `area_livre * espessura`.
pub fn volume_removido_liquido(camada: &QuantCamada, retorno: &Retorno) -> f64 {
    camada.volume_removido - retorno.volume
}
