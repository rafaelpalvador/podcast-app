use serde::Serialize;
use std::{collections::BTreeMap, fs, path::PathBuf};
use tauri::Manager;

mod feed;
mod thumb;

// ---------- HTTP sem limites de CORS (feeds RSS, busca, GitHub) ----------
#[derive(Serialize)]
struct HttpOut {
    status: u16,
    body: String,
    headers: BTreeMap<String, String>,
}

/// Um cliente só para o app inteiro: reaproveita conexões e sessões TLS
/// (antes cada pedido abria uma conexão nova, com handshake completo).
pub(crate) fn net() -> &'static reqwest::Client {
    static C: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(12))
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .pool_max_idle_per_host(6)
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .user_agent("PodcastApp/0.1 (app pessoal; +https://github.com/rafaelpalvador/podcast-app)")
            .build()
            .expect("cliente HTTP")
    })
}

#[tauri::command]
async fn http_req(
    method: String,
    url: String,
    headers: BTreeMap<String, String>,
    body: Option<String>,
) -> Result<HttpOut, String> {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD;
    let m = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut rq = net().request(m, &url).timeout(std::time::Duration::from_secs(60));
    for (k, v) in headers.iter() {
        rq = rq.header(k.as_str(), v.as_str());
    }
    if let Some(b) = body {
        rq = rq.body(b64.decode(b).map_err(|e| e.to_string())?);
    }
    let rs = rq.send().await.map_err(|e| e.to_string())?;
    let status = rs.status().as_u16();
    let mut hs = BTreeMap::new();
    for (k, v) in rs.headers().iter() {
        if let Ok(s) = v.to_str() {
            hs.insert(k.as_str().to_string(), s.to_string());
        }
    }
    let bytes = rs.bytes().await.map_err(|e| e.to_string())?;
    Ok(HttpOut { status, body: b64.encode(&bytes), headers: hs })
}

// ---------- Downloads de episódios ----------
fn dl_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("episodios");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn safe_name(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.').collect()
}

#[tauri::command]
async fn download_episode(app: tauri::AppHandle, url: String, name: String) -> Result<String, String> {
    use std::io::Write;
    let dir = dl_dir(&app)?;
    let path = dir.join(safe_name(&name));
    let mut rs = net()
        .get(&url)
        .timeout(std::time::Duration::from_secs(1800))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !rs.status().is_success() {
        return Err(format!("erro {}", rs.status().as_u16()));
    }
    // grava em partes: não segura o episódio inteiro (100+ MB) na memória
    let tmp = path.with_extension("part");
    let mut f = std::io::BufWriter::with_capacity(256 * 1024, fs::File::create(&tmp).map_err(|e| e.to_string())?);
    while let Some(chunk) = rs.chunk().await.map_err(|e| e.to_string())? {
        f.write_all(&chunk).map_err(|e| e.to_string())?;
    }
    f.flush().map_err(|e| e.to_string())?;
    drop(f);
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// ---------- Feeds ----------
#[derive(Serialize)]
struct FeedOut {
    status: u16,
    etag: Option<String>,
    modified: Option<String>,
    feed: Option<feed::Feed>,
}

/// Baixa e lê um feed fora da interface. Com etag/modified, um feed sem mudanças volta como 304.
#[tauri::command]
async fn fetch_feed(url: String, etag: Option<String>, modified: Option<String>, max: Option<usize>) -> Result<FeedOut, String> {
    let mut rq = net()
        .get(&url)
        .timeout(std::time::Duration::from_secs(45))
        .header("Accept", "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5");
    if let Some(e) = etag.as_deref().filter(|s| !s.is_empty()) {
        rq = rq.header("If-None-Match", e);
    }
    if let Some(m) = modified.as_deref().filter(|s| !s.is_empty()) {
        rq = rq.header("If-Modified-Since", m);
    }
    let rs = rq.send().await.map_err(|e| e.to_string())?;
    let status = rs.status().as_u16();
    if status == 304 {
        return Ok(FeedOut { status, etag, modified, feed: None });
    }
    if !rs.status().is_success() {
        return Err(format!("erro {}", status));
    }
    let hv = |k: &str| rs.headers().get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let (et, lm) = (hv("etag"), hv("last-modified"));
    let bytes = rs.bytes().await.map_err(|e| e.to_string())?;
    let max = max.unwrap_or(200);
    let f = tauri::async_runtime::spawn_blocking(move || feed::parse(&bytes, max))
        .await
        .map_err(|e| e.to_string())??;
    Ok(FeedOut { status, etag: et, modified: lm, feed: Some(f) })
}

#[tauri::command]
fn delete_download(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let p = dl_dir(&app)?.join(safe_name(&name));
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn download_path(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    let p = dl_dir(&app)?.join(safe_name(&name));
    Ok(if p.exists() { Some(p.to_string_lossy().to_string()) } else { None })
}

#[tauri::command]
fn downloads_size(app: tauri::AppHandle) -> Result<u64, String> {
    let mut total = 0u64;
    if let Ok(rd) = fs::read_dir(dl_dir(&app)?) {
        for e in rd.flatten() {
            if let Ok(m) = e.metadata() {
                total += m.len();
            }
        }
    }
    Ok(total)
}

// ---------- Salvar arquivo de texto (OPML, momentos em Markdown) ----------
#[tauri::command]
fn save_text(app: tauri::AppHandle, name: String, text: String) -> Result<String, String> {
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(safe_name(&name));
    fs::write(&p, text).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

// ---------- Armazenamento dos dados do app (arquivo, sem o limite do localStorage) ----------
fn store_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.join(safe_name(name)))
}

#[tauri::command]
fn store_write(app: tauri::AppHandle, name: String, text: String) -> Result<(), String> {
    let p = store_path(&app, &name)?;
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn store_read(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    let p = store_path(&app, &name)?;
    if !p.exists() { return Ok(None); }
    fs::read_to_string(p).map(Some).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol("thumb", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let uri = request.uri().to_string();
            tauri::async_runtime::spawn(async move {
                responder.respond(thumb::handle(app, uri).await);
            });
        })
        .invoke_handler(tauri::generate_handler![
            http_req,
            fetch_feed,
            download_episode,
            delete_download,
            download_path,
            downloads_size,
            save_text,
            store_write,
            store_read
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o app");
}
