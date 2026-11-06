//! Sombras em cascata (CSM) do Sol: divisão do volume de visão da câmera, matriz ortográfica de cada
//! cascata e o buffer `CascatasGpu` que o passe principal lê (binding 9 de `shader.wgsl`).
//!
//! **Divisão.** `NUMERO_CASCATAS` segmentos entre o plano próximo `n` e `D`, com `LAMBDA_DIVISAO` =
//! 0,75 (mistura da divisão logarítmica e da uniforme, como em Zhang et al. 2006):
//! `s_k = λ · n · (D/n)^(k/K) + (1 − λ) · (n + (D − n) · k/K)`. `D` é a distância do olho ao canto
//! da caixa dos projetores mais distante, limitada pelo plano distante da câmera. A última cascata
//! vai de `s_{K−1}` até o plano distante. A janela dela continua presa à caixa (abaixo), então o
//! custo não cresce com o plano distante (a casa de referência tem plano distante de 2000 m).
//!
//! **Janela.** Cada cascata usa a menor entre a esfera envolvente do seu subfrustum e a esfera da
//! caixa dos projetores (com folga). A luz é direcional, então o raio do receptor até o Sol tem a
//! mesma posição XY no espaço da luz que o receptor, e um projetor que sombreia um ponto da janela
//! está dentro da janela. Fora da caixa não há projetor: prender a janela à caixa não perde sombra.
//!
//! **Estabilização.** O centro da janela (XY no espaço da luz) é arredondado a um texel. O raio da
//! esfera depende só da forma do subfrustum, não da posição da câmera: andar com a câmera não muda
//! o texel nem a escala da janela, só desloca o centro, que é arredondado.
//!
//! **Mistura.** `FRACAO_MISTURA` (10%) do intervalo de cada cascata, no fim dela, mistura com a
//! seguinte (`fator_sombra` em `shader.wgsl`). Por isso a cascata k+1 começa antes de `s_{k+1}`.
//!
//! Tudo aqui depende só da câmera e do Sol: as cascatas são iguais em todos os tiles de um render.

use bytemuck::{Pod, Zeroable};
use render_core::camera::Camera;
use render_core::matematica::{inverter, transformar, Mat4};

use crate::constantes::LADO_SOMBRA;
use crate::erro::ErroRender;
use crate::geometria::Caixa;
use crate::matrizes::colunas_f32;

/// Número de cascatas. Igual a `CASCATAS` em `shader.wgsl` (teste de sincronia).
pub const NUMERO_CASCATAS: usize = 3;
/// Peso da divisão logarítmica na divisão do volume de visão (o resto é uniforme).
pub const LAMBDA_DIVISAO: f64 = 0.75;
/// Fração do intervalo de cada cascata usada para misturar com a próxima. Igual a `FRACAO_MISTURA`
/// em `shader.wgsl` (teste de sincronia).
pub const FRACAO_MISTURA: f64 = 0.10;

/// Folga sobre o raio da esfera de um subfrustum (contra a imprecisão na borda da janela).
const FOLGA_SUBFRUSTUM: f64 = 1.02;
/// Folga sobre o raio da caixa dos projetores: a mesma de antes do CSM, então o texel da caixa é o
/// texel do mapa único de antes (`texel_referencia_m`).
const FOLGA_CAIXA: f64 = 1.05;
/// Folga em profundidade, em metros, nos dois extremos do volume de cada cascata.
const FOLGA_PROFUNDIDADE_M: f64 = 0.05;

/// Cantos do quadrado do recorte, em NDC, na ordem das arestas (perto e longe pareados por índice).
const QUADRA: [(f64, f64); 4] = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)];

type V3 = [f64; 3];

/// Uma cascata já calculada, em unidades da luz.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Cascata {
    /// Matriz da luz (coluna maior): leva o mundo ao recorte da cascata, profundidade em 0..1.
    pub luz_vp: Mat4,
    /// Extensão do volume da luz em profundidade, em metros (de `zmax` a `zmin`).
    pub profundidade_m: f64,
    /// Metros por texel no plano da luz (a janela tem `LADO_SOMBRA` texels).
    pub texel_m: f64,
    /// Intervalo de profundidade de visão em que esta cascata é a principal (`inicio..fim`, sem
    /// contar a mistura, que começa antes de `fim`).
    pub inicio: f64,
    pub fim: f64,
    /// Centro da janela no espaço da luz (X, Y), em metros. Múltiplo de `texel_m`.
    pub centro: [f64; 2],
}

/// Planejamento de todas as cascatas de uma câmera e de um Sol.
#[derive(Clone, Debug)]
pub struct Planejamento {
    pub cascatas: [Cascata; NUMERO_CASCATAS],
    /// `s_0` (plano próximo) até `s_K` (plano distante). Os `K` primeiros são os limites das
    /// cascatas; o último é o plano distante, usado só para o último intervalo.
    pub limites: [f64; NUMERO_CASCATAS + 1],
    /// Metros por texel do mapa único de antes (caixa inteira, folga de 1,05). Escala as distâncias
    /// do PCSS, para que a penumbra física e os limites dela sejam os mesmos de antes.
    pub texel_referencia_m: f64,
    /// Direção da câmera para a frente (unitária) e posição do olho.
    pub frente: V3,
    pub posicao: V3,
}

/// Uma cascata no formato do buffer (std140-like, 256 bytes por cascata, alinhamento do offset
/// dinâmico da GPU). Espelha `CascataGpu` em `shader.wgsl`.
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct CascataGpu {
    /// Matriz da luz, coluna maior.
    pub luz_vp: [[f32; 4]; 4],
    /// (profundidade do volume em m, metros por texel, reservado, reservado).
    pub faixa: [f32; 4],
    /// Preenche a cascata até 256 bytes.
    pub reservado: [[f32; 4]; 11],
}

/// Buffer de cascatas (binding 9 do passe principal). Espelha `CascatasGpu` em `shader.wgsl`. O
/// passe de sombra lê cada `luz_vp` do mesmo buffer, num offset múltiplo de 256 (binding 10).
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct CascatasGpu {
    pub cascatas: [CascataGpu; NUMERO_CASCATAS],
    /// Direção da câmera para a frente (w livre). Profundidade de visão = (mundo - olho) · frente.
    pub frente: [f32; 4],
    /// `s_0..s_K` (K + 1 valores, o resto zero), quatro por vetor.
    pub limites: [[f32; 4]; 2],
    /// (metros por texel de referência, reservado, reservado, reservado).
    pub referencia: [f32; 4],
}

// Os limites precisam caber em dois vetores (K + 1 <= 8).
const _: () = assert!(NUMERO_CASCATAS < 8);

impl Planejamento {
    /// Empacota o planejamento no formato do buffer da GPU.
    pub fn para_gpu(&self) -> CascatasGpu {
        let mut gpu = CascatasGpu::zeroed();
        for (k, cascata) in self.cascatas.iter().enumerate() {
            gpu.cascatas[k].luz_vp = colunas_f32(&cascata.luz_vp);
            gpu.cascatas[k].faixa = [
                cascata.profundidade_m as f32,
                cascata.texel_m as f32,
                0.0,
                0.0,
            ];
        }
        gpu.frente = [
            self.frente[0] as f32,
            self.frente[1] as f32,
            self.frente[2] as f32,
            0.0,
        ];
        for (i, limite) in self.limites.iter().enumerate() {
            gpu.limites[i / 4][i % 4] = *limite as f32;
        }
        gpu.referencia = [self.texel_referencia_m as f32, 0.0, 0.0, 0.0];
        gpu
    }
}

/// Divisão do intervalo `[perto, longe]` em `NUMERO_CASCATAS` segmentos (`s_0..s_K`), com
/// `LAMBDA_DIVISAO`. Estritamente crescente quando `0 < perto < longe`.
pub fn dividir(perto: f64, longe: f64) -> [f64; NUMERO_CASCATAS + 1] {
    let mut s = [0.0; NUMERO_CASCATAS + 1];
    for (k, valor) in s.iter_mut().enumerate() {
        let t = k as f64 / NUMERO_CASCATAS as f64;
        let logaritmica = perto * (longe / perto).powf(t);
        let uniforme = perto + (longe - perto) * t;
        *valor = LAMBDA_DIVISAO * logaritmica + (1.0 - LAMBDA_DIVISAO) * uniforme;
    }
    s[0] = perto;
    s[NUMERO_CASCATAS] = longe;
    s
}

/// Planeja as cascatas de `camera` para a caixa `caixa` dos projetores e a direção `sol` (para o
/// Sol, unitária). Erro explícito quando a câmera não tem volume de visão válido.
pub fn planejar(camera: &Camera, caixa: Caixa, sol: V3) -> Result<Planejamento, ErroRender> {
    let (cantos_perto, cantos_longe, frente) = cantos_do_frustum(camera)?;
    let posicao = [camera.posicao.x, camera.posicao.y, camera.posicao.z];
    let profundidade = |p: V3| dot(sub(p, posicao), frente);

    let perto = cantos_perto
        .iter()
        .map(|&p| profundidade(p))
        .fold(f64::INFINITY, f64::min);
    let longe = cantos_longe
        .iter()
        .map(|&p| profundidade(p))
        .fold(f64::NEG_INFINITY, f64::max);
    if !(perto.is_finite() && longe.is_finite() && perto > 0.0 && longe > perto) {
        return Err(ErroRender::Gpu(
            "volume de visão da câmera inválido para as sombras em cascata".into(),
        ));
    }

    let cantos_caixa = cantos_da_caixa(caixa);
    let profundidade_caixa = cantos_caixa
        .iter()
        .map(|&p| profundidade(p))
        .fold(f64::NEG_INFINITY, f64::max);
    // A divisão cobre até o canto mais distante da caixa; além disso a última cascata segue até o
    // plano distante (com a janela presa à caixa).
    let distancia_divisao = if profundidade_caixa > perto {
        profundidade_caixa.min(longe)
    } else {
        longe
    };
    let s = dividir(perto, distancia_divisao);
    let mut limites = [0.0; NUMERO_CASCATAS + 1];
    limites[..NUMERO_CASCATAS].copy_from_slice(&s[..NUMERO_CASCATAS]);
    limites[NUMERO_CASCATAS] = longe;

    let sol = unitario(sol).ok_or_else(|| ErroRender::Gpu("direção do Sol nula".into()))?;
    let (ex, ey, ez) = base_da_luz(sol);
    let na_luz = |p: V3| [dot(p, ex), dot(p, ey), dot(p, ez)];

    // Texel do mapa único de antes: a caixa inteira com a folga de 1,05.
    let h_caixa = caixa.raio() * FOLGA_CAIXA;
    let texel_referencia_m = 2.0 * h_caixa / LADO_SOMBRA as f64;
    let centro_caixa = na_luz(caixa.centro());

    let mut cascatas = [Cascata::default(); NUMERO_CASCATAS];
    for (k, cascata) in cascatas.iter_mut().enumerate() {
        let inicio = if k == 0 {
            limites[0]
        } else {
            limites[k] - FRACAO_MISTURA * (limites[k] - limites[k - 1])
        };
        let fim = limites[k + 1];
        let subfrustum = fatia_do_frustum(&cantos_perto, &cantos_longe, inicio, fim, &profundidade)?;

        let centro_mundo = media(&subfrustum);
        let raio_fatia = subfrustum
            .iter()
            .map(|&p| norm(sub(p, centro_mundo)))
            .fold(0.0, f64::max);
        // Janela: a menor entre a esfera do subfrustum e a da caixa.
        let (h, centro_luz) = if raio_fatia * FOLGA_SUBFRUSTUM < h_caixa {
            (raio_fatia * FOLGA_SUBFRUSTUM, na_luz(centro_mundo))
        } else {
            (h_caixa, centro_caixa)
        };
        let texel = 2.0 * h / LADO_SOMBRA as f64;
        // Estabilização: centro arredondado ao texel. A janela tem LADO_SOMBRA texels, e como LADO é
        // par, a borda também cai num múltiplo do texel.
        let cx = (centro_luz[0] / texel).round() * texel;
        let cy = (centro_luz[1] / texel).round() * texel;

        // Profundidade: o subfrustum e a caixa precisam caber. Os receptores do subfrustum estão na
        // envoltória convexa dos seus cantos; os projetores, na da caixa.
        let mut zmin = f64::INFINITY;
        let mut zmax = f64::NEG_INFINITY;
        for &p in subfrustum.iter().chain(cantos_caixa.iter()) {
            let z = dot(p, ez);
            zmin = zmin.min(z);
            zmax = zmax.max(z);
        }
        zmin -= FOLGA_PROFUNDIDADE_M;
        zmax += FOLGA_PROFUNDIDADE_M;
        let profundidade_m = zmax - zmin;

        // Ortográfica da luz, profundidade 0 (perto do Sol, zmax) a 1 (longe, zmin). Linhas em
        // ordem de saída: X, Y, profundidade. Coluna maior no fim.
        let linhas = [
            [ex[0] / h, ex[1] / h, ex[2] / h, -cx / h],
            [ey[0] / h, ey[1] / h, ey[2] / h, -cy / h],
            [
                -ez[0] / profundidade_m,
                -ez[1] / profundidade_m,
                -ez[2] / profundidade_m,
                zmax / profundidade_m,
            ],
            [0.0, 0.0, 0.0, 1.0],
        ];
        let mut luz_vp = [0.0; 16];
        for (linha, valores) in linhas.iter().enumerate() {
            for (coluna, valor) in valores.iter().enumerate() {
                luz_vp[coluna * 4 + linha] = *valor;
            }
        }

        *cascata = Cascata {
            luz_vp,
            profundidade_m,
            texel_m: texel,
            inicio,
            fim,
            centro: [cx, cy],
        };
    }

    Ok(Planejamento {
        cascatas,
        limites,
        texel_referencia_m,
        frente,
        posicao,
    })
}

/// Cantos do volume de visão em mundo: quatro do plano próximo e quatro do distante, pareados por
/// aresta (mesma ordem de `QUADRA`). Também devolve a direção da câmera para a frente.
fn cantos_do_frustum(camera: &Camera) -> Result<([V3; 4], [V3; 4], V3), ErroRender> {
    // Forward = -(terceira linha da visão), porque a visão é olhar_para (linha z = -frente).
    let frente = unitario([-camera.view[2], -camera.view[6], -camera.view[10]])
        .ok_or_else(|| ErroRender::Gpu("direção da câmera inválida para as sombras".into()))?;
    let inversa = inverter(&camera.matriz_vp())
        .ok_or_else(|| ErroRender::Gpu("matriz de vista-projeção da câmera não é invertível".into()))?;
    let perto = QUADRA.map(|(x, y)| desprojetar(&inversa, x, y, -1.0));
    let longe = QUADRA.map(|(x, y)| desprojetar(&inversa, x, y, 1.0));
    Ok((perto, longe, frente))
}

/// Ponto de um subfrustum: os quatro pontos das arestas na profundidade `inicio` (primeiros) e
/// `fim` (últimos). O subfrustum tem 8 cantos.
fn fatia_do_frustum(
    cantos_perto: &[V3; 4],
    cantos_longe: &[V3; 4],
    inicio: f64,
    fim: f64,
    profundidade: &dyn Fn(V3) -> f64,
) -> Result<[V3; 8], ErroRender> {
    let mut saida = [[0.0; 3]; 8];
    for i in 0..4 {
        let (near, far) = (cantos_perto[i], cantos_longe[i]);
        let (d_near, d_far) = (profundidade(near), profundidade(far));
        if d_far - d_near <= 1.0e-12 {
            return Err(ErroRender::Gpu(
                "aresta do volume de visão sem profundidade para as sombras".into(),
            ));
        }
        saida[i] = na_aresta(near, far, d_near, d_far, inicio);
        saida[4 + i] = na_aresta(near, far, d_near, d_far, fim);
    }
    Ok(saida)
}

/// Ponto da aresta `near..far` na profundidade `d` (a profundidade cresce linearmente na aresta).
fn na_aresta(near: V3, far: V3, d_near: f64, d_far: f64, d: f64) -> V3 {
    let t = (d - d_near) / (d_far - d_near);
    [
        near[0] + (far[0] - near[0]) * t,
        near[1] + (far[1] - near[1]) * t,
        near[2] + (far[2] - near[2]) * t,
    ]
}

/// Ponto de NDC (WebGL, z em -1..1) levado ao mundo pela inversa de `view_projection`.
fn desprojetar(inversa: &Mat4, x: f64, y: f64, z: f64) -> V3 {
    let v = transformar(inversa, [x, y, z, 1.0]);
    [v[0] / v[3], v[1] / v[3], v[2] / v[3]]
}

/// Oito cantos da caixa.
fn cantos_da_caixa(caixa: Caixa) -> [V3; 8] {
    let mut saida = [[0.0; 3]; 8];
    for (i, canto) in saida.iter_mut().enumerate() {
        for (eixo, valor) in canto.iter_mut().enumerate() {
            *valor = if (i >> eixo) & 1 == 1 {
                caixa.maximo[eixo]
            } else {
                caixa.minimo[eixo]
            };
        }
    }
    saida
}

/// Base ortonormal da luz: `ez` é a direção para o Sol; `ex` e `ey` completam a base.
fn base_da_luz(ez: V3) -> (V3, V3, V3) {
    let cima = if ez[2].abs() > 0.98 {
        [0.0, 1.0, 0.0]
    } else {
        [0.0, 0.0, 1.0]
    };
    let ex = unitario(cross(cima, ez)).unwrap_or([1.0, 0.0, 0.0]);
    let ey = cross(ez, ex);
    (ex, ey, ez)
}

fn media(pontos: &[V3; 8]) -> V3 {
    let mut soma = [0.0; 3];
    for p in pontos {
        for eixo in 0..3 {
            soma[eixo] += p[eixo];
        }
    }
    [soma[0] / 8.0, soma[1] / 8.0, soma[2] / 8.0]
}

fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot(a: V3, b: V3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn cross(a: V3, b: V3) -> V3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn norm(a: V3) -> f64 {
    dot(a, a).sqrt()
}

fn unitario(a: V3) -> Option<V3> {
    let n = norm(a);
    (n.is_finite() && n > 1.0e-12).then(|| [a[0] / n, a[1] / n, a[2] / n])
}

#[cfg(test)]
mod testes {
    use super::*;
    use render_core::cena::Sol;
    use render_core::vetor::Vec3;
    use std::mem::size_of;

    const SHADER: &str = include_str!("shader.wgsl");

    fn camera(olho: [f64; 3], alvo: [f64; 3]) -> Camera {
        Camera::olhando_para(
            Vec3::novo(olho[0], olho[1], olho[2]),
            Vec3::novo(alvo[0], alvo[1], alvo[2]),
            Vec3::novo(0.0, 0.0, 1.0),
            45.0_f64.to_radians(),
            16.0 / 9.0,
            0.14,
            2000.0,
        )
        .expect("câmera de teste")
    }

    /// Caixa do tamanho da casa de referência (13,4 x 15,6 x 8 m, sobre o chão).
    fn casa() -> Caixa {
        Caixa {
            minimo: [-0.8, -0.8, 0.5],
            maximo: [12.6, 14.8, 7.8],
        }
    }

    /// Direção para o Sol de azimute 324 e elevação 52 graus (a da cena de prova).
    fn sol() -> V3 {
        let d = Sol {
            azimute: 324.46,
            elevacao: 51.97,
            intensidade: 1.0,
        }
        .direcao();
        [d.x, d.y, d.z]
    }

    /// Transforma um ponto do mundo pela matriz da cascata e devolve o NDC (já dividido por w).
    fn ndc(luz_vp: &Mat4, p: V3) -> [f64; 3] {
        let v = transformar(luz_vp, [p[0], p[1], p[2], 1.0]);
        [v[0] / v[3], v[1] / v[3], v[2] / v[3]]
    }

    #[test]
    fn frente_da_camera_aponta_para_o_alvo() {
        let cam = camera([0.0, -5.0, 2.0], [0.0, 0.0, 2.0]);
        let (_, _, frente) = cantos_do_frustum(&cam).unwrap();
        assert!((frente[0]).abs() < 1.0e-9 && (frente[1] - 1.0).abs() < 1.0e-9 && frente[2].abs() < 1.0e-9);
    }

    #[test]
    fn divisao_e_monotona_e_comeca_e_termina_nos_extremos() {
        for (perto, longe) in [(0.14, 2000.0), (0.14, 20.0), (1.0, 5.0), (0.05, 1000.0)] {
            let s = dividir(perto, longe);
            assert_eq!(s[0], perto);
            assert_eq!(s[NUMERO_CASCATAS], longe);
            for k in 0..NUMERO_CASCATAS {
                assert!(s[k + 1] > s[k], "limite {k} não cresce: {s:?}");
            }
        }
    }

    #[test]
    fn divisao_com_lambda_um_e_logaritmica() {
        // Com λ = 1 a divisão seria só a logarítmica; aqui o peso de 0,75 fica entre as duas.
        let (perto, longe) = (0.5, 500.0);
        let s = dividir(perto, longe);
        let log = perto * (longe / perto).powf(1.0 / NUMERO_CASCATAS as f64);
        let uni = perto + (longe - perto) / NUMERO_CASCATAS as f64;
        assert!((s[1] - (LAMBDA_DIVISAO * log + (1.0 - LAMBDA_DIVISAO) * uni)).abs() < 1.0e-9);
    }

    #[test]
    fn cascatas_cobrem_o_volume_de_visao_sem_buracos() {
        let cam = camera([9.5, -11.5, 7.0], [0.0, 0.0, 2.0]);
        let plano = planejar(&cam, casa(), sol()).unwrap();
        // O primeiro limite é o plano próximo (0,14 m); o último, o plano distante (2000 m).
        assert!((plano.limites[0] - 0.14).abs() < 1.0e-6, "limite inicial {}", plano.limites[0]);
        assert!((plano.limites[NUMERO_CASCATAS] - 2000.0).abs() < 1.0e-6);
        for k in 0..NUMERO_CASCATAS {
            assert!(plano.limites[k + 1] > plano.limites[k]);
        }
        for k in 0..NUMERO_CASCATAS {
            // Cada cascata cobre seu intervalo principal e começa antes do limite (mistura).
            let c = plano.cascatas[k];
            assert!((c.fim - plano.limites[k + 1]).abs() < 1.0e-9);
            assert!(c.inicio <= plano.limites[k] + 1.0e-9);
            if k > 0 {
                assert!(c.inicio < plano.limites[k], "a mistura da cascata {k} não começa antes do limite");
            }
        }
    }

    #[test]
    fn cada_cascata_cobre_seu_subfrustum() {
        let cam = camera([9.5, -11.5, 7.0], [0.0, 0.0, 2.0]);
        let plano = planejar(&cam, casa(), sol()).unwrap();
        let (perto, longe, frente) = cantos_do_frustum(&cam).unwrap();
        let posicao = [cam.posicao.x, cam.posicao.y, cam.posicao.z];
        let profundidade = |p: V3| dot(sub(p, posicao), frente);
        for (k, c) in plano.cascatas.iter().enumerate() {
            let fatia = fatia_do_frustum(&perto, &longe, c.inicio, c.fim, &profundidade).unwrap();
            let dentro_xy = |n: [f64; 3]| n[0].abs() <= 1.0 + 1.0e-9 && n[1].abs() <= 1.0 + 1.0e-9;
            // A janela é o subfrustum inteiro ou a caixa dos projetores inteira. Fora da caixa não há
            // projetor, então um subfrustum maior que a caixa pode ficar parcialmente fora da janela.
            let caixa_na_janela = cantos_da_caixa(casa())
                .iter()
                .all(|&p| dentro_xy(ndc(&c.luz_vp, p)));
            let fatia_na_janela = fatia.iter().all(|&p| dentro_xy(ndc(&c.luz_vp, p)));
            assert!(
                caixa_na_janela || fatia_na_janela,
                "cascata {k}: nem a caixa nem o subfrustum cabem na janela"
            );
            for p in fatia {
                let n = ndc(&c.luz_vp, p);
                assert!((-1.0e-9..=1.0 + 1.0e-9).contains(&n[2]), "cascata {k}: profundidade fora ({n:?})");
            }
        }
    }

    #[test]
    fn caixa_dos_projetores_esta_no_volume_de_todas_as_cascatas() {
        let cam = camera([9.5, -11.5, 7.0], [0.0, 0.0, 2.0]);
        let plano = planejar(&cam, casa(), sol()).unwrap();
        for c in &plano.cascatas {
            for p in cantos_da_caixa(casa()) {
                let n = ndc(&c.luz_vp, p);
                assert!((-1.0e-9..=1.0 + 1.0e-9).contains(&n[2]), "caixa fora da profundidade: {n:?}");
            }
        }
    }

    #[test]
    fn estabilizacao_centro_e_multiplo_do_texel() {
        let cam = camera([9.5, -11.5, 7.0], [0.0, 0.0, 2.0]);
        let plano = planejar(&cam, casa(), sol()).unwrap();
        for (k, c) in plano.cascatas.iter().enumerate() {
            for eixo in 0..2 {
                let quociente = c.centro[eixo] / c.texel_m;
                assert!(
                    (quociente - quociente.round()).abs() < 1.0e-6,
                    "cascata {k}, eixo {eixo}: centro {} não é múltiplo do texel {}",
                    c.centro[eixo],
                    c.texel_m
                );
            }
        }
    }

    #[test]
    fn mover_a_camera_um_pouco_muda_o_texel_pouco() {
        // O tamanho da janela depende da forma do subfrustum (invariante a translação) e da profundidade
        // da caixa, que entra na divisão: 1 cm de deslocamento muda o texel de forma contínua e pequena.
        let cam = camera([9.5, -11.5, 7.0], [0.0, 0.0, 2.0]);
        let movida = camera([9.51, -11.5, 7.0], [0.0, 0.0, 2.0]);
        let a = planejar(&cam, casa(), sol()).unwrap();
        let b = planejar(&movida, casa(), sol()).unwrap();
        for k in 0..NUMERO_CASCATAS {
            let relativo = (a.cascatas[k].texel_m - b.cascatas[k].texel_m).abs() / a.cascatas[k].texel_m;
            assert!(relativo < 1.0e-3, "cascata {k}: texel variou {relativo:e} com 1 cm de deslocamento");
        }
    }

    #[test]
    fn texel_nao_cresce_da_longe_para_a_perto() {
        let cam = camera([9.5, -11.5, 7.0], [0.0, 0.0, 2.0]);
        let plano = planejar(&cam, casa(), sol()).unwrap();
        let t: Vec<f64> = plano.cascatas.iter().map(|c| c.texel_m).collect();
        for k in 0..NUMERO_CASCATAS - 1 {
            assert!(t[k] <= t[k + 1] + 1.0e-12, "texel {k} ({}) maior que o de {} ({})", t[k], k + 1, t[k + 1]);
        }
        assert!(t[0] < t[NUMERO_CASCATAS - 1], "a cascata mais perto não é mais fina: {t:?}");
    }

    #[test]
    fn texel_de_referencia_e_o_do_mapa_unico_de_antes() {
        let cam = camera([9.5, -11.5, 7.0], [0.0, 0.0, 2.0]);
        let plano = planejar(&cam, casa(), sol()).unwrap();
        let antes = 2.0 * casa().raio() * 1.05 / LADO_SOMBRA as f64;
        assert!((plano.texel_referencia_m - antes).abs() < 1.0e-12);
    }

    #[test]
    fn buffer_de_cascatas_tem_o_layout_do_shader() {
        // 256 bytes por cascata (offset dinâmico de 256), 816 + 16 de referência no fim.
        assert_eq!(size_of::<CascataGpu>(), 256);
        assert_eq!(size_of::<CascatasGpu>(), NUMERO_CASCATAS * 256 + 64);
        assert_eq!(size_of::<CascatasGpu>() % 16, 0);
    }

    #[test]
    fn constantes_batem_com_o_shader() {
        let valor = |nome: &str| -> f64 {
            let trecho = format!("const {nome}");
            let inicio = SHADER.find(&trecho).expect("constante no shader");
            let depois = &SHADER[inicio..];
            let igual = depois.find('=').expect("sinal de igual") + 1;
            let fim = depois.find(';').expect("fim da constante");
            let texto = depois[igual..fim].trim().trim_end_matches("u").trim_end_matches('f');
            texto.parse().expect("número")
        };
        assert_eq!(valor("CASCATAS: u32") as usize, NUMERO_CASCATAS);
        assert!((valor("FRACAO_MISTURA: f32") - FRACAO_MISTURA).abs() < 1.0e-12);
    }
}
