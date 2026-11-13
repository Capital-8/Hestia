//! Planta da massa (plano de massa, A.4 regra 10; consulta 141 `massa_planta`).
//!
//! Para cada cópia de cada massa, na cota de corte `corte_z` e na faixa de vista `[z_min, z_max]` (cotas absolutas):
//! - estilo 0 (cortado): a fatia exata na cota de corte, se o corte passa pela massa;
//! - estilo 1 (projetado, linha fina): os anéis das seções do usuário abaixo do corte e dentro da faixa;
//! - estilo 2 (acima, tracejado): os anéis das seções do usuário acima do corte.
//!
//! A seção que coincide com a cota de corte (a menos de `EPS`) é o próprio anel cortado e não se repete. Os anéis vêm direto das seções
//! (`massa_fatia`), independentes de `lod`; não há união 2D entre massas nem entre cópias. Anel fechado, sem repetir o primeiro ponto.
//! Determinismo: ordem `massa_num`, cópia, e em cada cópia o anel cortado seguido das seções de baixo para cima.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE, LIMITE_BYTES_POR_CHAMADA};
use crate::massa_fatia::{finito, girar, Fatiador};
use crate::massa_tipos::{Massa, EPS};

/// `estilo` das linhas de `massa_planta`.
pub const ESTILO_CORTADO: u32 = 0;
pub const ESTILO_PROJETADO: u32 = 1;
pub const ESTILO_ACIMA: u32 = 2;

/// Um anel de planta.
#[derive(Clone, Debug, PartialEq)]
pub struct LinhaPlanta {
    pub massa: u32,
    pub copia: u32,
    pub estilo: u32,
    pub pontos: Vec<[f64; 2]>,
}

/// Anéis de planta de várias massas, na ordem dada (a consulta passa `massa_num` crescente). Faixa vazia (`z_min > z_max`) só tira os projetados.
pub fn massa_planta(massas: &[Massa], corte_z: f64, z_min: f64, z_max: f64) -> Result<Vec<LinhaPlanta>, u32> {
    if !(corte_z.is_finite() && z_min.is_finite() && z_max.is_finite()) {
        return Err(ENTRADA);
    }
    let mut out = Vec::new();
    let mut bytes = 0u64;
    for m in massas {
        let f = Fatiador::novo(m)?;
        // Anéis da cópia 0, com o estilo; as cópias só giram.
        let mut base: Vec<(u32, Vec<[f64; 2]>)> = Vec::new();
        if let Some(a) = f.anel(corte_z) {
            base.push((ESTILO_CORTADO, a));
        }
        for k in 0..m.secoes.len() {
            let cota = f.cota_da_secao(k);
            if (cota - corte_z).abs() <= EPS {
                continue;
            }
            if cota > corte_z {
                base.push((ESTILO_ACIMA, f.anel_da_secao(k)));
            } else if cota >= z_min && cota <= z_max {
                base.push((ESTILO_PROJETADO, f.anel_da_secao(k)));
            }
        }
        for copia in 0..m.copias() {
            for (estilo, anel0) in &base {
                let pontos = girar(anel0, m.arranjo, copia);
                if !finito(&pontos) {
                    return Err(ENTRADA);
                }
                // Limite da ABI: a saída inteira tem de caber numa chamada.
                bytes += 16 * pontos.len() as u64 + 16;
                if bytes > LIMITE_BYTES_POR_CHAMADA {
                    return Err(LIMITE);
                }
                out.push(LinhaPlanta { massa: m.num, copia, estilo: *estilo, pontos });
            }
        }
    }
    Ok(out)
}

/// Consulta 141: `linhas u32 [massa_num, copia, estilo, n_pontos]`, `pontos f64 [x, y]`.
pub fn consulta_massa_planta(cena: &Cena, nivel: u32, corte_z: f64, z_min: f64, z_max: f64) -> Result<Vec<Saida>, u32> {
    let linhas = massa_planta(&cena.massa.massas_do_nivel(nivel)?, corte_z, z_min, z_max)?;
    Ok(vec![
        Saida::U32(linhas.iter().flat_map(|l| [l.massa, l.copia, l.estilo, l.pontos.len() as u32]).collect()),
        Saida::F64(linhas.iter().flat_map(|l| l.pontos.iter().flat_map(|p| p.iter().copied())).collect()),
    ])
}
