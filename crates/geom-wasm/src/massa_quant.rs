//! Quantidades da massa (plano de massa, A.4 regra 11; consulta 144 `quant_massa`).
//!
//! FONTE ÚNICA: a malha `lod 2` de `massa_malha` (a mesma do 3D e do corte). O volume é o do teorema da divergência sobre os triângulos de cada
//! casca; as áreas lateral, da base e do topo são a soma das áreas dos triângulos de cada papel; tudo somado sobre as cópias do arranjo. A altura é
//! o z da última seção. A área e o perímetro por pavimento saem de `massa_fatias`.
//!
//! O volume de cada casca é somado em relação ao primeiro vértice dela (a casca é fechada, então o resultado não depende do ponto de referência):
//! assim a conta não perde precisão quando a massa está longe da origem do mundo.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::ENTRADA;
use crate::massa_malha::{malha_da_massa, MalhaMassa};
use crate::massa_tipos::{Massa, PAPEL_BASE, PAPEL_LATERAL, PAPEL_TOPO};

/// Quantidades de uma massa (todas as cópias somadas).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct QuantMassa {
    pub massa: u32,
    pub volume: f64,
    pub area_lateral: f64,
    pub area_base: f64,
    pub area_topo: f64,
    pub altura: f64,
}

fn menos(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn vetorial(u: [f64; 3], v: [f64; 3]) -> [f64; 3] {
    [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
}

/// Volume com sinal (positivo com as normais para fora) e áreas `[lateral, base, topo]` de uma malha de `massa_malha`.
pub fn medir(malha: &MalhaMassa) -> (f64, [f64; 3]) {
    let (mut volume, mut areas) = (0.0, [0.0; 3]);
    // Referência do volume: o primeiro vértice da casca (o grupo lateral abre cada cópia).
    let mut origem = [0.0; 3];
    for g in &malha.grupos {
        let indices = &malha.indices[g[3] as usize..(g[3] + g[4]) as usize];
        if g[2] == PAPEL_LATERAL {
            if let Some(&i) = indices.first() {
                origem = malha.vertices[i as usize];
            }
        }
        for t in indices.chunks_exact(3) {
            let (a, b, c) = (menos(malha.vertices[t[0] as usize], origem), menos(malha.vertices[t[1] as usize], origem), menos(malha.vertices[t[2] as usize], origem));
            let bc = vetorial(b, c);
            volume += (a[0] * bc[0] + a[1] * bc[1] + a[2] * bc[2]) / 6.0;
            let n = vetorial(menos(b, a), menos(c, a));
            let area = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt() / 2.0;
            match g[2] {
                PAPEL_LATERAL => areas[0] += area,
                PAPEL_BASE => areas[1] += area,
                PAPEL_TOPO => areas[2] += area,
                _ => {}
            }
        }
    }
    (volume, areas)
}

/// Quantidades de uma massa, sobre a malha `lod 2`. `ENTRADA` e `LIMITE` como em `massa_malha`.
pub fn quant_da_massa(m: &Massa) -> Result<QuantMassa, u32> {
    let mut malha = MalhaMassa::default();
    malha_da_massa(m, 2, &mut malha)?;
    let (volume, areas) = medir(&malha);
    let altura = m.secoes.last().map_or(0.0, |s| s.z);
    if ![volume, areas[0], areas[1], areas[2], altura].iter().all(|v| v.is_finite()) {
        return Err(ENTRADA);
    }
    Ok(QuantMassa { massa: m.num, volume, area_lateral: areas[0], area_base: areas[1], area_topo: areas[2], altura })
}

/// Quantidades de várias massas, na ordem dada (a consulta passa `massa_num` crescente).
pub fn quant_massa(massas: &[Massa]) -> Result<Vec<QuantMassa>, u32> {
    massas.iter().map(quant_da_massa).collect()
}

/// Consulta 144: `linhas u32 [massa_num]`, `valores f64 [volume, area_lateral, area_base, area_topo, altura]`.
pub fn consulta_quant_massa(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let q = quant_massa(&cena.massa.massas_do_nivel(nivel)?)?;
    Ok(vec![Saida::U32(q.iter().map(|l| l.massa).collect()), Saida::F64(q.iter().flat_map(|l| [l.volume, l.area_lateral, l.area_base, l.area_topo, l.altura]).collect())])
}
