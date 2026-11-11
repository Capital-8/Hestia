//! Grade da parede cortina (decisão 0056, §5.1): as linhas internas de um eixo nos quatro modos (`fixedNumber`, `fixedDistance` com justificação,
//! `maxDistance` e `manual`), o deslocamento, a fusão da sobra minúscula e a fusão campo a campo do tipo com a instância. Segue a referência TS
//! (`cortinaRef/grade.ts`) operação por operação.
//!
//! Regras numéricas:
//! - posição "dentro" quando `TOL_POS < p < A − TOL_POS`; linha nas pontas é borda, não linha; duas linhas a menos de `TOL_POS` viram uma (a primeira vale);
//! - `floor(A/d + 1e-9)` e `ceil(A/d − 1e-9)` contam as divisões; a sobra é comparada como `x < r − 1e-9`;
//! - `fixedNumber` e `maxDistance`: as linhas `k = 0 … n` de `A·k/n + o`; com deslocamento as de `k = 0` e `k = n` entram ou saem do vão;
//! - `fixedDistance`: o padrão PERIÓDICO `p0 + k·d + o` (`p0` = 0, `R/2` ou `R`, conforme a justificação); com `m = 0` há uma célula só e o
//!   deslocamento é ignorado; sempre funde a sobra;
//! - `manual`: `(âncora) + o`; fora do vão = ignorada com aviso; ordena e solda; NUNCA funde a sobra (a linha do usuário é preservada);
//! - fusão da sobra: em `fixedDistance` sempre, nos modos de divisão igual só com deslocamento; só as duas células de ponta e uma vez cada.

use std::collections::BTreeMap;

use crate::cortina_tipos::*;
use crate::esquema::{AVISO_CORTINA_POSICAO_FORA, AVISO_CORTINA_SOBRA_FUNDIDA, ENTRADA, ID_AUSENTE, LIMITE};
use crate::secoes_cortina::{GradeLinha, SecoesCortina};

/// Informativos que o cálculo de um eixo produz (viram `cortina_avisos`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AvisoEixo {
    pub codigo: u32,
    pub medido: f64,
    pub limite: f64,
    /// Posição no eixo (m) a que o aviso se refere.
    pub pos: f64,
    /// `sobra-fundida`: índice da célula fundida no eixo (0 = a primeira); `posicao-fora`: ordem da posição manual.
    pub indice: u32,
}

/// Linhas internas de um eixo, em ordem crescente, e os informativos.
#[derive(Clone, Debug, PartialEq)]
pub struct LinhasEixo {
    pub linhas: Vec<f64>,
    pub avisos: Vec<AvisoEixo>,
}

fn dentro(a: f64, p: f64) -> bool {
    p > TOL_POS && p < a - TOL_POS
}

/// Linhas internas do eixo de comprimento `a` (m). `LIMITE` se passar de 128 linhas; `ENTRADA` se o modo pedir um campo ausente ou inválido, ou se
/// o ângulo não for 0.
pub fn linhas_do_eixo(a: f64, e: &EixoEfetivo) -> Result<LinhasEixo, u32> {
    if !(a > 0.0 && a.is_finite()) || e.angulo.abs() > 1e-12 || !e.deslocamento.is_finite() || e.resto_minimo.is_nan() || e.resto_minimo < 0.0 {
        return Err(ENTRADA);
    }
    let teto = (LIMITE_LINHAS_EIXO + 1) as f64;
    let o = e.deslocamento;
    let mut avisos = Vec::new();
    let mut bruto: Vec<f64> = Vec::new();
    // Lado nominal da célula (para o aviso de sobra fundida); 0 = sem nominal (manual).
    let mut nominal = 0.0;
    let mut fundir = o != 0.0;
    match e.modo {
        MODO_NUMERO | MODO_DIST_MAX => {
            let n = if e.modo == MODO_NUMERO {
                if e.numero == 0 {
                    return Err(ENTRADA);
                }
                nominal = a / e.numero as f64;
                e.numero as f64
            } else {
                if !(e.distancia.is_finite() && e.distancia > 0.0) {
                    return Err(ENTRADA);
                }
                nominal = e.distancia;
                (a / e.distancia - EPS_CONTAGEM).ceil().max(1.0)
            };
            if n > teto {
                return Err(LIMITE);
            }
            for k in 0..=n as u32 {
                bruto.push((a * k as f64) / n + o);
            }
        }
        MODO_DIST_FIXA => {
            let d = e.distancia;
            if !(d.is_finite() && d > 0.0) {
                return Err(ENTRADA);
            }
            nominal = d;
            fundir = true;
            let m = (a / d + EPS_CONTAGEM).floor();
            if m > teto {
                return Err(LIMITE);
            }
            if m >= 1.0 {
                let resto = (a - m * d).max(0.0);
                let p0 = match e.justificacao {
                    JUSTIF_FIM => resto,
                    JUSTIF_CENTRO => resto / 2.0,
                    _ => 0.0,
                };
                // Padrão periódico p0 + k·d, deslocado de o.
                let kmin = ((0.0 - p0 - o) / d).floor() as i64 - 1;
                let kmax = ((a - p0 - o) / d).ceil() as i64 + 1;
                if kmax - kmin > 4 * (LIMITE_LINHAS_EIXO as i64 + 4) {
                    return Err(LIMITE);
                }
                for k in kmin..=kmax {
                    bruto.push(p0 + k as f64 * d + o);
                }
            }
        }
        MODO_MANUAL => {
            fundir = false;
            if e.posicoes.len() > LIMITE_POSICOES_MANUAIS {
                return Err(LIMITE);
            }
            for (ordem, &p) in e.posicoes.iter().enumerate() {
                if !p.is_finite() {
                    return Err(ENTRADA);
                }
                let q = (if e.ancora == ANCORA_FIM { a - p } else { p }) + o;
                if dentro(a, q) {
                    bruto.push(q);
                } else {
                    avisos.push(AvisoEixo { codigo: AVISO_CORTINA_POSICAO_FORA, medido: q, limite: a, pos: q, indice: ordem as u32 });
                }
            }
        }
        _ => return Err(ENTRADA),
    }
    // Filtra o que caiu no vão, ordena e solda (a primeira das duas linhas próximas vale).
    bruto.retain(|&p| dentro(a, p));
    bruto.sort_by(|x, y| x.total_cmp(y));
    let mut linhas: Vec<f64> = Vec::with_capacity(bruto.len());
    for p in bruto {
        if linhas.last().is_none_or(|&u| p - u >= TOL_POS) {
            linhas.push(p);
        }
    }
    if fundir && !linhas.is_empty() {
        fundir_sobras(a, e.resto_minimo, nominal, &mut linhas, &mut avisos);
    }
    if linhas.len() > LIMITE_LINHAS_EIXO {
        return Err(LIMITE);
    }
    Ok(LinhasEixo { linhas, avisos })
}

/// Fusão da sobra minúscula: a célula de ponta menor que `r` some, a linha que a separava vai junto. Uma vez por ponta.
fn fundir_sobras(a: f64, r: f64, nominal: f64, linhas: &mut Vec<f64>, avisos: &mut Vec<AvisoEixo>) {
    let mut avisa = |pos: f64, largura: f64, indice: usize| {
        if nominal > 0.0 && largura > FATOR_SOBRA_AVISO * nominal + EPS_CONTAGEM {
            avisos.push(AvisoEixo { codigo: AVISO_CORTINA_SOBRA_FUNDIDA, medido: largura, limite: FATOR_SOBRA_AVISO * nominal, pos, indice: indice as u32 });
        }
    };
    if linhas[0] < r - EPS_CONTAGEM {
        let sumiu = linhas.remove(0);
        avisa(sumiu, linhas.first().copied().unwrap_or(a), 0);
    }
    if let Some(&ultima) = linhas.last() {
        if a - ultima < r - EPS_CONTAGEM {
            let sumiu = linhas.pop().unwrap_or(ultima);
            avisa(sumiu, a - linhas.last().copied().unwrap_or(0.0), linhas.len());
        }
    }
}

/// Arestas completas de um eixo: `0`, as linhas internas e `a`.
pub fn arestas(a: f64, linhas: &[f64]) -> Vec<f64> {
    let mut v = Vec::with_capacity(linhas.len() + 2);
    v.push(0.0);
    v.extend_from_slice(linhas);
    v.push(a);
    v
}

/// Grades (linhas e posições) indexadas para a fusão do tipo com a instância.
pub struct IndiceGrades<'a> {
    sec: &'a SecoesCortina,
    por_dono: BTreeMap<(u8, u32, u8), u32>,
    posicoes: BTreeMap<u32, Vec<(u32, f64)>>,
}

impl<'a> IndiceGrades<'a> {
    pub fn novo(sec: &'a SecoesCortina) -> IndiceGrades<'a> {
        let por_dono = sec.grades.iter().map(|(&id, g)| ((g.dono, g.dono_num, g.eixo), id)).collect();
        let mut posicoes: BTreeMap<u32, Vec<(u32, f64)>> = BTreeMap::new();
        for p in sec.posicoes.values() {
            posicoes.entry(p.grade).or_default().push((p.ordem, p.pos));
        }
        for v in posicoes.values_mut() {
            v.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)));
        }
        IndiceGrades { sec, por_dono, posicoes }
    }

    fn linha(&self, dono: u8, dono_num: u32, eixo: u8) -> Option<(u32, &GradeLinha)> {
        let id = *self.por_dono.get(&(dono, dono_num, eixo))?;
        Some((id, self.sec.grades.get(&id)?))
    }

    /// `{ ...tipo, ...instância }` campo a campo (ADR §4.3). `ENTRADA` se o tipo não tem o eixo ou não define o modo.
    pub fn efetivo(&self, tipo: u32, cortina: u32, eixo: u8) -> Result<EixoEfetivo, u32> {
        let (id_t, t) = self.linha(0, tipo, eixo).ok_or(ENTRADA)?;
        if t.modo == HERDA {
            return Err(ENTRADA);
        }
        let mut e = EixoEfetivo {
            modo: t.modo,
            numero: t.numero,
            distancia: t.distancia,
            justificacao: if t.justificacao == HERDA { JUSTIF_INICIO } else { t.justificacao },
            posicoes: self.posicoes.get(&id_t).map(|v| v.iter().map(|x| x.1).collect()).unwrap_or_default(),
            ancora: if t.ancora == HERDA { ANCORA_INICIO } else { t.ancora },
            deslocamento: if t.deslocamento.is_nan() { 0.0 } else { t.deslocamento },
            angulo: if t.angulo.is_nan() { 0.0 } else { t.angulo },
            resto_minimo: if t.resto_minimo.is_nan() { SOBRA_FUNDIDA_PADRAO } else { t.resto_minimo },
        };
        if e.numero == ID_AUSENTE {
            e.numero = 0;
        }
        if let Some((id_i, i)) = self.linha(1, cortina, eixo) {
            if i.modo != HERDA {
                e.modo = i.modo;
            }
            if i.numero != ID_AUSENTE {
                e.numero = i.numero;
            }
            if !i.distancia.is_nan() {
                e.distancia = i.distancia;
            }
            if i.justificacao != HERDA {
                e.justificacao = i.justificacao;
            }
            if i.ancora != HERDA {
                e.ancora = i.ancora;
            }
            if !i.deslocamento.is_nan() {
                e.deslocamento = i.deslocamento;
            }
            if !i.angulo.is_nan() {
                e.angulo = i.angulo;
            }
            if !i.resto_minimo.is_nan() {
                e.resto_minimo = i.resto_minimo;
            }
            if let Some(p) = self.posicoes.get(&id_i) {
                e.posicoes = p.iter().map(|x| x.1).collect();
            }
        }
        Ok(e)
    }
}

/// Saída da consulta `cortina_grade`: as linhas internas de cada eixo, as células e os segmentos de cada linha (bordas inclusive).
///
/// - `linhas` `[cortina_num, eixo, indice, origem, flags]` e `linhas_pos` `[pos]`: só as linhas internas (índices 1 a n-1; 0 e n são as bordas);
///   `origem` 0 gerada, 1 extra, 2 manual; `flags` reservado (0);
/// - `celulas` `[cortina_num, i, j, regiao, painel_tipo_num, flags]` e `celulas_ret` `[s0, s1, z0, z1]` (a célula cheia, sem descontar montantes);
///   `regiao` = `i · nv + j` (a posição da célula na saída; cada célula é uma região até a fase 2); `flags` bit 0 = menor lado livre menor que a célula mínima;
/// - `segmentos` `[cortina_num, linha, k, removido, montante_tipo_num]` e `segmentos_ext` `[de, ate]`: um por trecho de cada aresta nominal (centro a
///   centro, sem aparo; as bordas contam). `linha` é o índice GLOBAL: U = 0 a nu (0 = borda início, nu = borda fim), V = nu+1 a nu+1+nv (nu+1 =
///   borda base, nu+1+nv = borda topo); `k` corre de baixo para cima nas verticais e do início ao fim nas horizontais; `removido` é 0 até a fase 2;
///   `montante_tipo_num` é `ID_AUSENTE` quando o papel não tem montante.
///
/// Ordem: cortina, U antes de V, índice, depois `i` e `j`. Valores na grade de 1 µm. Cortina de fora (arco, degenerada) não sai.
pub fn consulta_cortina_grade(cena: &crate::cena::Cena, nivel: u32) -> Result<Vec<crate::consultas::Saida>, u32> {
    use crate::consultas::Saida;
    let cortinas = crate::cortina_pecas::resolver(cena, nivel)?;
    let (mut linhas, mut linhas_pos) = (Vec::new(), Vec::new());
    let (mut celulas, mut celulas_ret) = (Vec::new(), Vec::new());
    let (mut segmentos, mut segmentos_ext) = (Vec::new(), Vec::new());
    for c in &cortinas {
        let Some(g) = &c.g else { continue };
        for (eixo, arestas, origens) in [(EIXO_U, &g.us, &g.origem_u), (EIXO_V, &g.vs, &g.origem_v)] {
            let travadas = if eixo == EIXO_U { &g.travada_u } else { &g.travada_v };
            for (k, &pos) in arestas.iter().enumerate().take(arestas.len() - 1).skip(1) {
                linhas.extend_from_slice(&[c.id, eixo as u32, k as u32, origens[k], travadas[k]]);
                linhas_pos.push(na_grade(pos));
            }
        }
        for x in &g.celulas {
            celulas.extend_from_slice(&[c.id, x.i, x.j, x.regiao, x.painel, x.flags]);
            celulas_ret.extend_from_slice(&[na_grade(x.s0), na_grade(x.s1), na_grade(x.z0), na_grade(x.z1)]);
        }
        for s in &g.segmentos {
            segmentos.extend_from_slice(&[c.id, g.linha_global(s.eixo, s.linha), s.k, u32::from(s.removido), s.montante]);
            segmentos_ext.extend_from_slice(&[na_grade(s.de), na_grade(s.ate)]);
        }
    }
    Ok(vec![Saida::U32(linhas), Saida::F64(linhas_pos), Saida::U32(celulas), Saida::F64(celulas_ret), Saida::U32(segmentos), Saida::F64(segmentos_ext)])
}

#[cfg(test)]
mod testes {
    use super::*;

    fn linhas(a: f64, e: EixoEfetivo) -> Vec<f64> {
        linhas_do_eixo(a, &e).expect("eixo").linhas
    }

    fn igual(a: &[f64], b: &[f64]) {
        assert_eq!(a.len(), b.len(), "{a:?} != {b:?}");
        for (x, y) in a.iter().zip(b) {
            assert!((x - y).abs() < 1e-9, "{a:?} != {b:?}");
        }
    }

    #[test]
    fn numero_fixo_divide_em_celulas_iguais() {
        igual(&linhas(6.0, EixoEfetivo::numero(4)), &[1.5, 3.0, 4.5]);
        igual(&linhas(6.0, EixoEfetivo::numero(1)), &[]);
        assert_eq!(linhas_do_eixo(6.0, &EixoEfetivo::numero(0)), Err(ENTRADA));
        assert_eq!(linhas_do_eixo(6.0, &EixoEfetivo::numero(500)), Err(LIMITE));
    }

    #[test]
    fn distancia_maxima_usa_o_menor_numero_de_celulas_que_respeita_o_limite() {
        // 6 / 1,25 = 4,8 => 5 células de 1,2 (nenhuma passa de 1,25).
        igual(&linhas(6.0, EixoEfetivo::distancia_maxima(1.25)), &[1.2, 2.4, 3.6, 4.8]);
        // Divisão exata não ganha célula extra.
        igual(&linhas(3.0, EixoEfetivo::distancia_maxima(1.5)), &[1.5]);
        // `1,1 / 0,1` dá 11,000000000000002 em ponto flutuante: continuam 11 células (10 linhas).
        assert_eq!(linhas(1.1, EixoEfetivo::distancia_maxima(0.1)).len(), 10);
        // Menor que o limite: uma célula só.
        igual(&linhas(0.9, EixoEfetivo::distancia_maxima(1.0)), &[]);
    }

    #[test]
    fn distancia_fixa_justifica_a_sobra() {
        // 4,7 m com d = 1,5: 3 células cheias e sobra de 0,2 m.
        igual(&linhas(4.7, EixoEfetivo::distancia_fixa(1.5, JUSTIF_INICIO)), &[1.5, 3.0, 4.5]);
        igual(&linhas(4.7, EixoEfetivo::distancia_fixa(1.5, JUSTIF_FIM)), &[0.2, 1.7, 3.2]);
        // Centro: 0,1 de sobra em cada ponta (maior que o limiar), então vira célula própria nas duas pontas.
        igual(&linhas(4.7, EixoEfetivo::distancia_fixa(1.5, JUSTIF_CENTRO)), &[0.1, 1.6, 3.1, 4.6]);
    }

    #[test]
    fn sobra_menor_que_o_limiar_e_fundida() {
        // 4,53 m: sobra de 0,03 < 0,05 no fim; a linha em 4,5 some e a última célula mede 1,53.
        igual(&linhas(4.53, EixoEfetivo::distancia_fixa(1.5, JUSTIF_INICIO)), &[1.5, 3.0]);
        igual(&linhas(4.53, EixoEfetivo::distancia_fixa(1.5, JUSTIF_FIM)), &[1.53, 3.03]);
        // Centro: 0,015 em cada ponta, as duas linhas de ponta somem.
        igual(&linhas(4.53, EixoEfetivo::distancia_fixa(1.5, JUSTIF_CENTRO)), &[1.515, 3.015]);
        // Sobra de 0,06 >= 0,05 fica como célula própria.
        igual(&linhas(4.56, EixoEfetivo::distancia_fixa(1.5, JUSTIF_INICIO)), &[1.5, 3.0, 4.5]);
        // Divisão exata: sem sobra e sem linha na ponta.
        igual(&linhas(4.5, EixoEfetivo::distancia_fixa(1.5, JUSTIF_INICIO)), &[1.5, 3.0]);
        igual(&linhas(4.5, EixoEfetivo::distancia_fixa(1.5, JUSTIF_CENTRO)), &[1.5, 3.0]);
    }

    #[test]
    fn limiar_da_sobra_e_configuravel() {
        let mut e = EixoEfetivo::distancia_fixa(1.5, JUSTIF_INICIO);
        e.resto_minimo = 0.2;
        // Sobra de 0,1 agora é menor que o limiar de 0,2: fundida.
        igual(&linhas(4.6, e.clone()), &[1.5, 3.0]);
        e.resto_minimo = 0.0;
        // Limiar zero desliga a fusão: até uma sobra de 0,03 vira célula.
        igual(&linhas(4.53, e), &[1.5, 3.0, 4.5]);
    }

    #[test]
    fn aviso_de_sobra_fundida_so_quando_a_celula_passa_de_uma_vez_e_meia() {
        let mut e = EixoEfetivo::distancia_fixa(1.0, JUSTIF_INICIO);
        e.resto_minimo = 0.6; // sobra de 0,5 é fundida e a célula vira 1,5 (não passa de 1,5)
        assert!(linhas_do_eixo(3.5, &e).expect("eixo").avisos.is_empty());
        e.resto_minimo = 0.8; // sobra de 0,7 fundida: 1,7 > 1,5
        let r = linhas_do_eixo(3.7, &e).expect("eixo");
        assert_eq!(r.avisos.len(), 1);
        assert_eq!(r.avisos[0].codigo, AVISO_CORTINA_SOBRA_FUNDIDA);
        assert!((r.avisos[0].medido - 1.7).abs() < 1e-9 && (r.avisos[0].limite - 1.5).abs() < 1e-9);
        assert_eq!(r.avisos[0].indice, 2, "a última célula do eixo");
    }

    #[test]
    fn parede_menor_que_a_distancia_fica_com_uma_celula_so_e_o_deslocamento_nao_conta() {
        for j in [JUSTIF_INICIO, JUSTIF_CENTRO, JUSTIF_FIM] {
            assert!(linhas(0.8, EixoEfetivo::distancia_fixa(1.5, j)).is_empty(), "justificação {j}");
            let mut e = EixoEfetivo::distancia_fixa(1.5, j);
            e.deslocamento = 0.3;
            assert!(linhas(0.8, e).is_empty(), "com deslocamento, justificação {j}");
        }
    }

    #[test]
    fn manual_conta_da_ancora_ignora_o_que_esta_fora_e_nunca_funde() {
        igual(&linhas(10.0, EixoEfetivo::manual(&[2.0, 7.5], ANCORA_INICIO)), &[2.0, 7.5]);
        igual(&linhas(10.0, EixoEfetivo::manual(&[2.0, 7.5], ANCORA_FIM)), &[2.5, 8.0]);
        // Fora de (0, A) e duplicata: ignoradas ou fundidas.
        let r = linhas_do_eixo(3.0, &EixoEfetivo::manual(&[1.0, 1.0000001, 3.0, 4.0, 0.0], ANCORA_INICIO)).expect("eixo");
        igual(&r.linhas, &[1.0]);
        assert_eq!(r.avisos.len(), 3);
        assert!(r.avisos.iter().all(|a| a.codigo == AVISO_CORTINA_POSICAO_FORA));
        assert_eq!(r.avisos.iter().map(|a| a.indice).collect::<Vec<_>>(), vec![2, 3, 4], "a ordem da posição manual");
        // Fora de ordem: a saída sai crescente.
        igual(&linhas(10.0, EixoEfetivo::manual(&[8.0, 2.0], ANCORA_INICIO)), &[2.0, 8.0]);
        // Linha do usuário a 3 cm da borda é preservada (sem fusão), com ou sem deslocamento.
        igual(&linhas(5.0, EixoEfetivo::manual(&[0.03, 4.98], ANCORA_INICIO)), &[0.03, 4.98]);
        let mut m = EixoEfetivo::manual(&[0.5], ANCORA_INICIO);
        m.deslocamento = -0.47;
        igual(&linhas(5.0, m), &[0.03]);
    }

    #[test]
    fn deslocamento_em_divisao_igual_desliza_o_padrao_inteiro() {
        let mut e = EixoEfetivo::numero(4);
        e.deslocamento = 0.5;
        // O padrão 0; 1,5; 3; 4,5; 6 vira 0,5; 2; 3,5; 5; 6,5: a linha k = 0 entra e a k = n sai.
        igual(&linhas(6.0, e.clone()), &[0.5, 2.0, 3.5, 5.0]);
        e.deslocamento = 1.6;
        igual(&linhas(6.0, e.clone()), &[1.6, 3.1, 4.6]);
        e.deslocamento = -1.6;
        igual(&linhas(6.0, e.clone()), &[1.4, 2.9, 4.4]);
        // Mais que o vão: nenhuma linha sobra.
        e.deslocamento = 20.0;
        igual(&linhas(6.0, e), &[]);
        // Ponta de 0,03 m: fundida (a linha em 0,03 some).
        let mut f = EixoEfetivo::numero(4);
        f.deslocamento = 0.03;
        igual(&linhas(6.0, f), &[1.53, 3.03, 4.53]);
        // Sem deslocamento as células iguais não são tocadas, mesmo pequenas.
        igual(&linhas(0.16, EixoEfetivo::numero(4)), &[0.04, 0.08, 0.12]);
    }

    #[test]
    fn deslocamento_em_distancia_fixa_desliza_o_padrao_periodico() {
        let mut f = EixoEfetivo::distancia_fixa(1.5, JUSTIF_INICIO);
        f.deslocamento = 0.2;
        // Padrão 0,2 + k·1,5: 0,2; 1,7; 3,2; 4,7 (a linha em 0,2 entra pelo início).
        igual(&linhas(6.0, f.clone()), &[0.2, 1.7, 3.2, 4.7]);
        // Um período inteiro reproduz a grade.
        f.deslocamento = 1.5;
        igual(&linhas(6.0, f.clone()), &linhas(6.0, EixoEfetivo::distancia_fixa(1.5, JUSTIF_INICIO)));
        // Negativo: 0,04; 1,54; 3,04; 4,54 e a ponta de 0,04 é fundida.
        f.deslocamento = -1.46;
        igual(&linhas(6.0, f), &[1.54, 3.04, 4.54]);
    }

    #[test]
    fn modo_desconhecido_angulo_e_comprimento_invalido_sao_entrada() {
        let mut e = EixoEfetivo::numero(2);
        e.modo = 9;
        assert_eq!(linhas_do_eixo(3.0, &e), Err(ENTRADA));
        assert_eq!(linhas_do_eixo(3.0, &EixoEfetivo::distancia_fixa(0.0, 0)), Err(ENTRADA));
        assert_eq!(linhas_do_eixo(3.0, &EixoEfetivo::distancia_maxima(f64::NAN)), Err(ENTRADA));
        assert_eq!(linhas_do_eixo(3000.0, &EixoEfetivo::distancia_fixa(1.0, 0)), Err(LIMITE));
        let mut a = EixoEfetivo::numero(2);
        a.angulo = 0.3;
        assert_eq!(linhas_do_eixo(3.0, &a), Err(ENTRADA), "ângulo só 0 até a fase 7");
        assert_eq!(linhas_do_eixo(0.0, &EixoEfetivo::numero(2)), Err(ENTRADA));
    }

    #[test]
    fn arestas_incluem_as_bordas() {
        assert_eq!(arestas(5.0, &[1.0, 2.0]), vec![0.0, 1.0, 2.0, 5.0]);
        assert_eq!(arestas(5.0, &[]), vec![0.0, 5.0]);
    }

    fn cena_de_teste(u: EixoEfetivo, v: EixoEfetivo, l: f64, h: f64) -> crate::cena::Cena {
        let e = crate::cortina_pecas::testes::Espec::novo(u, v);
        crate::cortina_pecas::testes::cena_simples(&e, l, h)
    }

    #[test]
    fn consulta_devolve_linhas_celulas_e_segmentos_na_ordem_do_contrato() {
        use crate::consultas::Saida;
        let cena = cena_de_teste(EixoEfetivo::numero(3), EixoEfetivo::distancia_fixa(1.0, JUSTIF_INICIO), 6.0, 2.5);
        let s = consulta_cortina_grade(&cena, 0).expect("consulta");
        let (Saida::U32(l), Saida::F64(lp), Saida::U32(c), Saida::F64(cr), Saida::U32(sg), Saida::F64(se)) = (&s[0], &s[1], &s[2], &s[3], &s[4], &s[5]) else { panic!() };
        // U: linhas 1 e 2 (2 e 4 m); V: m = 2 e sobra de 0,5 >= 0,05, então as linhas 1 e 2 (1 e 2 m).
        assert_eq!(l, &vec![1, 0, 1, 0, 0, 1, 0, 2, 0, 0, 1, 1, 1, 0, 0, 1, 1, 2, 0, 0]);
        assert_eq!(lp, &vec![2.0, 4.0, 1.0, 2.0]);
        // 3 colunas x 3 fileiras, i antes de j; regiao = i · nv + j.
        assert_eq!(c.len(), 6 * 9);
        assert_eq!(&c[0..6], &[1, 0, 0, 0, 1, 0]);
        assert_eq!(&c[6..12], &[1, 0, 1, 1, 1, 0]);
        assert_eq!(&c[12..18], &[1, 0, 2, 2, 1, 0]);
        assert_eq!(&c[18..24], &[1, 1, 0, 3, 1, 0]);
        assert_eq!(&cr[0..4], &[0.0, 2.0, 0.0, 1.0]);
        assert_eq!(&cr[cr.len() - 4..], &[4.0, 6.0, 2.0, 2.5]);
        // Segmentos: 4 linhas verticais x 3 fileiras e 4 linhas horizontais x 3 colunas; linha global (V começa em nu + 1 = 4).
        assert_eq!(sg.len(), 5 * (12 + 12));
        assert_eq!(se.len(), 2 * 24);
        assert_eq!(&sg[0..5], &[1, 0, 0, 0, 1]);
        assert_eq!(&sg[5 * 12..5 * 12 + 5], &[1, 4, 0, 0, 1], "a primeira horizontal é a linha global 4");
        assert_eq!(&se[0..2], &[0.0, 1.0]);
        // A fileira de cima tem 0,5 m: o último segmento da primeira linha vertical vai de 2 a 2,5.
        assert_eq!(&se[4..6], &[2.0, 2.5]);
    }

    #[test]
    fn linhas_manuais_saem_com_origem_manual_e_cortina_de_fora_nao_sai() {
        use crate::consultas::Saida;
        let mut cena = cena_de_teste(EixoEfetivo::manual(&[1.0], ANCORA_INICIO), EixoEfetivo::numero(1), 3.0, 2.0);
        let s = consulta_cortina_grade(&cena, 0).expect("consulta");
        let Saida::U32(l) = &s[0] else { panic!() };
        assert_eq!(l, &vec![1, 0, 1, ORIGEM_MANUAL, 0]);
        cena.cortina.cortinas.get_mut(&1).expect("c").sag = 0.3;
        let s = consulta_cortina_grade(&cena, 0).expect("consulta");
        assert!(s.iter().all(|x| x.is_empty()));
    }
}
