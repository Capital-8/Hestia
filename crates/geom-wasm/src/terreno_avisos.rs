//! Terreno (PLANO do terreno A.4 regra 14): avisos, consulta 168 (`terreno_avisos`).
//!
//! Os avisos 1 (pontos coincidentes com cotas diferentes), 2 (linha cruza outra, trecho ignorado) e 5 (terreno sem triângulos) são calculados junto com a
//! triangulação e ficam em `Existente.avisos`; aqui só são expostos. Os avisos 3, 4 e 6 dependem das regiões (ficha R3).
//!
//! Saída: `avisos [terreno_num, codigo, regiao_num, indice]` e `valores [medido, limite, x, y, z]`, na ordem dos terrenos e, em cada um, na ordem em que os
//! avisos foram gerados.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::terreno_tipos::{existente, terrenos_do_nivel, AvisoTerreno};

/// Acrescenta os avisos de um terreno às duas saídas da consulta 168.
pub fn achatar_avisos(terreno: u32, avisos: &[AvisoTerreno], linhas: &mut Vec<u32>, valores: &mut Vec<f64>) {
    for a in avisos {
        linhas.extend_from_slice(&[terreno, a.codigo, a.regiao, a.indice]);
        valores.extend_from_slice(&[a.medido, a.limite, a.x, a.y, a.z]);
    }
}

/// Consulta 168 (`terreno_avisos`): terrenos do nível por `id_num` crescente.
pub fn consulta_terreno_avisos(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let (mut linhas, mut valores) = (Vec::new(), Vec::new());
    for t in terrenos_do_nivel(&cena.terreno, nivel) {
        achatar_avisos(t, &existente(cena, t)?.avisos, &mut linhas, &mut valores);
    }
    Ok(vec![Saida::U32(linhas), Saida::F64(valores)])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::esquema::ID_AUSENTE;
    use crate::terreno_tipos::AVISO_LINHA_CRUZA;

    #[test]
    fn achata_nas_colunas_do_contrato() {
        let a = AvisoTerreno { codigo: AVISO_LINHA_CRUZA, regiao: ID_AUSENTE, indice: 4, medido: 1.5, limite: 0.0, x: 2.0, y: 3.0, z: 4.0 };
        let (mut l, mut v) = (vec![9], vec![9.0]);
        achatar_avisos(7, &[a, a], &mut l, &mut v);
        assert_eq!(l, vec![9, 7, 2, ID_AUSENTE, 4, 7, 2, ID_AUSENTE, 4]);
        assert_eq!(v[..6], [9.0, 1.5, 0.0, 2.0, 3.0, 4.0]);
        assert_eq!(v.len(), 11);
    }
}
