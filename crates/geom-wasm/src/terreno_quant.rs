//! Terreno (PLANO do terreno A.4 regra 12): quantidades básicas, consulta 165 (`quant_terreno`).
//!
//! Por terreno: `valores [area_planta, area_sup_existente, area_sup_proposta, z_min, z_max, volume_corte, volume_aterro, n_triangulos]`. Até a ficha R3 não
//! há regiões: a superfície proposta é a existente e os volumes são 0. Terreno sem triângulos sai com a linha toda em 0 (o aviso 5 diz por quê).

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::terreno_avalia::Malha;
use crate::terreno_tipos::{existente, terrenos_do_nivel};

/// Quantidades de uma malha: `[area_planta, area_superficie, z_min, z_max, n_triangulos]`. Malha sem triângulos: tudo 0.
pub fn quantidades_da_malha(m: &Malha) -> [f64; 5] {
    match m.z_min_max().filter(|_| !m.t.is_empty()) {
        Some((z_min, z_max)) => [m.area_planta(), m.area_superficie(), z_min, z_max, m.t.len() as f64],
        None => [0.0; 5],
    }
}

/// Consulta 165 (`quant_terreno`): terrenos do nível por `id_num` crescente.
pub fn consulta_quant_terreno(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let (mut linhas, mut valores) = (Vec::new(), Vec::new());
    for t in terrenos_do_nivel(&cena.terreno, nivel) {
        let e = existente(cena, t)?;
        let q = quantidades_da_malha(&e.e);
        linhas.push(t);
        valores.extend_from_slice(&[q[0], q[1], q[1], q[2], q[3], 0.0, 0.0, q[4]]);
    }
    Ok(vec![Saida::U32(linhas), Saida::F64(valores)])
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn quantidades_do_quadrado_inclinado_e_da_malha_vazia() {
        let v = vec![[0.0, 0.0, 0.0], [2.0, 0.0, 2.0], [2.0, 2.0, 2.0], [0.0, 2.0, 0.0]];
        let m = Malha::nova(v, vec![0, 1, 2, 3], vec![[0, 1, 2], [0, 2, 3]], Vec::new());
        let q = quantidades_da_malha(&m);
        assert_eq!((q[0], q[2], q[3], q[4]), (4.0, 0.0, 2.0, 2.0));
        assert!((q[1] - 4.0 * 2f64.sqrt()).abs() < 1e-12);
        assert_eq!(quantidades_da_malha(&Malha::default()), [0.0; 5]);
    }
}
