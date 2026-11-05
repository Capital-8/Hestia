//! Biblioteca de projetos em pasta (um projeto por pasta).
//!
//! A interface web escolhe a pasta uma vez e depois só pede listar/ler/gravar; quem fala com o disco é este módulo.
//! Nada de plugin `fs` com escopo amplo: cada comando recebe a pasta RAIZ que o usuário escolheu e só mexe dentro dela
//! (o nome da pasta do projeto é validado como um único segmento, sem `..` nem separadores).

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const ARQUIVO_PROJETO: &str = "projeto.hestia.json";
const ARQUIVO_BACKUP: &str = "projeto.hestia.json.bak";
const ARQUIVO_INDICE: &str = "biblioteca.json";
const ARQUIVO_RAIZ: &str = "biblioteca-raiz.txt";

/// Projeto encontrado ao varrer a pasta raiz. `modificadoEm` em milissegundos (a web converte para ISO).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjetoNaLista {
    pasta: String,
    modificado_em: u64,
}

/// Resultado de gravar um documento.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjetoGravado {
    pasta: String,
    nome: String,
    modificado_em: u64,
    bytes: u64,
    pasta_nova: bool,
}

fn ms(instante: SystemTime) -> u64 {
    instante
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn exigir_pasta(caminho: &Path) -> Result<(), String> {
    if caminho.is_dir() {
        Ok(())
    } else {
        Err(format!(
            "a pasta de projetos não existe: {}",
            caminho.display()
        ))
    }
}

/// Nome da pasta do projeto como um segmento simples (a raiz já é confiável; isto impede sair dela).
fn pasta_segura(pasta: &str) -> Result<&str, String> {
    let ok = !pasta.is_empty()
        && pasta != "."
        && pasta != ".."
        && !pasta.contains('/')
        && !pasta.contains('\\')
        && !pasta.contains(':');
    if ok {
        Ok(pasta)
    } else {
        Err(format!("nome de pasta inválido: {pasta}"))
    }
}

fn arquivo_da_raiz(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("sem a pasta de configuração do app: {e}"))?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("não foi possível criar {}: {e}", dir.display()))?;
    Ok(dir.join(ARQUIVO_RAIZ))
}

fn raiz_guardada(app: &AppHandle) -> Option<PathBuf> {
    let arquivo = arquivo_da_raiz(app).ok()?;
    let texto = fs::read_to_string(arquivo).ok()?;
    let caminho = PathBuf::from(texto.trim());
    // Pasta apagada/movida desde a última vez: a tela inicial pede de novo em vez de abrir um erro.
    caminho.is_dir().then_some(caminho)
}

/// Escolhe a pasta raiz dos projetos (seletor do sistema) e lembra a escolha.
#[tauri::command]
pub async fn biblioteca_escolher_raiz(app: AppHandle) -> Result<Option<String>, String> {
    let app_dialogo = app.clone();
    let escolhida =
        tauri::async_runtime::spawn_blocking(move || app_dialogo.dialog().file().blocking_pick_folder())
            .await
            .map_err(|e| format!("seletor de pastas falhou: {e}"))?;
    let Some(arquivo) = escolhida else {
        return Ok(None);
    };
    let caminho = arquivo
        .into_path()
        .map_err(|e| format!("caminho inválido: {e}"))?;
    if !caminho.is_dir() {
        return Err("a escolha não é uma pasta".into());
    }
    gravar_raiz(&app, &caminho)?;
    Ok(Some(caminho.to_string_lossy().to_string()))
}

fn gravar_raiz(app: &AppHandle, caminho: &Path) -> Result<(), String> {
    let arquivo = arquivo_da_raiz(app)?;
    fs::write(&arquivo, caminho.to_string_lossy().as_bytes())
        .map_err(|e| format!("não foi possível lembrar a pasta: {e}"))
}

/// Pasta raiz lembrada, se ela ainda existir.
#[tauri::command]
pub fn biblioteca_raiz_lembrada(app: AppHandle) -> Option<String> {
    raiz_guardada(&app).map(|p| p.to_string_lossy().to_string())
}

/// Esquece a pasta escolhida (os arquivos continuam no disco).
#[tauri::command]
pub fn biblioteca_esquecer(app: AppHandle) -> Result<(), String> {
    let arquivo = arquivo_da_raiz(&app)?;
    match fs::remove_file(&arquivo) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("não foi possível esquecer a pasta: {e}")),
    }
}

/// Conteúdo de `biblioteca.json` (índice/cache da tela inicial), ou `None` quando ainda não existe.
#[tauri::command]
pub fn biblioteca_ler_indice(raiz: String) -> Result<Option<String>, String> {
    let dir = PathBuf::from(&raiz);
    exigir_pasta(&dir)?;
    match fs::read_to_string(dir.join(ARQUIVO_INDICE)) {
        Ok(texto) => Ok(Some(texto)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("não foi possível ler o índice: {e}")),
    }
}

/// Pastas de projeto na raiz (as que têm `projeto.hestia.json`), com a data do documento.
#[tauri::command]
pub fn biblioteca_listar(raiz: String) -> Result<Vec<ProjetoNaLista>, String> {
    let dir = PathBuf::from(&raiz);
    exigir_pasta(&dir)?;
    let entradas = fs::read_dir(&dir)
        .map_err(|e| format!("não foi possível listar {}: {e}", dir.display()))?;
    let mut out = Vec::new();
    for entrada in entradas.flatten() {
        let caminho = entrada.path();
        if !caminho.is_dir() {
            continue;
        }
        let documento = caminho.join(ARQUIVO_PROJETO);
        let Ok(meta) = fs::metadata(&documento) else {
            continue;
        };
        let pasta = entrada.file_name().to_string_lossy().to_string();
        out.push(ProjetoNaLista {
            pasta,
            modificado_em: meta.modified().map(ms).unwrap_or(0),
        });
    }
    Ok(out)
}

/// Documento de um projeto.
#[tauri::command]
pub fn biblioteca_ler(raiz: String, pasta: String) -> Result<Option<String>, String> {
    let dir = PathBuf::from(&raiz).join(pasta_segura(&pasta)?);
    match fs::read_to_string(dir.join(ARQUIVO_PROJETO)) {
        Ok(texto) => Ok(Some(texto)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("não foi possível ler o projeto: {e}")),
    }
}

/// Grava o documento: a versão anterior vira `.bak` e a nova entra por arquivo temporário + renomeação.
#[tauri::command]
pub fn biblioteca_gravar(
    raiz: String,
    pasta: String,
    nome: String,
    conteudo: String,
) -> Result<ProjetoGravado, String> {
    let base = PathBuf::from(&raiz);
    exigir_pasta(&base)?;
    let pasta = pasta_segura(&pasta)?.to_string();
    let destino = base.join(&pasta);
    let pasta_nova = !destino.is_dir();
    fs::create_dir_all(&destino)
        .map_err(|e| format!("não foi possível criar a pasta do projeto: {e}"))?;

    let arquivo = destino.join(ARQUIVO_PROJETO);
    // Backup: a gravação anterior vira `.bak` antes da nova entrar.
    if arquivo.exists() {
        fs::copy(&arquivo, destino.join(ARQUIVO_BACKUP))
            .map_err(|e| format!("não foi possível guardar a versão anterior: {e}"))?;
    }
    let temporario = destino.join(format!("{ARQUIVO_PROJETO}.tmp"));
    fs::write(&temporario, conteudo.as_bytes())
        .map_err(|e| format!("não foi possível gravar: {e}"))?;
    // O `rename` do Windows não sobrescreve: apaga o destino antes (o `.bak` acima cobre o intervalo).
    if arquivo.exists() {
        fs::remove_file(&arquivo).map_err(|e| format!("não foi possível trocar o arquivo: {e}"))?;
    }
    fs::rename(&temporario, &arquivo)
        .map_err(|e| format!("não foi possível concluir a gravação: {e}"))?;

    let meta =
        fs::metadata(&arquivo).map_err(|e| format!("projeto gravado, mas sem leitura: {e}"))?;
    Ok(ProjetoGravado {
        pasta,
        nome,
        modificado_em: meta
            .modified()
            .map(ms)
            .unwrap_or_else(|_| ms(SystemTime::now())),
        bytes: meta.len(),
        pasta_nova,
    })
}

/// Grava o índice da tela inicial.
#[tauri::command]
pub fn biblioteca_gravar_indice(raiz: String, texto: String) -> Result<(), String> {
    let dir = PathBuf::from(&raiz);
    exigir_pasta(&dir)?;
    fs::write(dir.join(ARQUIVO_INDICE), texto.as_bytes())
        .map_err(|e| format!("não foi possível gravar o índice: {e}"))
}
