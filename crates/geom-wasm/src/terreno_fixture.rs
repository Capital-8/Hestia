//! Fixtures de referência do terreno (PLANO do terreno A.10), só para os testes Rust. Equivalente Rust de `packages/engine/src/fixtureTerreno.ts`.
//!
//! As fixtures entram na cena pelas seções codificadas (`definir_secao`), como na ABI: é o caminho que mantém a geração das fontes e o cache coerentes.
//! Os `id_num` dos vértices seguem a ordem canônica (pontos soltos, vértices de cada curva, de cada quebra e, por fim, da borda).

use crate::cena::Cena;
use crate::esquema::{self, bytes_coluna, Tipo, ID_AUSENTE, SECAO_TERRENOS, SECAO_TERRENO_LINHAS, SECAO_TERRENO_SONDAS, SECAO_TERRENO_VERTICES};
use crate::secoes_terreno::{LINHA_BORDA, LINHA_CURVA, LINHA_QUEBRA};

/// Um terreno de teste, nos termos do modelo (A.3).
#[derive(Clone, Debug)]
pub struct TerrenoFx {
    pub id: u32,
    pub nivel: u32,
    pub espessura_base: f64,
    pub intervalo: f64,
    /// Uma curva mestra a cada N (padrão 5).
    pub mestra_cada: u32,
    pub pontos: Vec<[f64; 3]>,
    /// `(z, xy, fechada)`.
    pub curvas: Vec<(f64, Vec<[f64; 2]>, bool)>,
    pub quebras: Vec<Vec<[f64; 3]>>,
    pub borda: Option<Vec<[f64; 2]>>,
}

impl TerrenoFx {
    pub fn novo(id: u32, pontos: Vec<[f64; 3]>) -> TerrenoFx {
        TerrenoFx { id, nivel: 0, espessura_base: 3.0, intervalo: 0.5, mestra_cada: 5, pontos, curvas: Vec::new(), quebras: Vec::new(), borda: None }
    }

    /// Todos os vértices de fonte (pontos, curvas e quebras), na ordem canônica.
    pub fn vertices_de_fonte(&self) -> Vec<[f64; 3]> {
        let mut v = self.pontos.clone();
        for (z, xy, _) in &self.curvas {
            v.extend(xy.iter().map(|p| [p[0], p[1], *z]));
        }
        for q in &self.quebras {
            v.extend(q.iter().copied());
        }
        v
    }
}

/// Cantos do quadrado (0,0)–(20,20) com a cota dada por `z(x, y)`.
fn cantos(z: impl Fn(f64, f64) -> f64) -> Vec<[f64; 3]> {
    [[0.0, 0.0], [20.0, 0.0], [20.0, 20.0], [0.0, 20.0]].iter().map(|p| [p[0], p[1], z(p[0], p[1])]).collect()
}

/// T1 plano: cantos com z = 10.
pub fn t1(id: u32) -> TerrenoFx {
    TerrenoFx::novo(id, cantos(|_, _| 10.0))
}

/// T2 rampa: z = 10,25 + 0,1·x.
pub fn t2(id: u32) -> TerrenoFx {
    TerrenoFx::novo(id, cantos(|x, _| 10.25 + 0.1 * x))
}

/// T3 pirâmide: cantos com z = 0 e o centro com z = 5; intervalo 1.
pub fn t3(id: u32) -> TerrenoFx {
    let mut p = cantos(|_, _| 0.0);
    p.push([10.0, 10.0, 5.0]);
    TerrenoFx { intervalo: 1.0, ..TerrenoFx::novo(id, p) }
}

/// T4 vale: cantos com z = 2 e linha de quebra de (10, 0, 0) a (10, 20, 0).
pub fn t4(id: u32) -> TerrenoFx {
    TerrenoFx { quebras: vec![vec![[10.0, 0.0, 0.0], [10.0, 20.0, 0.0]]], ..TerrenoFx::novo(id, cantos(|_, _| 2.0)) }
}

/// T8 borda: T3 com borda no quadrado (5,5)–(15,15).
pub fn t8(id: u32) -> TerrenoFx {
    TerrenoFx { borda: Some(vec![[5.0, 5.0], [15.0, 5.0], [15.0, 15.0], [5.0, 15.0]]), ..t3(id) }
}

/// T9 cruzadas: T1 mais duas quebras que se cruzam em X.
pub fn t9(id: u32) -> TerrenoFx {
    TerrenoFx { quebras: vec![vec![[5.0, 5.0, 10.0], [15.0, 15.0, 10.0]], vec![[5.0, 15.0, 10.0], [15.0, 5.0, 10.0]]], ..t1(id) }
}

/// Bytes de uma seção a partir de colunas dadas por nome (cada coluna preenchida a múltiplo de 8, como no codec).
pub fn bytes_da_secao(secao: u32, n: usize, valores: &[(&str, Vec<f64>)]) -> Vec<u8> {
    let s = esquema::secao(secao).expect("seção");
    let mut out = Vec::new();
    for c in s.colunas {
        let v = &valores.iter().find(|(nome, _)| *nome == c.nome).unwrap_or_else(|| panic!("coluna {} sem valores", c.nome)).1;
        assert_eq!(v.len(), n, "coluna {}", c.nome);
        let mut col = Vec::new();
        for &x in v {
            match c.tipo {
                Tipo::U32 => col.extend_from_slice(&(x as u32).to_le_bytes()),
                Tipo::I32 => col.extend_from_slice(&(x as i32).to_le_bytes()),
                Tipo::F64 => col.extend_from_slice(&x.to_le_bytes()),
                Tipo::U8 => col.push(x as u8),
            }
        }
        col.resize(bytes_coluna(c.tipo, n).expect("tamanho"), 0);
        out.extend(col);
    }
    out
}

/// Colunas das seções 160 a 162 para os terrenos dados.
#[derive(Default)]
struct Colunas {
    terrenos: [Vec<f64>; 5],
    linhas: [Vec<f64>; 4],
    vertices: [Vec<f64>; 7],
}

impl Colunas {
    fn linha(&mut self, terreno: u32, tipo: u8, fechada: bool) -> f64 {
        let id = self.linhas[0].len() as f64;
        for (c, x) in self.linhas.iter_mut().zip([id, f64::from(terreno), f64::from(tipo), f64::from(u8::from(fechada))]) {
            c.push(x);
        }
        id
    }

    fn vertice(&mut self, terreno: u32, linha: f64, ordem: usize, p: [f64; 3]) {
        let id = self.vertices[0].len() as f64;
        for (c, x) in self.vertices.iter_mut().zip([id, f64::from(terreno), linha, ordem as f64, p[0], p[1], p[2]]) {
            c.push(x);
        }
    }
}

/// Define as seções 160 a 162 inteiras com os terrenos dados. Erro de decodificação (por exemplo, `NaN`) volta como o código do kernel.
pub fn enviar(cena: &mut Cena, terrenos: &[TerrenoFx]) -> Result<(), u32> {
    let mut c = Colunas::default();
    let solto = f64::from(ID_AUSENTE);
    for t in terrenos {
        for (col, x) in c.terrenos.iter_mut().zip([f64::from(t.id), f64::from(t.nivel), t.espessura_base, t.intervalo, f64::from(t.mestra_cada)]) {
            col.push(x);
        }
        for (k, p) in t.pontos.iter().enumerate() {
            c.vertice(t.id, solto, k, *p);
        }
        for (z, xy, fechada) in &t.curvas {
            let l = c.linha(t.id, LINHA_CURVA, *fechada);
            for (k, p) in xy.iter().enumerate() {
                c.vertice(t.id, l, k, [p[0], p[1], *z]);
            }
        }
        for q in &t.quebras {
            let l = c.linha(t.id, LINHA_QUEBRA, false);
            for (k, p) in q.iter().enumerate() {
                c.vertice(t.id, l, k, *p);
            }
        }
        if let Some(b) = &t.borda {
            let l = c.linha(t.id, LINHA_BORDA, true);
            for (k, p) in b.iter().enumerate() {
                c.vertice(t.id, l, k, [p[0], p[1], 0.0]);
            }
        }
    }
    let nomes = |secao: u32| esquema::secao(secao).expect("seção").colunas.iter().map(|c| c.nome).collect::<Vec<_>>();
    let enviar_secao = |cena: &mut Cena, secao: u32, cols: &[Vec<f64>]| {
        let n = cols[0].len();
        let pares: Vec<(&str, Vec<f64>)> = nomes(secao).into_iter().zip(cols.iter().cloned()).collect();
        cena.definir_secao(secao, n as u32, &bytes_da_secao(secao, n, &pares))
    };
    enviar_secao(cena, SECAO_TERRENOS, &c.terrenos)?;
    enviar_secao(cena, SECAO_TERRENO_LINHAS, &c.linhas)?;
    enviar_secao(cena, SECAO_TERRENO_VERTICES, &c.vertices)
}

/// Uma cena nova com os terrenos dados.
pub fn cena_com(terrenos: &[TerrenoFx]) -> Cena {
    let mut cena = Cena::novo();
    enviar(&mut cena, terrenos).expect("fixture válida");
    cena
}

/// Define a seção 165 com as sondas dadas (`id_num` = posição na lista).
pub fn enviar_sondas(cena: &mut Cena, sondas: &[[f64; 2]]) {
    let ids = (0..sondas.len()).map(|k| k as f64).collect();
    let cols = [("id_num", ids), ("x", sondas.iter().map(|p| p[0]).collect()), ("y", sondas.iter().map(|p| p[1]).collect())];
    cena.definir_secao(SECAO_TERRENO_SONDAS, sondas.len() as u32, &bytes_da_secao(SECAO_TERRENO_SONDAS, sondas.len(), &cols)).expect("sondas");
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn fixtures_entram_na_cena_na_ordem_canonica() {
        let fx = TerrenoFx { curvas: vec![(1.0, vec![[1.0, 1.0], [2.0, 1.0]], true)], ..t8(7) };
        let cena = cena_com(&[t4(3), fx.clone()]);
        assert_eq!(cena.terreno.terrenos.keys().copied().collect::<Vec<_>>(), vec![3, 7]);
        assert_eq!(cena.terreno.terrenos[&7].intervalo, 1.0);
        assert_eq!(cena.terreno.terrenos[&7].espessura_base, 3.0);
        assert_eq!(cena.terreno.terrenos[&7].mestra_cada, 5);
        assert_eq!(cena.terreno.linhas.len(), 3, "quebra de T4, curva e borda do outro");
        assert_eq!(cena.terreno.vertices.len(), 6 + 5 + 2 + 4);
        let soltos = cena.terreno.vertices.values().filter(|v| v.linha == ID_AUSENTE).count();
        assert_eq!(soltos, 4 + 5);
        assert_eq!(fx.vertices_de_fonte().len(), 7);
        assert_eq!(fx.vertices_de_fonte()[5], [1.0, 1.0, 1.0]);
        assert_eq!(t9(1).quebras.len(), 2);
        assert_eq!(t2(1).pontos[1], [20.0, 0.0, 12.25]);
        assert_eq!(t1(1).pontos[2], [20.0, 20.0, 10.0]);
    }

    #[test]
    fn sondas_e_erro_de_entrada() {
        let mut cena = Cena::novo();
        enviar_sondas(&mut cena, &[[1.0, 2.0], [3.0, 4.0]]);
        assert_eq!(cena.terreno.sondas[&1].y, 4.0);
        let mut ruim = t1(1);
        ruim.pontos[0][2] = f64::NAN;
        assert_eq!(enviar(&mut cena, &[ruim]), Err(crate::esquema::ENTRADA));
    }
}
