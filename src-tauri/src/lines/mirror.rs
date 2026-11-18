//! Mirrors published by the upstream address pages.
//!
//! Publisher scripts are parsed as data; remote JavaScript is never executed.

use dom_query::Document;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use super::jsparse::js_array;

// huangguoai.ai is only a navigation/landing page: every /api/* call there is
// an nginx 404, so it is not an API line and carries no credential trust.
pub const FIXED: [(&str, &str); 1] = [
    ("固定线路 1", "https://huangguoai.com"),
];
pub(crate) const PUBLISH_PAGES: [&str; 2] = [
    "https://huangguoai.pages.dev/",
    "https://huang-guo.pages.dev/",
];
pub(crate) const MIRROR_MAX: usize = 60;
const RECOMMENDED_MAX: usize = 20;
const PAGE_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_PUBLISH_BYTES: usize = 512 * 1024;

/// Only origins actually parsed from a trusted publisher can enter this set.
/// Loading line.json, displaying the current line and probing a host never add trust.
static TRUSTED_MIRRORS: RwLock<Vec<String>> = RwLock::new(Vec::new());

fn remember_published(items: &[Value]) {
    let mut known = TRUSTED_MIRRORS
        .write()
        .unwrap_or_else(|error| error.into_inner());
    for origin in items
        .iter()
        .filter_map(|item| item.get("url").and_then(Value::as_str))
    {
        if !known.iter().any(|value| value == origin) {
            if known.len() >= 256 {
                known.remove(0);
            }
            known.push(origin.to_owned());
        }
    }
}

pub fn is_trusted_mirror(origin: &str) -> bool {
    TRUSTED_MIRRORS
        .read()
        .map(|known| known.iter().any(|value| value == origin))
        .unwrap_or(false)
}

pub fn fixed() -> Value {
    json!(FIXED
        .iter()
        .map(|(name, url)| json!({ "name": name, "url": url }))
        .collect::<Vec<_>>())
}

pub fn is_fixed(url: &str) -> bool {
    FIXED.iter().any(|(_, known)| *known == url)
}

pub(crate) struct PublishedPage {
    pub(crate) source: String,
    pub(crate) script: String,
    pub(crate) items: Vec<Value>,
}

/// Independent concurrent deadlines preserve either publisher's successful list.
pub async fn mirrors() -> Result<Value, String> {
    let (first, second) = tokio::join!(
        mirrors_from_page(PUBLISH_PAGES[0]),
        mirrors_from_page(PUBLISH_PAGES[1])
    );
    let result = merge_publishers([first, second], &crate::net::base())?;
    if let Some(items) = result.get("items").and_then(Value::as_array) {
        remember_published(items);
    }
    Ok(result)
}

pub(crate) fn merge_publishers(
    results: [Result<PublishedPage, String>; 2],
    current: &str,
) -> Result<Value, String> {
    let mut pages = Vec::new();
    let mut errors = Vec::new();
    for (index, result) in results.into_iter().enumerate() {
        match result {
            Ok(page) => pages.push(page),
            Err(error) => errors.push(format!("{}: {error}", PUBLISH_PAGES[index])),
        }
    }
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    // Interleave lists so a full first page cannot hide the second publisher.
    for index in 0..MIRROR_MAX {
        for page in &pages {
            if let Some(item) = page.items.get(index) {
                if let Some(origin) = item.get("url").and_then(Value::as_str) {
                    if items.len() < MIRROR_MAX && seen.insert(origin.to_owned()) {
                        items.push(item.clone());
                    }
                }
            }
        }
    }
    if items.is_empty() {
        return Err(if errors.is_empty() {
            "地址发布页里没有可用的镜像地址".into()
        } else {
            errors.join("；")
        });
    }
    let mut recommended = Vec::new();
    let mut recommended_seen = HashSet::new();
    // The restored/rotated current line is display-only unless actually published.
    if let Some(origin) = crate::net::normalize_base(current) {
        if let Some(host) = url::Url::parse(&origin)
            .ok()
            .and_then(|value| value.host_str().map(str::to_owned))
        {
            recommended_seen.insert(origin.clone());
            recommended.push(json!({ "url": origin, "host": host }));
        }
    }
    for item in &items {
        if recommended.len() >= RECOMMENDED_MAX {
            break;
        }
        if let Some(origin) = item.get("url").and_then(Value::as_str) {
            if recommended_seen.insert(origin.to_owned()) {
                recommended.push(item.clone());
            }
        }
    }
    let sources: Vec<_> = pages.iter().map(|page| page.source.as_str()).collect();
    let scripts: Vec<_> = pages.iter().map(|page| page.script.as_str()).collect();
    Ok(
        json!({ "source": sources.join(", "), "script": scripts.join(", "), "items": items, "recommended_source": sources.join(", "), "recommended": recommended, "errors": errors }),
    )
}

async fn mirrors_from_page(page: &str) -> Result<PublishedPage, String> {
    // One deadline includes DNS, redirects, both bodies and parsing.
    tokio::time::timeout(PAGE_TIMEOUT, async {
        let html = get_text(page).await?;
        let script = script_src(page, &html)?;
        let js = get_text(&script).await?;
        let items = parse_mirrors(&js)?;
        Ok(PublishedPage {
            source: page.to_owned(),
            script,
            items,
        })
    })
    .await
    .map_err(|_| "获取地址发布页超时（8 秒）".to_owned())?
}

pub(crate) fn parse_mirrors(js: &str) -> Result<Vec<Value>, String> {
    let domains = js_array(js, "urls")?.unwrap_or_default();
    let subs = js_array(js, "subdomains")?.unwrap_or_default();
    if domains.is_empty() {
        return Err("发布脚本中没有找到镜像域名".into());
    }
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    'domains: for domain in domains {
        let domain = domain.trim().trim_end_matches('/').to_ascii_lowercase();
        if !valid_dns_name(&domain) {
            continue;
        }
        let hosts: Vec<_> = if subs.is_empty() {
            vec![domain]
        } else {
            subs.iter()
                .filter_map(|sub| {
                    let sub = sub.trim().to_ascii_lowercase();
                    valid_dns_label(&sub).then(|| format!("{sub}.{domain}"))
                })
                .collect()
        };
        for host in hosts {
            if !valid_dns_name(&host) || !seen.insert(host.clone()) {
                continue;
            }
            let Some(origin) = crate::net::normalize_base(&format!("https://{host}")) else {
                continue;
            };
            items.push(json!({ "url": origin, "host": host }));
            if items.len() >= MIRROR_MAX {
                break 'domains;
            }
        }
    }
    if items.is_empty() {
        Err("发布脚本中没有合法镜像地址".into())
    } else {
        Ok(items)
    }
}

fn valid_dns_label(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 63
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value.as_bytes()[value.len() - 1].is_ascii_alphanumeric()
}

fn valid_dns_name(value: &str) -> bool {
    value.len() <= 253
        && value.contains('.')
        && value.split('.').all(valid_dns_label)
        && !["localhost", "local", "internal", "home.arpa", "huangguoai.ai"]
            .iter()
            .any(|suffix| value == *suffix || value.ends_with(&format!(".{suffix}")))
        && url::Url::parse(&format!("https://{value}"))
            .ok()
            .is_some_and(|parsed| matches!(parsed.host(), Some(url::Host::Domain(_))))
}

/// Bounded decoded body; the publisher's outer deadline also covers a slow body.
async fn get_text(raw: &str) -> Result<String, String> {
    let target = url::Url::parse(raw).map_err(|_| "发布地址无效")?;
    let mut response = crate::net::get(
        raw,
        PAGE_TIMEOUT,
        Some("text/html,application/javascript"),
        None,
    )
    .await?;
    // net::get checks DNS and redirects; publisher authority cannot cross origins.
    let final_url = response.url();
    if final_url.scheme() != "https"
        || final_url.origin() != target.origin()
        || (target.path().ends_with("/publish.js") && final_url.path() != target.path())
    {
        return Err("发布页或发布脚本跳转到了非可信地址".into());
    }
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_PUBLISH_BYTES as u64)
    {
        return Err("地址发布页或脚本超过 512 KiB 限制".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| crate::net::err_text(&error))?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_PUBLISH_BYTES {
            return Err("地址发布页或脚本超过 512 KiB 限制".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "地址发布页或脚本不是有效 UTF-8".into())
}

pub(crate) fn script_src(page: &str, html: &str) -> Result<String, String> {
    let document = Document::from(html);
    for script in document.select("script[src]").iter() {
        if let Some(src) = script.attr("src") {
            if let Ok(url) = absolute(page, &src) {
                return Ok(url);
            }
        }
    }
    Err("地址发布页没有同源 publish.js 脚本".into())
}

pub(crate) fn absolute(base: &str, relative: &str) -> Result<String, String> {
    if relative.chars().any(char::is_control) {
        return Err("发布脚本地址含控制字符".into());
    }
    let base = url::Url::parse(base).map_err(|_| "发布页地址无效")?;
    let target = base.join(relative.trim()).map_err(|_| "发布脚本地址无效")?;
    if base.scheme() != "https"
        || target.scheme() != "https"
        || target.origin() != base.origin()
        || !target.username().is_empty()
        || target.password().is_some()
        || target.fragment().is_some()
        || target.path().rsplit('/').next() != Some("publish.js")
    {
        return Err("只接受发布页同源的 HTTPS publish.js".into());
    }
    Ok(target.to_string())
}

/// Persisted lines gain credential trust only after a publisher confirms them.
/// Anonymous probes must not call this function.
pub async fn verify_published_origin(origin: &str) -> Result<(), String> {
    let origin = crate::net::normalize_base(origin).ok_or("线路必须是安全 HTTPS origin")?;
    if is_fixed(&origin) || is_trusted_mirror(&origin) {
        return Ok(());
    }
    // Concurrent startup requests share a refresh and briefly cache misses.
    type Refresh = Option<(Instant, Result<(), String>)>;
    static REFRESH: std::sync::OnceLock<tokio::sync::Mutex<Refresh>> = std::sync::OnceLock::new();
    tokio::time::timeout(PAGE_TIMEOUT + Duration::from_secs(1), async {
        let mut refresh = REFRESH
            .get_or_init(|| tokio::sync::Mutex::new(None))
            .lock()
            .await;
        if is_trusted_mirror(&origin) {
            return Ok(());
        }
        if let Some((_, result)) = refresh
            .as_ref()
            .filter(|(at, _)| at.elapsed() < Duration::from_secs(30))
        {
            result.clone()?;
        } else {
            let result = mirrors().await.map(|_| ());
            *refresh = Some((Instant::now(), result.clone()));
            result?;
        }
        if is_trusted_mirror(&origin) {
            Ok(())
        } else {
            Err("当前镜像未被可信地址发布页收录；请重新选择线路后登录".into())
        }
    })
    .await
    .map_err(|_| "验证镜像发布来源超时".to_owned())?
}
