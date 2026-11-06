//! Quantitativos de parede com perfil superior: altura média e volume de faixa.
//!
//! Porta para Rust duas funções do TypeScript:
//! - `perfil_media` ← `profileMean` (packages/model/src/profile.ts): altura média do topo em `[0, comprimento]`.
//! - `volume_faixa` ← `bandVolume` (packages/engine/src/profile.ts): área com furos × altura, no plano
//!   inclinado avaliada no centróide da área.
//!
//! Diferença deliberada: `perfil_media` calcula a integral analítica do perfil linear por trechos, sem o
//! termo `EPS * 1e-3` do TS que avalia o trecho num ponto deslocado. Pontos com o mesmo `t` formam um degrau
//! de largura zero (o TS também o ignora na integral); a altura antes do degrau é o limite pela esquerda.

/// Plano inclinado do topo da faixa, igual a `LayerBand.slope` do TS.
/// Altura relativa em `p`: `h0 + (h1 - h0) * (d·(p - o) - t0) / (t1 - t0)`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Inclinacao {
    pub o: [f64; 2],
    pub d: [f64; 2],
    pub t0: f64,
    pub t1: f64,
    pub h0: f64,
    pub h1: f64,
}

/// Altura média do topo em `[0, comprimento]`: integral do perfil dividida pelo comprimento.
///
/// `pts` são pares `(t, h)`: `t` é a distância ao longo da parede, `h` a altura do topo. Os pontos são
/// ordenados por `t` (estável, então dois pontos com o mesmo `t` mantêm a ordem de entrada e formam um degrau).
/// Fora do intervalo dos pontos, a altura é constante (a do ponto mais próximo).
/// Devolve 0 se não houver pontos ou se `comprimento <= 0`.
pub fn perfil_media(pts: &[(f64, f64)], comprimento: f64) -> f64 {
    if pts.is_empty() || !(comprimento > 0.0) {
        return 0.0;
    }
    let mut p: Vec<(f64, f64)> = pts.to_vec();
    p.sort_by(|a, b| a.0.total_cmp(&b.0));
    let l = comprimento;

    let (t_primeiro, h_primeiro) = p[0];
    let (t_ultimo, h_ultimo) = p[p.len() - 1];

    // Patamar antes do primeiro ponto: vale h_primeiro em [0, min(l, t_primeiro)].
    let mut area = h_primeiro * t_primeiro.min(l).max(0.0);

    // Trechos lineares entre pontos consecutivos, recortados em [0, l].
    for par in p.windows(2) {
        let (ta, fa) = par[0];
        let (tb, fb) = par[1];
        if !(tb > ta) {
            continue; // degrau: largura zero, sem área
        }
        let lo = ta.max(0.0);
        let hi = tb.min(l);
        if hi <= lo {
            continue;
        }
        let altura = |t: f64| fa + (fb - fa) * (t - ta) / (tb - ta);
        // Função linear no trecho: integral exata = média dos extremos × largura.
        area += (altura(lo) + altura(hi)) / 2.0 * (hi - lo);
    }

    // Patamar depois do último ponto: vale h_ultimo em [max(0, t_ultimo), l].
    let lo = t_ultimo.max(0.0);
    if l > lo {
        area += h_ultimo * (l - lo);
    }

    area / l
}

/// Área absoluta de um anel (fórmula do cadarço).
fn area_anel(anel: &[[f64; 2]]) -> f64 {
    let n = anel.len();
    let mut s = 0.0;
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        s += a[0] * b[1] - b[0] * a[1];
    }
    (s / 2.0).abs()
}

/// Área de um multipolígono: por polígono, anel externo menos os furos (igual a `multiArea` do TS).
fn area_multi(m: &[Vec<Vec<[f64; 2]>>]) -> f64 {
    m.iter()
        .map(|poligono| {
            poligono
                .iter()
                .enumerate()
                .map(|(i, anel)| if i == 0 { area_anel(anel) } else { -area_anel(anel) })
                .sum::<f64>()
        })
        .sum()
}

/// Altura do topo em `p`: `z1` sem inclinação, ou a altura do plano inclinado.
fn topo_em(z1: f64, inclinacao: Option<&Inclinacao>, p: [f64; 2]) -> f64 {
    match inclinacao {
        None => z1,
        Some(s) => {
            let k = ((p[0] - s.o[0]) * s.d[0] + (p[1] - s.o[1]) * s.d[1] - s.t0) / (s.t1 - s.t0);
            s.h0 + (s.h1 - s.h0) * k
        }
    }
}

/// Volume de uma faixa vertical (igual a `bandVolume` do TS).
///
/// `m` é a forma em planta (anel externo e furos por polígono), `z0`/`z1` a base e o topo relativos.
/// Sem inclinação, ou com área quase nula (< 1e-12), vale `área × (z1 - z0)`. Com inclinação, a altura é
/// avaliada no centróide da área com furos, que é exata porque a altura é afim.
pub fn volume_faixa(m: &[Vec<Vec<[f64; 2]>>], z0: f64, z1: f64, inclinacao: Option<&Inclinacao>) -> f64 {
    let area = area_multi(m);
    let inc = match inclinacao {
        Some(s) if area >= 1e-12 => s,
        _ => return area * (z1 - z0),
    };

    // Centróide: soma de (centróide do anel × área com sinal), anel externo positivo e furos negativos.
    let mut cx = 0.0;
    let mut cy = 0.0;
    for poligono in m {
        if poligono.is_empty() {
            continue;
        }
        for (i, anel) in poligono.iter().enumerate() {
            let n = anel.len();
            let mut a2 = 0.0;
            let mut sx = 0.0;
            let mut sy = 0.0;
            for j in 0..n {
                let p = anel[j];
                let q = anel[(j + 1) % n];
                let c = p[0] * q[1] - q[0] * p[1];
                a2 += c;
                sx += (p[0] + q[0]) * c;
                sy += (p[1] + q[1]) * c;
            }
            if a2.abs() < 1e-15 {
                continue;
            }
            let sinal = if i == 0 { 1.0 } else { -1.0 };
            let w = (a2.abs() / 2.0) * sinal;
            cx += (sx / (3.0 * a2)) * w;
            cy += (sy / (3.0 * a2)) * w;
        }
    }

    let centroide = [cx / area, cy / area];
    area * (topo_em(z1, Some(inc), centroide) - z0)
}

#[cfg(test)]
mod testes {
    use super::*;

    fn quase(obtido: f64, esperado: f64, tol: f64, rotulo: &str) {
        assert!(
            (obtido - esperado).abs() <= tol,
            "{rotulo}: obtido {obtido}, esperado {esperado} (tol {tol})"
        );
    }

    fn retangulo(x0: f64, y0: f64, x1: f64, y1: f64) -> Vec<Vec<Vec<[f64; 2]>>> {
        vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]]
    }

    #[test]
    fn rampa_media_e_metade_da_altura_final() {
        // Rampa de 0 a 2 m em 10 m: média 1.
        quase(perfil_media(&[(0.0, 0.0), (10.0, 2.0)], 10.0), 1.0, 1e-12, "rampa");
    }

    #[test]
    fn degrau_media_e_ponderada_pelos_trechos() {
        // 5 m a 1 m e 5 m a 3 m: média 2.
        quase(perfil_media(&[(0.0, 1.0), (5.0, 1.0), (5.0, 3.0), (10.0, 3.0)], 10.0), 2.0, 1e-12, "degrau");
    }

    #[test]
    fn um_ponto_devolve_altura_constante() {
        quase(perfil_media(&[(3.0, 2.5)], 7.0), 2.5, 1e-12, "1 ponto");
    }

    #[test]
    fn comprimento_zero_ou_negativo_devolve_zero() {
        assert_eq!(perfil_media(&[(0.0, 1.0), (10.0, 3.0)], 0.0), 0.0);
        assert_eq!(perfil_media(&[(0.0, 1.0), (10.0, 3.0)], -4.0), 0.0);
        assert_eq!(perfil_media(&[], 10.0), 0.0);
    }

    #[test]
    fn seis_perfis_conferidos_a_mao() {
        // (pontos, comprimento, média esperada calculada à mão)
        let casos: [(&[(f64, f64)], f64, f64, &str); 6] = [
            // 1. Patamar 1 m em [0,2], rampa 1→3 em [2,6], patamar 3 m em [6,10]:
            //    (2·1 + 4·2 + 4·3) / 10 = 22 / 10.
            (&[(2.0, 1.0), (6.0, 3.0)], 10.0, 2.2, "patamar + rampa + patamar"),
            // 2. Pontos fora de ordem: ordenados viram rampa 0→4 em 10 m, média 2.
            (&[(10.0, 4.0), (0.0, 0.0)], 10.0, 2.0, "fora de ordem"),
            // 3. Dois degraus: 2·4 + 5·3 + 1·3 = 26 em 10 m.
            (&[(0.0, 2.0), (4.0, 2.0), (4.0, 5.0), (7.0, 5.0), (7.0, 1.0), (10.0, 1.0)], 10.0, 2.6, "dois degraus"),
            // 4. Comprimento 5 < último ponto: h = 1 + 0.2·t em [0,5], média (1 + 2)/2 = 1.5.
            (&[(0.0, 1.0), (10.0, 3.0)], 5.0, 1.5, "comprimento menor que o perfil"),
            // 5. Todos os pontos além de 10 m: patamar 4 m em [0,10] → 4.
            (&[(12.0, 4.0)], 10.0, 4.0, "ponto além do comprimento"),
            // 6. Patamar 3 m em [0,1] (área 3); trecho 3→0 em [1,4] (área 4.5); trecho 0→6 em [4,9]
            //    (área 15); patamar 6 m em [9,10] (área 6). Total 28.5 em 10 m → 2.85.
            (&[(1.0, 3.0), (4.0, 0.0), (9.0, 6.0)], 10.0, 2.85, "vale e subida"),
        ];
        for (pts, l, esperado, rotulo) in casos {
            quase(perfil_media(pts, l), esperado, 1e-9, rotulo);
        }
    }

    #[test]
    fn volume_faixa_retangulo_com_furo_sob_altura_afim() {
        // Retângulo 4 × 2 com furo 1 × 1 (área líquida 7). Altura h(x) = 1 + x/2 (afim).
        // Integral: ∫∫(h - z0) = 7 + 0.5·(16 - 1.5) - 0.5·7 = 14.25 - 3.5 = 10.75 com z0 = 0.5.
        let m = vec![vec![
            vec![[0.0, 0.0], [4.0, 0.0], [4.0, 2.0], [0.0, 2.0]],
            vec![[1.0, 0.5], [2.0, 0.5], [2.0, 1.5], [1.0, 1.5]],
        ]];
        let inc = Inclinacao { o: [0.0, 0.0], d: [1.0, 0.0], t0: 0.0, t1: 4.0, h0: 1.0, h1: 3.0 };
        quase(volume_faixa(&m, 0.5, 9.0, Some(&inc)), 10.75, 1e-9, "retangulo com furo, afim");
    }

    #[test]
    fn volume_faixa_sem_inclinacao_e_area_vezes_altura() {
        // Retângulo 4 × 2 sem furo, altura 3 (z1 - z0): 8 × 3 = 24.
        let m = retangulo(0.0, 0.0, 4.0, 2.0);
        quase(volume_faixa(&m, 0.0, 3.0, None), 24.0, 1e-12, "sem inclinacao");
    }
}
