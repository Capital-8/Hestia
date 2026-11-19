//! Perfil superior variável da parede cortina (método do Lapin, `CurtainWalls.Profiled`): avaliação da polilinha de topo `(t, h)`, simplificação de
//! vértices colineares, recorte de painéis e montantes contra a borda inclinada ou em degrau.

use crate::secoes_cortina::SecoesCortina;

/// Área com sinal de um polígono simples em `(s, z)` (positiva se anti-horário).
pub fn area_poligono_sz(p: &[[f64; 2]]) -> f64 {
    if p.len() < 3 {
        return 0.0;
    }
    let s: f64 = (0..p.len()).map(|k| {
        let q = p[(k + 1) % p.len()];
        p[k][0] * q[1] - q[0] * p[k][1]
    }).sum();
    s / 2.0
}

/// Altura mínima aceita num ponto do perfil (1 cm, como `roofWall.ts`).
const ALTURA_PERFIL_MIN: f64 = 0.01;

/// Altura do perfil `p` na coordenada `u` ao longo do eixo; num degrau vertical (dois pontos no mesmo `u`), `side < 0` devolve o lado esquerdo e
/// `side >= 0` devolve o lado direito (igual ao `TopAt` do Lapin).
pub fn top_at(p: &[[f64; 2]], u: f64, side: i32) -> f64 {
    for w in p.windows(2) {
        let (a, b) = (w[0], w[1]);
        if b[0] - a[0] < 1e-9 {
            continue;
        }
        let inside = if side < 0 {
            a[0] < u - 1e-9 && u <= b[0] + 1e-9
        } else {
            a[0] <= u + 1e-9 && u < b[0] - 1e-9
        };
        if inside {
            return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]);
        }
    }
    if side < 0 {
        p[0][1]
    } else {
        p[p.len() - 1][1]
    }
}

/// Remove pontos duplicados e pontos interiores colineares da polilinha `(t, h)`, preservando degraus verticais e extremos.
pub fn simplificar_perfil(pts: &[[f64; 2]]) -> Vec<[f64; 2]> {
    let mut dedup: Vec<[f64; 2]> = Vec::with_capacity(pts.len());
    for &p in pts {
        if let Some(&ult) = dedup.last() {
            if (p[0] - ult[0]).abs() < 1e-9 && (p[1] - ult[1]).abs() < 1e-9 {
                continue;
            }
            if dedup.len() >= 2 && (p[0] - ult[0]).abs() < 1e-9 && (ult[0] - dedup[dedup.len() - 2][0]).abs() < 1e-9 {
                *dedup.last_mut().unwrap() = p;
                continue;
            }
        }
        dedup.push(p);
    }
    let mut out: Vec<[f64; 2]> = Vec::with_capacity(dedup.len());
    for p in dedup {
        while out.len() >= 2 {
            let a = out[out.len() - 2];
            let b = out[out.len() - 1];
            if b[0] > a[0] + 1e-9 && p[0] > b[0] + 1e-9 {
                let h_lin = a[1] + (p[1] - a[1]) * (b[0] - a[0]) / (p[0] - a[0]);
                if (b[1] - h_lin).abs() < 1e-6 {
                    out.pop();
                    continue;
                }
            }
            break;
        }
        out.push(p);
    }
    out
}

/// Perfil superior normalizado da cortina `id` no trecho efetivo `[r0, r0 + l]` (em coordenadas locais `0..=l` após os recuos de junção).
/// Devolve `None` se a cortina não tem perfil (ou tem menos de 2 pontos).
pub fn perfil_da_cortina(sec: &SecoesCortina, id: u32, r0: f64, l_raw: f64, l: f64) -> Option<Vec<[f64; 2]>> {
    let mut pts: Vec<_> = sec.perfis_topo.values().filter(|p| p.cortina == id).copied().collect();
    if pts.len() < 2 {
        return None;
    }
    pts.sort_by(|a, b| a.t.total_cmp(&b.t).then(a.ordem.cmp(&b.ordem)));
    let mut raw: Vec<[f64; 2]> = pts.into_iter().map(|p| [p.t.clamp(0.0, l_raw), p.h.max(ALTURA_PERFIL_MIN)]).collect();
    if raw[0][0] > 1e-9 {
        raw.insert(0, [0.0, raw[0][1]]);
    }
    if raw[raw.len() - 1][0] < l_raw - 1e-9 {
        raw.push([l_raw, raw[raw.len() - 1][1]]);
    }
    let mut sliced: Vec<[f64; 2]> = if r0 > 1e-9 || r0 + l < l_raw - 1e-9 {
        let mut s = vec![[0.0, top_at(&raw, r0, 1)]];
        for p in &raw {
            if p[0] > r0 + 1e-9 && p[0] < r0 + l - 1e-9 {
                s.push([p[0] - r0, p[1]]);
            }
        }
        s.push([l, top_at(&raw, r0 + l, -1)]);
        s
    } else {
        raw
    };
    sliced = simplificar_perfil(&sliced);
    if sliced.len() < 2 {
        None
    } else {
        Some(sliced)
    }
}

/// Área total da elevação sob a polilinha de perfil `p` (m²).
pub fn area_sob_perfil(p: &[[f64; 2]]) -> f64 {
    p.windows(2).map(|w| 0.5 * (w[0][1] + w[1][1]) * (w[1][0] - w[0][0]).max(0.0)).sum()
}

/// Limpa vértices repetidos e colineares de um polígono simples em `(s, z)` e garante orientação anti-horária.
pub fn limpar_sz(mut p: Vec<[f64; 2]>) -> Vec<[f64; 2]> {
    p.dedup_by(|a, b| (a[0] - b[0]).abs() < 1e-9 && (a[1] - b[1]).abs() < 1e-9);
    while p.len() > 1 && (p[0][0] - p[p.len() - 1][0]).abs() < 1e-9 && (p[0][1] - p[p.len() - 1][1]).abs() < 1e-9 {
        p.pop();
    }
    let mut mudou = true;
    while mudou && p.len() > 3 {
        mudou = false;
        let n = p.len();
        for k in 0..n {
            let (a, b, c) = (p[(k + n - 1) % n], p[k], p[(k + 1) % n]);
            let cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
            if cr.abs() < 1e-11 {
                p.remove(k);
                mudou = true;
                break;
            }
        }
    }
    if area_poligono_sz(&p) < 0.0 {
        p.reverse();
    }
    p
}

/// Recorta um polígono simples pelo semiplano `z >= z_min` (Sutherland-Hodgman).
pub fn recorta_z_min(poly: &[[f64; 2]], z_min: f64) -> Vec<[f64; 2]> {
    if poly.len() < 3 {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(poly.len() + 2);
    let n = poly.len();
    for k in 0..n {
        let (p, q) = (poly[k], poly[(k + 1) % n]);
        let (dp, dq) = (p[1] >= z_min - 1e-11, q[1] >= z_min - 1e-11);
        if dp {
            out.push(p);
        }
        if dp != dq {
            let s = (z_min - p[1]) / (q[1] - p[1]);
            out.push([p[0] + (q[0] - p[0]) * s, z_min]);
        }
    }
    limpar_sz(out)
}

/// Recorte do painel acima da última travessa contra a borda superior inclinada (`ua, ya -> ub, yb`) e sobre `z` (método do Lapin `Clip`).
/// Descarta restos com altura `< 0.02 m`.
pub fn clip_panel(ua: f64, ub: f64, z: f64, ya: f64, yb: f64) -> Option<Vec<[f64; 2]>> {
    if ub - ua < 1e-6 || ya.max(yb) - z < 0.02 {
        return None;
    }
    let raw = if ya >= z && yb >= z {
        vec![[ua, z], [ub, z], [ub, yb], [ua, ya]]
    } else {
        let uc = ua + (ub - ua) * (z - ya) / (yb - ya);
        if ya < z {
            vec![[uc, z], [ub, z], [ub, yb]]
        } else {
            vec![[ua, z], [uc, z], [ua, ya]]
        }
    };
    let clean = limpar_sz(raw);
    if clean.len() < 3 || area_poligono_sz(&clean).abs() < 1e-9 {
        None
    } else {
        Some(clean)
    }
}

/// Recorte de um painel de região possivelmente multi-vão `[ua, ub]` acima de `za` contra a polilinha de perfil `snapped` (descontando `off_top`).
pub fn clip_region_under_profile(ua: f64, ub: f64, za: f64, snapped: &[[f64; 2]], off_top: f64) -> Option<Vec<[f64; 2]>> {
    if ub - ua < 1e-6 {
        return None;
    }
    let y_a = top_at(snapped, ua, 1) - off_top;
    let y_b = top_at(snapped, ub, -1) - off_top;
    let mut y_max = y_a.max(y_b);
    let mut interior: Vec<[f64; 2]> = Vec::new();
    for &q in snapped {
        if q[0] > ua + 1e-9 && q[0] < ub - 1e-9 {
            let y = q[1] - off_top;
            y_max = y_max.max(y);
            interior.push([q[0], y]);
        }
    }
    if y_max - za < 0.02 {
        return None;
    }
    if interior.is_empty() {
        return clip_panel(ua, ub, za, y_a, y_b);
    }
    let base_low = za.min(y_a).min(y_b).min(interior.iter().map(|q| q[1]).fold(f64::INFINITY, f64::min)) - 1.0;
    let mut poly = vec![[ua, base_low], [ub, base_low], [ub, y_b]];
    for q in interior.into_iter().rev() {
        poly.push(q);
    }
    poly.push([ua, y_a]);
    let clipped = recorta_z_min(&poly, za);
    if clipped.len() < 3 || area_poligono_sz(&clipped).abs() < 1e-9 {
        None
    } else {
        Some(clipped)
    }
}

/// Polígono `(s, z)` de um montante vertical entre `z_bot` e a borda superior `(u_left, zl) -> [(u_mid, bend)] -> (u_right, zr)`.
pub fn clip_mullion_top(u_left: f64, u_right: f64, u_mid: f64, z_bot: f64, zl: f64, bend: Option<f64>, zr: f64) -> Option<Vec<[f64; 2]>> {
    if u_right - u_left < 1e-9 {
        return None;
    }
    let z_max = zl.max(zr).max(bend.unwrap_or(f64::NEG_INFINITY));
    if z_max - z_bot <= 1e-6 {
        return None;
    }
    let base_low = z_bot.min(zl).min(zr).min(bend.unwrap_or(f64::INFINITY)) - 1.0;
    let mut poly = vec![[u_left, base_low], [u_right, base_low], [u_right, zr]];
    if let Some(b) = bend {
        poly.push([u_mid, b]);
    }
    poly.push([u_left, zl]);
    let clipped = recorta_z_min(&poly, z_bot);
    if clipped.len() < 3 || area_poligono_sz(&clipped).abs() < 1e-9 {
        None
    } else {
        Some(clipped)
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cortina_malha::{montar, testes::fechada_e_orientada};
    use crate::cortina_pecas::{resolver, testes::*};
    use crate::cortina_planta::planta;
    use crate::cortina_quant::quant_cortina;
    use crate::cortina_tipos::*;
    use crate::secoes_a3::TipoAbertura;
    use crate::secoes_cortina::{CelulaAberturaLinha, PerfilTopoLinha};

    fn com_perfil(mut c: crate::cena::Cena, pts: &[(f64, f64)]) -> crate::cena::Cena {
        for (k, &(t, h)) in pts.iter().enumerate() {
            c.cortina.perfis_topo.insert((k + 1) as u32, PerfilTopoLinha { cortina: 1, ordem: k as u32, t, h });
        }
        c
    }

    fn volume(v: &[[f64; 3]], t: &[[u32; 3]]) -> f64 {
        t.iter()
            .map(|tri| {
                let (a, b, c) = (v[tri[0] as usize], v[tri[1] as usize], v[tri[2] as usize]);
                (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
            })
            .sum()
    }

    #[test]
    fn top_at_interpola_e_trata_degraus() {
        let p = vec![[0.0, 2.0], [2.0, 2.0], [2.0, 3.5], [4.0, 3.5]];
        assert!((top_at(&p, 0.0, 1) - 2.0).abs() < 1e-9);
        assert!((top_at(&p, 2.0, -1) - 2.0).abs() < 1e-9);
        assert!((top_at(&p, 2.0, 1) - 3.5).abs() < 1e-9);
        assert!((top_at(&p, 4.0, -1) - 3.5).abs() < 1e-9);

        let empena = vec![[0.0, 2.88], [0.88675, 3.145], [1.7735, 3.41], [2.66025, 3.145], [3.547, 2.88]];
        let simp = simplificar_perfil(&empena);
        assert_eq!(simp.len(), 3, "pontos médios colineares são removidos: {simp:?}");
        assert!((simp[1][0] - 1.7735).abs() < 1e-9);
    }

    #[test]
    fn empena_duas_aguas_insere_cumeeira_e_gera_malha_fechada_e_quantitativos() {
        // Caso real de projeto.hestia.json (w_650b03241kj): 3,547 m, grade U a cada 1,5 m (linhas 1,5 e 3,0) e empena 2,88 -> 3,41 -> 2,88.
        let e = Espec::novo(EixoEfetivo::distancia_fixa(1.5, JUSTIF_INICIO), EixoEfetivo::distancia_fixa(3.6, JUSTIF_INICIO));
        let l = 3.5469974584784083;
        let pts = [(0.0, 2.8826), (0.88675, 3.1486), (1.7735, 3.4146), (2.66025, 3.1486), (l, 2.8826)];
        for invertida in [false, true] {
            let mut cena = com_perfil(cena_simples(&e, l, 3.4146), &pts);
            cena.cortina.cortinas.get_mut(&1).unwrap().invertida = invertida;
            let res = resolver(&cena, 0).expect("resolver");
            let g = res[0].g.as_ref().expect("geom");
            // Cumeeira (1,7735) está > 1,5 * 0,05 = 0,075 m longe de 1,5 e 3,0 -> inserida na grade U!
            assert_eq!(g.us.len(), 5, "4 vãos: [0, 1.5, 1.7735, 3.0, L]: {:?}", g.us);
            assert!(g.us.iter().any(|&u| (u - 1.7735).abs() < 1e-4));
            // Montante na cumeeira (linha 2) tem topo em pico (5 vértices no polígono).
            let cumeeira = g.pecas_pol.iter().find(|p| p.eixo == EIXO_U && p.linha == 2).expect("montante da cumeeira");
            assert_eq!(cumeeira.poligono.len(), 5, "pico no topo do montante da cumeeira: {:?}", cumeeira.poligono);
            // 4 travessas inclinadas de borda superior.
            let topo_borda: Vec<_> = g.pecas_pol.iter().filter(|p| p.papel == PAPEL_BORDA_TOPO).collect();
            assert_eq!(topo_borda.len(), 4);
            // 4 painéis poligonais recortados sob as duas águas.
            assert_eq!(g.paineis_pol.len(), 4);
            assert!(g.paineis.is_empty());

            // Malha 3D: cada peça e painel poligonal é um sólido fechado e orientado com volume positivo.
            for p in &g.pecas_pol {
                let (y0, y1) = (p.m.desloc - p.m.prof() / 2.0, p.m.desloc + p.m.prof() / 2.0);
                let (v, t) = crate::cortina_malha::extrudar_sz(g, &p.poligono, y0, y1);
                assert!(fechada_e_orientada(&v, &t), "peca_pol papel={} invertida={invertida}", p.papel);
                assert!(volume(&v, &t) > 0.0);
            }
            for p in &g.paineis_pol {
                let (y0, y1) = (p.p.desloc - p.p.espessura / 2.0, p.p.desloc + p.p.espessura / 2.0);
                let (v, t) = crate::cortina_malha::extrudar_sz(g, &p.poligono_bruto, y0, y1);
                assert!(fechada_e_orientada(&v, &t), "painel_pol invertida={invertida}");
                assert!(volume(&v, &t) > 0.0);
            }
            let m = montar(&res, 2).expect("malha");
            assert!(!m.grupos.is_empty());
            for gr in &m.grupos {
                assert!(volume(&gr.vertices, &gr.triangulos) > 0.0, "volume positivo papel={} invertida={invertida}", gr.papel);
            }

            // Quantitativos: comprimento real inclinado da borda superior e área visível + montantes = área sob o perfil.
            let q = quant_cortina(&res);
            let bt = q.iter().find(|x| x.papel == PAPEL_BORDA_TOPO).expect("borda topo");
            let len_horiz_total: f64 = topo_borda.iter().map(|p| {
                let (s0, s1, _, _) = p.caixa_sz();
                s1 - s0
            }).sum();
            assert!(bt.comprimento > len_horiz_total + 0.01, "comprimento inclinado {} > horizontal {}", bt.comprimento, len_horiz_total);
            let area_mont: f64 = q.iter().filter(|x| x.papel <= PAPEL_BORDA_TOPO).map(|x| x.area_liquida).sum();
            let area_vidro = q.iter().find(|x| x.papel == PAPEL_PAINEL_VIDRO).expect("vidro").area_liquida;
            let area_sis = q.iter().find(|x| x.papel == PAPEL_SISTEMA).expect("sistema").area;
            assert!((area_mont + area_vidro - area_sis).abs() < 1e-4, "conservação de área: {area_mont} + {area_vidro} vs {area_sis}");
        }
    }

    #[test]
    fn uma_agua_inclinada_descarta_travessas_acima_do_contorno_e_restos_pequenos() {
        // Parede de 4 m com uma água de 1,0 m a 3,2 m; grade U=2 (2 m) e travessas horizontais em z = 1,0 e z = 2,0.
        // Vão 0 [0..2]: topo 1,0..2,1 (low = 1,0) -> nenhuma travessa interna cabe (1,0 + 0,025 > 1,0 - 0,05 - 0,05 = 0,90).
        // Vão 1 [2..4]: topo 2,1..3,2 (low = 2,1) -> travessa em z = 1,0 cabe (1,025 <= 2,0); z = 2,0 não cabe (2,025 > 2,0).
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::manual(&[1.0, 2.0], ANCORA_INICIO));
        let cena = com_perfil(cena_simples(&e, 4.0, 3.2), &[(0.0, 1.0), (4.0, 3.2)]);
        let res = resolver(&cena, 0).expect("resolver");
        let g = res[0].g.as_ref().expect("geom");
        let int_h: Vec<_> = g.pecas.iter().filter(|p| p.papel == PAPEL_INT_H).collect();
        assert_eq!(int_h.len(), 1, "só a travessa z=1,0 do vão 1 fica abaixo do topo");
        assert_eq!(int_h[0].k, 1);
        assert_eq!(g.paineis.len(), 1, "painel retangular [2..4]x[0..1] abaixo da travessa");
        assert_eq!(g.paineis_pol.len(), 2, "dois painéis trapezoidais no topo");
        for p in &g.pecas_pol {
            let (y0, y1) = (p.m.desloc - p.m.prof() / 2.0, p.m.desloc + p.m.prof() / 2.0);
            let (v, t) = crate::cortina_malha::extrudar_sz(g, &p.poligono, y0, y1);
            assert!(fechada_e_orientada(&v, &t));
            assert!(volume(&v, &t) > 0.0);
        }
        for p in &g.paineis_pol {
            let (y0, y1) = (p.p.desloc - p.p.espessura / 2.0, p.p.desloc + p.p.espessura / 2.0);
            let (v, t) = crate::cortina_malha::extrudar_sz(g, &p.poligono_bruto, y0, y1);
            assert!(fechada_e_orientada(&v, &t));
            assert!(volume(&v, &t) > 0.0);
        }
        let m = montar(&res, 1).expect("malha");
        for gr in &m.grupos {
            assert!(volume(&gr.vertices, &gr.triangulos) > 0.0);
        }
        assert!(!planta(&res, 0.5, 2).is_empty());

        // Sobra menor que 20 mm é descartada: perfil de 0,10 a 0,11 m com borda base 0,05 e borda topo 0,05 -> altura livre <= 0,01 m < 0,02 m.
        let e2 = Espec::novo(EixoEfetivo::numero(1), EixoEfetivo::numero(1));
        let cena2 = com_perfil(cena_simples(&e2, 2.0, 0.11), &[(0.0, 0.10), (2.0, 0.11)]);
        let res2 = resolver(&cena2, 0).expect("resolver");
        let g2 = res2[0].g.as_ref().expect("geom");
        assert!(g2.paineis.is_empty() && g2.paineis_pol.is_empty(), "resto < 0,02 m descartado");
    }

    #[test]
    fn perfil_em_degrau_mantem_montante_na_cota_mais_alta_e_dobra_encaixa_em_1_5_largura() {
        // Grade U=2 (linha em 2,0 m); degrau em 2,03 m (distância 0,03 <= 1,5 * 0,05 = 0,075) -> encaixa na linha 2,0!
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::manual(&[1.5, 2.5], ANCORA_INICIO));
        let cena = com_perfil(cena_simples(&e, 4.0, 3.5), &[(0.0, 2.0), (2.03, 2.0), (2.03, 3.5), (4.0, 3.5)]);
        let res = resolver(&cena, 0).expect("resolver");
        let g = res[0].g.as_ref().expect("geom");
        assert_eq!(g.us, vec![0.0, 2.0, 4.0], "degrau a 0,03 m encaixou na linha 2,0 m");
        // Montante central (linha 1) sobe até o lado mais alto (3,5 m).
        let max_central = g.pecas.iter().filter(|p| p.eixo == EIXO_U && p.linha == 1).map(|p| p.ate).fold(0.0, f64::max);
        assert!((max_central - 3.5).abs() < 1e-6);
        // Travessas internas: vão 0 (topo 2,0) mantém só 1,5; vão 1 (topo 3,5) mantém 1,5 e 2,5.
        assert_eq!(g.pecas.iter().filter(|p| p.papel == PAPEL_INT_H).count(), 3);
    }

    #[test]
    fn porta_em_celula_abaixo_do_topo_e_em_celula_cortada_nao_entra_em_panico() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::manual(&[2.2], ANCORA_INICIO));
        let mut cena = com_perfil(cena_simples(&e, 4.0, 4.5), &[(0.0, 0.5), (4.0, 4.5)]);
        cena.a3.tipos.insert(1, TipoAbertura { largura: 0.9, altura: 2.1, peitoril: 0.0, folga_w: 0.0, folga_h: 0.0, folhas: 1, plano: 0, janela: false, fechamento: 0, tem_alizar: false, estilo_batente: 0, modo_prof: 0, prof_pedida: 0.0, larg_batente: 0.05, esp_folha: 0.04 });
        // Porta na célula (1, 0) [2..4]x[0..2.2] (abaixo do topo 2..3.5) e porta na célula (0, 0) [0..2]x[0..2.2] (cortada pelo topo 0.5..2.0).
        cena.cortina.aberturas_celula.insert(1, CelulaAberturaLinha { cortina: 1, i: 1, j: 0, s: 0.75, z: 0.3, nu: 2, nv: 2, tipo: 1, flip_mao: false, flip_sentido: false, grade: false, alinhamento: 0, soleira: f64::NAN });
        cena.cortina.aberturas_celula.insert(2, CelulaAberturaLinha { cortina: 1, i: 0, j: 0, s: 0.25, z: 0.3, nu: 2, nv: 2, tipo: 1, flip_mao: false, flip_sentido: false, grade: false, alinhamento: 0, soleira: f64::NAN });
        let res = resolver(&cena, 0).expect("resolver sem panico");
        let g = res[0].g.as_ref().expect("geom");
        assert_eq!(g.esquadrias.len(), 2);
        let p_ok = g.esquadrias.iter().find(|x| x.i == 1).unwrap();
        assert!(p_ok.tem_vao() && p_ok.altura() > 2.0);
        let p_cortada = g.esquadrias.iter().find(|x| x.i == 0).unwrap();
        assert!(p_cortada.altura() <= 0.5);
        let _ = montar(&res, 1).expect("malha sem panico");
        let _ = quant_cortina(&res);
    }
}
