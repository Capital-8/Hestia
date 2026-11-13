//! Fatia horizontal da massa (plano de massa, A.4 regras 8 e 11; consulta 142 `massa_fatias`).
//!
//! A fatia na cota z é o anel interpolado pela regra 4, calculado direto das seções por `Pilha::anel_em_z`: não passa pela malha e não depende do
//! `lod`. Há um anel por cópia do arranjo (a cópia `i` é o anel da cópia 0 girado `i · anguloTotal / n` em torno do centro, a mesma conta da malha).
//! Sem união 2D entre cópias: a área por pavimento é a soma das cópias, e o aviso 2 (`massa_avisos`) acusa quando elas se sobrepõem.
//!
//! A consulta 142 devolve a fatia de cada massa na cota de cada nível do projeto (seção `niveis`) que cai dentro dela, com área, perímetro e cota.
//! Determinismo: ordem de saída `massa_num`, cópia, nível alvo (crescente em `nivel_num`).

use std::collections::BTreeMap;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE, LIMITE_BYTES_POR_CHAMADA};
use crate::massa_pilha::Pilha;
use crate::massa_tipos::{area_com_sinal, validar, Arranjo, Massa, EPS};

/// Uma massa validada com a sua pilha, pronta para devolver anéis em cotas absolutas (cópia 0).
pub struct Fatiador<'a> {
    pub m: &'a Massa,
    pub pilha: Pilha,
}

impl<'a> Fatiador<'a> {
    /// Valida a massa (`ENTRADA`) e monta a pilha (`LIMITE` se `|T|` passa de 512).
    pub fn novo(m: &'a Massa) -> Result<Fatiador<'a>, u32> {
        validar(m)?;
        Ok(Fatiador { m, pilha: Pilha::nova(m)? })
    }

    /// Altura da massa (z da última seção).
    pub fn altura(&self) -> f64 {
        self.pilha.z[self.pilha.z.len() - 1]
    }

    /// Cota absoluta da seção `k` do usuário.
    pub fn cota_da_secao(&self, k: usize) -> f64 {
        self.m.z_base + self.pilha.z[k]
    }

    /// Anel da seção `k` do usuário (exato, sem interpolação), cópia 0.
    pub fn anel_da_secao(&self, k: usize) -> Vec<[f64; 2]> {
        if k == 0 {
            self.pilha.anel(0, 0.0)
        } else {
            self.pilha.anel(k - 1, 1.0)
        }
    }

    /// Anel da cópia 0 na cota absoluta `cota`, ou `None` se a cota fica fora da massa. As pontas são inclusivas, com a folga `EPS` (a soma
    /// `z_base + z` não pode tirar da massa o nível que coincide com a base ou com o topo).
    pub fn anel(&self, cota: f64) -> Option<Vec<[f64; 2]>> {
        let (z, topo) = (cota - self.m.z_base, self.altura());
        let z = if (-EPS..0.0).contains(&z) {
            0.0
        } else if z > topo && z <= topo + EPS {
            topo
        } else {
            z
        };
        self.pilha.anel_em_z(z)
    }
}

/// Anel da cópia `copia` a partir do anel da cópia 0 (A.4 regra 7). A cópia 0 e a massa sem arranjo saem sem tocar nos pontos.
pub fn girar(anel: &[[f64; 2]], arranjo: Option<Arranjo>, copia: u32) -> Vec<[f64; 2]> {
    match arranjo.filter(|_| copia > 0) {
        None => anel.to_vec(),
        Some(a) => {
            let (s, co) = (copia as f64 * a.ang / a.n as f64).sin_cos();
            anel.iter().map(|q| [a.cx + (q[0] - a.cx) * co - (q[1] - a.cy) * s, a.cy + (q[0] - a.cx) * s + (q[1] - a.cy) * co]).collect()
        }
    }
}

/// Área do anel (em módulo: o anel sai anti-horário, mas um anel que se cruza pode ter área com sinal negativa).
pub fn area(anel: &[[f64; 2]]) -> f64 {
    area_com_sinal(anel).abs()
}

/// Perímetro do anel fechado.
pub fn perimetro(anel: &[[f64; 2]]) -> f64 {
    let n = anel.len();
    (0..n).map(|i| (anel[(i + 1) % n][0] - anel[i][0]).hypot(anel[(i + 1) % n][1] - anel[i][1])).sum()
}

/// `true` se todos os pontos são finitos.
pub fn finito(anel: &[[f64; 2]]) -> bool {
    anel.iter().all(|q| q[0].is_finite() && q[1].is_finite())
}

/// Níveis do projeto lidos da seção `niveis`: `(nivel_num, cota)` em ordem crescente de `nivel_num`. Se duas linhas trazem o mesmo `nivel_num`,
/// vale a de menor `id_num`.
pub fn niveis_da_cena(cena: &Cena) -> Vec<(u32, f64)> {
    let mut por_nivel: BTreeMap<u32, f64> = BTreeMap::new();
    for &(nivel, cota) in cena.b.niveis.values() {
        por_nivel.entry(nivel).or_insert(cota);
    }
    por_nivel.into_iter().collect()
}

/// Os níveis cuja cota cai dentro da massa, na ordem de `niveis`.
pub fn niveis_dentro(f: &Fatiador, niveis: &[(u32, f64)]) -> Vec<(u32, f64)> {
    let (base, topo) = (f.m.z_base, f.m.z_base + f.altura());
    niveis.iter().copied().filter(|&(_, cota)| cota.is_finite() && cota >= base - EPS && cota <= topo + EPS).collect()
}

/// Uma fatia: o anel de uma cópia na cota de um nível.
#[derive(Clone, Debug, PartialEq)]
pub struct Fatia {
    pub massa: u32,
    pub copia: u32,
    /// `nivel_num` do nível alvo.
    pub nivel: u32,
    /// Cota absoluta do nível alvo.
    pub z: f64,
    pub area: f64,
    pub perimetro: f64,
    pub pontos: Vec<[f64; 2]>,
}

/// Fatia de uma cópia da massa na cota absoluta `cota` (independe de `lod`), ou `None` fora da massa.
pub fn fatia_em(m: &Massa, copia: u32, cota: f64) -> Result<Option<Vec<[f64; 2]>>, u32> {
    Ok(Fatiador::novo(m)?.anel(cota).map(|a| girar(&a, m.arranjo, copia)))
}

/// Fatias de várias massas nos níveis dados (`(nivel_num, cota)`, já em ordem de `nivel_num`). Ordem: massa (a dada), cópia, nível alvo.
pub fn massa_fatias(massas: &[Massa], niveis: &[(u32, f64)]) -> Result<Vec<Fatia>, u32> {
    let mut out = Vec::new();
    let mut bytes = 0u64;
    for m in massas {
        let f = Fatiador::novo(m)?;
        // O anel da cópia 0 em cada nível se calcula uma vez; as cópias só giram.
        let mut base: Vec<(u32, f64, Vec<[f64; 2]>)> = Vec::new();
        for (nivel, cota) in niveis_dentro(&f, niveis) {
            if let Some(a) = f.anel(cota) {
                base.push((nivel, cota, a));
            }
        }
        for copia in 0..m.copias() {
            for (nivel, cota, anel0) in &base {
                let pontos = girar(anel0, m.arranjo, copia);
                let (a, p) = (area(&pontos), perimetro(&pontos));
                if !(finito(&pontos) && a.is_finite() && p.is_finite()) {
                    return Err(ENTRADA);
                }
                // Limite da ABI: a saída inteira tem de caber numa chamada.
                bytes += 16 * pontos.len() as u64 + 16 + 24;
                if bytes > LIMITE_BYTES_POR_CHAMADA {
                    return Err(LIMITE);
                }
                out.push(Fatia { massa: m.num, copia, nivel: *nivel, z: *cota, area: a, perimetro: p, pontos });
            }
        }
    }
    Ok(out)
}

/// Consulta 142: `fatias u32 [massa_num, copia, nivel_alvo_num, n_pontos]`, `pontos f64 [x, y]`, `valores f64 [area, perimetro, z]`.
pub fn consulta_massa_fatias(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let fatias = massa_fatias(&cena.massa.massas_do_nivel(nivel)?, &niveis_da_cena(cena))?;
    Ok(vec![
        Saida::U32(fatias.iter().flat_map(|f| [f.massa, f.copia, f.nivel, f.pontos.len() as u32]).collect()),
        Saida::F64(fatias.iter().flat_map(|f| f.pontos.iter().flat_map(|p| p.iter().copied())).collect()),
        Saida::F64(fatias.iter().flat_map(|f| [f.area, f.perimetro, f.z]).collect()),
    ])
}
