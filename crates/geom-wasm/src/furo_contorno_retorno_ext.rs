//! Retorno do acabamento que segue o contorno, versão estendida (docs/estudo-esquadrias/33).
//!
//! `furo_contorno_quant::retorno_do_vao` dá o anel do contorno inteiro (ombreiras, verga ou arco, soleira). Faltavam dois casos:
//!
//! 1. **Vão que toca o piso** (`soleira + z_min <= 0`): o retorno do retângulo atual (`a3b::retornos_do_vao`) é só de ombreiras,
//!    sem soleira. `base_livre` tira a faixa da base do anel e deixa as ombreiras descerem até o piso. A base livre é obtida
//!    prolongando a base do contorno para baixo (uma caixa) ANTES do offset, de modo que o offset não levanta as ombreiras, e
//!    cortando o resultado pelo contorno.
//! 2. **Vão perto do canto** onde a camada é cortada pela junção: o retorno não pode invadir a parede vizinha (`a3b::recortar_retorno`
//!    no cálculo atual, só em planta). Aqui o anel extrudado em y é interseccionado com o prisma de planta `recorte` ([u, s],
//!    a pegada do retorno menos as paredes vizinhas, calculada pelo engine), em qualquer z.
//!
//! Referencial: o de `furo_contorno_quant` (x = u, y = s, z para cima; contorno [x, z] anti-horário relativo à origem do vão).
//! As áreas `area_anel` e `area_livre` são do anel no plano x-z, sem o recorte; `volume` e `area_exposta` são da peça recortada.

use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE};
use crate::furo_contorno::{area_com_sinal, Vao};
use crate::furo_contorno_abi::{estado, fatia, LIMITE_PONTOS_POR_VAO};
use crate::furo_contorno_prisma::{mapa_curvo, mapa_curvo_inverso, preparar_planta, ANGULO_MAX_VAO, RAIO_MIN, CamadaPrisma, PoligonoPlanta, LIMITE_ANEIS, LIMITE_POLIGONOS, LIMITE_PONTOS_PLANTA, LIMITE_PONTOS_POR_ANEL};
use crate::furo_contorno_quant::{extrudar_regiao, EntradaRetorno, ErroQuant, ModoRetorno, Retorno};
use crate::furo_contorno_quant_abi::{contorno_de, erro_da_quant, escalar_ok, EntradaRetornoAbi};
use crate::ops::{diferenca, interseccao, offset, uniao};
use crate::pintor::area_da_forma;
use crate::{MultiPoligono, Poligono};
use manifold_rust::linalg::{Vec2, Vec3};
use manifold_rust::manifold::Manifold;
use manifold_rust::types::{Error as ErroManifold, OpType};

const EPS_CONTORNO: f64 = 1e-6;
/// Folga em z (m) do prisma de recorte além do anel.
const FOLGA_Z: f64 = 1.0;

fn multi_do_anel(anel: &[[f64; 2]]) -> MultiPoligono {
    vec![vec![anel.to_vec()]]
}

fn translada(m: &MultiPoligono, dx: f64) -> MultiPoligono {
    m.iter().map(|p| p.iter().map(|a| a.iter().map(|q| [q[0] + dx, q[1]]).collect()).collect()).collect()
}

fn geometria(e: u32) -> ErroQuant {
    ErroQuant::Geometria(e)
}

/// Extremos em x da aresta da base (vértices em `z_min`); `None` se a base for um ponto (círculo).
fn aresta_da_base(c: &[[f64; 2]]) -> Option<(f64, f64, f64)> {
    let zmin = c.iter().map(|p| p[1]).fold(f64::MAX, f64::min);
    let (mut x0, mut x1) = (f64::MAX, f64::MIN);
    for p in c.iter().filter(|p| (p[1] - zmin).abs() <= 1e-9) {
        x0 = x0.min(p[0]);
        x1 = x1.max(p[0]);
    }
    if x1 - x0 > 1e-9 {
        Some((x0, x1, zmin))
    } else {
        None
    }
}

/// Região do retorno e o "miolo" (vão livre) no plano x-z, relativos à origem do vão.
fn regiao(c: &[[f64; 2]], t: f64, recuo: f64, modo: ModoRetorno, base_livre: bool) -> Result<(MultiPoligono, MultiPoligono), ErroQuant> {
    let c_multi = multi_do_anel(c);
    let mut a = c_multi.clone();
    let estender = base_livre && modo == ModoRetorno::Contorno;
    if estender {
        if let Some((x0, x1, zmin)) = aresta_da_base(c) {
            let h = recuo + 2.0 * t;
            let caixa: MultiPoligono = vec![vec![vec![[x0, zmin - h], [x1, zmin - h], [x1, zmin], [x0, zmin]]]];
            a = uniao(&[c_multi.clone(), caixa]).map_err(geometria)?;
        }
    }
    if recuo > 0.0 {
        a = offset(&a, -recuo).map_err(geometria)?;
    }
    if a.is_empty() {
        return Err(ErroQuant::RetornoNaoCabe);
    }
    let miolo = match modo {
        ModoRetorno::Contorno => offset(&a, -t).map_err(geometria)?,
        ModoRetorno::Ombreiras => interseccao(&translada(&a, t), &translada(&a, -t)).map_err(geometria)?,
    };
    if miolo.is_empty() {
        return Err(ErroQuant::RetornoNaoCabe);
    }
    let mut anel = diferenca(&[a, miolo.clone()]).map_err(geometria)?;
    if estender {
        anel = interseccao(&anel, &c_multi).map_err(geometria)?;
    }
    Ok((anel, miolo))
}

fn dist2_segmento(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
    let (vx, vy) = (b[0] - a[0], b[1] - a[1]);
    let len2 = vx * vx + vy * vy;
    let t = if len2 == 0.0 { 0.0 } else { (((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2).clamp(0.0, 1.0) };
    let (dx, dy) = (a[0] + t * vx - p[0], a[1] + t * vy - p[1]);
    dx * dx + dy * dy
}

/// Área dos triângulos laterais (sem componente em y na normal) que estão sobre a borda do vão livre: o acabamento do retorno.
fn area_exposta_interna(vertices: &[f64], indices: &[u32], miolo: &MultiPoligono, x: f64, soleira: f64) -> f64 {
    let segs: Vec<([f64; 2], [f64; 2])> = miolo.iter().flat_map(|p: &Poligono| p.iter()).flat_map(|a| (0..a.len()).map(move |i| (a[i], a[(i + 1) % a.len()]))).collect();
    let mut soma = 0.0;
    for t in indices.chunks_exact(3) {
        let p = |i: u32| [vertices[i as usize * 3], vertices[i as usize * 3 + 1], vertices[i as usize * 3 + 2]];
        let (a, b, c) = (p(t[0]), p(t[1]), p(t[2]));
        let (u, v) = ([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
        let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        let dobro = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
        if dobro == 0.0 || (n[1] / dobro).abs() > 1e-9 {
            continue;
        }
        let cx = [(a[0] + b[0] + c[0]) / 3.0 - x, (a[2] + b[2] + c[2]) / 3.0 - soleira];
        if segs.iter().any(|(s0, s1)| dist2_segmento(cx, *s0, *s1) <= EPS_CONTORNO * EPS_CONTORNO) {
            soma += dobro / 2.0;
        }
    }
    soma
}

/// Prisma de recorte: os polígonos de planta [u, s] extrudados em z cobrindo `[z0, z1]`.
fn prisma_de_recorte(recorte: &[PoligonoPlanta], z0: f64, z1: f64) -> Result<Manifold, ErroQuant> {
    let c = CamadaPrisma { poligonos: recorte.to_vec(), z0, z1 };
    let (pols, _) = preparar_planta(0, &c).map_err(|_| ErroQuant::ContornoInvalido)?;
    let secao: Vec<Vec<Vec2>> = pols.iter().flatten().map(|a| a.iter().map(|p| Vec2::new(p[0], p[1])).collect()).collect();
    let m = Manifold::extrude(&secao, z1 - z0, 0, 0.0, Vec2::new(1.0, 1.0)).translate(Vec3::new(0.0, 0.0, z0));
    if m.status() != ErroManifold::NoError {
        return Err(ErroQuant::Manifold(format!("recorte: {:?}", m.status())));
    }
    Ok(m)
}

/// Retorno do vão com `recuo` (offset do contorno para dentro), base livre opcional e recorte em planta opcional (vazio = sem recorte).
pub fn retorno_do_vao_ext(vao: &Vao, e: &EntradaRetorno, recuo: f64, base_livre: bool, recorte: &[PoligonoPlanta]) -> Result<Retorno, ErroQuant> {
    retorno_do_vao_curvo(vao, e, recuo, base_livre, recorte, None)
}

/// Aresta máxima (m) do anel antes do mapa curvo: o tampo é plano entre vértices e a corda precisa seguir a face cilíndrica.
const ARESTA_MAX_CURVA: f64 = 0.05;

fn densificar(m: &MultiPoligono, max: f64) -> MultiPoligono {
    m.iter()
        .map(|p| {
            p.iter()
                .map(|a| {
                    let mut out = Vec::with_capacity(a.len());
                    for i in 0..a.len() {
                        let (p0, p1) = (a[i], a[(i + 1) % a.len()]);
                        let n = (((p1[0] - p0[0]).hypot(p1[1] - p0[1])) / max).ceil().max(1.0) as usize;
                        for j in 0..n {
                            let f = j as f64 / n as f64;
                            out.push([p0[0] + f * (p1[0] - p0[0]), p0[1] + f * (p1[1] - p0[1])]);
                        }
                    }
                    out
                })
                .collect()
        })
        .collect()
}

/// Área exposta em parede curva: os triângulos "laterais" (normal sem componente radial, isto é, faces regradas na direção
/// radial) cujo (t, z) cai sobre a borda do vão livre. A área é a da malha já no mundo.
fn area_exposta_curva(vertices: &[f64], indices: &[u32], miolo: &MultiPoligono, vao: &Vao, raio: f64) -> f64 {
    let segs: Vec<([f64; 2], [f64; 2])> = miolo.iter().flat_map(|p: &Poligono| p.iter()).flat_map(|a| (0..a.len()).map(move |i| (a[i], a[(i + 1) % a.len()]))).collect();
    let mut soma = 0.0;
    for t in indices.chunks_exact(3) {
        let p = |i: u32| [vertices[i as usize * 3], vertices[i as usize * 3 + 1], vertices[i as usize * 3 + 2]];
        let (a, b, c) = (p(t[0]), p(t[1]), p(t[2]));
        let (u, v) = ([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
        let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        let dobro = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
        if dobro == 0.0 {
            continue;
        }
        let m = [(a[0] + b[0] + c[0]) / 3.0, (a[1] + b[1] + c[1]) / 3.0, (a[2] + b[2] + c[2]) / 3.0];
        let (rx, ry) = (m[0], m[1] + raio);
        let rl = rx.hypot(ry);
        if rl == 0.0 || ((n[0] * rx + n[1] * ry) / (dobro * rl)).abs() > 0.02 {
            continue;
        }
        let (tt, _) = mapa_curvo_inverso(raio, [m[0], m[1]], vao.x);
        let cx = [tt - vao.x, m[2] - vao.soleira];
        if segs.iter().any(|(s0, s1)| dist2_segmento(cx, *s0, *s1) <= 1e-8) {
            soma += dobro / 2.0;
        }
    }
    soma
}

/// `retorno_do_vao_ext` em parede curva opcional (`curva` = raio assinado `k * R`, docs/estudo-esquadrias/33 §4): o anel do contorno
/// (x = comprimento de eixo, y = lateral s) é extrudado reto e levado ao referencial local pelo mapa curvo, de modo que as
/// faces laterais do retorno são radiais como o vão. `recorte` já está no referencial local (u, s). `area_anel` e `area_livre`
/// são as do anel desenvolvido (plano x-z); `volume` e `area_exposta` são da peça no mundo.
pub fn retorno_do_vao_curvo(vao: &Vao, e: &EntradaRetorno, recuo: f64, base_livre: bool, recorte: &[PoligonoPlanta], curva: Option<f64>) -> Result<Retorno, ErroQuant> {
    if let Some(r) = curva {
        let (x0, x1) = vao.contorno.iter().fold((f64::MAX, f64::MIN), |(a, b), p| (a.min(p[0]), b.max(p[0])));
        if !(r.is_finite() && r.abs() >= RAIO_MIN) || (x1 - x0) / r.abs() > ANGULO_MAX_VAO {
            return Err(ErroQuant::ContornoInvalido);
        }
    }
    if vao.contorno.len() < 3 || area_com_sinal(&vao.contorno) <= 1e-12 || !vao.x.is_finite() || !vao.soleira.is_finite() || vao.contorno.iter().any(|p| !p[0].is_finite() || !p[1].is_finite()) {
        return Err(ErroQuant::ContornoInvalido);
    }
    if !(e.espessura_pedida > 0.0 && e.espessura_acabamento > 0.0 && e.espessura_pedida.is_finite() && e.espessura_acabamento.is_finite()) || !(recuo >= 0.0 && recuo.is_finite()) {
        return Err(ErroQuant::EspessuraInvalida);
    }
    if !(e.y1 > e.y0 && e.y0.is_finite() && e.y1.is_finite()) {
        return Err(ErroQuant::ProfundidadeInvalida);
    }
    let t = e.espessura_pedida.min(e.espessura_acabamento);
    let (anel, miolo) = regiao(&vao.contorno, t, recuo, e.modo, base_livre)?;
    let area_anel = area_da_forma(&anel);
    if !(area_anel > 1e-12) {
        return Err(ErroQuant::RetornoNaoCabe);
    }
    let area_livre = area_da_forma(&interseccao(&miolo, &multi_do_anel(&vao.contorno)).map_err(geometria)?);
    let mut solido = match curva {
        None => extrudar_regiao(&anel, vao.x, vao.soleira, e.y0, e.y1),
        Some(r) => extrudar_regiao(&densificar(&anel, ARESTA_MAX_CURVA), vao.x, vao.soleira, e.y0, e.y1).warp(move |p: &mut Vec3| {
            let q = mapa_curvo(r, p.x, p.y);
            p.x = q[0];
            p.y = q[1];
        }),
    };
    if !recorte.is_empty() {
        let zmin = vao.contorno.iter().map(|p| p[1]).fold(f64::MAX, f64::min);
        let zmax = vao.contorno.iter().map(|p| p[1]).fold(f64::MIN, f64::max);
        let prisma = prisma_de_recorte(recorte, vao.soleira + zmin - FOLGA_Z, vao.soleira + zmax + FOLGA_Z)?;
        solido = solido.boolean(&prisma, OpType::Intersect);
    }
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
    let exposta = match curva {
        None => area_exposta_interna(&vertices, &indices, &miolo, vao.x, vao.soleira),
        Some(r) => area_exposta_curva(&vertices, &indices, &miolo, vao, r),
    };
    Ok(Retorno {
        espessura: t,
        limitada: e.espessura_pedida > e.espessura_acabamento,
        y0: e.y0,
        y1: e.y1,
        area_anel,
        area_livre,
        volume: solido.volume(),
        area_exposta: exposta,
        vertices,
        indices,
    })
}

// ---------------------------------------------------------------------------------------------
// ABI: `furo_retorno_vao_ext`
// ---------------------------------------------------------------------------------------------

/// Versão do layout de `furo_retorno_vao_ext`.
pub const VERSAO_ABI_RETORNO_EXT: u32 = 1;

/// Entradas decodificadas: as de `furo_retorno_vao` (com `modo` 0 contorno, 1 ombreiras, 2 contorno com a base livre) mais o recorte.
pub struct EntradaRetornoExtAbi<'a> {
    pub base: EntradaRetornoAbi<'a>,
    /// u, s intercalados de todos os anéis do recorte.
    pub pontos: &'a [f64],
    /// Índice do primeiro ponto de cada anel (`n_aneis + 1`).
    pub aneis: &'a [u32],
    /// Índice do primeiro anel de cada polígono (`n_poligonos + 1`); o primeiro anel de cada polígono é o externo.
    pub poligonos: &'a [u32],
}

fn crescente(v: &[u32], total: usize) -> bool {
    !v.is_empty() && v[0] == 0 && v[v.len() - 1] as usize == total && v.windows(2).all(|w| w[1] >= w[0])
}

/// Toda a lógica da ABI sem ponteiros. Saídas: as de `retorno_planos` (meta F64 de 8, vértices F64, índices U32).
pub fn retorno_ext_planos(e: &EntradaRetornoExtAbi) -> Result<Vec<Saida>, (u32, String)> {
    retorno_ext_planos_cur(e, None)
}

/// `retorno_ext_planos` com parede curva opcional (raio assinado).
pub fn retorno_ext_planos_cur(e: &EntradaRetornoExtAbi, curva: Option<f64>) -> Result<Vec<Saida>, (u32, String)> {
    let b = &e.base;
    let (modo, base_livre) = match b.modo {
        0 => (ModoRetorno::Contorno, false),
        1 => (ModoRetorno::Ombreiras, false),
        2 => (ModoRetorno::Contorno, true),
        m => return Err((ENTRADA, format!("modo do retorno invalido ({m})"))),
    };
    if ![b.x, b.soleira, b.espessura, b.espessura_acabamento, b.recuo, b.y0, b.y1].iter().all(|v| escalar_ok(*v)) {
        return Err((ENTRADA, "escalar nao finito ou fora de +-1e6 m".into()));
    }
    if b.recuo < 0.0 {
        return Err((ENTRADA, "recuo negativo".into()));
    }
    if e.pontos.len() % 2 != 0 || e.aneis.is_empty() || e.poligonos.is_empty() {
        return Err((ENTRADA, "tamanhos dos buffers do recorte incoerentes".into()));
    }
    let (n_pts, n_aneis, n_pols) = (e.pontos.len() / 2, e.aneis.len() - 1, e.poligonos.len() - 1);
    if n_pols > LIMITE_POLIGONOS as usize || n_aneis > LIMITE_ANEIS as usize || n_pts > LIMITE_PONTOS_PLANTA as usize {
        return Err((LIMITE, "recorte grande demais".into()));
    }
    if !crescente(e.aneis, n_pts) || !crescente(e.poligonos, n_aneis) {
        return Err((ENTRADA, "offsets do recorte invalidos".into()));
    }
    if e.aneis.windows(2).any(|w| w[1] - w[0] > LIMITE_PONTOS_POR_ANEL) {
        return Err((LIMITE, format!("pontos por anel do recorte demais (> {LIMITE_PONTOS_POR_ANEL})")));
    }
    if e.pontos.iter().any(|v| !escalar_ok(*v)) {
        return Err((ENTRADA, "recorte com coordenada nao finita ou fora de +-1e6 m".into()));
    }
    let contorno = contorno_de(b.pontos)?;
    debug_assert!(contorno.len() as u32 <= LIMITE_PONTOS_POR_VAO);
    let anel = |r: usize| -> Vec<[f64; 2]> { e.pontos[2 * e.aneis[r] as usize..2 * e.aneis[r + 1] as usize].chunks_exact(2).map(|p| [p[0], p[1]]).collect() };
    let recorte: Vec<PoligonoPlanta> = (0..n_pols).map(|j| (e.poligonos[j] as usize..e.poligonos[j + 1] as usize).map(anel).collect()).collect();
    let vao = Vao { contorno, x: b.x, soleira: b.soleira };
    let entrada = EntradaRetorno { espessura_pedida: b.espessura, espessura_acabamento: b.espessura_acabamento, y0: b.y0, y1: b.y1, modo };
    if let Some(r) = curva {
        if !escalar_ok(r) {
            return Err((ENTRADA, "raio nao finito ou fora de +-1e6 m".into()));
        }
    }
    let r = retorno_do_vao_curvo(&vao, &entrada, b.recuo, base_livre, &recorte, curva).map_err(erro_da_quant)?;
    Ok(vec![
        Saida::F64(vec![r.espessura, if r.limitada { 1.0 } else { 0.0 }, r.y0, r.y1, r.area_anel, r.area_livre, r.volume, r.area_exposta]),
        Saida::F64(r.vertices),
        Saida::U32(r.indices),
    ])
}

#[no_mangle]
pub extern "C" fn furo_retorno_ext_abi_versao() -> u32 {
    VERSAO_ABI_RETORNO_EXT
}

/// Retorno do acabamento com base livre e recorte em planta. `modo`: 0 contorno inteiro, 1 ombreiras, 2 contorno sem a faixa
/// da base. Recorte: `n_poligonos` polígonos de planta [u, s] (0 = sem recorte), no layout de `furo_prisma_furar`. 0 OK, 3 ENTRADA, 5 LIMITE, 6 INTERNO.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn furo_retorno_vao_ext(
    n_pontos: u32,
    ptr_pontos: u32,
    x: f64,
    soleira: f64,
    espessura: f64,
    espessura_acabamento: f64,
    recuo: f64,
    y0: f64,
    y1: f64,
    modo: u32,
    n_poligonos: u32,
    n_aneis: u32,
    n_pontos_rec: u32,
    ptr_pontos_rec: u32,
    ptr_aneis: u32,
    ptr_poligonos: u32,
) -> u32 {
    retorno_por_ponteiros(n_pontos, ptr_pontos, x, soleira, espessura, espessura_acabamento, recuo, y0, y1, modo, n_poligonos, n_aneis, n_pontos_rec, ptr_pontos_rec, ptr_aneis, ptr_poligonos, None)
}

/// Versão do layout de `furo_retorno_vao_curvo`.
pub const VERSAO_ABI_RETORNO_CURVO: u32 = 1;

#[no_mangle]
pub extern "C" fn furo_retorno_curvo_abi_versao() -> u32 {
    VERSAO_ABI_RETORNO_CURVO
}

/// `furo_retorno_vao_ext` em parede curva (docs/estudo-esquadrias/33 §4): os 16 primeiros argumentos são os de `furo_retorno_vao_ext`
/// (`x` = comprimento de eixo, `y0`/`y1` = lateral s, `recorte` no referencial local u, s) e `raio` é o raio assinado `k * R`.
/// A malha sai no referencial local da parede.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn furo_retorno_vao_curvo(
    n_pontos: u32,
    ptr_pontos: u32,
    x: f64,
    soleira: f64,
    espessura: f64,
    espessura_acabamento: f64,
    recuo: f64,
    y0: f64,
    y1: f64,
    modo: u32,
    n_poligonos: u32,
    n_aneis: u32,
    n_pontos_rec: u32,
    ptr_pontos_rec: u32,
    ptr_aneis: u32,
    ptr_poligonos: u32,
    raio: f64,
) -> u32 {
    retorno_por_ponteiros(n_pontos, ptr_pontos, x, soleira, espessura, espessura_acabamento, recuo, y0, y1, modo, n_poligonos, n_aneis, n_pontos_rec, ptr_pontos_rec, ptr_aneis, ptr_poligonos, Some(raio))
}

#[allow(clippy::too_many_arguments)]
fn retorno_por_ponteiros(
    n_pontos: u32,
    ptr_pontos: u32,
    x: f64,
    soleira: f64,
    espessura: f64,
    espessura_acabamento: f64,
    recuo: f64,
    y0: f64,
    y1: f64,
    modo: u32,
    n_poligonos: u32,
    n_aneis: u32,
    n_pontos_rec: u32,
    ptr_pontos_rec: u32,
    ptr_aneis: u32,
    ptr_poligonos: u32,
    curva: Option<f64>,
) -> u32 {
    let st = estado();
    st.saida_liberar();
    if n_pontos > LIMITE_PONTOS_POR_VAO {
        return st.falha(LIMITE, &format!("pontos por vao demais ({n_pontos} > {LIMITE_PONTOS_POR_VAO})"));
    }
    for (n, max, nome) in [(n_poligonos, LIMITE_POLIGONOS, "poligonos do recorte"), (n_aneis, LIMITE_ANEIS, "aneis do recorte"), (n_pontos_rec, LIMITE_PONTOS_PLANTA, "pontos do recorte")] {
        if n > max {
            return st.falha(LIMITE, &format!("{nome} demais ({n} > {max})"));
        }
    }
    let (Some(pontos), Some(pontos_rec), Some(aneis), Some(poligonos)) = (
        fatia::<f64>(ptr_pontos, 2 * n_pontos as usize),
        fatia::<f64>(ptr_pontos_rec, 2 * n_pontos_rec as usize),
        fatia::<u32>(ptr_aneis, n_aneis as usize + 1),
        fatia::<u32>(ptr_poligonos, n_poligonos as usize + 1),
    ) else {
        return st.falha(ENTRADA, "ponteiro invalido");
    };
    // Sem recorte (n_poligonos = 0) o decodificador recebe offsets vazios: um único `0` em cada buffer de offsets.
    st.guardar(retorno_ext_planos_cur(&EntradaRetornoExtAbi { base: EntradaRetornoAbi { pontos, x, soleira, espessura, espessura_acabamento, recuo, y0, y1, modo }, pontos: pontos_rec, aneis, poligonos }, curva))
}

