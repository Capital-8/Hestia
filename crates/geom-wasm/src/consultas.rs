//! As três consultas da Fase 0 da ABI v2 (`schema/cena-v11.json`), sobre a seção `paredes`. A quarta,
//! `quadros_e_juncoes`, vive em `a1.rs`.
//!
//! ## Regras exatas (o harness do lado TypeScript deve reproduzi-las)
//!
//! Seja `h = espessura / 2`. A **caixa de uma parede** é a caixa do segmento (A, B) expandida por
//! `h` em cada lado:
//! `[min(ax,bx) - h, min(ay,by) - h, max(ax,bx) + h, max(ay,by) + h]`.
//! Cruzamento de caixas: **fronteira inclusiva** (caixas que apenas se tocam contam):
//! `a.minx <= b.maxx && b.minx <= a.maxx && a.miny <= b.maxy && b.miny <= a.maxy`.
//!
//! - `estatisticas_nivel(nivel)`: considera as paredes do nível (`0xFFFFFFFF` = todas).
//!   `n_paredes` = quantidade; `caixa` = união das caixas dos **segmentos, sem espessura**
//!   (`[0,0,0,0]` se não há paredes); `comprimento_total` = soma de
//!   `sqrt((bx-ax)^2 + (by-ay)^2)`, somada **em ordem crescente de id** (a ordem importa nos
//!   últimos bits do `f64`; comparar com tolerância relativa ~1e-12).
//! - `paredes_na_caixa(nivel, minx, miny, maxx, maxy)`: ids (crescentes) das paredes do nível cuja
//!   caixa (com espessura) cruza a caixa pedida. Caixa pedida invertida (`min > max`) não cruza
//!   nada.
//! - `pares_proximos(nivel, tol)`, `tol >= 0`: pares `(a, b)`, `a < b` (ids), em ordem
//!   lexicográfica, tais que, com `g = tol / 2`, as caixas de `a` e de `b` **cada uma expandida por
//!   `g` em cada lado** se cruzam (inclusive):
//!   `a.minx - g <= b.maxx + g && b.minx - g <= a.maxx + g && a.miny - g <= b.maxy + g &&
//!    b.miny - g <= a.maxy + g`. Ou seja, as caixas (com espessura) estão a distância de
//!   Chebyshev (por eixo) `<= tol`. Com `tol = 0` equivale a "as caixas se cruzam".
//!
//! Argumentos inválidos (não finitos, `nivel_num` fora de `[0, 2^32)` ou fracionário, `tol < 0`,
//! número de argumentos diferente do esquema) => `ENTRADA`.

use crate::cena::Cena;
use crate::esquema::{
    self, Tipo, CONSULTA_ESTATISTICAS_NIVEL, CONSULTA_ABERTURAS_GEOM, CONSULTA_CLUSTER_RESOLVIDO, CONSULTA_ITENS_PINTADOS, CONSULTA_RETORNOS_GEOM, CONSULTA_PARES_PROXIMOS, CONSULTA_PAREDES_NA_CAIXA, CONSULTA_QUADROS_E_JUNCOES, CONSULTA_JUNCTION_NIVEL, CONSULTA_QUANT_FORROS, CONSULTA_QUANT_LAJES, CONSULTA_QUANT_PAREDES, CONSULTA_QUANT_PISOS, CONSULTA_PISOS_LAJES_COM_PAREDES, CONSULTA_PISOS_LAJES_NIVEL, CONSULTA_RESOLVER_NIVEL,
    ENTRADA,
    NAO_IMPLEMENTADO,
};
use crate::indice::Caixa;

/// Uma saída tipada de uma consulta.
#[derive(Debug, Clone, PartialEq)]
pub enum Saida {
    U32(Vec<u32>),
    F64(Vec<f64>),
}

impl Saida {
    pub fn tipo(&self) -> u32 {
        match self {
            Saida::U32(_) => Tipo::U32.codigo(),
            Saida::F64(_) => Tipo::F64.codigo(),
        }
    }
    /// Nº de elementos.
    pub fn len(&self) -> usize {
        match self {
            Saida::U32(v) => v.len(),
            Saida::F64(v) => v.len(),
        }
    }
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
    /// Endereço do primeiro elemento (alinhado ao tipo; ponteiro "pendurado" mas alinhado se vazio).
    pub fn ptr(&self) -> usize {
        match self {
            Saida::U32(v) => v.as_ptr() as usize,
            Saida::F64(v) => v.as_ptr() as usize,
        }
    }
}

fn arg_nivel(v: f64) -> Result<u32, u32> {
    if v.is_finite() && v.fract() == 0.0 && (0.0..=(u32::MAX as f64)).contains(&v) {
        Ok(v as u32)
    } else {
        Err(ENTRADA)
    }
}

fn arg_finito(v: f64) -> Result<f64, u32> {
    if v.is_finite() {
        Ok(v)
    } else {
        Err(ENTRADA)
    }
}

/// Teste de proximidade de `pares_proximos` com `g = tol / 2` (ver regras no topo do arquivo).
#[inline]
pub fn par_proximo(a: &Caixa, b: &Caixa, g: f64) -> bool {
    a.minx - g <= b.maxx + g && b.minx - g <= a.maxx + g && a.miny - g <= b.maxy + g && b.miny - g <= a.maxy + g
}

/// Executa a consulta `id` com os argumentos `args`.
pub fn executar(cena: &mut Cena, id: u32, args: &[f64]) -> Result<Vec<Saida>, u32> {
    let def = esquema::consulta(id).ok_or(NAO_IMPLEMENTADO)?;
    if def.args_variaveis {
        if args.len() < def.args.len() {
            return Err(ENTRADA);
        }
    } else if args.len() != def.args.len() {
        return Err(ENTRADA);
    }
    match id {
        CONSULTA_ESTATISTICAS_NIVEL => estatisticas_nivel(cena, arg_nivel(args[0])?),
        CONSULTA_PAREDES_NA_CAIXA => {
            let nivel = arg_nivel(args[0])?;
            let q = Caixa {
                minx: arg_finito(args[1])?,
                miny: arg_finito(args[2])?,
                maxx: arg_finito(args[3])?,
                maxy: arg_finito(args[4])?,
            };
            paredes_na_caixa(cena, nivel, &q)
        }
        CONSULTA_PARES_PROXIMOS => {
            let nivel = arg_nivel(args[0])?;
            let tol = arg_finito(args[1])?;
            if tol < 0.0 {
                return Err(ENTRADA);
            }
            pares_proximos(cena, nivel, tol)
        }
        CONSULTA_QUADROS_E_JUNCOES => {
            let nivel = arg_nivel(args[0])?;
            let tol = arg_finito(args[1])?;
            if tol < 0.0 {
                return Err(ENTRADA);
            }
            crate::a1::quadros_e_juncoes(cena, nivel, tol)
        }
        CONSULTA_ITENS_PINTADOS | CONSULTA_RETORNOS_GEOM => {
            let nivel = arg_nivel(args[0])?;
            let tol = arg_finito(args[1])?;
            if tol < 0.0 {
                return Err(ENTRADA);
            }
            let tem_corte = match args[2] {
                x if x == 0.0 => false,
                x if x == 1.0 => true,
                _ => return Err(ENTRADA),
            };
            let corte = arg_finito(args[3])?;
            // `n_contorno` ids de parede vêm depois dos 5 argumentos fixos.
            let n = arg_nivel(args[4])? as usize;
            if args.len() != def.args.len() + n {
                return Err(ENTRADA);
            }
            let mut contorno = std::collections::BTreeSet::new();
            for &a in &args[def.args.len()..] {
                contorno.insert(arg_nivel(a)?);
            }
            let opcoes = crate::a2::OpcoesDePlanta { corte_z: if tem_corte { Some(corte) } else { None }, contorno };
            if id == CONSULTA_RETORNOS_GEOM {
                crate::a3b::retornos_geom(cena, nivel, tol, &opcoes)
            } else {
                crate::a2::itens_pintados(cena, nivel, tol, &opcoes)
            }
        }
        CONSULTA_CLUSTER_RESOLVIDO | CONSULTA_RESOLVER_NIVEL => {
            let nivel = arg_nivel(args[0])?;
            let tol = arg_finito(args[1])?;
            if tol < 0.0 {
                return Err(ENTRADA);
            }
            let tem_corte = match args[2] {
                x if x == 0.0 => false,
                x if x == 1.0 => true,
                _ => return Err(ENTRADA),
            };
            let corte = arg_finito(args[3])?;
            let n_contorno = arg_nivel(args[4])? as usize;
            let tem_aberturas = match args[5] {
                x if x == 0.0 => false,
                x if x == 1.0 => true,
                _ => return Err(ENTRADA),
            };
            let n_aberturas = arg_nivel(args[6])? as usize;
            if !tem_aberturas && n_aberturas != 0 {
                return Err(ENTRADA);
            }
            let fixos = def.args.len();
            if n_contorno.checked_add(n_aberturas).and_then(|t| t.checked_add(fixos)) != Some(args.len()) {
                return Err(ENTRADA);
            }
            let mut contorno = std::collections::BTreeSet::new();
            for &a in &args[fixos..fixos + n_contorno] {
                contorno.insert(arg_nivel(a)?);
            }
            let mut aberturas_planta = std::collections::BTreeSet::new();
            for &a in &args[fixos + n_contorno..] {
                aberturas_planta.insert(arg_nivel(a)?);
            }
            let opcoes = crate::a3c::OpcoesDoCluster {
                planta: crate::a2::OpcoesDePlanta { corte_z: if tem_corte { Some(corte) } else { None }, contorno },
                aberturas_planta: if tem_aberturas { Some(aberturas_planta) } else { None },
            };
            if id == CONSULTA_RESOLVER_NIVEL {
                crate::a3d::resolver_nivel_completo(cena, nivel, tol, &opcoes)
            } else {
                crate::a3c::cluster_resolvido(cena, nivel, tol, &opcoes)
            }
        }
        CONSULTA_ABERTURAS_GEOM => crate::a3::aberturas_geom(cena, arg_nivel(args[0])?),
        CONSULTA_PISOS_LAJES_NIVEL => crate::b1::pisos_lajes_nivel(cena, arg_nivel(args[0])?),
        CONSULTA_PISOS_LAJES_COM_PAREDES => {
            let nivel = arg_nivel(args[0])?;
            let tol = arg_finito(args[1])?;
            if tol < 0.0 {
                return Err(ENTRADA);
            }
            crate::b1::pisos_lajes_com_paredes(cena, nivel, tol)
        }
        CONSULTA_JUNCTION_NIVEL => {
            let nivel = arg_nivel(args[0])?;
            let tol = arg_finito(args[1])?;
            if tol < 0.0 {
                return Err(ENTRADA);
            }
            crate::b3::junction_nivel(cena, nivel, tol)
        }
        CONSULTA_QUANT_PAREDES | CONSULTA_QUANT_PISOS | CONSULTA_QUANT_LAJES | CONSULTA_QUANT_FORROS => {
            let nivel = arg_nivel(args[0])?;
            let tol = arg_finito(args[1])?;
            if tol < 0.0 {
                return Err(ENTRADA);
            }
            let linhas = match id {
                CONSULTA_QUANT_PAREDES => crate::quantidades::quantidades_paredes(cena, nivel, tol)?,
                CONSULTA_QUANT_PISOS => crate::quantidades::quantidades_pisos(cena, nivel, tol)?,
                CONSULTA_QUANT_LAJES => crate::quantidades::quantidades_lajes(cena, nivel, tol)?,
                _ => crate::quantidades::quantidades_forros(cena, nivel)?,
            };
            Ok(crate::quantidades::codificar(&linhas))
        }
        _ => Err(NAO_IMPLEMENTADO),
    }
}

pub fn estatisticas_nivel(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let ps = cena.paredes.do_nivel(nivel);
    let mut caixa = [0.0f64; 4];
    let mut comprimento = 0.0f64;
    for (k, p) in ps.iter().enumerate() {
        let c = p.caixa_segmento();
        if k == 0 {
            caixa = [c.minx, c.miny, c.maxx, c.maxy];
        } else {
            caixa[0] = caixa[0].min(c.minx);
            caixa[1] = caixa[1].min(c.miny);
            caixa[2] = caixa[2].max(c.maxx);
            caixa[3] = caixa[3].max(c.maxy);
        }
        comprimento += p.comprimento();
    }
    Ok(vec![Saida::U32(vec![ps.len() as u32]), Saida::F64(caixa.to_vec()), Saida::F64(vec![comprimento])])
}

pub fn paredes_na_caixa(cena: &mut Cena, nivel: u32, q: &Caixa) -> Result<Vec<Saida>, u32> {
    let nv = cena.indice_do_nivel(nivel);
    let mut itens = Vec::new();
    nv.indice.buscar(q, &mut itens);
    let ids: Vec<u32> = itens.iter().filter_map(|&i| nv.ids.get(i as usize).copied()).collect();
    Ok(vec![Saida::U32(ids)])
}

pub fn pares_proximos(cena: &mut Cena, nivel: u32, tol: f64) -> Result<Vec<Saida>, u32> {
    let nv = cena.indice_do_nivel(nivel);
    let g = tol / 2.0;
    // Folga na busca: só gera candidatos; o teste exato (`par_proximo`) decide.
    let folga = tol + tol * 1e-9 + nv.indice.escala() * 1e-12;
    let mut pares: Vec<u32> = Vec::new();
    let mut cand: Vec<u32> = Vec::new();
    for i in 0..nv.indice.len() {
        let (Some(ci), Some(&id_i)) = (nv.indice.caixa(i), nv.ids.get(i)) else { continue };
        nv.indice.buscar(&ci.expandida(folga), &mut cand);
        // `cand` vem em ordem crescente de item (= id crescente): a saída sai lexicográfica.
        for &j in &cand {
            if (j as usize) <= i {
                continue;
            }
            let (Some(cj), Some(&id_j)) = (nv.indice.caixa(j as usize), nv.ids.get(j as usize)) else { continue };
            if par_proximo(ci, cj, g) {
                pares.push(id_i);
                pares.push(id_j);
            }
        }
    }
    Ok(vec![Saida::U32(pares)])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cena::testes_util::*;
    use crate::cena::{LoteParedes, ParedeRef};
    use crate::esquema::{NIVEL_TODOS, SECAO_PAREDES};
    use crate::teste_util::Xorshift;
    use std::time::Instant;

    fn cena_com(l: &LoteParedes) -> Cena {
        let mut c = Cena::novo();
        c.definir_secao(SECAO_PAREDES, l.len() as u32, &codificar_paredes(l)).expect("definir");
        c
    }

    // --- implementações de referência (força bruta) ---

    fn ref_caixa(l: &LoteParedes, i: usize) -> Caixa {
        ParedeRef {
            id: l.id[i],
            nivel: l.nivel[i],
            ax: l.ax[i],
            ay: l.ay[i],
            bx: l.bx[i],
            by: l.by[i],
            espessura: l.espessura[i],
        }
        .caixa_com_espessura()
    }

    fn ordem_por_id(l: &LoteParedes, nivel: u32) -> Vec<usize> {
        let mut v: Vec<usize> = (0..l.len()).filter(|&i| nivel == NIVEL_TODOS || l.nivel[i] == nivel).collect();
        v.sort_by_key(|&i| l.id[i]);
        v
    }

    fn ref_na_caixa(l: &LoteParedes, nivel: u32, q: &Caixa) -> Vec<u32> {
        ordem_por_id(l, nivel).into_iter().filter(|&i| ref_caixa(l, i).cruza(q)).map(|i| l.id[i]).collect()
    }

    fn ref_pares(l: &LoteParedes, nivel: u32, tol: f64) -> Vec<u32> {
        let ord = ordem_por_id(l, nivel);
        let g = tol / 2.0;
        let mut out = Vec::new();
        for (k, &i) in ord.iter().enumerate() {
            for &j in &ord[k + 1..] {
                let (a, b) = (ref_caixa(l, i), ref_caixa(l, j));
                let ok = a.minx - g <= b.maxx + g && b.minx - g <= a.maxx + g && a.miny - g <= b.maxy + g && b.miny - g <= a.maxy + g;
                if ok {
                    out.push(l.id[i]);
                    out.push(l.id[j]);
                }
            }
        }
        out
    }

    fn ref_estat(l: &LoteParedes, nivel: u32) -> (u32, [f64; 4], f64) {
        let ord = ordem_por_id(l, nivel);
        let mut caixa = [0.0; 4];
        let mut comp = 0.0;
        for (k, &i) in ord.iter().enumerate() {
            let (minx, maxx) = (l.ax[i].min(l.bx[i]), l.ax[i].max(l.bx[i]));
            let (miny, maxy) = (l.ay[i].min(l.by[i]), l.ay[i].max(l.by[i]));
            if k == 0 {
                caixa = [minx, miny, maxx, maxy];
            } else {
                caixa = [caixa[0].min(minx), caixa[1].min(miny), caixa[2].max(maxx), caixa[3].max(maxy)];
            }
            comp += ((l.bx[i] - l.ax[i]).powi(2) + (l.by[i] - l.ay[i]).powi(2)).sqrt();
        }
        (ord.len() as u32, caixa, comp)
    }

    fn u32s(s: &Saida) -> &[u32] {
        match s {
            Saida::U32(v) => v,
            Saida::F64(_) => panic!("esperava u32"),
        }
    }
    fn f64s(s: &Saida) -> &[f64] {
        match s {
            Saida::F64(v) => v,
            Saida::U32(_) => panic!("esperava f64"),
        }
    }

    fn gerar(r: &mut Xorshift, n: usize, espaco: f64, comp: f64, niveis: u32) -> LoteParedes {
        let mut linhas = Vec::new();
        // ids embaralhados e não contíguos, para exercitar a ordenação por id
        let mut ids: Vec<u32> = (0..n as u32).map(|i| i * 3 + 7).collect();
        for k in (1..ids.len()).rev() {
            let j = (r.proximo() % (k as u64 + 1)) as usize;
            ids.swap(k, j);
        }
        for id in ids {
            let ax = r.intervalo(0.0, espaco);
            let ay = r.intervalo(0.0, espaco);
            let ang = r.intervalo(0.0, std::f64::consts::TAU);
            let len = r.intervalo(0.0, comp);
            let e = [0.0, 0.1, 0.2, 0.35][(r.proximo() % 4) as usize];
            linhas.push((id, (r.proximo() % niveis as u64) as u32, ax, ay, ax + len * ang.cos(), ay + len * ang.sin(), e));
        }
        lote(&linhas)
    }

    // --- casos fixos ---

    #[test]
    fn estatisticas_fixas() {
        let l = lote(&[(1, 0, 0.0, 0.0, 3.0, 4.0, 0.2), (2, 0, -1.0, 2.0, 1.0, 2.0, 0.5), (3, 1, 10.0, 10.0, 10.0, 12.0, 0.1)]);
        let mut c = cena_com(&l);
        let s = executar(&mut c, 1, &[0.0]).expect("ok");
        assert_eq!(u32s(&s[0]), &[2]);
        assert_eq!(f64s(&s[1]), &[-1.0, 0.0, 3.0, 4.0]);
        assert_eq!(f64s(&s[2]), &[7.0]);
        let s = executar(&mut c, 1, &[NIVEL_TODOS as f64]).expect("ok");
        assert_eq!(u32s(&s[0]), &[3]);
        assert_eq!(f64s(&s[1]), &[-1.0, 0.0, 10.0, 12.0]);
        // nível vazio
        let s = executar(&mut c, 1, &[5.0]).expect("ok");
        assert_eq!(u32s(&s[0]), &[0]);
        assert_eq!(f64s(&s[1]), &[0.0; 4]);
        assert_eq!(f64s(&s[2]), &[0.0]);
    }

    #[test]
    fn caixa_inclui_espessura_e_fronteira() {
        // parede horizontal de x=0..2, y=0, espessura 1 => caixa [0,-0.5,2,0.5]
        let l = lote(&[(10, 0, 0.0, 0.0, 2.0, 0.0, 1.0)]);
        let mut c = cena_com(&l);
        let mut q = |miny: f64, maxy: f64| executar(&mut c, 2, &[0.0, 0.0, miny, 2.0, maxy]).map(|s| u32s(&s[0]).to_vec());
        assert_eq!(q(0.5, 3.0), Ok(vec![10])); // toca em y=0.5 (inclusivo)
        assert_eq!(q(0.5000001, 3.0), Ok(vec![]));
        assert_eq!(q(-3.0, -0.5), Ok(vec![10]));
        assert_eq!(q(3.0, -3.0), Ok(vec![])); // invertida
    }

    #[test]
    fn pares_fixos() {
        // três paredes paralelas, espaçadas 1.0 com espessura 0.2 => caixas separadas por 0.8
        let l = lote(&[(1, 0, 0.0, 0.0, 5.0, 0.0, 0.2), (2, 0, 0.0, 1.0, 5.0, 1.0, 0.2), (3, 0, 0.0, 2.0, 5.0, 2.0, 0.2), (4, 1, 0.0, 0.5, 5.0, 0.5, 0.2)]);
        let mut c = cena_com(&l);
        let mut p = |tol: f64, nivel: f64| executar(&mut c, 3, &[nivel, tol]).map(|s| u32s(&s[0]).to_vec());
        assert_eq!(p(0.0, 0.0), Ok(vec![]));
        assert_eq!(p(0.79, 0.0), Ok(vec![]));
        assert_eq!(p(0.81, 0.0), Ok(vec![1, 2, 2, 3]));
        assert_eq!(p(1.81, 0.0), Ok(vec![1, 2, 1, 3, 2, 3]));
        assert_eq!(p(0.81, 1.0), Ok(vec![]));
        // todos os níveis: a parede 4 (y=0.5) fica a 0.3 de 1 e de 2 e a 1.3 de 3
        assert_eq!(p(0.81, NIVEL_TODOS as f64), Ok(vec![1, 2, 1, 4, 2, 3, 2, 4]));
    }

    #[test]
    fn caixas_que_apenas_se_tocam_contam_com_tol_zero() {
        let l = lote(&[(1, 0, 0.0, 0.0, 1.0, 0.0, 0.0), (2, 0, 1.0, 0.0, 2.0, 0.0, 0.0)]);
        let mut c = cena_com(&l);
        let s = executar(&mut c, 3, &[0.0, 0.0]).expect("ok");
        assert_eq!(u32s(&s[0]), &[1, 2]);
    }

    #[test]
    fn argumentos_invalidos() {
        let mut c = cena_com(&lote(&[(1, 0, 0.0, 0.0, 1.0, 0.0, 0.1)]));
        assert_eq!(executar(&mut c, 99, &[]), Err(NAO_IMPLEMENTADO));
        assert_eq!(executar(&mut c, 0, &[]), Err(NAO_IMPLEMENTADO));
        assert_eq!(executar(&mut c, 1, &[]), Err(ENTRADA));
        assert_eq!(executar(&mut c, 1, &[0.0, 0.0]), Err(ENTRADA));
        assert_eq!(executar(&mut c, 1, &[f64::NAN]), Err(ENTRADA));
        assert_eq!(executar(&mut c, 1, &[-1.0]), Err(ENTRADA));
        assert_eq!(executar(&mut c, 1, &[0.5]), Err(ENTRADA));
        assert_eq!(executar(&mut c, 1, &[4294967296.0]), Err(ENTRADA));
        assert_eq!(executar(&mut c, 1, &[f64::INFINITY]), Err(ENTRADA));
        assert!(executar(&mut c, 1, &[4294967295.0]).is_ok());
        assert_eq!(executar(&mut c, 2, &[0.0, 0.0, 0.0, f64::INFINITY, 1.0]), Err(ENTRADA));
        assert_eq!(executar(&mut c, 2, &[0.0, 0.0, 0.0, 1.0]), Err(ENTRADA));
        assert_eq!(executar(&mut c, 3, &[0.0, -0.001]), Err(ENTRADA));
        assert_eq!(executar(&mut c, 3, &[0.0, f64::NAN]), Err(ENTRADA));
        assert_eq!(executar(&mut c, 3, &[0.0]), Err(ENTRADA));
    }

    // --- aleatórios contra força bruta ---

    #[test]
    fn consultas_iguais_a_forca_bruta_aleatoria() {
        let mut r = Xorshift::novo(2024);
        for rodada in 0..60 {
            let n = (r.proximo() % 250) as usize;
            let (espaco, comp) = [(50.0, 5.0), (20.0, 8.0), (200.0, 3.0), (10.0, 30.0)][rodada % 4];
            let l = gerar(&mut r, n, espaco, comp, 3);
            let mut c = cena_com(&l);
            for nivel in [0, 1, 2, 7, NIVEL_TODOS] {
                // estatísticas
                let (n_ref, caixa_ref, comp_ref) = ref_estat(&l, nivel);
                let s = executar(&mut c, 1, &[nivel as f64]).expect("estat");
                assert_eq!(u32s(&s[0]), &[n_ref]);
                assert_eq!(f64s(&s[1]), &caixa_ref);
                assert_eq!(f64s(&s[2]), &[comp_ref]);
                // caixas
                for _ in 0..8 {
                    let x = r.intervalo(-5.0, espaco);
                    let y = r.intervalo(-5.0, espaco);
                    let q = Caixa { minx: x, miny: y, maxx: x + r.intervalo(0.0, 25.0), maxy: y + r.intervalo(0.0, 25.0) };
                    let s = executar(&mut c, 2, &[nivel as f64, q.minx, q.miny, q.maxx, q.maxy]).expect("caixa");
                    assert_eq!(u32s(&s[0]), ref_na_caixa(&l, nivel, &q).as_slice());
                }
                // pares
                for tol in [0.0, 0.05, 0.5, 3.0] {
                    let s = executar(&mut c, 3, &[nivel as f64, tol]).expect("pares");
                    assert_eq!(u32s(&s[0]), ref_pares(&l, nivel, tol).as_slice(), "rodada {rodada} nivel {nivel} tol {tol}");
                }
            }
        }
    }

    #[test]
    fn consultas_depois_de_upsert_e_remocao_batem_com_a_referencia() {
        let mut r = Xorshift::novo(77);
        let base = gerar(&mut r, 150, 40.0, 6.0, 2);
        let mut c = cena_com(&base);
        let mut atual: Vec<(u32, u32, f64, f64, f64, f64, f64)> = (0..base.len())
            .map(|i| (base.id[i], base.nivel[i], base.ax[i], base.ay[i], base.bx[i], base.by[i], base.espessura[i]))
            .collect();
        for passo in 0..30 {
            // consulta (força a construção do cache) antes de mudar
            executar(&mut c, 3, &[0.0, 0.3]).expect("pares");
            let alvo = atual[(r.proximo() % atual.len() as u64) as usize].0;
            if passo % 2 == 0 {
                atual.retain(|l| l.0 != alvo);
                c.remover(SECAO_PAREDES, &[alvo]).expect("remover");
            } else {
                let novo = (alvo, (r.proximo() % 2) as u32, r.intervalo(0.0, 40.0), r.intervalo(0.0, 40.0), r.intervalo(0.0, 40.0), r.intervalo(0.0, 40.0), 0.2);
                for l in atual.iter_mut() {
                    if l.0 == alvo {
                        *l = novo;
                    }
                }
                c.upsert(SECAO_PAREDES, 1, &codificar_paredes(&lote(&[novo]))).expect("upsert");
            }
            let l = lote(&atual);
            for nivel in [0, 1, NIVEL_TODOS] {
                let s = executar(&mut c, 3, &[nivel as f64, 0.3]).expect("pares");
                assert_eq!(u32s(&s[0]), ref_pares(&l, nivel, 0.3).as_slice(), "passo {passo}");
                let q = Caixa { minx: 5.0, miny: 5.0, maxx: 25.0, maxy: 25.0 };
                let s = executar(&mut c, 2, &[nivel as f64, 5.0, 5.0, 25.0, 25.0]).expect("caixa");
                assert_eq!(u32s(&s[0]), ref_na_caixa(&l, nivel, &q).as_slice());
            }
        }
    }

    #[test]
    fn determinismo_mesma_entrada_mesma_saida() {
        let mut r = Xorshift::novo(5);
        let l = gerar(&mut r, 300, 60.0, 6.0, 2);
        let a = rodar_ok(&l);
        let b = rodar_ok(&l);
        assert_eq!(a, b);
        // e a ordem de entrada das linhas não muda a saída
        let mut inv = l.clone();
        inv.id.reverse();
        inv.nivel.reverse();
        inv.ax.reverse();
        inv.ay.reverse();
        inv.bx.reverse();
        inv.by.reverse();
        inv.espessura.reverse();
        assert_eq!(a[1..], rodar_ok(&inv)[1..]);
    }

    fn rodar_ok(l: &LoteParedes) -> Vec<Vec<Saida>> {
        let mut c = cena_com(l);
        vec![
            executar(&mut c, 1, &[0.0]).expect("1"),
            executar(&mut c, 2, &[0.0, 0.0, 0.0, 30.0, 30.0]).expect("2"),
            executar(&mut c, 3, &[0.0, 0.4]).expect("3"),
        ]
    }

    // --- escala ---

    #[test]
    fn escala_20000_paredes_pares_rapido() {
        let mut r = Xorshift::novo(99);
        // densidade de uma cidade: ~5 m de parede, 20000 paredes em 1000 x 1000 m
        let l = gerar(&mut r, 20_000, 1000.0, 5.0, 1);
        let mut c = cena_com(&l);
        let t = Instant::now();
        let s = executar(&mut c, 3, &[0.0, 0.1]).expect("pares");
        let dt_grade = t.elapsed();
        let pares = u32s(&s[0]).to_vec();
        // segunda chamada usa o cache do índice
        let t = Instant::now();
        executar(&mut c, 3, &[0.0, 0.1]).expect("pares");
        let dt_cache = t.elapsed();
        // força bruta (O(n^2)) para comparação de resultado e de tempo
        let t = Instant::now();
        let bruto = ref_pares(&l, 0, 0.1);
        let dt_bruto = t.elapsed();
        assert_eq!(pares, bruto);
        eprintln!(
            "20000 paredes, {} pares: grade {:?} (com índice) / {:?} (índice em cache), força bruta {:?}",
            pares.len() / 2,
            dt_grade,
            dt_cache,
            dt_bruto
        );
        let limite_ms = if cfg!(debug_assertions) { 2000 } else { 200 };
        assert!(dt_grade.as_millis() < limite_ms, "pares_proximos demorou {:?}", dt_grade);
        assert!(dt_grade < dt_bruto, "a grade deveria vencer a força bruta");
    }
}
