//! Seções do terreno (esquema v19; PLANO do terreno A.5): `terrenos`, `terreno_linhas`, `terreno_vertices`, `terreno_regioes`, `terreno_regiao_pontos` e
//! `terreno_sondas` (ids 160 a 165).
//!
//! Mesmo molde de `secoes_gc` e `secoes_cortina`: `BTreeMap` por chave (ordem canônica = id crescente) e decodificação que valida antes de tocar a cena
//! (atômica): tamanho, chave ausente ou duplicada, valores não finitos e enums fora do domínio (`ENTRADA`). As referências ENTRE seções (terreno ou região
//! inexistente) NÃO são checadas aqui, porque as seções chegam em qualquer ordem. `linha_num = ID_AUSENTE` em `terreno_vertices` é ponto solto, não
//! referência quebrada.
//!
//! O kernel só lê estas seções (não conhece o `Project`). As consultas de terreno ainda devolvem `NAO_IMPLEMENTADO`.

use std::collections::BTreeMap;

use crate::cena::{decodificar_colunas, Coluna, COORD_MAX};
use crate::esquema::{
    self, Secao, ENTRADA, ID_AUSENTE, INTERNO, LIMITE, LIMITE_LINHAS_POR_SECAO, SECAO_TERRENOS, SECAO_TERRENO_LINHAS, SECAO_TERRENO_REGIAO_PONTOS, SECAO_TERRENO_REGIOES,
    SECAO_TERRENO_SONDAS, SECAO_TERRENO_VERTICES,
};

/// `tipo` de `terreno_linhas`.
pub const LINHA_CURVA: u8 = 0;
pub const LINHA_QUEBRA: u8 = 1;
pub const LINHA_BORDA: u8 = 2;
/// `papel` de `terreno_regioes`.
pub const PAPEL_SUBDIVISAO: u8 = 0;
pub const PAPEL_PLATAFORMA: u8 = 1;
pub const PAPEL_NIVELADA: u8 = 2;

/// Um terreno (seção 160).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TerrenoLinha {
    pub nivel: u32,
    pub espessura_base: f64,
    pub intervalo: f64,
    pub mestra_cada: u32,
}

/// Curva, quebra ou borda de um terreno (seção 161).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LinhaTerrenoLinha {
    pub terreno: u32,
    pub tipo: u8,
    pub fechada: bool,
}

/// Vértice de um terreno (seção 162). `linha` `ID_AUSENTE` = ponto solto. `z` é ignorado nos vértices de borda.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VerticeTerrenoLinha {
    pub terreno: u32,
    pub linha: u32,
    pub ordem: u32,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Região do terreno (seção 163).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RegiaoTerrenoLinha {
    pub terreno: u32,
    pub ordem: u32,
    pub papel: u8,
    pub cota: f64,
    pub inclinacao: f64,
    pub direcao: f64,
    pub ref_xy: [f64; 2],
    pub talude_corte: f64,
    pub talude_aterro: f64,
}

/// Ponto do contorno de uma região (seção 164).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RegiaoPontoLinha {
    pub regiao: u32,
    pub ordem: u32,
    pub x: f64,
    pub y: f64,
}

/// Sonda de cota (seção 165).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SondaLinha {
    pub x: f64,
    pub y: f64,
}

macro_rules! tabelas {
    ($($campo:ident: $ty:ty = $id:ident,)*) => {
        /// Linhas das seções do terreno.
        #[derive(Default)]
        pub struct SecoesTerreno {
            $(pub $campo: BTreeMap<u32, $ty>,)*
        }

        #[allow(non_camel_case_types)]
        enum Lote {
            $($campo(Vec<(u32, $ty)>),)*
        }

        impl Lote {
            fn chaves(&self) -> Vec<u32> {
                match self {
                    $(Lote::$campo(v) => v.iter().map(|x| x.0).collect(),)*
                }
            }
        }

        impl SecoesTerreno {
            /// `true` se a seção é uma das daqui.
            pub fn e_minha(secao: u32) -> bool {
                matches!(secao, $($id)|*)
            }

            fn tamanho(&self, secao: u32) -> usize {
                match secao {
                    $($id => self.$campo.len(),)*
                    _ => 0,
                }
            }

            fn contem(&self, secao: u32, k: u32) -> bool {
                match secao {
                    $($id => self.$campo.contains_key(&k),)*
                    _ => false,
                }
            }

            fn limpar(&mut self, secao: u32) {
                match secao {
                    $($id => self.$campo.clear(),)*
                    _ => {}
                }
            }

            fn aplicar(&mut self, lote: Lote) {
                match lote {
                    $(Lote::$campo(v) => self.$campo.extend(v),)*
                }
            }

            /// Remove pelas chaves (ausentes são ignoradas).
            pub fn remover(&mut self, secao: u32, ids: &[u32]) {
                for k in ids {
                    match secao {
                        $($id => { self.$campo.remove(k); })*
                        _ => {}
                    }
                }
            }

            /// Total de linhas em todas as seções daqui.
            pub fn total_linhas(&self) -> usize {
                0 $(+ self.$campo.len())*
            }
        }
    };
}

tabelas! {
    terrenos: TerrenoLinha = SECAO_TERRENOS,
    linhas: LinhaTerrenoLinha = SECAO_TERRENO_LINHAS,
    vertices: VerticeTerrenoLinha = SECAO_TERRENO_VERTICES,
    regioes: RegiaoTerrenoLinha = SECAO_TERRENO_REGIOES,
    regiao_pontos: RegiaoPontoLinha = SECAO_TERRENO_REGIAO_PONTOS,
    sondas: SondaLinha = SECAO_TERRENO_SONDAS,
}

/// As colunas decodificadas de uma seção, lidas por nome.
struct Tab {
    s: &'static Secao,
    c: Vec<Coluna>,
    n: usize,
}

impl Tab {
    fn nova(secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<Tab, u32> {
        let c = decodificar_colunas(secao, n_linhas, bytes)?;
        let s = esquema::secao(secao).ok_or(ENTRADA)?;
        Ok(Tab { s, c, n: n_linhas as usize })
    }

    fn coluna(&self, nome: &str) -> Result<&Coluna, u32> {
        let k = self.s.colunas.iter().position(|c| c.nome == nome).ok_or(INTERNO)?;
        self.c.get(k).ok_or(INTERNO)
    }

    fn u(&self, nome: &str, i: usize) -> Result<u32, u32> {
        match self.coluna(nome)? {
            Coluna::U32(v) => v.get(i).copied().ok_or(INTERNO),
            _ => Err(INTERNO),
        }
    }

    /// `f64` finito e dentro de `COORD_MAX`.
    fn d(&self, nome: &str, i: usize) -> Result<f64, u32> {
        match self.coluna(nome)? {
            Coluna::F64(v) => {
                let x = v.get(i).copied().ok_or(INTERNO)?;
                if x.is_finite() && x.abs() <= COORD_MAX {
                    Ok(x)
                } else {
                    Err(ENTRADA)
                }
            }
            _ => Err(INTERNO),
        }
    }

    /// `u8` de enum, de 0 a `max`.
    fn e(&self, nome: &str, i: usize, max: u8) -> Result<u8, u32> {
        match self.coluna(nome)? {
            Coluna::U8(v) => {
                let x = v.get(i).copied().ok_or(INTERNO)?;
                if x <= max {
                    Ok(x)
                } else {
                    Err(ENTRADA)
                }
            }
            _ => Err(INTERNO),
        }
    }

    fn chaves(&self) -> Result<Vec<u32>, u32> {
        let ids = match self.c.first() {
            Some(Coluna::U32(v)) => v.clone(),
            _ => return Err(INTERNO),
        };
        if ids.contains(&ID_AUSENTE) {
            return Err(ENTRADA);
        }
        let mut o = ids.clone();
        o.sort_unstable();
        if o.windows(2).any(|w| w[0] == w[1]) {
            return Err(ENTRADA);
        }
        Ok(ids)
    }
}

fn decodificar(secao: u32, n_linhas: u32, bytes: &[u8]) -> Result<Lote, u32> {
    let t = Tab::nova(secao, n_linhas, bytes)?;
    let ids = t.chaves()?;
    let n = t.n;
    macro_rules! linhas {
        ($i:ident => $fila:expr) => {{
            let mut v = Vec::with_capacity(n);
            for ($i, &k) in ids.iter().enumerate() {
                v.push((k, $fila));
            }
            v
        }};
    }
    Ok(match secao {
        SECAO_TERRENOS => Lote::terrenos(linhas!(i => TerrenoLinha {
            nivel: t.u("nivel_num", i)?,
            espessura_base: t.d("espessura_base", i)?,
            intervalo: t.d("intervalo", i)?,
            mestra_cada: t.u("mestra_cada", i)?,
        })),
        SECAO_TERRENO_LINHAS => Lote::linhas(linhas!(i => LinhaTerrenoLinha {
            terreno: t.u("terreno_num", i)?,
            tipo: t.e("tipo", i, LINHA_BORDA)?,
            fechada: t.e("fechada", i, 1)? == 1,
        })),
        SECAO_TERRENO_VERTICES => Lote::vertices(linhas!(i => VerticeTerrenoLinha {
            terreno: t.u("terreno_num", i)?,
            linha: t.u("linha_num", i)?,
            ordem: t.u("ordem", i)?,
            x: t.d("x", i)?,
            y: t.d("y", i)?,
            z: t.d("z", i)?,
        })),
        SECAO_TERRENO_REGIOES => Lote::regioes(linhas!(i => RegiaoTerrenoLinha {
            terreno: t.u("terreno_num", i)?,
            ordem: t.u("ordem", i)?,
            papel: t.e("papel", i, PAPEL_NIVELADA)?,
            cota: t.d("cota", i)?,
            inclinacao: t.d("inclinacao", i)?,
            direcao: t.d("direcao", i)?,
            ref_xy: [t.d("ref_x", i)?, t.d("ref_y", i)?],
            talude_corte: t.d("talude_corte", i)?,
            talude_aterro: t.d("talude_aterro", i)?,
        })),
        SECAO_TERRENO_REGIAO_PONTOS => Lote::regiao_pontos(linhas!(i => RegiaoPontoLinha {
            regiao: t.u("regiao_num", i)?,
            ordem: t.u("ordem", i)?,
            x: t.d("x", i)?,
            y: t.d("y", i)?,
        })),
        SECAO_TERRENO_SONDAS => Lote::sondas(linhas!(i => SondaLinha { x: t.d("x", i)?, y: t.d("y", i)? })),
        _ => return Err(ENTRADA),
    })
}

impl SecoesTerreno {
    /// Substitui todas as linhas da seção (atômico: decodifica antes de tocar).
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
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cena::Cena;
    use crate::esquema::{bytes_coluna, Tipo, NAO_IMPLEMENTADO, SECOES};

    /// Bytes de uma seção a partir de colunas dadas por nome (as que faltam ficam zeradas). Cada coluna é preenchida a múltiplo de 8, como no codec.
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

    fn v(x: &[f64]) -> Vec<f64> {
        x.to_vec()
    }

    #[test]
    fn toda_secao_de_terreno_tem_dono_e_aceita_vazia_e_uma_linha_de_zeros() {
        let ids: Vec<u32> = SECOES.iter().map(|s| s.id).filter(|&i| (160..=199).contains(&i)).collect();
        assert_eq!(ids, vec![160, 161, 162, 163, 164, 165]);
        for id in ids {
            assert!(SecoesTerreno::e_minha(id), "seção {id}");
            let mut s = SecoesTerreno::default();
            assert_eq!(s.definir(id, 0, &bytes(id, 0, &[])), Ok(()), "seção {id} vazia");
            assert_eq!(s.definir(id, 1, &bytes(id, 1, &[("id_num", v(&[1.0]))])), Ok(()), "seção {id} com zeros");
        }
        assert!(!SecoesTerreno::e_minha(159));
        assert!(!SecoesTerreno::e_minha(166));
    }

    #[test]
    fn ida_e_volta_das_seis_secoes() {
        let mut s = SecoesTerreno::default();
        let b = bytes(SECAO_TERRENOS, 2, &[("id_num", v(&[7.0, 3.0])), ("nivel_num", v(&[1.0, 2.0])), ("espessura_base", v(&[3.0, 2.0])), ("intervalo", v(&[0.5, 1.0])), ("mestra_cada", v(&[5.0, 4.0]))]);
        s.definir(SECAO_TERRENOS, 2, &b).expect("terrenos");
        assert_eq!(s.terrenos.keys().copied().collect::<Vec<_>>(), vec![3, 7], "ordem canônica por id");
        assert_eq!(s.terrenos[&7], TerrenoLinha { nivel: 1, espessura_base: 3.0, intervalo: 0.5, mestra_cada: 5 });

        let b = bytes(SECAO_TERRENO_LINHAS, 2, &[("id_num", v(&[1.0, 2.0])), ("terreno_num", v(&[7.0, 7.0])), ("tipo", v(&[1.0, 2.0])), ("fechada", v(&[0.0, 1.0]))]);
        s.definir(SECAO_TERRENO_LINHAS, 2, &b).expect("linhas");
        assert_eq!(s.linhas[&1], LinhaTerrenoLinha { terreno: 7, tipo: LINHA_QUEBRA, fechada: false });
        assert_eq!(s.linhas[&2], LinhaTerrenoLinha { terreno: 7, tipo: LINHA_BORDA, fechada: true });

        let ausente = ID_AUSENTE as f64;
        let b = bytes(SECAO_TERRENO_VERTICES, 2, &[("id_num", v(&[0.0, 1.0])), ("terreno_num", v(&[7.0, 7.0])), ("linha_num", v(&[ausente, 1.0])), ("ordem", v(&[0.0, 1.0])), ("x", v(&[1.0, 2.0])), ("y", v(&[3.0, 4.0])), ("z", v(&[5.0, 6.0]))]);
        s.definir(SECAO_TERRENO_VERTICES, 2, &b).expect("ponto solto não é referência quebrada");
        assert_eq!(s.vertices[&0].linha, ID_AUSENTE);
        assert_eq!(s.vertices[&1], VerticeTerrenoLinha { terreno: 7, linha: 1, ordem: 1, x: 2.0, y: 4.0, z: 6.0 });

        let b = bytes(SECAO_TERRENO_REGIOES, 1, &[("id_num", v(&[9.0])), ("terreno_num", v(&[7.0])), ("ordem", v(&[2.0])), ("papel", v(&[2.0])), ("cota", v(&[1.5])), ("inclinacao", v(&[0.02])), ("direcao", v(&[0.3])), ("ref_x", v(&[4.0])), ("ref_y", v(&[5.0])), ("talude_corte", v(&[0.5])), ("talude_aterro", v(&[0.0]))]);
        s.definir(SECAO_TERRENO_REGIOES, 1, &b).expect("regiões");
        assert_eq!(s.regioes[&9], RegiaoTerrenoLinha { terreno: 7, ordem: 2, papel: PAPEL_NIVELADA, cota: 1.5, inclinacao: 0.02, direcao: 0.3, ref_xy: [4.0, 5.0], talude_corte: 0.5, talude_aterro: 0.0 });

        let b = bytes(SECAO_TERRENO_REGIAO_PONTOS, 1, &[("id_num", v(&[1.0])), ("regiao_num", v(&[9.0])), ("ordem", v(&[3.0])), ("x", v(&[1.0])), ("y", v(&[2.0]))]);
        s.definir(SECAO_TERRENO_REGIAO_PONTOS, 1, &b).expect("pontos");
        assert_eq!(s.regiao_pontos[&1], RegiaoPontoLinha { regiao: 9, ordem: 3, x: 1.0, y: 2.0 });

        let b = bytes(SECAO_TERRENO_SONDAS, 1, &[("id_num", v(&[4.0])), ("x", v(&[1.0])), ("y", v(&[2.0]))]);
        s.definir(SECAO_TERRENO_SONDAS, 1, &b).expect("sondas");
        assert_eq!(s.sondas[&4], SondaLinha { x: 1.0, y: 2.0 });
        assert_eq!(s.total_linhas(), 2 + 2 + 2 + 1 + 1 + 1);
    }

    #[test]
    fn recusa_chave_ausente_duplicada_nao_finito_e_enum_fora() {
        let mut s = SecoesTerreno::default();
        let ok = |ids: &[f64]| bytes(SECAO_TERRENO_SONDAS, ids.len(), &[("id_num", v(ids))]);
        assert_eq!(s.definir(SECAO_TERRENO_SONDAS, 2, &ok(&[1.0, 1.0])), Err(ENTRADA), "duplicada");
        assert_eq!(s.definir(SECAO_TERRENO_SONDAS, 1, &ok(&[ID_AUSENTE as f64])), Err(ENTRADA), "ausente");
        for x in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 2e12] {
            let r = bytes(SECAO_TERRENO_SONDAS, 1, &[("id_num", v(&[1.0])), ("x", v(&[x]))]);
            assert_eq!(s.definir(SECAO_TERRENO_SONDAS, 1, &r), Err(ENTRADA), "x = {x}");
        }
        let nan_z = bytes(SECAO_TERRENO_VERTICES, 1, &[("id_num", v(&[1.0])), ("z", v(&[f64::NAN]))]);
        assert_eq!(s.definir(SECAO_TERRENO_VERTICES, 1, &nan_z), Err(ENTRADA), "z não finito, mesmo em borda");
        assert_eq!(s.definir(SECAO_TERRENO_SONDAS, 1, &ok(&[1.0])[..8]), Err(ENTRADA), "tamanho errado");
        let tipo = |x: f64| bytes(SECAO_TERRENO_LINHAS, 1, &[("id_num", v(&[1.0])), ("tipo", v(&[x]))]);
        assert_eq!(s.definir(SECAO_TERRENO_LINHAS, 1, &tipo(2.0)), Ok(()));
        assert_eq!(s.definir(SECAO_TERRENO_LINHAS, 1, &tipo(3.0)), Err(ENTRADA), "tipo 0..2");
        let fechada = |x: f64| bytes(SECAO_TERRENO_LINHAS, 1, &[("id_num", v(&[1.0])), ("fechada", v(&[x]))]);
        assert_eq!(s.definir(SECAO_TERRENO_LINHAS, 1, &fechada(1.0)), Ok(()));
        assert_eq!(s.definir(SECAO_TERRENO_LINHAS, 1, &fechada(2.0)), Err(ENTRADA), "fechada 0..1");
        let papel = |x: f64| bytes(SECAO_TERRENO_REGIOES, 1, &[("id_num", v(&[1.0])), ("papel", v(&[x]))]);
        assert_eq!(s.definir(SECAO_TERRENO_REGIOES, 1, &papel(2.0)), Ok(()));
        assert_eq!(s.definir(SECAO_TERRENO_REGIOES, 1, &papel(3.0)), Err(ENTRADA), "papel 0..2");
        let nan_ref = bytes(SECAO_TERRENO_REGIOES, 1, &[("id_num", v(&[1.0])), ("ref_y", v(&[f64::NAN]))]);
        assert_eq!(s.definir(SECAO_TERRENO_REGIOES, 1, &nan_ref), Err(ENTRADA));
        assert_eq!(s.sondas.len(), 0, "falha não toca a cena");
    }

    #[test]
    fn upsert_remover_e_atomicidade() {
        let mut s = SecoesTerreno::default();
        let a = bytes(SECAO_TERRENO_SONDAS, 2, &[("id_num", v(&[1.0, 2.0])), ("x", v(&[3.0, 4.0]))]);
        s.definir(SECAO_TERRENO_SONDAS, 2, &a).expect("definir");
        let b = bytes(SECAO_TERRENO_SONDAS, 2, &[("id_num", v(&[2.0, 9.0])), ("x", v(&[40.0, 90.0]))]);
        s.upsert(SECAO_TERRENO_SONDAS, 2, &b).expect("upsert");
        assert_eq!(s.sondas.len(), 3);
        assert_eq!(s.sondas[&2].x, 40.0);
        assert_eq!(s.sondas[&1].x, 3.0, "linha não tocada fica");
        let ruim = bytes(SECAO_TERRENO_SONDAS, 2, &[("id_num", v(&[1.0, 1.0])), ("x", v(&[7.0, 8.0]))]);
        assert_eq!(s.upsert(SECAO_TERRENO_SONDAS, 2, &ruim), Err(ENTRADA));
        let nan = bytes(SECAO_TERRENO_SONDAS, 2, &[("id_num", v(&[1.0, 5.0])), ("x", v(&[7.0, f64::NAN]))]);
        assert_eq!(s.upsert(SECAO_TERRENO_SONDAS, 2, &nan), Err(ENTRADA));
        assert_eq!(s.sondas[&1].x, 3.0, "upsert inválido não muda nada");
        assert!(!s.sondas.contains_key(&5));
        s.remover(SECAO_TERRENO_SONDAS, &[1, 77]);
        assert_eq!(s.sondas.keys().copied().collect::<Vec<_>>(), vec![2, 9]);
        s.definir(SECAO_TERRENO_SONDAS, 1, &bytes(SECAO_TERRENO_SONDAS, 1, &[("id_num", v(&[5.0]))])).expect("definir de novo");
        assert_eq!(s.sondas.keys().copied().collect::<Vec<_>>(), vec![5]);
    }

    #[test]
    fn cena_roteia_as_secoes_e_as_consultas_ainda_nao_existem() {
        let mut cena = Cena::novo();
        let b = bytes(SECAO_TERRENOS, 1, &[("id_num", v(&[1.0])), ("intervalo", v(&[0.5]))]);
        assert_eq!(cena.definir_secao(SECAO_TERRENOS, 1, &b), Ok(()));
        assert_eq!(cena.terreno.terrenos.len(), 1);
        assert_eq!(cena.upsert(SECAO_TERRENOS, 1, &bytes(SECAO_TERRENOS, 1, &[("id_num", v(&[2.0]))])), Ok(()));
        assert_eq!(cena.terreno.terrenos.len(), 2);
        assert_eq!(cena.remover(SECAO_TERRENOS, &[1]), Ok(()));
        assert_eq!(cena.terreno.terrenos.keys().copied().collect::<Vec<_>>(), vec![2]);
        for def in esquema::CONSULTAS.iter().filter(|c| c.id >= 160) {
            let args = vec![0.0; def.args.len()];
            assert_eq!(crate::consultas::executar(&mut cena, def.id, &args).err(), Some(NAO_IMPLEMENTADO), "consulta {}", def.id);
        }
    }
}
