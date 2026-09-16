/* ═══════════════════════════════════════════════════════════════════
   Didi's K-point — the OST shelf
   Paste a Spotify or YouTube playlist link into a drama and it plays
   inside the article. No keys, no accounts: both services allow this.

   Loads after app.js (and after enrich.js if you have it). Borrows
   app.js's globals; changes nothing in it.
   ═══════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const esc3 = s => String(s==null?"":s).replace(/[&<>"']/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const style = document.createElement("style");
style.textContent = `
.plists{display:grid;gap:18px}
.plist{position:relative}
.plist iframe{display:block;width:100%;border:2px solid var(--ink);
  box-shadow:4px 4px 0 var(--ink);background:var(--paper-2)}
.plist .rm{position:absolute;top:-11px;right:-11px;z-index:3;display:none;
  background:var(--ink);color:var(--paper);border:2px solid var(--paper);
  width:28px;height:28px;cursor:pointer;line-height:1;font-size:15px}
body.editing .plist .rm{display:block}
.plist .cap{font-family:"DM Mono",monospace;font-size:11px;color:var(--ink-soft);margin-top:8px}
.addplay{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.addplay input{flex:1 1 260px;min-width:0;border:2px solid var(--ink);
  background:var(--paper-2);padding:8px 10px}
`;
document.head.appendChild(style);

/* ── what did she paste? ────────────────────────────────────── */
function readLink(raw){
  let url = String(raw||"").trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://"+url;

  // Spotify — playlist, album, track, artist, podcast
  let m = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/i);
  if (m){
    const type = m[1].toLowerCase(), id = m[2];
    const short = (type==="track" || type==="episode");
    return { url, kind:"spotify", type,
      embed:`https://open.spotify.com/embed/${type}/${id}`,
      height: short ? 152 : 420,
      label:"Spotify "+type };
  }

  // Apple Music
  if (/(^|\.)music\.apple\.com\//i.test(url)){
    return { url, kind:"apple",
      embed: url.replace(/(^https?:\/\/)(?:[a-z0-9-]+\.)?music\.apple\.com/i, "$1embed.music.apple.com"),
      height: 450, label:"Apple Music" };
  }

  // YouTube playlist
  m = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (m && /youtu\.?be/i.test(url)){
    return { url, kind:"youtube", ratio:true,
      embed:`https://www.youtube-nocookie.com/embed/videoseries?list=${m[1]}`,
      label:"YouTube playlist" };
  }
  // single YouTube video
  m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (m && /youtu\.?be/i.test(url)){
    return { url, kind:"youtube", ratio:true,
      embed:`https://www.youtube-nocookie.com/embed/${m[1]}`,
      label:"YouTube video" };
  }

  return { url, kind:"link", label: hostName(url) };
}
function hostName(u){ try { return new URL(u).hostname.replace(/^www\./,""); } catch(e){ return "the web"; } }

/* ── the section ────────────────────────────────────────────── */
function render(s){
  const list = s.playlists || [];
  const items = list.map((p,i)=>{
    const r = readLink(p.url);
    let body;
    if (!r || r.kind==="link"){
      body = `<a class="vlink" href="${esc3(p.url)}" target="_blank" rel="noopener noreferrer">
        <span class="play">♪</span><span><b>${esc3(p.title||"Listen")}</b>
        <span>${esc3(p.url)}</span></span></a>`;
    } else if (r.ratio){
      body = `<div style="position:relative;aspect-ratio:16/9">
        <iframe style="position:absolute;inset:0;height:100%" src="${esc3(r.embed)}"
          title="${esc3(p.title||r.label)}" loading="lazy" allowfullscreen
          allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"></iframe></div>`;
    } else {
      body = `<iframe height="${r.height}" style="height:${r.height}px" src="${esc3(r.embed)}"
        title="${esc3(p.title||r.label)}" loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
    }
    return `<div class="plist">
      ${body}
      <button class="rm" type="button" data-rmplay="${i}" aria-label="Remove this playlist"
        title="Remove this">×</button>
      ${p.title||r?`<div class="cap">${esc3(p.title || (r?r.label:""))}</div>`:""}
    </div>`;
  }).join("");

  return `<div class="sec-h"><h2>The OST</h2><div class="rule"></div></div>
    ${list.length ? `<div class="plists">${items}</div>`
      : `<p class="noyet ostempty">No music saved for this one yet.</p>`}
    <div class="addplay editonly">
      <input id="playUrl" placeholder="Paste a Spotify or YouTube playlist link">
      <button class="btn" id="playAdd" type="button">Add</button>
    </div>
    <p class="label editonly" style="margin-top:10px">Spotify playlists, albums and single tracks all
    work, so do YouTube playlists. Anything else becomes a link.</p>`;
}

function mount(){
  const s = (typeof get === "function") ? get(openId) : null;
  if (!s) return;
  const reader = document.getElementById("reader");
  if (!reader || !reader.classList.contains("on")) return;
  if (document.getElementById("ostSec")) return;

  const sec = document.createElement("section");
  sec.className = "sec"; sec.id = "ostSec";
  sec.innerHTML = render(s);

  // sit it just after Watch, or after the write-up, or at the end
  const heads = [...reader.querySelectorAll(".sec-h h2")];
  const watch = heads.find(h=>h.textContent.trim()==="Watch");
  const write = heads.find(h=>h.textContent.trim()==="The write-up");
  const anchor = (watch || write);
  if (anchor) anchor.closest(".sec").after(sec);
  else (document.getElementById("artBody")||reader).appendChild(sec);

  // hide the empty-state line from readers — it's only useful to you
  const empty = sec.querySelector(".ostempty");
  if (empty) empty.classList.add("editonly");

  const add = ()=>{
    const box = sec.querySelector("#playUrl");
    const v = (box.value||"").trim();
    if (!v) return;
    const r = readLink(v);
    s.playlists = (s.playlists||[]).concat([{ url:r.url, title:r.label }]);
    markDirty();
    renderReader();
    toast(r.kind==="link"
      ? "Added as a link — that one can't be embedded"
      : r.label+" added");
  };
  sec.querySelector("#playAdd").onclick = add;
  sec.querySelector("#playUrl").addEventListener("keydown", e=>{
    if (e.key==="Enter"){ e.preventDefault(); add(); }
  });
  sec.querySelectorAll("[data-rmplay]").forEach(b=>b.onclick = ()=>{
    s.playlists.splice(+b.dataset.rmplay, 1);
    if (!s.playlists.length) delete s.playlists;
    markDirty(); renderReader();
    toast("Removed — hit Save to publish that");
  });
}

/* chain onto whatever renderReader currently is */
const prev = renderReader;
renderReader = function(){ prev.apply(this, arguments); try { mount(); } catch(e){} };
})();
