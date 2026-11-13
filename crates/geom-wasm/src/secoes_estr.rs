//! Seções da estrutura (docs/estrutura/PLANO.md, A.5; esquema v19, ficha K1): `pilares`, `vigas`, `fundacoes`, `tipos_pilar`, `tipos_viga`,
//! `tipos_fundacao` e `perfis` (ids 200 a 206).
//!
//! Mesmo molde de `secoes_gc` e `secoes_cortina`: `BTreeMap` por chave (ordem canônica = id crescente) e decodificação que valida antes de tocar a cena
//! (atômica): tamanho, chave ausente ou duplicada, valores não finitos, enums fora do domínio e as regras de uma linha só (perfil paramétrico da A.2,
//! regras do tipo de fundação, grupos de posição da fundação) dão `ENTRADA`. As referências ENTRE seções (tipo, nível, perfil personalizado, parede) e a
//! coerência dos anéis da seção 206 não são checadas aqui, porque as seções chegam em qualquer ordem: ficam para as consultas (fichas K2 a K4).

use std::collections::BTreeMap;

use crate::cena::{decodificar_colunas, Coluna, COORD_MAX};
use crate::esquema::{
    self, Secao, ENTRADA, ID_AUSENTE, INTERNO, LIMITE, LIMITE_LINHAS_POR_SECAO, SECAO_FUNDACOES, SECAO_PERFIS_ESTR, SECAO_PILARES, SECAO_TIPOS_FUNDACAO,
    SECAO_TIPOS_PILAR, SECAO_TIPOS_VIGA, SECAO_VIGAS,
};

/// Código de `forma` do perfil (A.2), na ordem de `FORMAS_DE_PERFIL` do modelo.
pub const PERFIL_RETANGULAR: u8 = 0;
pub const PERFIL_CIRCULAR: u8 = 1;
pub const PERFIL_L: u8 = 2;
pub const PERFIL_T: u8 = 3;
pub const PERFIL_I: u8 = 4;
pub const PERFIL_U: u8 = 5;
pub const PERFIL_TUBO_RETANGULAR: u8 = 6;
pub const PERFIL_TUBO_CIRCULAR: u8 = 7;
pub const PERFIL_PERSONALIZADO: u8 = 8;
/// `pescoco_forma` de um tipo de fundação sem pescoço.
pub const PERFIL_AUSENTE: u8 = 255;

/// `disciplina` do pilar e do tipo de pilar.
pub const DISCIPLINA_ARQUITETONICO: u8 = 0;
pub const DISCIPLINA_ESTRUTURAL: u8 = 1;
/// `modo` e `forma` do tipo de fundação.
pub const FUNDACAO_ISOLADA: u8 = 0;
pub const FUNDACAO_CORRIDA: u8 = 1;
pub const FUNDACAO_SAPATA: u8 = 0;
pub const FUNDACAO_BLOCO: u8 = 1;
pub const FUNDACAO_ESTACA: u8 = 2;

/// Perfil paramétrico de um tipo. `p`: parâmetros na ordem da A.2 (os não usados pela forma ficam como vieram: `NaN` ou um finito ignorado).
/// `perfil`: o `perfil_num` da seção 206 na forma personalizada; `ID_AUSENTE` nas demais.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PerfilLinha {
    pub forma: u8,
    pub p: [f64; 6],
    pub perfil: u32,
}

/// Pilar. `nivel_topo` `ID_AUSENTE` = topo pela `altura`; `altura` `NaN` = ausente (só com nível de topo).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PilarLinha {
    pub nivel: u32,
    pub tipo: u32,
    pub disciplina: u8,
    pub pos: [f64; 2],
    pub rotacao: f64,
    pub deslocamento_base: f64,
    pub nivel_topo: u32,
    pub deslocamento_topo: f64,
    pub altura: f64,
    pub hosp: u32,
}

/// Viga. `alinhamento`: 0 topo, 1 centro, 2 base. `extremidades`: 0 rígida, 1 articulada (a e b).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VigaLinha {
    pub nivel: u32,
    pub tipo: u32,
    pub a: [f64; 2],
    pub b: [f64; 2],
    pub deslocamento_z: [f64; 2],
    pub alinhamento: u8,
    pub rotacao: f64,
    pub extremidades: [u8; 2],
}

/// Fundação: `pos` (isolada) ou `a` e `b` (corrida), exatamente um dos dois.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FundacaoLinha {
    pub nivel: u32,
    pub tipo: u32,
    pub pos: Option<[f64; 2]>,
    pub rotacao: f64,
    pub eixo: Option<([f64; 2], [f64; 2])>,
    pub hosp: u32,
    pub deslocamento_topo: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TipoPilarLinha {
    pub disciplina: u8,
    pub perfil: PerfilLinha,
    pub material: u32,
    pub espessura_camadas: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TipoVigaLinha {
    pub perfil: PerfilLinha,
    pub material: u32,
}

/// Tipo de fundação. `pescoco` `None` = sem pescoço.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TipoFundacaoLinha {
    pub modo: u8,
    pub forma: u8,
    pub base: PerfilLinha,
    pub altura_base: f64,
    pub pescoco: Option<(PerfilLinha, f64)>,
    pub material: u32,
}

/// Vértice de perfil personalizado. `anel` 0 = contorno; k >= 1 = furo k.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VerticePerfilLinha {
    pub perfil: u32,
    pub anel: u32,
    pub indice: u32,
    pub p: [f64; 2],
}

macro_rules! tabelas {
    ($($campo:ident: $ty:ty = $id:ident,)*) => {
        /// Linhas das seções da estrutura.
        #[derive(Default)]
        pub struct SecoesEstr {
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

        impl SecoesEstr {
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
    pilares: PilarLinha = SECAO_PILARES,
    vigas: VigaLinha = SECAO_VIGAS,
    fundacoes: FundacaoLinha = SECAO_FUNDACOES,
    tipos_pilar: TipoPilarLinha = SECAO_TIPOS_PILAR,
    tipos_viga: TipoVigaLinha = SECAO_TIPOS_VIGA,
    tipos_fundacao: TipoFundacaoLinha = SECAO_TIPOS_FUNDACAO,
    perfis: VerticePerfilLinha = SECAO_PERFIS_ESTR,
}

/// Regras de uma linha do perfil paramétrico (A.2, as mesmas de `validarPerfil` do modelo). O personalizado só exige o `perfil_num`; os anéis são
/// conferidos pelas consultas.
pub fn perfil_valido(p: &PerfilLinha) -> bool {
    let pos = |k: usize| p.p[k].is_finite() && p.p[k] > 0.0;
    let todos = |n: usize| (0..n).all(pos);
    let parametrico = p.perfil == ID_AUSENTE;
    let [b, h, x2, x3, _, _] = p.p;
    match p.forma {
        PERFIL_RETANGULAR => parametrico && todos(2),
        PERFIL_CIRCULAR => parametrico && todos(1),
        PERFIL_L => parametrico && todos(3) && x2 < b && x2 < h,
        PERFIL_T => parametrico && todos(4) && x2 < h && x3 < b,
        PERFIL_I | PERFIL_U => parametrico && todos(4) && x2 * 2.0 < h && x3 < b,
        PERFIL_TUBO_RETANGULAR => parametrico && todos(3) && x2 * 2.0 < b.min(h),
        PERFIL_TUBO_CIRCULAR => parametrico && todos(2) && h * 2.0 < b,
        PERFIL_PERSONALIZADO => p.perfil != ID_AUSENTE,
        _ => false,
    }
}

/// Regras de uma linha do tipo de fundação (as de `footingTypeIssue` do modelo).
pub fn tipo_fundacao_valido(t: &TipoFundacaoLinha) -> bool {
    let bases_isolada = [PERFIL_RETANGULAR, PERFIL_CIRCULAR, PERFIL_PERSONALIZADO];
    let base_ok = match (t.modo, t.forma) {
        (_, FUNDACAO_ESTACA) => [PERFIL_CIRCULAR, PERFIL_TUBO_CIRCULAR].contains(&t.base.forma),
        (FUNDACAO_CORRIDA, f) => f == FUNDACAO_SAPATA && t.base.forma == PERFIL_RETANGULAR,
        _ => bases_isolada.contains(&t.base.forma),
    };
    let pescoco_ok = match t.pescoco {
        None => true,
        Some((p, altura)) => t.modo == FUNDACAO_ISOLADA && t.forma != FUNDACAO_ESTACA && bases_isolada.contains(&p.forma) && perfil_valido(&p) && altura > 0.0,
    };
    base_ok && perfil_valido(&t.base) && t.altura_base > 0.0 && pescoco_ok
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

    /// `f64` que pode ser `NaN` (= ausente), mas nunca infinito nem acima de `COORD_MAX`.
    fn dn(&self, nome: &str, i: usize) -> Result<f64, u32> {
        match self.coluna(nome)? {
            Coluna::F64(v) => {
                let x = v.get(i).copied().ok_or(INTERNO)?;
                if x.is_nan() || (x.is_finite() && x.abs() <= COORD_MAX) {
                    Ok(x)
                } else {
                    Err(ENTRADA)
                }
            }
            _ => Err(INTERNO),
        }
    }

    /// `f64` finito e dentro de `COORD_MAX`.
    fn d(&self, nome: &str, i: usize) -> Result<f64, u32> {
        let x = self.dn(nome, i)?;
        if x.is_nan() {
            Err(ENTRADA)
        } else {
            Ok(x)
        }
    }

    /// `u8` de enum, de 0 a `max`; `extra` (se dado) também vale.
    fn e(&self, nome: &str, i: usize, max: u8, extra: Option<u8>) -> Result<u8, u32> {
        match self.coluna(nome)? {
            Coluna::U8(v) => {
                let x = v.get(i).copied().ok_or(INTERNO)?;
                if x <= max || Some(x) == extra {
                    Ok(x)
                } else {
                    Err(ENTRADA)
                }
            }
            _ => Err(INTERNO),
        }
    }

    fn p(&self, nx: &str, ny: &str, i: usize) -> Result<[f64; 2], u32> {
        Ok([self.d(nx, i)?, self.d(ny, i)?])
    }

    /// Par de coordenadas opcional: os dois `NaN` = ausente; um só `NaN` = `ENTRADA`.
    fn p_opcional(&self, nx: &str, ny: &str, i: usize) -> Result<Option<[f64; 2]>, u32> {
        match (self.dn(nx, i)?, self.dn(ny, i)?) {
            (x, y) if x.is_nan() && y.is_nan() => Ok(None),
            (x, y) if x.is_nan() || y.is_nan() => Err(ENTRADA),
            (x, y) => Ok(Some([x, y])),
        }
    }

    /// Perfil com as colunas `{prefixo}forma`, `{prefixo}p0` a `{prefixo}p5` e `{prefixo}perfil_num`, já validado (`ENTRADA` se inválido).
    fn perfil(&self, prefixo: &str, i: usize) -> Result<PerfilLinha, u32> {
        let nome = |s: &str| format!("{prefixo}{s}");
        let mut p = [0.0; 6];
        for (k, x) in p.iter_mut().enumerate() {
            *x = self.dn(&nome(&format!("p{k}")), i)?;
        }
        let perfil = PerfilLinha { forma: self.e(&nome("forma"), i, PERFIL_PERSONALIZADO, None)?, p, perfil: self.u(&nome("perfil_num"), i)? };
        if perfil_valido(&perfil) {
            Ok(perfil)
        } else {
            Err(ENTRADA)
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

/// `Ok(x)` se a condição vale; senão `ENTRADA`.
fn exige<T>(ok: bool, x: T) -> Result<T, u32> {
    if ok {
        Ok(x)
    } else {
        Err(ENTRADA)
    }
}

fn pilar(t: &Tab, i: usize) -> Result<PilarLinha, u32> {
    let l = PilarLinha {
        nivel: t.u("nivel_num", i)?,
        tipo: t.u("tipo_num", i)?,
        disciplina: t.e("disciplina", i, DISCIPLINA_ESTRUTURAL, None)?,
        pos: t.p("px", "py", i)?,
        rotacao: t.d("rotacao", i)?,
        deslocamento_base: t.d("deslocamento_base", i)?,
        nivel_topo: t.u("nivel_topo_num", i)?,
        deslocamento_topo: t.d("deslocamento_topo", i)?,
        altura: t.dn("altura", i)?,
        hosp: t.u("hosp_num", i)?,
    };
    // Sem nível de topo a altura manda (finita e > 0); parede hospedeira só no arquitetônico.
    let altura_ok = l.nivel_topo != ID_AUSENTE || l.altura > 0.0;
    exige(altura_ok && (l.hosp == ID_AUSENTE || l.disciplina == DISCIPLINA_ARQUITETONICO), l)
}

fn fundacao(t: &Tab, i: usize) -> Result<FundacaoLinha, u32> {
    let pos = t.p_opcional("px", "py", i)?;
    let eixo = match (t.p_opcional("ax", "ay", i)?, t.p_opcional("bx", "by", i)?) {
        (None, None) => None,
        (Some(a), Some(b)) => Some((a, b)),
        _ => return Err(ENTRADA),
    };
    let l = FundacaoLinha { nivel: t.u("nivel_num", i)?, tipo: t.u("tipo_num", i)?, pos, rotacao: t.d("rotacao", i)?, eixo, hosp: t.u("hosp_num", i)?, deslocamento_topo: t.d("deslocamento_topo", i)? };
    // Exatamente um grupo; parede hospedeira só na corrida.
    exige(pos.is_some() != eixo.is_some() && (l.hosp == ID_AUSENTE || eixo.is_some()), l)
}

fn tipo_pilar(t: &Tab, i: usize) -> Result<TipoPilarLinha, u32> {
    let l = TipoPilarLinha { disciplina: t.e("disciplina", i, DISCIPLINA_ESTRUTURAL, None)?, perfil: t.perfil("", i)?, material: t.u("material_num", i)?, espessura_camadas: t.d("espessura_camadas", i)? };
    exige(l.espessura_camadas == 0.0 || (l.espessura_camadas > 0.0 && l.disciplina == DISCIPLINA_ARQUITETONICO), l)
}

fn tipo_fundacao(t: &Tab, i: usize) -> Result<TipoFundacaoLinha, u32> {
    let pescoco = if t.e("pescoco_forma", i, PERFIL_PERSONALIZADO, Some(PERFIL_AUSENTE))? == PERFIL_AUSENTE {
        // Sem pescoço: as demais colunas do pescoço vêm vazias.
        let vazio = (0..6).try_fold(true, |ok, k| Ok::<bool, u32>(ok && t.dn(&format!("pescoco_p{k}"), i)?.is_nan()))?;
        exige(vazio && t.u("pescoco_perfil_num", i)? == ID_AUSENTE && t.dn("altura_pescoco", i)?.is_nan(), None)?
    } else {
        Some((t.perfil("pescoco_", i)?, t.d("altura_pescoco", i)?))
    };
    let l = TipoFundacaoLinha {
        modo: t.e("modo", i, FUNDACAO_CORRIDA, None)?,
        forma: t.e("forma", i, FUNDACAO_ESTACA, None)?,
        base: t.perfil("base_", i)?,
        altura_base: t.d("altura_base", i)?,
        pescoco,
        material: t.u("material_num", i)?,
    };
    exige(tipo_fundacao_valido(&l), l)
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
        SECAO_PILARES => Lote::pilares(linhas!(i => pilar(&t, i)?)),
        SECAO_VIGAS => Lote::vigas(linhas!(i => VigaLinha {
            nivel: t.u("nivel_num", i)?,
            tipo: t.u("tipo_num", i)?,
            a: t.p("ax", "ay", i)?,
            b: t.p("bx", "by", i)?,
            deslocamento_z: [t.d("deslocamento_z_a", i)?, t.d("deslocamento_z_b", i)?],
            alinhamento: t.e("alinhamento", i, 2, None)?,
            rotacao: t.d("rotacao", i)?,
            extremidades: [t.e("extremidade_a", i, 1, None)?, t.e("extremidade_b", i, 1, None)?],
        })),
        SECAO_FUNDACOES => Lote::fundacoes(linhas!(i => fundacao(&t, i)?)),
        SECAO_TIPOS_PILAR => Lote::tipos_pilar(linhas!(i => tipo_pilar(&t, i)?)),
        SECAO_TIPOS_VIGA => Lote::tipos_viga(linhas!(i => TipoVigaLinha { perfil: t.perfil("", i)?, material: t.u("material_num", i)? })),
        SECAO_TIPOS_FUNDACAO => Lote::tipos_fundacao(linhas!(i => tipo_fundacao(&t, i)?)),
        SECAO_PERFIS_ESTR => Lote::perfis(linhas!(i => {
            let perfil = t.u("perfil_num", i)?;
            exige(perfil != ID_AUSENTE, VerticePerfilLinha { perfil, anel: t.u("anel", i)?, indice: t.u("indice", i)?, p: t.p("x", "y", i)? })?
        })),
        _ => return Err(ENTRADA),
    })
}

impl SecoesEstr {
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
    use crate::esquema::{bytes_coluna, Tipo, SECOES};

    const NAN: f64 = f64::NAN;
    const AUS: f64 = ID_AUSENTE as f64;

    /// Bytes de uma seção a partir de colunas dadas por nome (as que faltam ficam com `padrao`, por linha). Cada coluna é preenchida a múltiplo de 8.
    fn bytes_com(secao: u32, n: usize, valores: &[(&str, Vec<f64>)], padrao: &dyn Fn(&str) -> f64) -> Vec<u8> {
        let s = esquema::secao(secao).expect("seção");
        let mut out = Vec::new();
        for c in s.colunas {
            let v: Vec<f64> = valores.iter().find(|(nome, _)| *nome == c.nome).map(|(_, v)| v.clone()).unwrap_or_else(|| vec![padrao(c.nome); n]);
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

    /// Padrões de uma linha válida de cada seção: o que um TS coerente mandaria (retangular 0,25 × 0,25, sapata 0,8 × 0,8 × 0,3 sem pescoço...).
    fn padrao(nome: &str) -> f64 {
        match nome {
            "p0" | "p1" | "base_p0" | "base_p1" => 0.25,
            "altura" | "altura_base" => 3.0,
            "perfil_num" | "base_perfil_num" | "pescoco_perfil_num" | "nivel_topo_num" | "hosp_num" => AUS,
            "pescoco_forma" => PERFIL_AUSENTE as f64,
            "altura_pescoco" | "p2" | "p3" | "p4" | "p5" | "base_p2" | "base_p3" | "base_p4" | "base_p5" => NAN,
            n if n.starts_with("pescoco_p") => NAN,
            "disciplina" => DISCIPLINA_ESTRUTURAL as f64,
            _ => 0.0,
        }
    }

    /// Na fundação os dois grupos de posição vêm ausentes (`NaN`) por padrão.
    fn bytes(secao: u32, n: usize, valores: &[(&str, Vec<f64>)]) -> Vec<u8> {
        let fundacao = |nome: &str| if ["px", "py", "ax", "ay", "bx", "by"].contains(&nome) { NAN } else { padrao(nome) };
        if secao == SECAO_FUNDACOES {
            bytes_com(secao, n, valores, &fundacao)
        } else {
            bytes_com(secao, n, valores, &padrao)
        }
    }

    fn v(x: &[f64]) -> Vec<f64> {
        x.to_vec()
    }

    /// Uma linha com id 1 e as colunas dadas.
    fn um(secao: u32, valores: &[(&str, f64)]) -> Vec<u8> {
        let mut c: Vec<(&str, Vec<f64>)> = valores.iter().map(|&(n, x)| (n, vec![x])).collect();
        c.push(("id_num", vec![1.0]));
        bytes(secao, 1, &c)
    }

    fn definir_um(secao: u32, valores: &[(&str, f64)]) -> Result<(), u32> {
        SecoesEstr::default().definir(secao, 1, &um(secao, valores))
    }

    #[test]
    fn toda_secao_da_estrutura_tem_dono_e_aceita_uma_linha_padrao() {
        let ids: Vec<u32> = SECOES.iter().map(|s| s.id).filter(|&i| (200..=229).contains(&i)).collect();
        assert_eq!(ids, vec![200, 201, 202, 203, 204, 205, 206]);
        for id in ids {
            assert!(SecoesEstr::e_minha(id), "seção {id}");
            let mut s = SecoesEstr::default();
            assert_eq!(s.definir(id, 0, &bytes(id, 0, &[])), Ok(()), "seção {id} vazia");
            // A fundação precisa de um dos grupos de posição e o vértice, de um perfil; o resto entra com os padrões.
            let extra: &[(&str, f64)] = match id {
                SECAO_FUNDACOES => &[("px", 1.0), ("py", 1.0)],
                SECAO_PERFIS_ESTR => &[("perfil_num", 1.0)],
                _ => &[],
            };
            assert_eq!(s.definir(id, 1, &um(id, extra)), Ok(()), "seção {id} com uma linha");
            assert_eq!(s.total_linhas(), 1);
            // Zeros em tudo: entra ou é ENTRADA, nunca INTERNO.
            let zeros = bytes_com(id, 1, &[("id_num", v(&[2.0]))], &|_| 0.0);
            let r = s.definir(id, 1, &zeros);
            assert!(r == Ok(()) || r == Err(ENTRADA), "seção {id}: {r:?}");
        }
        for fora in [113, 199, 207, 230] {
            assert!(!SecoesEstr::e_minha(fora), "seção {fora}");
        }
    }

    #[test]
    fn ida_e_volta_de_pilar_viga_e_fundacao() {
        let mut s = SecoesEstr::default();
        let b = bytes(
            SECAO_PILARES,
            2,
            &[("id_num", v(&[7.0, 3.0])), ("nivel_num", v(&[1.0, 1.0])), ("tipo_num", v(&[4.0, 5.0])), ("disciplina", v(&[0.0, 1.0])), ("px", v(&[1.0, 2.0])), ("py", v(&[0.5, 0.0])), ("rotacao", v(&[0.3, 0.0])), ("deslocamento_base", v(&[-0.1, 0.0])), ("nivel_topo_num", v(&[2.0, AUS])), ("deslocamento_topo", v(&[0.2, 0.0])), ("altura", v(&[NAN, 2.8])), ("hosp_num", v(&[9.0, AUS]))],
        );
        assert_eq!(s.definir(SECAO_PILARES, 2, &b), Ok(()));
        assert_eq!(s.pilares.keys().copied().collect::<Vec<_>>(), vec![3, 7], "ordem canônica por id");
        let p = s.pilares[&7];
        assert_eq!((p.nivel, p.tipo, p.disciplina, p.pos, p.rotacao, p.deslocamento_base, p.nivel_topo, p.deslocamento_topo, p.hosp), (1, 4, 0, [1.0, 0.5], 0.3, -0.1, 2, 0.2, 9));
        assert!(p.altura.is_nan());
        assert_eq!(s.pilares[&3].altura, 2.8);

        let b = um(SECAO_VIGAS, &[("nivel_num", 2.0), ("tipo_num", 6.0), ("bx", 5.0), ("ay", 0.0), ("by", 0.0), ("ax", 0.0), ("deslocamento_z_a", 3.0), ("deslocamento_z_b", 3.2), ("alinhamento", 1.0), ("rotacao", 0.1), ("extremidade_b", 1.0)]);
        assert_eq!(s.definir(SECAO_VIGAS, 1, &b), Ok(()));
        assert_eq!(s.vigas[&1], VigaLinha { nivel: 2, tipo: 6, a: [0.0, 0.0], b: [5.0, 0.0], deslocamento_z: [3.0, 3.2], alinhamento: 1, rotacao: 0.1, extremidades: [0, 1] });

        let b = bytes(
            SECAO_FUNDACOES,
            2,
            &[("id_num", v(&[1.0, 2.0])), ("px", v(&[1.0, NAN])), ("py", v(&[2.0, NAN])), ("ax", v(&[NAN, 0.0])), ("ay", v(&[NAN, 0.0])), ("bx", v(&[NAN, 6.0])), ("by", v(&[NAN, 0.0])), ("hosp_num", v(&[AUS, 12.0])), ("deslocamento_topo", v(&[-0.5, -0.2]))],
        );
        assert_eq!(s.definir(SECAO_FUNDACOES, 2, &b), Ok(()));
        assert_eq!(s.fundacoes[&1].pos, Some([1.0, 2.0]));
        assert_eq!(s.fundacoes[&1].eixo, None);
        assert_eq!(s.fundacoes[&2].eixo, Some(([0.0, 0.0], [6.0, 0.0])));
        assert_eq!((s.fundacoes[&2].hosp, s.fundacoes[&2].deslocamento_topo), (12, -0.2));
    }

    #[test]
    fn ida_e_volta_dos_tipos_e_dos_vertices() {
        let mut s = SecoesEstr::default();
        // E3: perfil I (b 0,10, h 0,20, tf 0,008, tw 0,005).
        let b = um(SECAO_TIPOS_PILAR, &[("disciplina", 1.0), ("forma", PERFIL_I as f64), ("p0", 0.1), ("p1", 0.2), ("p2", 0.008), ("p3", 0.005), ("material_num", 3.0)]);
        assert_eq!(s.definir(SECAO_TIPOS_PILAR, 1, &b), Ok(()));
        let t = s.tipos_pilar[&1];
        assert_eq!((t.disciplina, t.perfil.forma, t.perfil.perfil, t.material, t.espessura_camadas), (1, PERFIL_I, ID_AUSENTE, 3, 0.0));
        assert_eq!(&t.perfil.p[..4], &[0.1, 0.2, 0.008, 0.005]);
        // Arquitetônico com camadas.
        let b = um(SECAO_TIPOS_PILAR, &[("disciplina", 0.0), ("espessura_camadas", 0.025)]);
        assert_eq!(s.definir(SECAO_TIPOS_PILAR, 1, &b), Ok(()));
        assert_eq!(s.tipos_pilar[&1].espessura_camadas, 0.025);
        // E9: viga com perfil personalizado (os vértices vêm na 206).
        let b = um(SECAO_TIPOS_VIGA, &[("forma", PERFIL_PERSONALIZADO as f64), ("p0", NAN), ("p1", NAN), ("perfil_num", 40.0)]);
        assert_eq!(s.definir(SECAO_TIPOS_VIGA, 1, &b), Ok(()));
        assert_eq!(s.tipos_viga[&1].perfil.perfil, 40);
        let xs = [0.0, 0.1, 0.1, 0.02, 0.02, 0.0];
        let ys = [0.0, 0.0, 0.02, 0.02, 0.1, 0.1];
        let b = bytes(SECAO_PERFIS_ESTR, 6, &[("id_num", v(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0])), ("perfil_num", vec![40.0; 6]), ("indice", v(&[0.0, 1.0, 2.0, 3.0, 4.0, 5.0])), ("x", v(&xs)), ("y", v(&ys))]);
        assert_eq!(s.definir(SECAO_PERFIS_ESTR, 6, &b), Ok(()));
        assert_eq!(s.perfis[&3], VerticePerfilLinha { perfil: 40, anel: 0, indice: 2, p: [0.1, 0.02] });
        // E7: sapata 0,80 × 0,80 × 0,30 com pescoço 0,25 × 0,25 × 0,50.
        let b = um(SECAO_TIPOS_FUNDACAO, &[("base_p0", 0.8), ("base_p1", 0.8), ("altura_base", 0.3), ("pescoco_forma", 0.0), ("pescoco_p0", 0.25), ("pescoco_p1", 0.25), ("altura_pescoco", 0.5), ("material_num", 2.0)]);
        assert_eq!(s.definir(SECAO_TIPOS_FUNDACAO, 1, &b), Ok(()));
        let f = s.tipos_fundacao[&1];
        assert_eq!((f.modo, f.forma, f.base.forma, f.altura_base, f.material), (FUNDACAO_ISOLADA, FUNDACAO_SAPATA, PERFIL_RETANGULAR, 0.3, 2));
        let (pescoco, altura) = f.pescoco.expect("pescoço");
        assert_eq!((pescoco.p[0], pescoco.p[1], altura), (0.25, 0.25, 0.5));
        // E8: baldrame corrido 0,40 × 0,30, sem pescoço.
        let b = um(SECAO_TIPOS_FUNDACAO, &[("modo", 1.0), ("base_p0", 0.4), ("base_p1", 0.3), ("altura_base", 0.3)]);
        assert_eq!(s.definir(SECAO_TIPOS_FUNDACAO, 1, &b), Ok(()));
        assert_eq!(s.tipos_fundacao[&1].pescoco, None);
        // Estaca de tubo circular.
        let b = um(SECAO_TIPOS_FUNDACAO, &[("forma", 2.0), ("base_forma", PERFIL_TUBO_CIRCULAR as f64), ("base_p0", 0.3), ("base_p1", 0.05), ("altura_base", 8.0)]);
        assert_eq!(s.definir(SECAO_TIPOS_FUNDACAO, 1, &b), Ok(()));
    }

    #[test]
    fn perfil_parametrico_segue_as_regras_da_a2() {
        let p = |forma: u8, x: &[f64]| {
            let mut q = [NAN; 6];
            q[..x.len()].copy_from_slice(x);
            perfil_valido(&PerfilLinha { forma, p: q, perfil: ID_AUSENTE })
        };
        assert!(p(PERFIL_RETANGULAR, &[0.2, 0.4]));
        assert!(!p(PERFIL_RETANGULAR, &[0.2, 0.0]), "dimensão zero");
        assert!(!p(PERFIL_RETANGULAR, &[0.2, -0.4]), "dimensão negativa");
        assert!(!p(PERFIL_RETANGULAR, &[0.2, NAN]), "dimensão ausente");
        assert!(p(PERFIL_CIRCULAR, &[0.3]));
        assert!(p(PERFIL_L, &[0.1, 0.1, 0.01]));
        assert!(!p(PERFIL_L, &[0.1, 0.05, 0.05]), "L: tf < h");
        assert!(!p(PERFIL_L, &[0.05, 0.1, 0.05]), "L: tf < b");
        assert!(p(PERFIL_T, &[0.1, 0.2, 0.15, 0.005]), "T: uma aba só, tf < h basta");
        assert!(!p(PERFIL_T, &[0.1, 0.2, 0.2, 0.005]), "T: tf < h");
        assert!(p(PERFIL_I, &[0.1, 0.2, 0.008, 0.005]), "E3");
        assert!(!p(PERFIL_I, &[0.1, 0.2, 0.1, 0.005]), "E10: tf >= h/2");
        assert!(!p(PERFIL_U, &[0.1, 0.2, 0.008, 0.1]), "U: tw < b");
        assert!(p(PERFIL_TUBO_RETANGULAR, &[0.1, 0.1, 0.005]), "E4");
        assert!(!p(PERFIL_TUBO_RETANGULAR, &[0.1, 0.2, 0.05]), "2t < min(b, h)");
        assert!(p(PERFIL_TUBO_CIRCULAR, &[0.2, 0.01]));
        assert!(!p(PERFIL_TUBO_CIRCULAR, &[0.2, 0.1]), "2t < d");
        assert!(!p(9, &[0.2, 0.2]), "forma desconhecida");
        assert!(!perfil_valido(&PerfilLinha { forma: PERFIL_PERSONALIZADO, p: [NAN; 6], perfil: ID_AUSENTE }), "personalizado sem vértices");
        assert!(!perfil_valido(&PerfilLinha { forma: PERFIL_RETANGULAR, p: [0.2, 0.2, NAN, NAN, NAN, NAN], perfil: 4 }), "paramétrico com perfil_num");
    }

    #[test]
    fn recusa_linhas_invalidas_com_entrada_e_nao_toca_a_cena() {
        type Caso = (u32, Vec<(&'static str, f64)>, &'static str);
        let casos: Vec<Caso> = vec![
            (SECAO_PILARES, vec![("altura", NAN)], "sem nível de topo a altura manda"),
            (SECAO_PILARES, vec![("altura", 0.0)], "altura zero sem nível de topo"),
            (SECAO_PILARES, vec![("hosp_num", 5.0)], "hospedeiro só no arquitetônico"),
            (SECAO_PILARES, vec![("disciplina", 2.0)], "disciplina fora"),
            (SECAO_PILARES, vec![("px", f64::INFINITY)], "infinito"),
            (SECAO_PILARES, vec![("py", 2e12)], "acima de COORD_MAX"),
            (SECAO_PILARES, vec![("rotacao", NAN)], "NaN onde não cabe"),
            (SECAO_VIGAS, vec![("alinhamento", 3.0)], "alinhamento fora"),
            (SECAO_VIGAS, vec![("extremidade_a", 2.0)], "extremidade fora"),
            (SECAO_VIGAS, vec![("ax", NAN)], "eixo com NaN"),
            (SECAO_FUNDACOES, vec![], "nenhum grupo de posição"),
            (SECAO_FUNDACOES, vec![("px", 1.0)], "meio par"),
            (SECAO_FUNDACOES, vec![("px", 1.0), ("py", 1.0), ("ax", 0.0), ("ay", 0.0), ("bx", 1.0), ("by", 0.0)], "os dois grupos"),
            (SECAO_FUNDACOES, vec![("ax", 0.0), ("ay", 0.0), ("bx", 1.0)], "eixo incompleto"),
            (SECAO_FUNDACOES, vec![("px", 1.0), ("py", 1.0), ("hosp_num", 3.0)], "isolada hospedada"),
            (SECAO_TIPOS_PILAR, vec![("forma", 9.0)], "forma fora"),
            (SECAO_TIPOS_PILAR, vec![("espessura_camadas", 0.02)], "camadas no estrutural"),
            (SECAO_TIPOS_PILAR, vec![("disciplina", 0.0), ("espessura_camadas", -0.02)], "camadas negativas"),
            (SECAO_TIPOS_PILAR, vec![("forma", PERFIL_I as f64), ("p2", 0.2), ("p3", 0.01)], "E10: perfil I com tf >= h/2"),
            (SECAO_TIPOS_VIGA, vec![("forma", PERFIL_PERSONALIZADO as f64)], "personalizado sem perfil_num"),
            (SECAO_TIPOS_VIGA, vec![("perfil_num", 3.0)], "paramétrico com perfil_num"),
            (SECAO_TIPOS_FUNDACAO, vec![("altura_base", 0.0)], "altura da base zero"),
            (SECAO_TIPOS_FUNDACAO, vec![("modo", 2.0)], "modo fora"),
            (SECAO_TIPOS_FUNDACAO, vec![("forma", 3.0)], "forma fora"),
            (SECAO_TIPOS_FUNDACAO, vec![("modo", 1.0), ("forma", 1.0)], "corrida só sapata"),
            (SECAO_TIPOS_FUNDACAO, vec![("modo", 1.0), ("base_forma", 1.0), ("base_p1", NAN)], "corrida só retangular"),
            (SECAO_TIPOS_FUNDACAO, vec![("forma", 2.0)], "estaca retangular"),
            (SECAO_TIPOS_FUNDACAO, vec![("base_forma", PERFIL_I as f64), ("base_p2", 0.01), ("base_p3", 0.01)], "sapata de perfil I"),
            (SECAO_TIPOS_FUNDACAO, vec![("pescoco_forma", 0.0), ("pescoco_p0", 0.25), ("pescoco_p1", 0.25)], "pescoço sem altura"),
            (SECAO_TIPOS_FUNDACAO, vec![("pescoco_forma", 0.0), ("pescoco_p0", 0.25), ("pescoco_p1", 0.25), ("altura_pescoco", 0.5), ("modo", 1.0)], "pescoço na corrida"),
            (SECAO_TIPOS_FUNDACAO, vec![("pescoco_forma", 1.0), ("pescoco_p0", 0.25), ("altura_pescoco", 0.5), ("forma", 2.0), ("base_forma", 1.0), ("base_p1", NAN)], "pescoço na estaca"),
            (SECAO_TIPOS_FUNDACAO, vec![("altura_pescoco", 0.5)], "sem pescoço mas com altura"),
            (SECAO_TIPOS_FUNDACAO, vec![("pescoco_p0", 0.5)], "sem pescoço mas com parâmetro"),
            (SECAO_TIPOS_FUNDACAO, vec![("pescoco_forma", 12.0)], "pescoço com forma fora"),
            (SECAO_PERFIS_ESTR, vec![], "vértice sem perfil"),
            (SECAO_PERFIS_ESTR, vec![("perfil_num", 1.0), ("x", NAN)], "vértice com NaN"),
        ];
        for (secao, valores, motivo) in casos {
            let mut s = SecoesEstr::default();
            let ok = s.definir(secao, 1, &bytes(secao, 1, &[("id_num", v(&[5.0]))]));
            let r = s.definir(secao, 1, &um(secao, &valores));
            assert_eq!(r, Err(ENTRADA), "{motivo}");
            assert_eq!(s.total_linhas(), usize::from(ok.is_ok()), "{motivo}: a falha não toca a cena");
        }
        // A linha padrão da fundação (nenhum grupo) é recusada; com o par da isolada entra.
        assert_eq!(definir_um(SECAO_FUNDACOES, &[("px", 1.0), ("py", 1.0)]), Ok(()));
        assert_eq!(definir_um(SECAO_PERFIS_ESTR, &[("perfil_num", 1.0)]), Ok(()));
    }

    #[test]
    fn recusa_chave_ausente_duplicada_e_tamanho_errado() {
        let mut s = SecoesEstr::default();
        let ids = |x: &[f64]| bytes(SECAO_VIGAS, x.len(), &[("id_num", v(x))]);
        assert_eq!(s.definir(SECAO_VIGAS, 2, &ids(&[1.0, 1.0])), Err(ENTRADA), "duplicada");
        assert_eq!(s.definir(SECAO_VIGAS, 1, &ids(&[AUS])), Err(ENTRADA), "ausente");
        assert_eq!(s.definir(SECAO_VIGAS, 1, &ids(&[1.0])[..8]), Err(ENTRADA), "tamanho errado");
        assert_eq!(s.definir(SECAO_VIGAS, 1, &ids(&[1.0])), Ok(()));
        assert_eq!(s.definir(199, 0, &[]), Err(ENTRADA), "seção que não é daqui");
    }

    #[test]
    fn upsert_remover_e_atomicidade() {
        let mut s = SecoesEstr::default();
        let a = bytes(SECAO_VIGAS, 2, &[("id_num", v(&[1.0, 2.0])), ("bx", v(&[3.0, 4.0]))]);
        assert_eq!(s.definir(SECAO_VIGAS, 2, &a), Ok(()));
        let b = bytes(SECAO_VIGAS, 2, &[("id_num", v(&[2.0, 9.0])), ("bx", v(&[40.0, 90.0]))]);
        assert_eq!(s.upsert(SECAO_VIGAS, 2, &b), Ok(()));
        assert_eq!(s.vigas.keys().copied().collect::<Vec<_>>(), vec![1, 2, 9]);
        assert_eq!(s.vigas[&2].b, [40.0, 0.0]);
        // Lote com uma linha ruim não entra inteiro.
        let ruim = bytes(SECAO_VIGAS, 2, &[("id_num", v(&[1.0, 3.0])), ("bx", v(&[7.0, 7.0])), ("alinhamento", v(&[0.0, 5.0]))]);
        assert_eq!(s.upsert(SECAO_VIGAS, 2, &ruim), Err(ENTRADA));
        assert_eq!(s.vigas[&1].b, [3.0, 0.0]);
        assert_eq!(s.vigas.len(), 3);
        s.remover(SECAO_VIGAS, &[1, 77]);
        assert_eq!(s.vigas.keys().copied().collect::<Vec<_>>(), vec![2, 9]);
        // Remover numa seção alheia não faz nada.
        s.remover(SECAO_PILARES, &[2]);
        assert_eq!(s.total_linhas(), 2);
        // definir substitui tudo.
        assert_eq!(s.definir(SECAO_VIGAS, 0, &[]), Ok(()));
        assert!(s.vigas.is_empty());
    }

    #[test]
    fn cena_encaminha_as_secoes_da_estrutura() {
        use crate::cena::Cena;
        let mut c = Cena::novo();
        let a = bytes(SECAO_PILARES, 2, &[("id_num", v(&[1.0, 2.0])), ("px", v(&[3.0, 4.0]))]);
        assert_eq!(c.definir_secao(SECAO_PILARES, 2, &a), Ok(()));
        assert_eq!(c.estr.pilares.len(), 2);
        assert_eq!(c.definir_secao(SECAO_PILARES, 2, &a), Ok(()), "reenviar a mesma seção não muda nada");
        let b = bytes(SECAO_PILARES, 1, &[("id_num", v(&[2.0])), ("px", v(&[9.0]))]);
        assert_eq!(c.upsert(SECAO_PILARES, 1, &b), Ok(()));
        assert_eq!(c.estr.pilares[&2].pos, [9.0, 0.0]);
        assert_eq!(c.remover(SECAO_PILARES, &[1]), Ok(()));
        assert_eq!(c.estr.pilares.len(), 1);
        let ruim = bytes(SECAO_PILARES, 2, &[("id_num", v(&[5.0, 5.0]))]);
        assert_eq!(c.definir_secao(SECAO_PILARES, 2, &ruim), Err(ENTRADA), "dado ruim: a cena fica como estava");
        assert_eq!(c.estr.pilares.len(), 1);
        for id in [SECAO_VIGAS, SECAO_FUNDACOES, SECAO_TIPOS_PILAR, SECAO_TIPOS_VIGA, SECAO_TIPOS_FUNDACAO, SECAO_PERFIS_ESTR] {
            assert_eq!(c.definir_secao(id, 0, &[]), Ok(()), "seção {id}");
            assert_eq!(c.upsert(id, 0, &[]), Ok(()), "seção {id}");
            assert_eq!(c.remover(id, &[1]), Ok(()), "seção {id}");
        }
        assert_eq!(c.n_paredes(), 0, "a estrutura não mexe nas paredes");
        assert_eq!(c.definir_secao(207, 0, &[]), Err(ENTRADA), "seção fora do esquema continua recusada");
    }
}
