//! Furo por contorno sobre o PRISMA EM PLANTA da camada (docs/estudo-esquadrias/25-furo-prisma-abi.md).
//!
//! `furar_parede` (furo_contorno.rs) fura uma placa `L x e x H`. A camada real, depois da junção, é um polígono
//! em planta (esquadrejado, com cantos em esquadria ou chanfro, possivelmente vazado) extrudado entre `z0` e
//! `z1`. Aqui o alvo da booleana é esse prisma: o cortador é o contorno do vão ([x, z]) extrudado na direção
//! s, atravessando a camada com folga. Nada de faixas nem colunas.
//!
//! Referencial (o da parede): u ao longo, s na espessura, z para cima. Na malha de saída, x = u, y = s, z = z.
//! Cada camada é um multipolígono em planta: polígonos, cada um com anel externo (primeiro) e furos.
//! Orientação de entrada livre: o anel externo é normalizado para anti-horário e os furos para horário.
//!
//! Validação (antes de qualquer booleana, porque o `manifold-rust` pode entrar em panic e o produto compila
//! com `panic = "abort"`): contornos de vão com as regras de `furo_contorno` (`validar_anel`); cada anel de
//! planta é simples (mesma função); furos dentro do externo, sem tocar nem cruzar o externo ou outros furos.

use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE};
use crate::furo_contorno::{area_com_sinal, segmentos_se_tocam, unir, validar_anel, ErroFuro, Vao};
use manifold_rust::linalg::{Vec2, Vec3};
use manifold_rust::manifold::Manifold;
use manifold_rust::types::{Error as ErroManifold, OpType};

/// Folga (m) do cortador além do prisma em s, para não deixar faces coplanares.
const FOLGA_S: f64 = 0.05;

/// Topo inclinado de uma camada (perfil superior da parede, docs/estudo-esquadrias/33): plano que depende só de u,
/// `z(u) = h0 + (h1 - h0) (u - t0) / (t1 - t0)`. A camada vai de `z0` até esse plano (`z1` é a maior altura).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TopoInclinado {
    pub t0: f64,
    pub t1: f64,
    pub h0: f64,
    pub h1: f64,
}

/// O que fazer com o vão que sai (em parte) do envelope das camadas.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ForaDoEnvelope {
    /// `VaoForaDaParede` (o comportamento de `furar_prisma`).
    Recusar,
    /// A booleana remove só o que cabe: o cortador que passa do prisma não leva nada além dele.
    Recortar,
}

/// Um polígono em planta: anel externo + furos, em [u, s] (m).
pub type PoligonoPlanta = Vec<Vec<[f64; 2]>>;

/// Uma camada: multipolígono em planta + faixa de z.
#[derive(Debug, Clone)]
pub struct CamadaPrisma {
    pub poligonos: Vec<PoligonoPlanta>,
    pub z0: f64,
    pub z1: f64,
}

#[derive(Debug, Clone, Default)]
pub struct MalhaPrisma {
    pub z0: f64,
    pub z1: f64,
    /// x, y, z intercalados (m); x = u, y = s.
    pub vertices: Vec<f64>,
    pub indices: Vec<u32>,
    pub volume: f64,
    /// Área líquida da planta x (z1 - z0).
    pub volume_sem_furo: f64,
}

#[derive(Debug, Clone, Default)]
pub struct ResultadoPrisma {
    pub camadas: Vec<MalhaPrisma>,
    pub volume: f64,
    pub volume_removido: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ErroPrisma {
    /// Sem camadas.
    SemCamadas,
    /// z0/z1 não finitos ou z1 <= z0 (camada i).
    AlturaInvalida(usize),
    /// Camada sem polígono, polígono sem anel ou área líquida nula (camada i).
    PlantaVazia(usize),
    /// Anel de planta inválido (camada i, número do anel dentro da camada, motivo de `validar_anel`).
    AnelPlanta(usize, usize, ErroFuro),
    /// Furo fora do externo, ou aneis do mesmo polígono que se tocam/cruzam (camada i, polígono j).
    AneisInconsistentes(usize, usize),
    /// Erro de vão (contorno, x, soleira, ou fora do envelope do conjunto de camadas).
    Vao(ErroFuro),
    /// Parede curva inválida (raio, vão angular demais, topo inclinado junto com curva).
    Curva(String),
    Manifold(String),
}

fn orientar(anel: &[[f64; 2]], ccw: bool) -> Vec<[f64; 2]> {
    let mut v = anel.to_vec();
    if (area_com_sinal(&v) > 0.0) != ccw {
        v.reverse();
    }
    v
}

/// Ponto dentro do anel (ray casting; o ponto não está sobre o anel, o que já foi garantido por "não tocar").
fn ponto_dentro(p: [f64; 2], anel: &[[f64; 2]]) -> bool {
    let mut dentro = false;
    let n = anel.len();
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0] {
            dentro = !dentro;
        }
    }
    dentro
}

fn aneis_se_tocam(a: &[[f64; 2]], b: &[[f64; 2]]) -> bool {
    for i in 0..a.len() {
        let (p, q) = (a[i], a[(i + 1) % a.len()]);
        for j in 0..b.len() {
            if segmentos_se_tocam(p, q, b[j], b[(j + 1) % b.len()]) {
                return true;
            }
        }
    }
    false
}

/// Valida e normaliza a planta de uma camada; devolve (polígonos orientados, área líquida).
pub(crate) fn preparar_planta(k: usize, c: &CamadaPrisma) -> Result<(Vec<PoligonoPlanta>, f64), ErroPrisma> {
    if !(c.z0.is_finite() && c.z1.is_finite() && c.z1 > c.z0) {
        return Err(ErroPrisma::AlturaInvalida(k));
    }
    if c.poligonos.is_empty() || c.poligonos.iter().any(|p| p.is_empty()) {
        return Err(ErroPrisma::PlantaVazia(k));
    }
    let mut saida = Vec::with_capacity(c.poligonos.len());
    let mut area = 0.0;
    let mut n_anel = 0usize;
    for (j, pol) in c.poligonos.iter().enumerate() {
        let mut aneis: Vec<Vec<[f64; 2]>> = Vec::with_capacity(pol.len());
        for (r, anel) in pol.iter().enumerate() {
            // validar_anel exige anti-horário; a orientação final (furo = horário) vem depois.
            let ccw = orientar(anel, true);
            validar_anel(n_anel, &ccw).map_err(|e| ErroPrisma::AnelPlanta(k, n_anel, e))?;
            n_anel += 1;
            area += if r == 0 { area_com_sinal(&ccw) } else { -area_com_sinal(&ccw) };
            aneis.push(if r == 0 { ccw } else { orientar(anel, false) });
        }
        for r in 1..aneis.len() {
            if !ponto_dentro(aneis[r][0], &aneis[0]) || aneis_se_tocam(&aneis[0], &aneis[r]) {
                return Err(ErroPrisma::AneisInconsistentes(k, j));
            }
            for s in (r + 1)..aneis.len() {
                if aneis_se_tocam(&aneis[r], &aneis[s]) || ponto_dentro(aneis[s][0], &aneis[r]) || ponto_dentro(aneis[r][0], &aneis[s]) {
                    return Err(ErroPrisma::AneisInconsistentes(k, j));
                }
            }
        }
        saida.push(aneis);
    }
    if area <= 1e-12 {
        return Err(ErroPrisma::PlantaVazia(k));
    }
    Ok((saida, area))
}

/// Cortador: contorno [x, z] extrudado em y cobrindo `[s0 - FOLGA_S, s1 + FOLGA_S]`.
fn cortador(v: &Vao, s0: f64, s1: f64) -> Manifold {
    let anel: Vec<Vec2> = v.contorno.iter().map(|p| Vec2::new(p[0], p[1])).collect();
    let profundidade = (s1 - s0) + 2.0 * FOLGA_S;
    // Mesma construção de `furo_contorno::cortador`: extrude em +z, rotate(90,0,0) leva (x,y,z) a (x,-z,y).
    Manifold::extrude(&vec![anel], profundidade, 0, 0.0, Vec2::new(1.0, 1.0))
        .rotate(90.0, 0.0, 0.0)
        .translate(Vec3::new(v.x, s1 + FOLGA_S, v.soleira))
}

/// Ângulo máximo (rad) que um vão pode abranger numa parede curva: o tampo externo do cortador é uma corda e o raio dele
/// cresce com `1 / cos(meio ângulo)`; acima disso o cortador ficaria enorme.
pub const ANGULO_MAX_VAO: f64 = 2.4;
/// Menor |raio| (m) aceito na parede curva.
pub const RAIO_MIN: f64 = 0.05;

/// Mapa da parede curva (docs/estudo-esquadrias/33 §4): `(t, s)` (comprimento do eixo e deslocamento lateral à esquerda) para o
/// referencial local (u, s) da parede, em que `a` é a origem e `u` a tangente em `a`. `raio` é assinado (`k * R`, `k = +1` com o
/// centro à direita do percurso). O centro é `(0, -raio)`; o ponto é `centro + rho (cos th, sin th)` com
/// `th = k pi/2 - t/raio` e `rho = R + k s`. Preserva a orientação (jacobiano `rho / R > 0`).
pub(crate) fn mapa_curvo(raio: f64, t: f64, s: f64) -> [f64; 2] {
    let k = raio.signum();
    let th = k * std::f64::consts::FRAC_PI_2 - t / raio;
    let rho = raio.abs() + k * s;
    [rho * th.cos(), -raio + rho * th.sin()]
}

/// Inverso de `mapa_curvo` para um ponto próximo de `t_ref`: `(t, s)`.
pub(crate) fn mapa_curvo_inverso(raio: f64, p: [f64; 2], t_ref: f64) -> (f64, f64) {
    let k = raio.signum();
    let (dx, dy) = (p[0], p[1] + raio);
    let rho = dx.hypot(dy);
    let th = dy.atan2(dx);
    let th_ref = k * std::f64::consts::FRAC_PI_2 - t_ref / raio;
    let mut d = th - th_ref;
    d = (d + std::f64::consts::PI).rem_euclid(2.0 * std::f64::consts::PI) - std::f64::consts::PI;
    (t_ref - d * raio, k * (rho - raio.abs()))
}

/// Cortador radial em leque: o contorno [x, z] (x = comprimento de eixo) extrudado na lateral, de `rho_lo` a `rho_hi`, e
/// levado ao referencial local pelo `mapa_curvo` (a face lateral de cada ponto do contorno é radial). O tampo externo é
/// plano entre vértices: `rho_hi` já vem dividido por `cos(meio ângulo)` para a corda não entrar na camada.
fn cortador_curvo(v: &Vao, raio: f64, rho_lo: f64, rho_hi: f64) -> Manifold {
    let k = raio.signum();
    // s = k rho - raio  (pois rho = R + k s e raio = k R).
    let (s_a, s_b) = (k * rho_lo - raio, k * rho_hi - raio);
    let (sa, sb) = (s_a.min(s_b), s_a.max(s_b));
    let anel: Vec<Vec2> = v.contorno.iter().map(|p| Vec2::new(p[0], p[1])).collect();
    Manifold::extrude(&vec![anel], sb - sa, 0, 0.0, Vec2::new(1.0, 1.0))
        .rotate(90.0, 0.0, 0.0)
        .translate(Vec3::new(v.x, sb, v.soleira))
        .warp(move |p: &mut Vec3| {
            let q = mapa_curvo(raio, p.x, p.y);
            p.x = q[0];
            p.y = q[1];
        })
}

/// Fura cada camada (prisma em planta entre z0 e z1) com a união dos cortadores dos vãos.
pub fn furar_prisma(camadas: &[CamadaPrisma], vaos: &[Vao]) -> Result<ResultadoPrisma, ErroPrisma> {
    furar_prisma_gen(camadas, &[], vaos, ForaDoEnvelope::Recusar)
}

/// Plano do topo inclinado válido para a camada `c`: finito, `t1 > t0` e alturas dentro de `[z0, z1]`.
fn topo_valido(c: &CamadaPrisma, t: &TopoInclinado) -> bool {
    let e = 1e-9;
    [t.t0, t.t1, t.h0, t.h1].iter().all(|v| v.is_finite())
        && t.t1 > t.t0
        && t.h0.min(t.h1) >= c.z0 - e
        && t.h0.max(t.h1) <= c.z1 + e
        && t.h0.max(t.h1) > c.z0 + e
}

/// Corta o prisma (já extrudado até `z1`) pelo plano do topo, mantendo o que está abaixo.
fn aparar_pelo_topo(prisma: Manifold, t: &TopoInclinado) -> Manifold {
    let k = (t.h1 - t.h0) / (t.t1 - t.t0);
    let n = (1.0 + k * k).sqrt();
    // Mantém z <= h0 + k (u - t0): normal (k, 0, -1)/n, deslocamento (k t0 - h0)/n.
    prisma.trim_by_plane(Vec3::new(k / n, 0.0, -1.0 / n), (k * t.t0 - t.h0) / n)
}

/// Como `furar_prisma`, com topo inclinado opcional por camada (`topos` vazio ou do tamanho de `camadas`) e política para
/// o vão que sai do envelope.
pub fn furar_prisma_gen(camadas: &[CamadaPrisma], topos: &[Option<TopoInclinado>], vaos: &[Vao], fora: ForaDoEnvelope) -> Result<ResultadoPrisma, ErroPrisma> {
    furar_prisma_cur(camadas, topos, vaos, fora, None)
}

/// Como `furar_prisma_gen`, com parede curva opcional (`curva` = raio assinado `k * R`, docs/estudo-esquadrias/33 §4): a planta
/// das camadas está no referencial local (u, s) da parede (origem em `a`, `u` = tangente em `a`), o `x` de cada vão é o
/// comprimento de eixo e o cortador é radial em leque (`cortador_curvo`). Em parede curva o vão que sai do envelope é sempre
/// recortado (a posição em u não é o comprimento de eixo) e o topo inclinado não é aceito.
pub fn furar_prisma_cur(camadas: &[CamadaPrisma], topos: &[Option<TopoInclinado>], vaos: &[Vao], fora: ForaDoEnvelope, curva: Option<f64>) -> Result<ResultadoPrisma, ErroPrisma> {
    if let Some(r) = curva {
        if !(r.is_finite() && r.abs() >= RAIO_MIN) {
            return Err(ErroPrisma::Curva(format!("raio invalido ({r})")));
        }
        if topos.iter().any(|t| t.is_some()) {
            return Err(ErroPrisma::Curva("topo inclinado nao e aceito em parede curva".into()));
        }
    }
    let fora = if curva.is_some() { ForaDoEnvelope::Recortar } else { fora };
    if camadas.is_empty() {
        return Err(ErroPrisma::SemCamadas);
    }
    if !topos.is_empty() && topos.len() != camadas.len() {
        return Err(ErroPrisma::AlturaInvalida(topos.len().min(camadas.len())));
    }
    let topo_de = |k: usize| -> Option<TopoInclinado> { topos.get(k).copied().flatten() };
    let mut preparadas = Vec::with_capacity(camadas.len());
    // Envelope do conjunto (u e z) para validar que o vão está na parede.
    let (mut u0, mut u1, mut zmin, mut zmax) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
    for (k, c) in camadas.iter().enumerate() {
        let (pols, area) = preparar_planta(k, c)?;
        if let Some(t) = topo_de(k) {
            if !topo_valido(c, &t) {
                return Err(ErroPrisma::AlturaInvalida(k));
            }
        }
        for p in pols.iter().flat_map(|p| p[0].iter()) {
            u0 = u0.min(p[0]);
            u1 = u1.max(p[0]);
        }
        zmin = zmin.min(c.z0);
        zmax = zmax.max(c.z1);
        preparadas.push((pols, area));
    }
    for (i, v) in vaos.iter().enumerate() {
        if !v.x.is_finite() || !v.soleira.is_finite() {
            return Err(ErroPrisma::Vao(ErroFuro::ContornoInvalido(i)));
        }
        validar_anel(i, &v.contorno).map_err(ErroPrisma::Vao)?;
        let e = 1e-9;
        let (mut a0, mut a1, mut b0, mut b1) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
        for p in &v.contorno {
            a0 = a0.min(v.x + p[0]);
            a1 = a1.max(v.x + p[0]);
            b0 = b0.min(v.soleira + p[1]);
            b1 = b1.max(v.soleira + p[1]);
        }
        if fora == ForaDoEnvelope::Recusar && (a0 < u0 - e || a1 > u1 + e || b0 < zmin - e || b1 > zmax + e) {
            return Err(ErroPrisma::Vao(ErroFuro::VaoForaDaParede(i)));
        }
        if let Some(r) = curva {
            if (a1 - a0) / r.abs() > ANGULO_MAX_VAO {
                return Err(ErroPrisma::Curva(format!("vao {i} abrange mais de {ANGULO_MAX_VAO} rad na parede curva")));
            }
        }
    }
    // Faixa de raios das camadas (parede curva): o cortador cobre `[rho_lo, rho_hi]` com folga.
    let faixa_rho = curva.map(|r| {
        let (mut lo, mut hi) = (f64::MAX, f64::MIN);
        for (pols, _) in &preparadas {
            for p in pols.iter().flat_map(|p| p[0].iter()) {
                let rho = p[0].hypot(p[1] + r);
                lo = lo.min(rho);
                hi = hi.max(rho);
            }
        }
        (lo, hi)
    });

    let mut res = ResultadoPrisma::default();
    for (k, (c, (pols, area))) in camadas.iter().zip(preparadas).enumerate() {
        let (mut s0, mut s1) = (f64::MAX, f64::MIN);
        for p in pols.iter().flat_map(|p| p[0].iter()) {
            s0 = s0.min(p[1]);
            s1 = s1.max(p[1]);
        }
        let secao: Vec<Vec<Vec2>> = pols.iter().flatten().map(|a| a.iter().map(|p| Vec2::new(p[0], p[1])).collect()).collect();
        let mut prisma = Manifold::extrude(&secao, c.z1 - c.z0, 0, 0.0, Vec2::new(1.0, 1.0)).translate(Vec3::new(0.0, 0.0, c.z0));
        if let Some(t) = topo_de(k) {
            prisma = aparar_pelo_topo(prisma, &t);
        }
        if prisma.status() != ErroManifold::NoError {
            return Err(ErroPrisma::Manifold(format!("prisma: {:?}", prisma.status())));
        }
        let cortadores: Vec<Manifold> = match (curva, faixa_rho) {
            (Some(r), Some((lo, hi))) => vaos
                .iter()
                .map(|v| {
                    let xs = v.contorno.iter().map(|p| p[0]);
                    let meio_ang = (xs.clone().fold(f64::MIN, f64::max) - xs.fold(f64::MAX, f64::min)) / r.abs() / 2.0;
                    let rho_lo = (lo - FOLGA_S).max(0.5 * lo);
                    cortador_curvo(v, r, rho_lo, hi / meio_ang.cos() + FOLGA_S)
                })
                .collect(),
            _ => vaos.iter().map(|v| cortador(v, s0, s1)).collect(),
        };
        let furada = match unir(cortadores) {
            Some(cut) => prisma.boolean(&cut, OpType::Subtract),
            None => prisma.clone(),
        };
        if furada.status() != ErroManifold::NoError {
            return Err(ErroPrisma::Manifold(format!("{:?}", furada.status())));
        }
        let malha = furada.get_mesh_gl64(-1);
        let n_prop = malha.num_prop as usize;
        let mut vertices = Vec::with_capacity(malha.vert_properties.len() / n_prop.max(1) * 3);
        for v in malha.vert_properties.chunks(n_prop.max(3)) {
            vertices.extend_from_slice(&v[..3]);
        }
        let indices: Vec<u32> = malha.tri_verts.iter().map(|&i| i as u32).collect();
        let volume = furada.volume();
        // Com topo inclinado o volume sem furo é o do prisma aparado (kernel); sem ele, área líquida x altura.
        let volume_sem_furo = if topo_de(k).is_some() { prisma.volume() } else { area * (c.z1 - c.z0) };
        res.volume += volume;
        res.volume_removido += volume_sem_furo - volume;
        res.camadas.push(MalhaPrisma { z0: c.z0, z1: c.z1, vertices, indices, volume, volume_sem_furo });
    }
    Ok(res)
}

// ---------------------------------------------------------------------------------------------
// ABI: `furo_prisma_furar` (layout em docs/estudo-esquadrias/25-furo-prisma-abi.md)
// ---------------------------------------------------------------------------------------------

/// Versão do layout desta ABI.
pub const VERSAO_ABI_PRISMA: u32 = 1;
pub const LIMITE_VAOS: u32 = crate::furo_contorno_abi::LIMITE_VAOS;
pub const LIMITE_PONTOS_VAO: u32 = crate::furo_contorno_abi::LIMITE_PONTOS;
pub const LIMITE_PONTOS_POR_VAO: u32 = crate::furo_contorno_abi::LIMITE_PONTOS_POR_VAO;
pub const LIMITE_CAMADAS: u32 = crate::furo_contorno_abi::LIMITE_CAMADAS;
/// Nº máximo de polígonos de planta, somando as camadas.
pub const LIMITE_POLIGONOS: u32 = 1024;
/// Nº máximo de anéis de planta, somando as camadas.
pub const LIMITE_ANEIS: u32 = 4096;
/// Nº máximo de pontos de planta, somando todos os anéis.
pub const LIMITE_PONTOS_PLANTA: u32 = 65_536;
/// Nº máximo de pontos de um anel de planta (auto-interseção O(n^2)).
pub const LIMITE_PONTOS_POR_ANEL: u32 = 4096;

/// Entradas decodificadas (slices sobre os buffers planos).
pub struct EntradasPrisma<'a> {
    /// u, s intercalados de todos os anéis de planta (2 * n_pontos_planta f64).
    pub pontos_planta: &'a [f64],
    /// Índice do primeiro ponto de cada anel; `n_aneis + 1` u32, o último é `n_pontos_planta`.
    pub aneis: &'a [u32],
    /// Índice do primeiro anel de cada polígono (o primeiro é o externo); `n_poligonos + 1` u32.
    pub poligonos: &'a [u32],
    /// Índice do primeiro polígono de cada camada; `n_camadas + 1` u32.
    pub camadas: &'a [u32],
    /// z0, z1 intercalados de cada camada (2 * n_camadas f64).
    pub z: &'a [f64],
    /// Vãos, como em `furo_contorno_abi::Entradas`.
    pub pontos: &'a [f64],
    pub vaos: &'a [u32],
    pub x: &'a [f64],
    pub soleira: &'a [f64],
}

fn crescente(v: &[u32], total: usize) -> bool {
    !v.is_empty() && v[0] == 0 && v[v.len() - 1] as usize == total && v.windows(2).all(|w| w[1] >= w[0])
}

fn erro_do_prisma(e: ErroPrisma) -> (u32, String) {
    use crate::esquema::INTERNO;
    match e {
        ErroPrisma::SemCamadas => (ENTRADA, "a parede precisa de pelo menos uma camada".into()),
        ErroPrisma::AlturaInvalida(k) => (ENTRADA, format!("z0/z1 invalidos na camada {k}")),
        ErroPrisma::PlantaVazia(k) => (ENTRADA, format!("planta vazia ou sem area na camada {k}")),
        ErroPrisma::AnelPlanta(k, a, e) => (ENTRADA, format!("anel de planta {a} invalido na camada {k} ({e:?})")),
        ErroPrisma::AneisInconsistentes(k, j) => (ENTRADA, format!("aneis do poligono {j} da camada {k} se tocam, se cruzam ou o furo sai do externo")),
        ErroPrisma::Vao(e) => match e {
            ErroFuro::ContornoInvalido(i) => (ENTRADA, format!("contorno invalido no vao {i}")),
            ErroFuro::PontoRepetido(i) => (ENTRADA, format!("contorno com pontos repetidos consecutivos no vao {i}")),
            ErroFuro::AutoInterseccao(i) => (ENTRADA, format!("contorno auto-intersectado no vao {i}")),
            ErroFuro::VaoForaDaParede(i) => (ENTRADA, format!("vao {i} sai da parede")),
            outro => (ENTRADA, format!("vao invalido ({outro:?})")),
        },
        ErroPrisma::Curva(m) => (ENTRADA, format!("parede curva: {m}")),
        ErroPrisma::Manifold(s) => (INTERNO, format!("kernel: {s}")),
    }
}

/// Toda a lógica da ABI sem ponteiros. Saída: os mesmos 5 arrays de `furo_contorno_abi::furar_planos`, com
/// `[z0, z1, volume, volume_sem_furo]` por camada no array 0 (no lugar de `[y0, y1, ...]`).
pub fn furar_prisma_planos(e: &EntradasPrisma) -> Result<Vec<Saida>, (u32, String)> {
    furar_prisma_planos_gen(e, &[], ForaDoEnvelope::Recusar)
}

/// `furar_prisma_planos` com topo inclinado e política de vão fora do envelope (docs/estudo-esquadrias/33). `topo` é vazio
/// (sem topo inclinado) ou tem 4 f64 por camada `[t0, t1, h0, h1]`; `t1 <= t0` (por exemplo, tudo zero) = camada sem topo inclinado.
pub fn furar_prisma_planos_gen(e: &EntradasPrisma, topo: &[f64], fora: ForaDoEnvelope) -> Result<Vec<Saida>, (u32, String)> {
    furar_prisma_planos_cur(e, topo, fora, None)
}

/// `furar_prisma_planos_gen` com parede curva opcional (`curva` = raio assinado, docs/estudo-esquadrias/33 §4).
pub fn furar_prisma_planos_cur(e: &EntradasPrisma, topo: &[f64], fora: ForaDoEnvelope, curva: Option<f64>) -> Result<Vec<Saida>, (u32, String)> {
    let n_vaos = e.x.len();
    let n_camadas = e.camadas.len().saturating_sub(1);
    if e.pontos_planta.len() % 2 != 0
        || e.pontos.len() % 2 != 0
        || e.soleira.len() != n_vaos
        || e.vaos.len() != n_vaos + 1
        || e.z.len() != 2 * n_camadas
        || e.aneis.is_empty()
        || e.poligonos.is_empty()
        || e.camadas.is_empty()
    {
        return Err((ENTRADA, "tamanhos dos buffers incoerentes".into()));
    }
    let (n_pts_planta, n_pts_vao) = (e.pontos_planta.len() / 2, e.pontos.len() / 2);
    let (n_aneis, n_pols) = (e.aneis.len() - 1, e.poligonos.len() - 1);
    let lim = |n: usize, max: u32, nome: &str| if n > max as usize { Err((LIMITE, format!("{nome} demais ({n} > {max})"))) } else { Ok(()) };
    lim(n_vaos, LIMITE_VAOS, "vaos")?;
    lim(n_pts_vao, LIMITE_PONTOS_VAO, "pontos de vao")?;
    lim(n_camadas, LIMITE_CAMADAS, "camadas")?;
    lim(n_pols, LIMITE_POLIGONOS, "poligonos")?;
    lim(n_aneis, LIMITE_ANEIS, "aneis")?;
    lim(n_pts_planta, LIMITE_PONTOS_PLANTA, "pontos de planta")?;
    if n_camadas == 0 {
        return Err((ENTRADA, "a parede precisa de pelo menos uma camada".into()));
    }
    if !topo.is_empty() && topo.len() != 4 * n_camadas {
        return Err((ENTRADA, "buffer do topo inclinado incoerente (4 f64 por camada)".into()));
    }
    if !crescente(e.vaos, n_pts_vao) || !crescente(e.aneis, n_pts_planta) || !crescente(e.poligonos, n_aneis) || !crescente(e.camadas, n_pols) {
        return Err((ENTRADA, "offsets invalidos".into()));
    }
    if e.vaos.windows(2).any(|w| w[1] - w[0] > LIMITE_PONTOS_POR_VAO) {
        return Err((LIMITE, format!("pontos por vao demais (> {LIMITE_PONTOS_POR_VAO})")));
    }
    if e.aneis.windows(2).any(|w| w[1] - w[0] > LIMITE_PONTOS_POR_ANEL) {
        return Err((LIMITE, format!("pontos por anel de planta demais (> {LIMITE_PONTOS_POR_ANEL})")));
    }
    let anel = |r: usize| -> Vec<[f64; 2]> {
        e.pontos_planta[2 * e.aneis[r] as usize..2 * e.aneis[r + 1] as usize].chunks_exact(2).map(|p| [p[0], p[1]]).collect()
    };
    let camadas: Vec<CamadaPrisma> = (0..n_camadas)
        .map(|k| CamadaPrisma {
            poligonos: (e.camadas[k] as usize..e.camadas[k + 1] as usize)
                .map(|j| (e.poligonos[j] as usize..e.poligonos[j + 1] as usize).map(anel).collect())
                .collect(),
            z0: e.z[2 * k],
            z1: e.z[2 * k + 1],
        })
        .collect();
    let vaos: Vec<Vao> = (0..n_vaos)
        .map(|i| Vao {
            contorno: e.pontos[2 * e.vaos[i] as usize..2 * e.vaos[i + 1] as usize].chunks_exact(2).map(|p| [p[0], p[1]]).collect(),
            x: e.x[i],
            soleira: e.soleira[i],
        })
        .collect();

    let topos: Vec<Option<TopoInclinado>> = topo
        .chunks_exact(4)
        .map(|q| if q[1] > q[0] { Some(TopoInclinado { t0: q[0], t1: q[1], h0: q[2], h1: q[3] }) } else { None })
        .collect();
    let res = furar_prisma_cur(&camadas, &topos, &vaos, fora, curva).map_err(erro_do_prisma)?;
    let mut meta = Vec::with_capacity(4 * n_camadas);
    let mut contagens = Vec::with_capacity(2 * n_camadas);
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    for c in &res.camadas {
        meta.extend_from_slice(&[c.z0, c.z1, c.volume, c.volume_sem_furo]);
        contagens.extend_from_slice(&[(c.vertices.len() / 3) as u32, c.indices.len() as u32]);
        vertices.extend_from_slice(&c.vertices);
        indices.extend_from_slice(&c.indices);
    }
    Ok(vec![Saida::F64(meta), Saida::U32(contagens), Saida::F64(vertices), Saida::U32(indices), Saida::F64(vec![res.volume, res.volume_removido])])
}

#[no_mangle]
pub extern "C" fn furo_prisma_abi_versao() -> u32 {
    VERSAO_ABI_PRISMA
}

/// Argumentos de ponteiro e tamanho de `furo_prisma_furar`, decodificados e limitados antes de ler qualquer ponteiro.
#[allow(clippy::too_many_arguments)]
fn furar_por_ponteiros(
    n_camadas: u32, n_poligonos: u32, n_aneis: u32, n_pontos_planta: u32, ptr_pontos_planta: u32, ptr_aneis: u32, ptr_poligonos: u32, ptr_camadas: u32, ptr_z: u32,
    n_vaos: u32, n_pontos: u32, ptr_pontos: u32, ptr_vaos: u32, ptr_x: u32, ptr_soleira: u32, ptr_topo: Option<u32>, fora: ForaDoEnvelope, curva: Option<f64>,
) -> u32 {
    use crate::furo_contorno_abi::{estado, fatia};
    let st = estado();
    st.saida_liberar();
    // Limites checados antes de qualquer leitura de ponteiro (os tamanhos vêm do JS).
    for (n, max, nome) in [
        (n_vaos, LIMITE_VAOS, "vaos"),
        (n_pontos, LIMITE_PONTOS_VAO, "pontos de vao"),
        (n_camadas, LIMITE_CAMADAS, "camadas"),
        (n_poligonos, LIMITE_POLIGONOS, "poligonos"),
        (n_aneis, LIMITE_ANEIS, "aneis"),
        (n_pontos_planta, LIMITE_PONTOS_PLANTA, "pontos de planta"),
    ] {
        if n > max {
            return st.falha(LIMITE, &format!("{nome} demais ({n} > {max})"));
        }
    }
    let (nv, nc) = (n_vaos as usize, n_camadas as usize);
    let (Some(pontos_planta), Some(aneis), Some(poligonos), Some(camadas), Some(z), Some(pontos), Some(vaos), Some(x), Some(soleira)) = (
        fatia::<f64>(ptr_pontos_planta, 2 * n_pontos_planta as usize),
        fatia::<u32>(ptr_aneis, n_aneis as usize + 1),
        fatia::<u32>(ptr_poligonos, n_poligonos as usize + 1),
        fatia::<u32>(ptr_camadas, nc + 1),
        fatia::<f64>(ptr_z, 2 * nc),
        fatia::<f64>(ptr_pontos, 2 * n_pontos as usize),
        fatia::<u32>(ptr_vaos, nv + 1),
        fatia::<f64>(ptr_x, nv),
        fatia::<f64>(ptr_soleira, nv),
    ) else {
        return st.falha(ENTRADA, "ponteiro invalido");
    };
    let topo: &[f64] = match ptr_topo {
        None => &[],
        Some(p) => match fatia::<f64>(p, 4 * nc) {
            Some(t) => t,
            None => return st.falha(ENTRADA, "ponteiro invalido"),
        },
    };
    st.guardar(furar_prisma_planos_cur(&EntradasPrisma { pontos_planta, aneis, poligonos, camadas, z, pontos, vaos, x, soleira }, topo, fora, curva))
}

/// Fura camadas em prisma de planta. Layout dos buffers: docs/estudo-esquadrias/25. Retorno: 0 OK, 3 ENTRADA,
/// 5 LIMITE, 6 INTERNO. Saídas e erro pelos accessors `furo_saida_*` e `furo_erro_*` (os mesmos de `furo_contorno_furar`).
#[no_mangle]
pub extern "C" fn furo_prisma_furar(
    n_camadas: u32,
    n_poligonos: u32,
    n_aneis: u32,
    n_pontos_planta: u32,
    ptr_pontos_planta: u32,
    ptr_aneis: u32,
    ptr_poligonos: u32,
    ptr_camadas: u32,
    ptr_z: u32,
    n_vaos: u32,
    n_pontos: u32,
    ptr_pontos: u32,
    ptr_vaos: u32,
    ptr_x: u32,
    ptr_soleira: u32,
) -> u32 {
    furar_por_ponteiros(
        n_camadas, n_poligonos, n_aneis, n_pontos_planta, ptr_pontos_planta, ptr_aneis, ptr_poligonos, ptr_camadas, ptr_z, n_vaos, n_pontos, ptr_pontos, ptr_vaos, ptr_x, ptr_soleira, None, ForaDoEnvelope::Recusar, None,
    )
}

/// Versão do layout de `furo_prisma_furar_ext`.
pub const VERSAO_ABI_PRISMA_EXT: u32 = 1;

#[no_mangle]
pub extern "C" fn furo_prisma_ext_abi_versao() -> u32 {
    VERSAO_ABI_PRISMA_EXT
}

/// `furo_prisma_furar` com topo inclinado e política de envelope (docs/estudo-esquadrias/33). Os 15 primeiros argumentos
/// são os de `furo_prisma_furar`; `ptr_topo` aponta 4 f64 por camada `[t0, t1, h0, h1]` (`t1 <= t0` = sem topo inclinado);
/// `recortar` 0 = vão fora do envelope é recusado, 1 = o furo remove só a parte que cabe no prisma.
#[no_mangle]
pub extern "C" fn furo_prisma_furar_ext(
    n_camadas: u32,
    n_poligonos: u32,
    n_aneis: u32,
    n_pontos_planta: u32,
    ptr_pontos_planta: u32,
    ptr_aneis: u32,
    ptr_poligonos: u32,
    ptr_camadas: u32,
    ptr_z: u32,
    n_vaos: u32,
    n_pontos: u32,
    ptr_pontos: u32,
    ptr_vaos: u32,
    ptr_x: u32,
    ptr_soleira: u32,
    ptr_topo: u32,
    recortar: u32,
) -> u32 {
    let fora = if recortar != 0 { ForaDoEnvelope::Recortar } else { ForaDoEnvelope::Recusar };
    furar_por_ponteiros(
        n_camadas, n_poligonos, n_aneis, n_pontos_planta, ptr_pontos_planta, ptr_aneis, ptr_poligonos, ptr_camadas, ptr_z, n_vaos, n_pontos, ptr_pontos, ptr_vaos, ptr_x, ptr_soleira, Some(ptr_topo), fora, None,
    )
}

/// Versão do layout de `furo_prisma_furar_curvo`.
pub const VERSAO_ABI_PRISMA_CURVO: u32 = 1;

#[no_mangle]
pub extern "C" fn furo_prisma_curvo_abi_versao() -> u32 {
    VERSAO_ABI_PRISMA_CURVO
}

/// `furo_prisma_furar` em parede curva (docs/estudo-esquadrias/33 §4). Os 15 primeiros argumentos são os de `furo_prisma_furar`;
/// `raio` é o raio assinado do eixo (`k * R`, `k = +1` quando o centro fica à direita do percurso a -> b, o `sag > 0`). A planta das
/// camadas está no referencial local da parede (origem em `a`, `u` = tangente em `a`, `s` = normal à esquerda) e o `x` de cada
/// vão é o comprimento de eixo; cada vão é cortado em leque radial. O vão que sai do prisma é recortado; sem topo inclinado.
/// `raio` não finito, |raio| < 0,05 m ou vão com mais de 2,4 rad: ENTRADA.
#[no_mangle]
pub extern "C" fn furo_prisma_furar_curvo(
    n_camadas: u32,
    n_poligonos: u32,
    n_aneis: u32,
    n_pontos_planta: u32,
    ptr_pontos_planta: u32,
    ptr_aneis: u32,
    ptr_poligonos: u32,
    ptr_camadas: u32,
    ptr_z: u32,
    n_vaos: u32,
    n_pontos: u32,
    ptr_pontos: u32,
    ptr_vaos: u32,
    ptr_x: u32,
    ptr_soleira: u32,
    raio: f64,
) -> u32 {
    furar_por_ponteiros(
        n_camadas, n_poligonos, n_aneis, n_pontos_planta, ptr_pontos_planta, ptr_aneis, ptr_poligonos, ptr_camadas, ptr_z, n_vaos, n_pontos, ptr_pontos, ptr_vaos, ptr_x, ptr_soleira, None, ForaDoEnvelope::Recortar, Some(raio),
    )
}
