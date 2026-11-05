//! Casca desktop do Hestia: abre a janela com o app web já gerado em
//! `apps/web/dist`. A interface web decide quando verificar/instalar atualizações;
//! aqui ficam só os comandos que falam com o `tauri_plugin_updater` e com a pasta
//! de projetos (`biblioteca`, um projeto por pasta).

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

mod biblioteca;

/// Consulta o updater e devolve a versão nova com as notas (`notes` do latest.json).
/// `null` significa que já estamos na versão mais recente.
#[tauri::command]
async fn verificar_atualizacao(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let atualizador = app
        .updater()
        .map_err(|e| format!("atualizador indisponível: {e}"))?;

    let Some(atualizacao) = atualizador
        .check()
        .await
        .map_err(|e| format!("falha ao verificar atualização: {e}"))?
    else {
        return Ok(None);
    };

    Ok(Some(serde_json::json!({
        "versao": atualizacao.version,
        "notas": atualizacao.body,
    })))
}

/// Baixa, confere a assinatura, instala e reinicia. O app web chama isto apenas
/// depois da confirmação do usuário no diálogo "Sobre" ou no aviso de abertura.
#[tauri::command]
async fn instalar_atualizacao(app: AppHandle) -> Result<(), String> {
    let atualizador = app
        .updater()
        .map_err(|e| format!("atualizador indisponível: {e}"))?;

    let Some(atualizacao) = atualizador
        .check()
        .await
        .map_err(|e| format!("falha ao verificar atualização: {e}"))?
    else {
        return Ok(());
    };

    atualizacao
        .download_and_install(|_bytes, _total| {}, || {})
        .await
        .map_err(|e| format!("falha ao baixar ou instalar a atualização: {e}"))?;

    // O plugin de processo expõe reinício por `restart`; no Tauri 2.4 o reinício
    // ordenado é `request_restart` (o mesmo que o comando do plugin usa).
    app.request_restart();
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            verificar_atualizacao,
            instalar_atualizacao,
            biblioteca::biblioteca_escolher_raiz,
            biblioteca::biblioteca_raiz_lembrada,
            biblioteca::biblioteca_esquecer,
            biblioteca::biblioteca_ler_indice,
            biblioteca::biblioteca_listar,
            biblioteca::biblioteca_ler,
            biblioteca::biblioteca_gravar,
            biblioteca::biblioteca_gravar_indice
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Hestia");
}
