//! Seções da massa de estudo volumétrico (plano de massa, A.5; esquema v19): `massas`, `massa_secoes` e `massa_pontos` (ids 140 a 142).
//!
//! Mesmo molde de `secoes_gc` e `secoes_cortina`: `BTreeMap` por chave (ordem canônica = id crescente) e decodificação que valida antes de tocar a
//! cena (atômica): tamanho, chave ausente ou duplicada, valores não finitos e enums fora do domínio (`ENTRADA`). Aqui só se guardam as linhas; as regras
//! de geometria (A.4), as referências entre seções (massa da seção, seção do ponto) e os limites de A.3 ficam para a ficha R1, junto das consultas
//! 140 a 145, que por enquanto devolvem `NAO_IMPLEMENTADO`.

use std::collections::BTreeMap;

use crate::cena::{decodificar_colunas, Coluna, COORD_MAX};
use crate::esquema::{ENTRADA, ID_AUSENTE, INTERNO, LIMITE, LIMITE_LINHAS_POR_SECAO, SECAO_MASSAS, SECAO_MASSA_PONTOS, SECAO_MASSA_SECOES};

/// Uma massa (seção 140). `arr_n` 1 = sem arranjo.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MassaLinha {
    pub nivel: u32,
    pub ox: f64,
    pub oy: f64,
    pub z_base: f64,
    pub interp: u8,
    pub resolucao: u32,
    pub arr_n: u32,
    pub arr_cx: f64,
    pub arr_cy: f64,
    pub arr_ang: f64,
}

/// Uma seção da pilha (seção 141). `forma`: 0 círculo, 1 elipse, 2 polígono regular, 3 livre.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MassaSecaoLinha {
    pub massa: u32,
    pub ordem: u32,
    pub z: f64,
    pub forma: u8,
    pub p1: f64,
    pub p2: f64,
    pub lados: u32,
    pub rot: f64,
    pub escala: f64,
    pub dx: f64,
    pub dy: f64,
}

/// Um ponto do perfil livre (seção 142).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MassaPontoLinha {
    pub secao: u32,
    pub ordem: u32,
    pub x: f64,
    pub y: f64,
}

/// Linhas das seções da massa.
#[derive(Default)]
pub struct SecoesMassa {
    pub massas: BTreeMap<u32, MassaLinha>,
    pub secoes: BTreeMap<u32, MassaSecaoLinha>,
    pub pontos: BTreeMap<u32, MassaPontoLinha>,
}

enum Lote {
    Massas(Vec<(u32, MassaLinha)>),
    Secoes(Vec<(u32, MassaSecaoLinha)>),
    Pontos(Vec<(u32, MassaPontoLinha)>),
}

impl Lote {
    fn chaves(&self) -> Vec<u32> {
        match self {
            Lote::Massas(v) => v.iter().map(|x| x.0).collect(),
            Lote::Secoes(v) => v.iter().map(|x| x.0).collect(),
            Lote::Pontos(v) => v.iter().map(|x| x.0).collect(),
        }
    }
}

fn u32s(c: &Coluna) -> Result<&[u32], u32> {
    match c {
        Coluna::U32(v) => Ok(v),
        _ => Err(INTERNO),
    }
}

/// `f64` finito e dentro de `COORD_MAX`.
fn f64s(c: &Coluna) -> Result<&[f64], u32> {
    match c {
        Coluna::F64(v) if v.iter().all(|x| x.is_finite() && x.abs() <= COORD_MAX) => Ok(v),
        Coluna::F64(_) => Err(ENTRADA),
        _ => Err(INTERNO),
    }
}

/// `u8` de enum, de 0 a `max`.
fn enums(c: &Coluna, max: u8) -> Result<&[u8], u32> {
    match c {
        Coluna::U8(v) if v.iter().all(|&x| x <= max) => Ok(v),
        Coluna::U8(_) => Err(ENTRADA),
        _ => Err(INTERNO),
    }
}

fn decodificar(secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<Lote, u32> {
    let c = decodificar_colunas(secao, n_linhas, bytes)?;
    let ids = u32s(c.first().ok_or(INTERNO)?)?;
    if ids.contains(&ID_AUSENTE) {
        return Err(ENTRADA);
    }
    let mut o = ids.to_vec();
    o.sort_unstable();
    if o.windows(2).any(|w| w[0] == w[1]) {
        return Err(ENTRADA);
    }
    let col = |k: usize| c.get(k).ok_or(INTERNO);
    Ok(match secao {
        SECAO_MASSAS => {
            let (nivel, ox, oy, zb) = (u32s(col(1)?)?, f64s(col(2)?)?, f64s(col(3)?)?, f64s(col(4)?)?);
            let (interp, res, an) = (enums(col(5)?, 1)?, u32s(col(6)?)?, u32s(col(7)?)?);
            let (acx, acy, aang) = (f64s(col(8)?)?, f64s(col(9)?)?, f64s(col(10)?)?);
            Lote::Massas(
                (0..ids.len())
                    .map(|i| {
                        let l = MassaLinha { nivel: nivel[i], ox: ox[i], oy: oy[i], z_base: zb[i], interp: interp[i], resolucao: res[i], arr_n: an[i], arr_cx: acx[i], arr_cy: acy[i], arr_ang: aang[i] };
                        (ids[i], l)
                    })
                    .collect(),
            )
        }
        SECAO_MASSA_SECOES => {
            let (massa, ordem, z, forma) = (u32s(col(1)?)?, u32s(col(2)?)?, f64s(col(3)?)?, enums(col(4)?, 3)?);
            let (p1, p2, lados, rot) = (f64s(col(5)?)?, f64s(col(6)?)?, u32s(col(7)?)?, f64s(col(8)?)?);
            let (escala, dx, dy) = (f64s(col(9)?)?, f64s(col(10)?)?, f64s(col(11)?)?);
            Lote::Secoes(
                (0..ids.len())
                    .map(|i| {
                        let l = MassaSecaoLinha { massa: massa[i], ordem: ordem[i], z: z[i], forma: forma[i], p1: p1[i], p2: p2[i], lados: lados[i], rot: rot[i], escala: escala[i], dx: dx[i], dy: dy[i] };
                        (ids[i], l)
                    })
                    .collect(),
            )
        }
        SECAO_MASSA_PONTOS => {
            let (secao_n, ordem, x, y) = (u32s(col(1)?)?, u32s(col(2)?)?, f64s(col(3)?)?, f64s(col(4)?)?);
            Lote::Pontos((0..ids.len()).map(|i| (ids[i], MassaPontoLinha { secao: secao_n[i], ordem: ordem[i], x: x[i], y: y[i] })).collect())
        }
        _ => return Err(ENTRADA),
    })
}

impl SecoesMassa {
    /// `true` se a seção é uma das daqui.
    pub fn e_minha(secao: u32) -> bool {
        matches!(secao, SECAO_MASSAS | SECAO_MASSA_SECOES | SECAO_MASSA_PONTOS)
    }

    fn tamanho(&self, secao: u32) -> usize {
        match secao {
            SECAO_MASSAS => self.massas.len(),
            SECAO_MASSA_SECOES => self.secoes.len(),
            SECAO_MASSA_PONTOS => self.pontos.len(),
            _ => 0,
        }
    }

    fn contem(&self, secao: u32, k: u32) -> bool {
        match secao {
            SECAO_MASSAS => self.massas.contains_key(&k),
            SECAO_MASSA_SECOES => self.secoes.contains_key(&k),
            SECAO_MASSA_PONTOS => self.pontos.contains_key(&k),
            _ => false,
        }
    }

    fn limpar(&mut self, secao: u32) {
        match secao {
            SECAO_MASSAS => self.massas.clear(),
            SECAO_MASSA_SECOES => self.secoes.clear(),
            SECAO_MASSA_PONTOS => self.pontos.clear(),
            _ => {}
        }
    }

    fn aplicar(&mut self, lote: Lote) {
        match lote {
            Lote::Massas(v) => self.massas.extend(v),
            Lote::Secoes(v) => self.secoes.extend(v),
            Lote::Pontos(v) => self.pontos.extend(v),
        }
    }

    /// Substitui todas as linhas da seção (atômico).
    pub fn definir(&mut self, secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        let lote = decodificar(secao, n_linhas, bytes)?;
        self.limpar(secao);
        self.aplicar(lote);
        Ok(())
    }

    /// Insere ou substitui pela chave (atômico). `LIMITE` se passar do máximo de linhas da seção.
    pub fn upsert(&mut self, secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<(), u32> {
        let lote = decodificar(secao, n_linhas, bytes)?;
        let novas = lote.chaves().into_iter().filter(|&k| !self.contem(secao, k)).count();
        if self.tamanho(secao).saturating_add(novas) > LIMITE_LINHAS_POR_SECAO as usize {
            return Err(LIMITE);
        }
        self.aplicar(lote);
        Ok(())
    }

    /// Remove pelas chaves (ausentes são ignoradas).
    pub fn remover(&mut self, secao: u32, ids: &[u32]) {
        for k in ids {
            match secao {
                SECAO_MASSAS => {
                    self.massas.remove(k);
                }
                SECAO_MASSA_SECOES => {
                    self.secoes.remove(k);
                }
                SECAO_MASSA_PONTOS => {
                    self.pontos.remove(k);
                }
                _ => {}
            }
        }
    }

    /// Total de linhas em todas as seções daqui.
    pub fn total_linhas(&self) -> usize {
        self.massas.len() + self.secoes.len() + self.pontos.len()
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cena::Cena;
    use crate::esquema::{self, bytes_coluna, Tipo};

    /// Bytes de uma seção a partir de colunas dadas por nome (as que faltam ficam zeradas), cada coluna preenchida a múltiplo de 8.
    fn bytes(secao: u32, n: usize, valores: &[(&str, Vec<f64>)]) -> Vec<u8> {
        let s = esquema::secao(secao).expect("seção");
        let mut out = Vec::new();
        for c in s.colunas {
            let v: Vec<f64> = valores.iter().find(|(nome, _)| *nome == c.nome).map(|(_, v)| v.clone()).unwrap_or_else(|| vec![0.0; n]);
            assert_eq!(v.len(), n, "coluna {}", c.nome);
            let mut col = Vec::new();
            for x in v {
                match c.tipo {
                    Tipo::U32 => col.extend_from_slice(&(x as u32).to_le_bytes()),
                    Tipo::I32 => col.extend_from_slice(&(x as i32).to_le_bytes()),
                    Tipo::F64 => col.extend_from_slice(&x.to_le_bytes()),
                    Tipo::U8 => col.push(x as u8),
                }
            }
            col.resize(bytes_coluna(c.tipo, n).expect("tam"), 0);
            out.extend(col);
        }
        out
    }

    #[test]
    fn faixa_140_a_142_tem_dono_e_aceita_definir_upsert_e_remover() {
        let ids: Vec<u32> = esquema::SECOES.iter().map(|s| s.id).filter(|i| (140..=159).contains(i)).collect();
        assert_eq!(ids, vec![140, 141, 142]);
        let mut c = Cena::novo();
        let m = bytes(SECAO_MASSAS, 2, &[("id_num", vec![1.0, 2.0]), ("interp", vec![0.0, 1.0]), ("resolucao", vec![64.0, 32.0]), ("arr_n", vec![1.0, 6.0]), ("ox", vec![1.5, 0.0])]);
        assert_eq!(c.definir_secao(SECAO_MASSAS, 2, &m), Ok(()));
        let s = bytes(SECAO_MASSA_SECOES, 2, &[("id_num", vec![10.0, 11.0]), ("massa_num", vec![1.0, 1.0]), ("ordem", vec![0.0, 1.0]), ("z", vec![0.0, 3.0]), ("forma", vec![0.0, 3.0]), ("p1", vec![2.0, 0.0]), ("escala", vec![1.0, 1.0])]);
        assert_eq!(c.definir_secao(SECAO_MASSA_SECOES, 2, &s), Ok(()));
        let p = bytes(SECAO_MASSA_PONTOS, 3, &[("id_num", vec![1.0, 2.0, 3.0]), ("secao_num", vec![11.0; 3]), ("ordem", vec![0.0, 1.0, 2.0]), ("x", vec![0.0, 1.0, 0.0]), ("y", vec![0.0, 0.0, 1.0])]);
        assert_eq!(c.definir_secao(SECAO_MASSA_PONTOS, 3, &p), Ok(()));
        assert_eq!(c.massa.massas.len(), 2);
        assert_eq!(c.massa.massas[&1].ox, 1.5);
        assert_eq!(c.massa.massas[&2].arr_n, 6);
        assert_eq!(c.massa.secoes[&11].forma, 3);
        assert_eq!(c.massa.pontos.len(), 3);
        assert_eq!(c.massa.total_linhas(), 7);
        let m1 = bytes(SECAO_MASSAS, 1, &[("id_num", vec![1.0]), ("ox", vec![9.0]), ("resolucao", vec![64.0]), ("arr_n", vec![1.0])]);
        assert_eq!(c.upsert(SECAO_MASSAS, 1, &m1), Ok(()));
        assert_eq!(c.massa.massas[&1].ox, 9.0);
        assert_eq!(c.massa.massas.len(), 2);
        assert_eq!(c.remover(SECAO_MASSAS, &[2]), Ok(()));
        assert_eq!(c.massa.massas.len(), 1);
        assert_eq!(c.definir_secao(SECAO_MASSA_PONTOS, 0, &[]), Ok(()));
        assert_eq!(c.massa.pontos.len(), 0);
    }

    #[test]
    fn recusa_entrada_invalida_sem_tocar_a_cena() {
        let mut c = Cena::novo();
        let ok = bytes(SECAO_MASSAS, 1, &[("id_num", vec![1.0])]);
        assert_eq!(c.definir_secao(SECAO_MASSAS, 1, &ok), Ok(()));
        assert_eq!(c.definir_secao(SECAO_MASSAS, 2, &bytes(SECAO_MASSAS, 2, &[("id_num", vec![5.0, 5.0])])), Err(ENTRADA));
        assert_eq!(c.definir_secao(SECAO_MASSAS, 1, &bytes(SECAO_MASSAS, 1, &[("id_num", vec![ID_AUSENTE as f64])])), Err(ENTRADA));
        assert_eq!(c.definir_secao(SECAO_MASSAS, 1, &bytes(SECAO_MASSAS, 1, &[("id_num", vec![2.0]), ("ox", vec![f64::NAN])])), Err(ENTRADA));
        assert_eq!(c.definir_secao(SECAO_MASSAS, 1, &bytes(SECAO_MASSAS, 1, &[("id_num", vec![2.0]), ("interp", vec![2.0])])), Err(ENTRADA));
        assert_eq!(c.definir_secao(SECAO_MASSA_SECOES, 1, &bytes(SECAO_MASSA_SECOES, 1, &[("id_num", vec![2.0]), ("forma", vec![4.0])])), Err(ENTRADA));
        assert_eq!(c.definir_secao(SECAO_MASSAS, 1, &ok[..ok.len() - 8]), Err(ENTRADA));
        assert_eq!(c.massa.massas.keys().copied().collect::<Vec<_>>(), vec![1]);
    }
}
