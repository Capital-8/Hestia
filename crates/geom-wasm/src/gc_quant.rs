//! Quantidades do guarda-corpo (decisão 0055, Fase 4a, só a parte de quantidades; consulta `quant_guarda`, id 64).
//!
//! Por guarda-corpo, por papel, perfil e material: número de peças, comprimento (m), área (m²), volume (m³) e área projetada (m²).
//! Papéis (ADR §6.2): 0 poste, 1 balaústre, 2 trilho, 3 corrimão, 5 painel, 7 travessa superior (corrimão com `funcao` topo).
//!
//! Regras de contagem (ADR §5.2, §5.5, §5.6, §5.7), com as escolhas de `0055` §16:
//! - Nós: extremos de cada trecho, vértices com giro em planta acima de `postes.canto.ang_canto` e vértices com mudança de inclinação (lance e
//!   patamar). Trecho curvo (caracol) não tem nó no meio do arco.
//! - Postes: início e fim de cada trecho; canto em cada nó interior (só com `canto.ativo`); intermediários por segmento entre nós, com o
//!   espaçamento horizontal (§5.5), descartando os que cairiam a menos de meia largura de um poste de nó.
//! - Balaústres: por vão entre postes (`escopo` 0) ou por segmento (`escopo` 1), com a folga de meia largura do poste e do primeiro/último elemento
//!   (§5.6). Justificações: `inicio`, `fim`, `centro`, `folga-nas-pontas` e `distribuir` (n + 1 repetições, a última encostando no fim do vão).
//!   Elementos que colidem com um poste saem. Elemento vazio ocupa espaço e não conta.
//! - Painéis: um vão entre postes (sempre por vão), dividido em `ceil(Lu / larguraMaxima)` painéis iguais com `folgaLateral` entre eles.
//! - Trilhos e corrimãos: comprimento de cada trecho (3D, o eixo do guarda-corpo); corrimão com extensão soma o comprimento da extensão de cada ponta
//!   com estilo diferente de `nenhum`; `posicao` ambas conta dois corrimãos.
//!
//! Ainda fora desta fase (pendente da Fase 3c e 3b; registrado em 0055 §16): contagem de balaústres de `porDegrau`, quebra `angulo` e `nunca` com
//! o padrão contínuo (usa a quebra do dado, mas sem a remoção por canto da 3c), área líquida de painel perfurado (a bruta sai), suportes de
//! corrimão, cabos, extensão `maisPiso` e o deslocamento lateral nos comprimentos (sai o eixo).
//!
//! `quant_guarda` ainda não tem cadeias do motor (Fase 3a): `cadeias_do_nivel` devolve vazio até ela, como o gancho de `guarda_caminhos`. As
//! contagens são exatas para as cadeias de `CadeiaGC` (reta, L, caracol) nos testes deste módulo.

use std::collections::BTreeMap;
use std::f64::consts::PI;

use crate::consultas::Saida;
use crate::esquema::{ENTRADA, ID_AUSENTE, NIVEL_TODOS};
use crate::gc_tipos::*;
use crate::secoes_gc::{ElementoPadraoLinha, PadraoLinha, PerfilGuardaLinha, PosteLinha, SecoesGC, TrilhoLinha};

/// Papéis de `quant_guarda`.
pub const QUANT_POSTE: u32 = 0;
pub const QUANT_BALAUSTRE: u32 = 1;
pub const QUANT_TRILHO: u32 = 2;
pub const QUANT_CORRIMAO: u32 = 3;
pub const QUANT_PAINEL: u32 = 5;
pub const QUANT_TRAVESSA: u32 = 7;

/// Enums de `padroes_guarda` (ver `kernelGuardaCorpoTabelas`): justificação, sobra, quebra e escopo.
const JUSTIF_INICIO: u8 = 0;
const JUSTIF_FIM: u8 = 1;
const JUSTIF_CENTRO: u8 = 2;
const JUSTIF_DISTRIBUIR: u8 = 3;
const SOBRA_BALAUSTRE_EXTRA: u8 = 1;
const SOBRA_FOLGA_NAS_PONTAS: u8 = 2;
const QUEBRA_CADA_SEGMENTO: u8 = 0;
const QUEBRA_ANGULO: u8 = 1;
const ESCOPO_VAO: u8 = 0;
const ESCOPO_SEGMENTO: u8 = 1;
/// `modo` do intermediário de `postes_guarda`.
const MODO_ESPACAMENTO_MAXIMO: u8 = 1;
const MODO_ESPACAMENTO_FIXO: u8 = 2;
const MODO_NUMERO_FIXO: u8 = 3;
/// `posicao` do corrimão (ADR §4.2): 3 = ambas as laterais.
const POSICAO_AMBAS: u8 = 3;
/// `funcao` do corrimão: 0 topo (travessa superior), 1 corrimão.
const FUNCAO_TOPO: u8 = 0;
/// `estilo` da extensão: 0 nenhum.
const ESTILO_NENHUM: u8 = 0;
/// Giro em planta padrão de canto (rad, 5°) quando o tipo não tem a linha de canto.
const ANG_CANTO_PADRAO: f64 = 0.0873;

/// Uma linha de `quant_guarda`: o total de um guarda-corpo para um papel, perfil e material.
#[derive(Clone, Debug, PartialEq)]
pub struct LinhaGCQuant {
    pub guarda: u32,
    pub papel: u32,
    pub perfil: u32,
    pub material: u32,
    pub n_pecas: u32,
    pub comprimento: f64,
    pub area: f64,
    pub volume: f64,
    pub area_projetada: f64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Soma {
    n: u32,
    comprimento: f64,
    area: f64,
    volume: f64,
    area_projetada: f64,
}

/// Acumulador por (guarda, papel, perfil, material); ordem = a da saída (ADR §6.2: por `guarda_num`, depois `papel`).
type Acumulo = BTreeMap<(u32, u32, u32, u32), Soma>;

/// Sem perfil (painel): a chave usa `ID_AUSENTE`.
const SEM_PERFIL: u32 = ID_AUSENTE;

fn somar(acc: &mut Acumulo, chave: (u32, u32, u32, u32), n: u32, comprimento: f64, area: f64, volume: f64, area_projetada: f64) {
    let s = acc.entry(chave).or_default();
    s.n += n;
    s.comprimento += comprimento;
    s.area += area;
    s.volume += volume;
    s.area_projetada += area_projetada;
}

/// Geometria de um perfil: área da seção (m²) e largura vista de frente (m).
#[derive(Clone, Copy, Debug)]
struct Secao {
    area: f64,
    largura: f64,
}

fn secao_do_perfil(gc: &SecoesGC, perfil: u32) -> Result<Secao, u32> {
    let p: &PerfilGuardaLinha = gc.perfis.get(&perfil).ok_or(ENTRADA)?;
    match p.forma {
        FORMA_CIRCULAR => Ok(Secao { area: PI * p.largura * p.largura / 4.0, largura: p.largura }),
        FORMA_RETANGULAR => Ok(Secao { area: p.largura * p.altura, largura: p.largura }),
        FORMA_POLIGONO => {
            let mut pts: Vec<(u32, f64, f64)> = gc.perfis_pontos.values().filter(|x| x.perfil == perfil).map(|x| (x.indice, x.x, x.y)).collect();
            pts.sort_by_key(|x| x.0);
            if pts.len() < 3 {
                return Err(ENTRADA);
            }
            let n = pts.len();
            let mut dupla = 0.0;
            for i in 0..n {
                let (a, b) = (pts[i], pts[(i + 1) % n]);
                dupla += a.1 * b.2 - b.1 * a.2;
            }
            let (min, max) = pts.iter().fold((f64::MAX, f64::MIN), |(lo, hi), x| (lo.min(x.1), hi.max(x.1)));
            Ok(Secao { area: dupla.abs() / 2.0, largura: max - min })
        }
        _ => Err(ENTRADA),
    }
}

/// Largura de um elemento de padrão (0 quando vazio).
fn largura_elemento(gc: &SecoesGC, e: &ElementoPadraoLinha) -> Result<f64, u32> {
    if e.perfil == ID_AUSENTE {
        Ok(0.0)
    } else {
        Ok(secao_do_perfil(gc, e.perfil)?.largura)
    }
}

/// Cota da base de um padrão ou painel, relativa ao hospedeiro (0 = hospedeiro; 1 = trilho `indice`).
fn cota_base(gc: &SecoesGC, tipo: u32, de: u8, indice: u32) -> Result<f64, u32> {
    match de {
        REF_HOSPEDEIRO_OU_ALTURA => Ok(0.0),
        REF_TRILHO => Ok(trilho_de(gc, tipo, indice)?.altura),
        _ => Err(ENTRADA),
    }
}

/// Cota do topo: 0 = altura do guarda-corpo `h`; 1 = trilho; 2 = corrimão.
fn cota_topo(gc: &SecoesGC, tipo: u32, h: f64, de: u8, indice: u32) -> Result<f64, u32> {
    match de {
        REF_HOSPEDEIRO_OU_ALTURA => Ok(h),
        REF_TRILHO => Ok(trilho_de(gc, tipo, indice)?.altura),
        REF_CORRIMAO => Ok(gc.corrimaos.values().find(|c| c.tipo == tipo && c.indice == indice).ok_or(ENTRADA)?.altura),
        _ => Err(ENTRADA),
    }
}

fn trilho_de(gc: &SecoesGC, tipo: u32, indice: u32) -> Result<&TrilhoLinha, u32> {
    gc.trilhos.values().find(|t| t.tipo == tipo && t.indice == indice).ok_or(ENTRADA)
}

/// Nó de um trecho: índice no trecho, comprimento horizontal acumulado, giro em planta e se é nó de canto (ou de transição).
#[derive(Clone, Copy, Debug)]
struct No {
    s: f64,
    virada: f64,
}

/// Nós de um trecho (extremos e, em trecho não curvo, vértices de canto ou de mudança de inclinação), com o comprimento horizontal acumulado.
fn nos_do_trecho(t: &TrechoGC, ang_canto: f64) -> (Vec<f64>, Vec<No>) {
    let n = t.nos.len();
    let mut s = vec![0.0; n];
    for k in 1..n {
        let (a, b) = (t.nos[k - 1], t.nos[k]);
        s[k] = s[k - 1] + (b.x - a.x).hypot(b.y - a.y);
    }
    let mut nos = vec![No { s: 0.0, virada: 0.0 }];
    if !t.curvo && n >= 3 {
        for k in 1..n - 1 {
            let (a, b, c) = (t.nos[k - 1], t.nos[k], t.nos[k + 1]);
            let (d1x, d1y) = (b.x - a.x, b.y - a.y);
            let (d2x, d2y) = (c.x - b.x, c.y - b.y);
            let (l1, l2) = (d1x.hypot(d1y), d2x.hypot(d2y));
            if l1 <= 1e-12 || l2 <= 1e-12 {
                continue;
            }
            let virada = (d1x * d2y - d1y * d2x).atan2(d1x * d2x + d1y * d2y).abs();
            let trans = ((b.z - a.z) / l1 - (c.z - b.z) / l2).abs() > 1e-9;
            if virada > ang_canto + 1e-12 || trans {
                nos.push(No { s: s[k], virada });
            }
        }
    }
    nos.push(No { s: s[n - 1], virada: 0.0 });
    (s, nos)
}

/// Poste de um trecho, com o que as contagens precisam: posição, largura, perfil, material e altura total.
#[derive(Clone, Copy, Debug)]
struct PostePos {
    s: f64,
    largura: f64,
    perfil: u32,
    material: u32,
    altura: f64,
}

fn linha_poste(gc: &SecoesGC, tipo: u32, papel: u8) -> Option<&PosteLinha> {
    gc.postes.values().find(|p| p.tipo == tipo && p.papel == papel && p.ativo)
}

/// Postes de um trecho (ver a regra no topo do arquivo).
fn postes_do_trecho(gc: &SecoesGC, tipo: u32, h: f64, flags: u8, nos: &[No]) -> Result<Vec<PostePos>, u32> {
    let mut out: Vec<PostePos> = Vec::new();
    let altura = |p: &PosteLinha| h + p.acima + p.abaixo;
    let poste = |p: &PosteLinha, s: f64| -> Result<PostePos, u32> {
        let sec = secao_do_perfil(gc, p.perfil)?;
        Ok(PostePos { s, largura: sec.largura, perfil: p.perfil, material: p.material, altura: altura(p) })
    };
    let inicio = linha_poste(gc, tipo, POSTE_INICIO);
    let fim = linha_poste(gc, tipo, POSTE_FIM);
    let canto = linha_poste(gc, tipo, POSTE_CANTO);
    let intermediario = linha_poste(gc, tipo, POSTE_INTERMEDIARIO);
    // Largura do poste em cada nó (zero quando não há poste ali), para a folga do intermediário.
    let largura_no = |i: usize| -> Result<f64, u32> {
        let linha = if i == 0 {
            inicio
        } else if i == nos.len() - 1 {
            fim
        } else {
            canto
        };
        match linha {
            Some(p) => Ok(secao_do_perfil(gc, p.perfil)?.largura),
            None => Ok(0.0),
        }
    };
    let ultimo_s = nos[nos.len() - 1].s;
    if let Some(p) = inicio {
        out.push(poste(p, 0.0)?);
    }
    if let Some(p) = fim {
        out.push(poste(p, ultimo_s)?);
    }
    if let Some(p) = canto {
        for no in &nos[1..nos.len() - 1] {
            out.push(poste(p, no.s)?);
        }
    }
    if let (true, Some(r)) = (flags & FLAG_POSTES_INTERMEDIARIOS != 0, intermediario) {
        if r.modo != 0 {
            let wi = secao_do_perfil(gc, r.perfil)?.largura;
            for w in 0..nos.len() - 1 {
                let (a, b) = (nos[w], nos[w + 1]);
                let l = b.s - a.s;
                if l <= 1e-12 {
                    continue;
                }
                let (wa, wb) = (largura_no(w)?, largura_no(w + 1)?);
                let posicoes: Vec<f64> = match r.modo {
                    MODO_ESPACAMENTO_MAXIMO => {
                        if r.espacamento <= 0.0 {
                            return Err(ENTRADA);
                        }
                        let n = ((l / r.espacamento - 1e-9).ceil() as i64 - 1).max(0) as u32;
                        (1..=n).map(|j| a.s + l * j as f64 / (n + 1) as f64).collect()
                    }
                    MODO_ESPACAMENTO_FIXO => {
                        if r.espacamento <= 0.0 {
                            return Err(ENTRADA);
                        }
                        let mut v = Vec::new();
                        let mut k = 1u32;
                        while (k as f64) * r.espacamento < l - 1e-12 {
                            v.push(a.s + (k as f64) * r.espacamento);
                            k += 1;
                        }
                        v
                    }
                    MODO_NUMERO_FIXO => (1..=r.numero).map(|j| a.s + l * j as f64 / (r.numero + 1) as f64).collect(),
                    _ => return Err(ENTRADA),
                };
                for s in posicoes {
                    if s - a.s >= wi / 2.0 + wa / 2.0 - 1e-9 && b.s - s >= wi / 2.0 + wb / 2.0 - 1e-9 {
                        out.push(poste(r, s)?);
                    }
                }
            }
        }
    }
    Ok(out)
}

/// Quebras de padrão do trecho (índices em `nos`): por quebra do padrão.
fn quebras(nos: &[No], quebra: u8, ang_quebra: f64) -> Vec<usize> {
    let ultimo = nos.len() - 1;
    match quebra {
        QUEBRA_CADA_SEGMENTO => (0..nos.len()).collect(),
        QUEBRA_ANGULO => (0..nos.len()).filter(|&i| i == 0 || i == ultimo || nos[i].virada > ang_quebra).collect(),
        _ => vec![0, ultimo],
    }
}

/// Vãos de um trecho contínuo entre `s_a` e `s_b`: (início, fim, largura do poste em cada ponta). `escopo` vão = por poste; segmento = inteiro.
fn vaos(posts: &[PostePos], s_a: f64, s_b: f64, escopo: u8) -> Vec<(f64, f64, f64, f64)> {
    let largura_em = |s: f64| posts.iter().filter(|x| (x.s - s).abs() < 1e-9).map(|x| x.largura).fold(0.0, f64::max);
    if escopo == ESCOPO_SEGMENTO {
        return vec![(s_a, s_b, largura_em(s_a), largura_em(s_b))];
    }
    let mut pts: Vec<f64> = vec![s_a];
    let mut meio: Vec<f64> = posts.iter().map(|x| x.s).filter(|&s| s > s_a + 1e-9 && s < s_b - 1e-9).collect();
    meio.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    for s in meio {
        if (s - pts[pts.len() - 1]).abs() > 1e-9 {
            pts.push(s);
        }
    }
    pts.push(s_b);
    pts.windows(2).map(|w| (w[0], w[1], largura_em(w[0]), largura_em(w[1]))).collect()
}

/// Centros dos elementos de um padrão num vão (índice do elemento, posição no trecho). Ver §5.6 e a regra no topo.
fn centros_do_padrao(gc: &SecoesGC, els: &[ElementoPadraoLinha], pad: &PadraoLinha, vao: (f64, f64, f64, f64), posts: &[PostePos]) -> Result<Vec<(usize, f64)>, u32> {
    if els.is_empty() {
        return Ok(Vec::new());
    }
    let (p, q, wp, wq) = vao;
    let n = els.len();
    let w: Vec<f64> = els.iter().map(|e| largura_elemento(gc, e)).collect::<Result<_, _>>()?;
    let mut e = vec![0.0; n];
    for i in 1..n {
        e[i] = e[i - 1] + els[i].dist_anterior;
    }
    let d = e[n - 1];
    let a = p + wp / 2.0 + w[0] / 2.0;
    let b = q - wq / 2.0 - w[n - 1] / 2.0;
    let lu = b - a;
    if lu < -1e-9 {
        return Ok(Vec::new());
    }
    let per = pad.periodo;
    let mut bases: Vec<f64> = vec![0.0];
    let mut sobra_extra = false;
    if lu + 1e-9 >= d {
        let folga = lu - d;
        match pad.justif {
            JUSTIF_DISTRIBUIR => {
                if per > 1e-12 && folga > 1e-12 {
                    let k = (folga / per - 1e-9).ceil() as u32;
                    bases = (0..=k).map(|j| j as f64 * folga / k as f64).collect();
                }
            }
            JUSTIF_INICIO | JUSTIF_FIM | JUSTIF_CENTRO => {
                let k = if per > 1e-12 { (folga / per + 1e-9).floor() as u32 + 1 } else { 1 };
                let s_sobra = lu - ((k - 1) as f64 * per + d);
                let base = if pad.sobra == SOBRA_FOLGA_NAS_PONTAS {
                    s_sobra / 2.0
                } else {
                    match pad.justif {
                        JUSTIF_INICIO => 0.0,
                        JUSTIF_FIM => s_sobra,
                        _ => s_sobra / 2.0,
                    }
                };
                bases = (0..k).map(|j| base + j as f64 * per).collect();
                sobra_extra = pad.sobra == SOBRA_BALAUSTRE_EXTRA && s_sobra >= per / 2.0 - 1e-9;
            }
            _ => return Err(ENTRADA),
        }
    } else {
        // O padrão inteiro não cabe: só o início do padrão, sem cortar elemento (ADR §5.6).
        bases = vec![0.0];
    }
    let mut centros: Vec<(usize, f64)> = Vec::new();
    for base in &bases {
        for (i, ei) in e.iter().enumerate() {
            let c = a + base + ei;
            if c <= b + 1e-9 {
                centros.push((i, c));
            }
        }
    }
    if sobra_extra {
        centros.push((0, b));
    }
    // Sem elemento vazio e sem colisão com poste (ADR §5.6: "elementos que colidem com o poste são removidos").
    let mut kept = Vec::new();
    for (i, c) in centros {
        if els[i].perfil == ID_AUSENTE {
            continue;
        }
        let colide = posts.iter().any(|x| (c - x.s).abs() < w[i] / 2.0 + x.largura / 2.0 - 1e-9);
        if !colide {
            kept.push((i, c));
        }
    }
    Ok(kept)
}

/// Trecho com nós e postes, já calculados (`s` acumulado e nós, na ordem do trecho).
type TrechoPlano<'a> = (&'a TrechoGC, Vec<f64>, Vec<No>, Vec<PostePos>);

/// Quantidades de um nível: os guarda-corpos de `nivel` com as cadeias `cadeias` (o trecho de cada um). Sem trecho, o guarda-corpo não conta.
pub fn quantificar(gc: &SecoesGC, nivel: u32, cadeias: &CadeiaGC) -> Result<Vec<LinhaGCQuant>, u32> {
    let mut acc: Acumulo = BTreeMap::new();
    for (&id, g) in &gc.guardas {
        if g.nivel != nivel {
            continue;
        }
        let trechos: Vec<&TrechoGC> = cadeias.do_guarda(id).collect();
        if trechos.is_empty() {
            continue;
        }
        let tipo_num = g.tipo;
        let tipo = gc.tipos.get(&tipo_num).ok_or(ENTRADA)?;
        let h = if g.altura.is_finite() { g.altura } else { tipo.altura };
        let ang_canto = gc.postes.values().find(|p| p.tipo == tipo_num && p.papel == POSTE_CANTO).map_or(ANG_CANTO_PADRAO, |p| p.ang_canto);
        let corrimao_on = g.flags & FLAG_CORRIMAO != 0;
        let preench_on = g.flags & FLAG_PREENCHIMENTO != 0;

        // Trechos com nós e postes (uma vez por guarda).
        let mut por_trecho: Vec<TrechoPlano> = Vec::new();
        for &t in &trechos {
            if t.nos.len() < 2 {
                return Err(ENTRADA);
            }
            let (s, nos) = nos_do_trecho(t, ang_canto);
            let posts = postes_do_trecho(gc, tipo_num, h, g.flags, &nos)?;
            por_trecho.push((t, s, nos, posts));
        }

        // Postes.
        for (_, _, _, posts) in &por_trecho {
            for p in posts {
                let sec = secao_do_perfil(gc, p.perfil)?;
                somar(&mut acc, (id, QUANT_POSTE, p.perfil, p.material), 1, p.altura, 0.0, sec.area * p.altura, sec.largura * p.altura);
            }
        }

        // Trilhos: comprimento de cada trecho.
        for t in gc.trilhos.values().filter(|t| t.tipo == tipo_num) {
            let sec = secao_do_perfil(gc, t.perfil)?;
            for (tr, _, _, _) in &por_trecho {
                let c = tr.comprimento_desenvolvido();
                somar(&mut acc, (id, QUANT_TRILHO, t.perfil, t.material), 1, c, 0.0, sec.area * c, sec.largura * c);
            }
        }

        // Corrimãos: comprimento do trecho mais as extensões de cada ponta (com estilo), vezes as laterais.
        if corrimao_on {
            for c in gc.corrimaos.values().filter(|c| c.tipo == tipo_num) {
                let sec = secao_do_perfil(gc, c.perfil)?;
                let laterais: u32 = if c.posicao == POSICAO_AMBAS { 2 } else { 1 };
                let papel = if c.funcao == FUNCAO_TOPO { QUANT_TRAVESSA } else { QUANT_CORRIMAO };
                for (tr, _, _, _) in &por_trecho {
                    let mut comp = tr.comprimento_desenvolvido();
                    if c.ext_inicio.estilo != ESTILO_NENHUM {
                        comp += c.ext_inicio.comprimento;
                    }
                    if c.ext_fim.estilo != ESTILO_NENHUM {
                        comp += c.ext_fim.comprimento;
                    }
                    let l = laterais as f64;
                    somar(&mut acc, (id, papel, c.perfil, c.material), laterais, comp * l, 0.0, sec.area * comp * l, sec.largura * comp * l);
                }
            }
        }

        // Balaústres (padrões do tipo) e painéis, por trecho, quebra e vão.
        if preench_on {
            let padroes: Vec<(u32, &PadraoLinha)> = gc.padroes.iter().filter(|(_, p)| p.tipo == tipo_num).map(|(k, p)| (*k, p)).collect();
            for (pid, pad) in padroes {
                let mut els: Vec<ElementoPadraoLinha> = gc.padrao_elementos.values().filter(|e| e.padrao == pid).copied().collect();
                els.sort_by_key(|e| e.indice);
                for (_, _, nos, posts) in &por_trecho {
                    let brks = quebras(nos, pad.quebra, pad.ang_quebra);
                    for pair in brks.windows(2) {
                        let (s_a, s_b) = (nos[pair[0]].s, nos[pair[1]].s);
                        if s_b - s_a <= 1e-12 {
                            continue;
                        }
                        for v in vaos(posts, s_a, s_b, pad.escopo) {
                            for (i, _c) in centros_do_padrao(gc, &els, pad, v, posts)? {
                                let e = els[i];
                                let sec = secao_do_perfil(gc, e.perfil)?;
                                let base = cota_base(gc, tipo_num, pad.base_tipo, pad.base_idx)? + e.desloc_base;
                                let topo = cota_topo(gc, tipo_num, h, pad.topo_tipo, pad.topo_idx)? + e.desloc_topo;
                                let alt = (topo - base).max(0.0);
                                somar(&mut acc, (id, QUANT_BALAUSTRE, e.perfil, e.material), 1, alt, 0.0, sec.area * alt, sec.largura * alt);
                            }
                        }
                    }
                }
            }
            for pn in gc.paineis.values().filter(|p| p.tipo == tipo_num) {
                for (_, _, nos, posts) in &por_trecho {
                    for pair in quebras(nos, QUEBRA_CADA_SEGMENTO, 0.0).windows(2) {
                        let (s_a, s_b) = (nos[pair[0]].s, nos[pair[1]].s);
                        if s_b - s_a <= 1e-12 {
                            continue;
                        }
                        for (p, q, wp, wq) in vaos(posts, s_a, s_b, ESCOPO_VAO) {
                            let lu = (q - p) - wp / 2.0 - wq / 2.0 - 2.0 * pn.folga_lateral;
                            if lu <= 1e-12 {
                                continue;
                            }
                            let n = if pn.largura_max > 0.0 { ((lu / pn.largura_max - 1e-9).ceil() as u32).max(1) } else { 1 };
                            let w = (lu - (n - 1) as f64 * pn.folga_lateral) / n as f64;
                            if w <= 1e-12 {
                                continue;
                            }
                            let base = cota_base(gc, tipo_num, pn.base_tipo, pn.base_idx)? + pn.desl_base;
                            let topo = cota_topo(gc, tipo_num, h, pn.topo_tipo, pn.topo_idx)? + pn.desl_topo;
                            let alt = (topo - base).max(0.0);
                            let area = n as f64 * w * alt;
                            let comp = n as f64 * w;
                            somar(&mut acc, (id, QUANT_PAINEL, SEM_PERFIL, pn.material), n, comp, area, area * pn.espessura, area);
                        }
                    }
                }
            }
        }
    }
    Ok(acc
        .into_iter()
        .map(|((guarda, papel, perfil, material), s)| LinhaGCQuant {
            guarda,
            papel,
            perfil,
            material,
            n_pecas: s.n,
            comprimento: s.comprimento,
            area: s.area,
            volume: s.volume,
            area_projetada: s.area_projetada,
        })
        .collect())
}

/// Cadeias do nível para as quantidades. Até a Fase 3a, não há motor de caminho: devolve vazio (como o gancho de `guarda_caminhos`).
fn cadeias_do_nivel(_gc: &SecoesGC, _nivel: u32) -> Result<CadeiaGC, u32> {
    Ok(CadeiaGC::default())
}

/// Consulta `quant_guarda` (`nivel_num`): `linhas` U32 de 5 por linha e `valores` F64 de 4 por linha (esquema v13).
pub fn quant_guarda(gc: &SecoesGC, nivel: u32) -> Result<Vec<Saida>, u32> {
    if nivel == NIVEL_TODOS {
        return Err(ENTRADA);
    }
    gc.validar_referencias()?;
    let cadeias = cadeias_do_nivel(gc, nivel)?;
    let linhas = quantificar(gc, nivel, &cadeias)?;
    Ok(codificar(&linhas))
}

/// Codifica as linhas nas duas saídas.
pub fn codificar(linhas: &[LinhaGCQuant]) -> Vec<Saida> {
    let mut u = Vec::with_capacity(linhas.len() * 5);
    let mut f = Vec::with_capacity(linhas.len() * 4);
    for l in linhas {
        u.extend([l.guarda, l.papel, l.perfil, l.material, l.n_pecas]);
        f.extend([l.comprimento, l.area, l.volume, l.area_projetada]);
    }
    vec![Saida::U32(u), Saida::F64(f)]
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::secoes_gc::{CorrimaoLinha, ExtensaoLinha, GuardaCorpoLinha, PainelLinha, TipoGuardaLinha};

    const TIPO: u32 = 1;
    const GUARDA: u32 = 1;
    const NIVEL: u32 = 0;
    const FLAGS_TUDO: u8 = FLAG_POSTES_INTERMEDIARIOS | FLAG_PREENCHIMENTO | FLAG_CORRIMAO;

    fn perfil_circ(d: f64) -> PerfilGuardaLinha {
        PerfilGuardaLinha { forma: FORMA_CIRCULAR, largura: d, altura: 0.0, n_pontos: 0, lados: 16 }
    }

    fn poste(papel: u8, ativo: bool, perfil: u32, modo: u8, espacamento: f64, numero: u32) -> PosteLinha {
        PosteLinha { tipo: TIPO, papel, ativo, perfil, material: 7, acima: 0.0, abaixo: 0.0, ang_canto: ANG_CANTO_PADRAO, modo, espacamento, numero }
    }

    fn tipo(altura: f64) -> TipoGuardaLinha {
        TipoGuardaLinha {
            altura,
            desloc: 0.0,
            ajuste_patamar: 0.0,
            folga_inferior: 0.0,
            junc_angular: 0,
            junc_tangente: 0,
            conexao: 0,
            tol_corda: 0.002,
            norma: ID_AUSENTE,
        }
    }

    /// Guarda-corpo `GUARDA` de altura 1,1 m, com postes de início e fim (perfil 10, 5 cm), intermediário de 5 cm por `modo`.
    fn gc_base(modo: u8, espacamento: f64, numero: u32, canto_ativo: bool, flags: u8) -> SecoesGC {
        let mut gc = SecoesGC::default();
        gc.guardas.insert(
            GUARDA,
            GuardaCorpoLinha {
                nivel: NIVEL,
                tipo: TIPO,
                hosp: HOSP_MANUAL,
                hosp_num: ID_AUSENTE,
                lados: 0,
                pos_base: 0,
                desloc: 0.0,
                altura: f64::NAN,
                inverter: false,
                fechado: false,
                lado_desloc: 2,
                cota_base: 0.0,
                flags,
            },
        );
        gc.tipos.insert(TIPO, tipo(1.1));
        gc.perfis.insert(10, perfil_circ(0.05));
        gc.postes.insert(1, poste(POSTE_INICIO, true, 10, 0, 0.0, 0));
        gc.postes.insert(2, poste(POSTE_FIM, true, 10, 0, 0.0, 0));
        gc.postes.insert(3, poste(POSTE_CANTO, canto_ativo, 10, 0, 0.0, 0));
        gc.postes.insert(4, poste(POSTE_INTERMEDIARIO, true, 10, modo, espacamento, numero));
        gc
    }

    fn cadeia_do_trecho(t: TrechoGC) -> CadeiaGC {
        CadeiaGC { trechos: vec![t] }
    }

    fn trecho(nos: Vec<No3>, curvo: bool) -> TrechoGC {
        TrechoGC { guarda: GUARDA, indice: 0, origem: OrigemTrecho::Manual, curvo, fechado: false, nos }
    }

    fn total_pecas(linhas: &[LinhaGCQuant], papel: u32) -> u32 {
        linhas.iter().filter(|l| l.papel == papel).map(|l| l.n_pecas).sum()
    }

    fn soma(linhas: &[LinhaGCQuant], papel: u32, f: impl Fn(&LinhaGCQuant) -> f64) -> f64 {
        linhas.iter().filter(|l| l.papel == papel).map(f).sum()
    }

    #[test]
    fn postes_de_reta_com_intermediarios_por_espacamento() {
        // Reta de 3 m, intermediário a cada 1 m: 2 intermediários; com início e fim, 4 postes de 1,1 m.
        let gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        let c = cadeia_do_trecho(trecho(vec![No3 { x: 0.0, y: 0.0, z: 0.0 }, No3 { x: 3.0, y: 0.0, z: 0.0 }], false));
        let l = quantificar(&gc, NIVEL, &c).expect("quant");
        assert_eq!(total_pecas(&l, QUANT_POSTE), 4);
        assert!((soma(&l, QUANT_POSTE, |x| x.comprimento) - 4.4).abs() < 1e-12);
        // Sem postes intermediários (flag desligada): só início e fim.
        let gc2 = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO & !FLAG_POSTES_INTERMEDIARIOS);
        assert_eq!(total_pecas(&quantificar(&gc2, NIVEL, &c).expect("quant"), QUANT_POSTE), 2);
    }

    #[test]
    fn postes_de_l_com_e_sem_canto() {
        // L de 2 m + 2 m: nós em (0,0), (2,0) canto e (2,2). Intermediário a cada 1 m: 1 por segmento.
        let t = trecho(vec![No3 { x: 0.0, y: 0.0, z: 0.0 }, No3 { x: 2.0, y: 0.0, z: 0.0 }, No3 { x: 2.0, y: 2.0, z: 0.0 }], false);
        let com = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, true, FLAGS_TUDO);
        let l = quantificar(&com, NIVEL, &cadeia_do_trecho(t.clone())).expect("quant");
        // início, fim, canto e 2 intermediários.
        assert_eq!(total_pecas(&l, QUANT_POSTE), 5);
        let sem = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        let l2 = quantificar(&sem, NIVEL, &cadeia_do_trecho(t)).expect("quant");
        assert_eq!(total_pecas(&l2, QUANT_POSTE), 4);
    }

    #[test]
    fn postes_de_caracol_com_numero_fixo() {
        // Hélice de um giro, raio 1 m, em 64 cordas (curvo, sem nó no arco). Intermediário de número fixo 3: 3 por trecho + início e fim.
        let n = 64;
        let nos: Vec<No3> = (0..=n)
            .map(|k| {
                let a = 2.0 * PI * k as f64 / n as f64;
                No3 { x: a.cos(), y: a.sin(), z: 0.2 * k as f64 / n as f64 }
            })
            .collect();
        let gc = gc_base(MODO_NUMERO_FIXO, 0.0, 3, true, FLAGS_TUDO);
        let l = quantificar(&gc, NIVEL, &cadeia_do_trecho(trecho(nos, true))).expect("quant");
        assert_eq!(total_pecas(&l, QUANT_POSTE), 5);
    }

    #[test]
    fn caracol_com_espacamento_maximo_conta_exato() {
        // Arco de 2π (comprimento em planta ~6,28 m) com intermediário máximo de 0,5 m: ceil(6,28/0,5) - 1 = 12 intermediários.
        let n = 64;
        let nos: Vec<No3> = (0..=n)
            .map(|k| {
                let a = 2.0 * PI * k as f64 / n as f64;
                No3 { x: a.cos(), y: a.sin(), z: 0.2 * k as f64 / n as f64 }
            })
            .collect();
        let gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 0.5, 0, false, FLAGS_TUDO);
        let l = quantificar(&gc, NIVEL, &cadeia_do_trecho(trecho(nos, true))).expect("quant");
        assert_eq!(total_pecas(&l, QUANT_POSTE), 14);
    }

    #[test]
    fn trilho_e_corrimao_em_metros() {
        let mut gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        gc.perfis.insert(20, perfil_circ(0.04));
        gc.trilhos.insert(1, TrilhoLinha { tipo: TIPO, indice: 0, altura: 0.5, desloc: 0.0, perfil: 10, material: 7 });
        let ext = |estilo: u8, comp: f64| ExtensaoLinha { estilo, comprimento: comp, mais_piso: false };
        // Corrimão (funcao 1) no eixo, com extensões de 0,3 m nas duas pontas: 3 + 0,6 = 3,6 m.
        gc.corrimaos.insert(
            1,
            CorrimaoLinha {
                tipo: TIPO,
                indice: 0,
                funcao: 1,
                posicao: 0,
                altura: 0.92,
                afastamento: 0.04,
                perfil: 20,
                material: 8,
                ext_inicio: ext(1, 0.3),
                ext_fim: ext(1, 0.3),
                sup_layout: 0,
                sup_espac: 0.0,
                sup_numero: 0,
                sup_justif: 0,
                sup_perfil: ID_AUSENTE,
                sup_comp: 0.0,
                transicao: 0,
                juncao: 0,
                raio_filete: 0.0,
            },
        );
        let c = cadeia_do_trecho(trecho(vec![No3 { x: 0.0, y: 0.0, z: 0.0 }, No3 { x: 3.0, y: 0.0, z: 0.0 }], false));
        let l = quantificar(&gc, NIVEL, &c).expect("quant");
        assert!((soma(&l, QUANT_TRILHO, |x| x.comprimento) - 3.0).abs() < 1e-12);
        assert!((soma(&l, QUANT_CORRIMAO, |x| x.comprimento) - 3.6).abs() < 1e-12);
        // Duas laterais dobram o metro e contam dois corrimãos.
        gc.corrimaos.get_mut(&1).expect("corrimão").posicao = POSICAO_AMBAS;
        let l2 = quantificar(&gc, NIVEL, &c).expect("quant");
        assert!((soma(&l2, QUANT_CORRIMAO, |x| x.comprimento) - 7.2).abs() < 1e-12);
        assert_eq!(total_pecas(&l2, QUANT_CORRIMAO), 2);
    }

    /// Padrão de um balaústre circular de 1,2 cm, periodo 11 cm, base no hospedeiro, topo na altura do guarda-corpo.
    fn padrao_balaustre(justif: u8, escopo: u8, sobra: u8) -> (PadraoLinha, Vec<ElementoPadraoLinha>) {
        let pad = PadraoLinha {
            tipo: TIPO,
            indice: 0,
            base_tipo: REF_HOSPEDEIRO_OU_ALTURA,
            base_idx: 0,
            topo_tipo: REF_HOSPEDEIRO_OU_ALTURA,
            topo_idx: 0,
            periodo: 0.11,
            justif,
            sobra,
            quebra: QUEBRA_CADA_SEGMENTO,
            ang_quebra: 0.0,
            escopo,
            pd_ativo: false,
            pd_qtd: 0,
            pd_dist: 0.0,
            pd_perfil: ID_AUSENTE,
            pd_material: ID_AUSENTE,
        };
        let el = ElementoPadraoLinha { padrao: 100, indice: 0, perfil: 30, material: 9, dist_anterior: 0.0, desloc_lateral: 0.0, desloc_base: 0.0, desloc_topo: 0.0 };
        (pad, vec![el])
    }

    fn gc_com_padrao(justif: u8, escopo: u8, sobra: u8) -> SecoesGC {
        let mut gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        gc.perfis.insert(30, perfil_circ(0.012));
        let (pad, els) = padrao_balaustre(justif, escopo, sobra);
        gc.padroes.insert(100, pad);
        for e in els {
            gc.padrao_elementos.insert(1000 + e.indice, ElementoPadraoLinha { padrao: 100, ..e });
        }
        gc
    }

    fn reta3() -> CadeiaGC {
        cadeia_do_trecho(trecho(vec![No3 { x: 0.0, y: 0.0, z: 0.0 }, No3 { x: 3.0, y: 0.0, z: 0.0 }], false))
    }

    #[test]
    fn baluastres_justificados_no_inicio_de_cada_vao() {
        // Três vãos de 1 m (postes a cada 1 m). Em cada vão: folga de 0,031 m dos dois lados (poste de 5 cm e balaústre de 1,2 cm),
        // Lu = 0,938 m, periodo 0,11 m: k = floor(0,938/0,11) + 1 = 9 repetições. Total 3 × 9 = 27.
        let gc = gc_com_padrao(JUSTIF_INICIO, ESCOPO_VAO, 0);
        let l = quantificar(&gc, NIVEL, &reta3()).expect("quant");
        assert_eq!(total_pecas(&l, QUANT_BALAUSTRE), 27);
        // Altura do balaústre = altura do guarda-corpo (1,1 m) e comprimento = soma das alturas.
        assert!((soma(&l, QUANT_BALAUSTRE, |x| x.comprimento) - 27.0 * 1.1).abs() < 1e-9);
    }

    #[test]
    fn baluastres_distribuidos_tem_n_mais_um_por_vao() {
        // Com `distribuir`, n = ceil(0,938 / 0,11) = 9 e n + 1 = 10 repetições por vão (a última encosta no fim do vão): 3 × 10 = 30.
        let gc = gc_com_padrao(JUSTIF_DISTRIBUIR, ESCOPO_VAO, 0);
        let l = quantificar(&gc, NIVEL, &reta3()).expect("quant");
        assert_eq!(total_pecas(&l, QUANT_BALAUSTRE), 30);
    }

    #[test]
    fn padrao_que_nao_cabe_gera_so_o_inicio() {
        // Padrão de dois elementos a 0,5 m, vão de 0,3 m de Lu: só o primeiro elemento cabe (sem cortar), 1 por vão.
        let mut gc = gc_com_padrao(JUSTIF_INICIO, ESCOPO_SEGMENTO, 0);
        let pad_id = 100;
        gc.padrao_elementos.insert(1001, ElementoPadraoLinha { padrao: pad_id, indice: 1, perfil: 30, material: 9, dist_anterior: 0.5, desloc_lateral: 0.0, desloc_base: 0.0, desloc_topo: 0.0 });
        gc.postes.insert(4, poste(POSTE_INTERMEDIARIO, false, 10, 0, 0.0, 0));
        // Segmento de 0,3 m: folgas de 0,025 + 0,006 em cada lado não deixam Lu = 0,3 - 0,062 = 0,238 < 0,5: só o elemento 0 entra.
        let c = cadeia_do_trecho(trecho(vec![No3 { x: 0.0, y: 0.0, z: 0.0 }, No3 { x: 0.3, y: 0.0, z: 0.0 }], false));
        let l = quantificar(&gc, NIVEL, &c).expect("quant");
        assert_eq!(total_pecas(&l, QUANT_BALAUSTRE), 1);
    }

    #[test]
    fn paineis_de_vao_entre_postes() {
        // Reta de 3 m com postes a cada 1 m (início, fim e 2 intermediários de 5 cm). Painel de vidro, 1,1 m de altura, folga lateral
        // de 1 cm e largura máxima de 0,5 m. Por vão: Lu = 1 - 0,025 - 0,025 - 2 × 0,01 = 0,93, n = ceil(0,93 / 0,5) = 2, largura
        // = (0,93 - 0,01) / 2 = 0,46. Área por vão = 2 × 0,46 × 1,1 = 1,012 m²; 3 vãos = 3,036 m².
        let mut gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        gc.paineis.insert(
            1,
            PainelLinha {
                tipo: TIPO,
                indice: 0,
                familia: 0,
                base_tipo: REF_HOSPEDEIRO_OU_ALTURA,
                base_idx: 0,
                topo_tipo: REF_HOSPEDEIRO_OU_ALTURA,
                topo_idx: 0,
                desl_base: 0.0,
                desl_topo: 0.0,
                espessura: 0.01,
                folga_lateral: 0.01,
                largura_max: 0.5,
                material: 11,
                perf_diam: 0.0,
                perf_passo_x: 0.0,
                perf_passo_y: 0.0,
                perf_alternado: false,
                tela_larg: 0.0,
                tela_alt: 0.0,
                tela_fio: 0.0,
                cabo_diam: 0.0,
                cabo_espac: 0.0,
                cabo_orient: 0,
            },
        );
        let l = quantificar(&gc, NIVEL, &reta3()).expect("quant");
        assert_eq!(total_pecas(&l, QUANT_PAINEL), 6);
        assert!((soma(&l, QUANT_PAINEL, |x| x.area) - 3.036).abs() < 1e-9);
        assert!((soma(&l, QUANT_PAINEL, |x| x.volume) - 3.036 * 0.01).abs() < 1e-12);
    }

    #[test]
    fn guarda_sem_cadeia_nao_conta_e_nivel_todos_recusa() {
        let gc = gc_base(MODO_ESPACAMENTO_MAXIMO, 1.0, 0, false, FLAGS_TUDO);
        assert!(quantificar(&gc, NIVEL, &CadeiaGC::default()).expect("quant").is_empty());
        assert_eq!(quant_guarda(&gc, NIVEL_TODOS), Err(ENTRADA));
    }

    #[test]
    fn codificar_tem_cinco_e_quatro_valores_por_linha() {
        let linha = LinhaGCQuant { guarda: 1, papel: 0, perfil: 2, material: 3, n_pecas: 4, comprimento: 1.0, area: 2.0, volume: 3.0, area_projetada: 4.0 };
        let s = codificar(&[linha]);
        match (&s[0], &s[1]) {
            (Saida::U32(u), Saida::F64(f)) => {
                assert_eq!(u, &vec![1, 0, 2, 3, 4]);
                assert_eq!(f, &vec![1.0, 2.0, 3.0, 4.0]);
            }
            _ => panic!("saídas com tipo inesperado"),
        }
    }
}
