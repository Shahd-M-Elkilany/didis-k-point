/* ═══════════════════════════════════════════════════════════════════
   Didi's K-point — the research desk
   Looks a drama up on TMDB, pulls the poster, summary, episode count,
   air dates, platform and YouTube trailer, gets the IMDb rating from
   OMDb, and can ask Gemini for a first draft of a write-up.

   Loads after app.js and borrows its globals (DATA, get, markDirty,
   renderReader, renderView, queueImage, toast). Nothing here touches
   app.js itself.

   Keys live in this browser only. They are never written to the repo —
   the repo is public, and a key in a public repo is a key anyone can
   spend. To move to another device, use the setup code instead.
   ═══════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const KEYS_KEY = "kpoint.keys";
const GH_KEY   = "kpoint.gh";
const TMDB = "https://api.themoviedb.org/3";
const IMG  = "https://image.tmdb.org/t/p/w500";
const DEFAULT_MODEL = "gemini-2.0-flash";

let keys = { tmdb:"", omdb:"", gemini:"", model:DEFAULT_MODEL };
try { keys = Object.assign(keys, JSON.parse(localStorage.getItem(KEYS_KEY)||"{}")); } catch(e){}
function saveKeys(){ try { localStorage.setItem(KEYS_KEY, JSON.stringify(keys)); } catch(e){} }

/* Ask the browser to treat this site's storage as persistent, so your
   keys and any waiting pictures don't get evicted when space is tight. */
(async function(){
  try {
    if (navigator.storage && navigator.storage.persist){
      if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    }
  } catch(e){}
})();

const CC = { KR:"KR", CN:"CN", TW:"CN", HK:"CN", JP:"JP" };
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const norm = t => String(t||"").toLowerCase().normalize("NFKD")
  .replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const esc2 = s => String(s==null?"":s).replace(/[&<>"']/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ── styles ─────────────────────────────────────────────────── */
const st = document.createElement("style");
st.textContent = `
.cand{display:grid;grid-template-columns:78px 1fr auto;gap:14px;align-items:start;
  border:2px solid var(--ink);background:var(--paper-2);padding:12px;margin-bottom:12px}
.cand img{width:78px;aspect-ratio:2/3;object-fit:cover;border:2px solid var(--ink);display:block}
.cand .noimg{width:78px;aspect-ratio:2/3;border:2px dashed var(--ink);background:var(--paper-3)}
.cand h4{margin:0 0 4px;font-family:"Oswald",sans-serif;font-size:15px;font-weight:500}
.cand p{margin:0;font-size:13px;color:var(--ink-soft);line-height:1.5;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cand .meta{font-family:"DM Mono",monospace;font-size:11px;color:var(--ink-soft);margin-bottom:5px}
.prog{height:20px;border:2px solid var(--ink);background:var(--paper-2);margin:16px 0 8px}
.prog i{display:block;height:100%;background:var(--pink);width:0;transition:width .2s}
.runlog{font-family:"DM Mono",monospace;font-size:12px;max-height:190px;overflow-y:auto;
  border:1px solid var(--hair);padding:10px;margin-top:12px;line-height:1.7}
.runlog .ok{color:var(--grass)} .runlog .q{color:var(--orange)} .runlog .no{color:var(--pink)}
.draftflag{display:inline-block;font-family:"Oswald",sans-serif;text-transform:uppercase;
  letter-spacing:.14em;font-size:10px;background:var(--orange);color:var(--on-yellow);
  padding:4px 9px;border:2px solid var(--ink);margin-bottom:12px}
.summary{border-left:4px solid var(--ink);padding-left:16px;font-style:italic;
  color:var(--ink-soft);max-width:65ch}
.conn{display:grid;gap:8px;margin:16px 0}
.connrow{display:flex;align-items:center;gap:12px;border:2px solid var(--ink);
  background:var(--paper-2);padding:10px 14px;flex-wrap:wrap}
.connrow .dot{width:12px;height:12px;flex:none;border:2px solid var(--ink)}
.connrow .on{background:var(--grass)} .connrow .off{background:var(--paper-3)}
.connrow b{font-family:"Oswald",sans-serif;font-weight:500;font-size:13px;letter-spacing:.04em}
.connrow span{font-size:13px;color:var(--ink-soft)}
.connrow button{margin-left:auto}
.codebox{width:100%;border:2px solid var(--ink);background:var(--paper-2);padding:10px;
  font-family:"DM Mono",monospace;font-size:11px;min-height:80px;resize:vertical;
  word-break:break-all}
`;
document.head.appendChild(st);

/* ── sheets ─────────────────────────────────────────────────── */
function sheet(id, inner){
  let el = document.getElementById(id);
  if (!el){
    el = document.createElement("div");
    el.className = "sheet"; el.id = id;
    el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true");
    document.body.appendChild(el);
    el.addEventListener("click", e=>{ if (e.target===el) el.classList.remove("on"); });
  }
  el.innerHTML = `<div class="sheet-card">${inner}</div>`;
  el.classList.add("on");
  return el;
}
function close(id){ const e = document.getElementById(id); if (e) e.classList.remove("on"); }

/* ── the setup code: all your keys as one string ────────────── */
function b64enc(str){
  const bytes = new TextEncoder().encode(str);
  let bin = ""; bytes.forEach(b=>bin += String.fromCharCode(b));
  return btoa(bin);
}
function b64dec(b64){
  const bin = atob(b64.replace(/\s+/g,""));
  const bytes = Uint8Array.from(bin, c=>c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function readGh(){ try { return JSON.parse(localStorage.getItem(GH_KEY)||"{}"); } catch(e){ return {}; } }
function makeCode(){
  return b64enc(JSON.stringify({ v:1, keys, gh:readGh() }));
}
function useCode(code){
  const o = JSON.parse(b64dec(code));
  if (!o || o.v!==1) throw new Error("That doesn't look like a K-point setup code.");
  if (o.keys) { keys = Object.assign(keys, o.keys); saveKeys(); }
  if (o.gh && o.gh.token){
    localStorage.setItem(GH_KEY, JSON.stringify(o.gh));
    try { gh = Object.assign(gh||{}, o.gh); updateSaveBar(); } catch(e){}
  }
  return o;
}

/* ── the research desk ──────────────────────────────────────── */
function connected(){
  const g = readGh();
  return [
    ["TMDB", "Posters, summaries, episodes, trailers", !!keys.tmdb, "https://www.themoviedb.org/settings/api"],
    ["OMDb", "IMDb ratings", !!keys.omdb, "https://www.omdbapi.com/apikey.aspx"],
    ["Gemini", "Drafting write-ups", !!keys.gemini, "https://aistudio.google.com/apikey"],
    ["GitHub", g.owner&&g.repo ? "Publishing to "+g.owner+"/"+g.repo : "Publishing your changes", !!g.token, null]
  ];
}
function allSet(){ return connected().every(r=>r[2]); }

function openKeys(edit){
  const rows = connected();
  const el = sheet("keysSheet", `
    <div class="sec-h"><h2>The research desk</h2><div class="rule"></div>
      <button class="x big" data-x type="button" aria-label="Close">×</button></div>
    <p class="fine">${allSet()
      ? "You're set up on this browser. Nothing here needs touching again unless a key expires."
      : "Fill in TMDB and most of this works. The other three are optional."}</p>

    <div class="conn">${rows.map(([n,what,ok,link])=>`
      <div class="connrow">
        <span class="dot ${ok?"on":"off"}"></span>
        <b>${n}</b><span>${ok?"connected":"not set"} · ${esc2(what)}</span>
        ${!ok&&link?`<a class="btn ghost" href="${link}" target="_blank" rel="noopener noreferrer">Get a key →</a>`:""}
      </div>`).join("")}</div>

    <div class="row">
      <button class="btn ${allSet()?"ghost":"solid"}" data-edit type="button">
        ${allSet()?"Change a key":"Enter keys"}</button>
      <button class="btn ghost" data-move type="button">Move to another device</button>
    </div>

    <div id="editArea" class="${edit?"":"hidden"}">
      <div class="fgrid" style="margin-top:20px">
        <label class="field"><span class="label">TMDB key</span>
          <input id="kTmdb" type="password" value="${esc2(keys.tmdb)}" autocomplete="off"></label>
        <label class="field"><span class="label">OMDb key</span>
          <input id="kOmdb" type="password" value="${esc2(keys.omdb)}" autocomplete="off"></label>
        <label class="field"><span class="label">Gemini key</span>
          <input id="kGem" type="password" value="${esc2(keys.gemini)}" autocomplete="off"></label>
        <label class="field"><span class="label">Gemini model</span>
          <input id="kModel" value="${esc2(keys.model||DEFAULT_MODEL)}" autocomplete="off"></label>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn solid" data-save type="button">Save keys</button>
      </div>
      <p class="fine" style="margin-top:10px">If Gemini answers "model not found", the model name has
      moved on — put the current one in and save again.</p>
    </div>

    <div id="moveArea" class="hidden">
      <div class="sec-h" style="margin-top:24px"><h2>Move to another device</h2><div class="rule"></div></div>
      <p class="fine">This code holds every key above, including your GitHub token. Copy it into your
      password manager, then paste it on your phone or another browser and you'll never type a key
      twice. <b>Treat it exactly like a password</b> — anyone who has it can publish to your repo
      and spend on your API accounts.</p>
      <div class="row" style="margin-top:14px">
        <button class="btn solid" data-copy type="button">Copy my setup code</button>
        <button class="btn ghost" data-show type="button">Show it</button>
      </div>
      <textarea class="codebox hidden" id="codeOut" readonly></textarea>
      <div class="sec-h" style="margin-top:24px"><h2>Or paste one in</h2><div class="rule"></div></div>
      <textarea class="codebox" id="codeIn" placeholder="Paste a setup code from your other device"></textarea>
      <div class="row" style="margin-top:12px">
        <button class="btn solid" data-use type="button">Use this code</button>
      </div>
      <p class="fine" id="moveStatus" style="margin-top:10px"></p>
    </div>

    <p class="fine" id="kStatus" style="margin-top:16px"></p>`);

  const q = s => el.querySelector(s);
  q("[data-x]").onclick = ()=>close("keysSheet");
  q("[data-edit]").onclick = ()=>q("#editArea").classList.toggle("hidden");
  q("[data-move]").onclick = ()=>q("#moveArea").classList.toggle("hidden");

  q("[data-save]").onclick = ()=>{
    keys.tmdb = q("#kTmdb").value.trim();
    keys.omdb = q("#kOmdb").value.trim();
    keys.gemini = q("#kGem").value.trim();
    keys.model = q("#kModel").value.trim() || DEFAULT_MODEL;
    saveKeys(); refreshDesk();
    toast("Saved on this browser — you won't be asked again here");
    openKeys(false);
  };
  q("[data-show]").onclick = ()=>{
    const t = q("#codeOut"); t.value = makeCode(); t.classList.remove("hidden"); t.select();
  };
  q("[data-copy]").onclick = async ()=>{
    const code = makeCode();
    try { await navigator.clipboard.writeText(code); q("#moveStatus").textContent = "Copied. Paste it somewhere safe."; }
    catch(e){
      const t = q("#codeOut"); t.value = code; t.classList.remove("hidden"); t.select();
      q("#moveStatus").textContent = "Couldn't reach the clipboard — select the text above and copy it.";
    }
  };
  q("[data-use]").onclick = ()=>{
    const v = q("#codeIn").value.trim();
    if (!v) return;
    try {
      useCode(v);
      refreshDesk();
      q("#moveStatus").textContent = "Done. Every key is set on this browser now.";
      toast("Setup restored");
      setTimeout(()=>openKeys(false), 600);
    } catch(err){ q("#moveStatus").textContent = err.message; }
  };
}
function refreshDesk(){
  const b = document.getElementById("deskBtn");
  if (b) b.textContent = allSet() ? "⚡ Research desk ✓"
       : keys.tmdb ? "⚡ Research desk" : "⚡ Set up research desk";
}

/* ── TMDB ───────────────────────────────────────────────────── */
async function tmdb(path, params){
  if (!keys.tmdb) throw new Error("No TMDB key yet — open the research desk and add one.");
  const u = new URL(TMDB+path);
  u.searchParams.set("api_key", keys.tmdb);
  Object.entries(params||{}).forEach(([k,v])=>u.searchParams.set(k,v));
  const r = await fetch(u);
  if (r.status===401) throw new Error("TMDB rejected that key.");
  if (!r.ok) throw new Error("TMDB said "+r.status);
  return r.json();
}
async function searchCandidates(s){
  const q = s.title.replace(/\s*\d+\s*&\s*\d+\s*$/,"").trim();
  let out = [];
  const tv = await tmdb("/search/tv", {query:q, include_adult:"false"});
  out = (tv.results||[]).map(x=>({
    kind:"tv", id:x.id, title:x.name, original:x.original_name,
    year:(x.first_air_date||"").slice(0,4), overview:x.overview,
    poster:x.poster_path, countries:x.origin_country||[]
  }));
  if (!out.length){
    const mv = await tmdb("/search/movie", {query:q, include_adult:"false"});
    out = (mv.results||[]).map(x=>({
      kind:"movie", id:x.id, title:x.title, original:x.original_title,
      year:(x.release_date||"").slice(0,4), overview:x.overview,
      poster:x.poster_path, countries:[]
    }));
  }
  return out.slice(0,6);
}
/* Confident means: the title matches exactly once and the year lines up.
   Anything less goes to you rather than into your data. */
function judge(s, cands){
  if (!cands.length) return {pick:null, confident:false, why:"nothing found"};
  const want = norm(s.title), wy = s.year;
  const exact = cands.filter(c=>norm(c.title)===want || norm(c.original)===want);
  const yearOk = c => !wy || !c.year || Math.abs(+c.year - wy) <= 1;
  const strong = exact.filter(yearOk);
  if (strong.length===1) return {pick:strong[0], confident:true, why:"title and year match"};
  if (exact.length===1 && !wy) return {pick:exact[0], confident:true, why:"only one title match"};
  if (strong.length>1) return {pick:null, confident:false, why:strong.length+" equally good matches"};
  if (exact.length) return {pick:null, confident:false, why:"title matches but the year doesn't"};
  return {pick:null, confident:false, why:"no exact title match"};
}
async function details(c){
  const d = await tmdb(`/${c.kind}/${c.id}`, {append_to_response:"videos,external_ids"});
  const vids = ((d.videos||{}).results)||[];
  const trailer = vids.find(v=>v.site==="YouTube" && v.type==="Trailer")
               || vids.find(v=>v.site==="YouTube" && v.type==="Teaser")
               || vids.find(v=>v.site==="YouTube");
  return {
    tmdbId: c.id, kind: c.kind,
    summary: (d.overview||"").trim(),
    poster: d.poster_path ? IMG+d.poster_path : null,
    episodes: d.number_of_episodes || null,
    seasons: d.number_of_seasons || null,
    firstAir: d.first_air_date || d.release_date || null,
    lastAir: d.last_air_date || null,
    networks: (d.networks||[]).map(n=>n.name),
    companies: (d.production_companies||[]).map(n=>n.name),
    country: CC[(d.origin_country||[])[0]] || null,
    imdbId: ((d.external_ids||{}).imdb_id) || null,
    trailer: trailer ? "https://www.youtube.com/watch?v="+trailer.key : null,
    trailerName: trailer ? trailer.name : null
  };
}
async function imdbRating(imdbId){
  if (!keys.omdb || !imdbId) return null;
  try {
    const r = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(keys.omdb)}&i=${encodeURIComponent(imdbId)}`);
    if (!r.ok) return null;
    const j = await r.json();
    const v = parseFloat(j.imdbRating);
    return isNaN(v) ? null : v;
  } catch(e){ return null; }
}
async function grabPoster(s, url){
  try {
    const r = await fetch(url, {mode:"cors"});
    if (!r.ok) throw new Error("no");
    const blob = await r.blob();
    const file = new File([blob], "poster.jpg", {type: blob.type || "image/jpeg"});
    return queueImage(s.id, file);            // committed to images/ on your next save
  } catch(e){
    return url;                               // fall back to TMDB's own copy
  }
}

/* ── applying ───────────────────────────────────────────────── */
async function apply(s, d){
  const touched = [];
  s.tmdbId = d.tmdbId;
  if (d.summary && !s.summary){ s.summary = d.summary; touched.push("summary"); }
  if (d.episodes && !s.episodes){ s.episodes = d.episodes; touched.push("episodes"); }
  if (d.seasons && d.seasons>1 && !s.seasons) s.seasons = d.seasons;
  if (d.firstAir && !s.firstAir) s.firstAir = d.firstAir;
  if (d.lastAir && !s.lastAir) s.lastAir = d.lastAir;
  if (d.country && !s.country){ s.country = d.country; touched.push("country"); }
  if (!s.network){
    const n = (d.networks.length ? d.networks : d.companies).slice(0,2).join(", ");
    if (n){ s.network = n; touched.push("platform"); }
  }
  if (d.poster && !s.poster){
    s.poster = await grabPoster(s, d.poster); touched.push("poster");
  }
  if (d.trailer && !(s.videos||[]).length){
    s.videos = [{url:d.trailer, title:d.trailerName || "Trailer"}]; touched.push("trailer");
  }
  if (!s.imdb && d.imdbId){
    const v = await imdbRating(d.imdbId);
    if (v){ s.imdb = v; touched.push("IMDb "+v); }
  }
  markDirty();
  return touched;
}

async function fetchOne(s, interactive){
  const cands = await searchCandidates(s);
  const verdict = judge(s, cands);
  if (verdict.confident){
    const d = await details(verdict.pick);
    const t = await apply(s, d);
    return {status:"filled", fields:t, name:verdict.pick.title};
  }
  if (interactive){ reviewOne(s, cands, verdict.why); return {status:"asking"}; }
  return {status:"queued", why:verdict.why, cands};
}

/* ── the review queue ───────────────────────────────────────── */
let queue = [];
function reviewOne(s, cands, why){
  const el = sheet("pickSheet", `
    <div class="sec-h"><h2>Which one is it?</h2><div class="rule"></div>
      <button class="x big" data-x type="button" aria-label="Close">×</button></div>
    <p class="fine"><b>${esc2(s.title)}</b>${s.year?` · your sheet says ${s.year}`:""} —
      ${esc2(why||"needs a look")}.${queue.length?` ${queue.length} more after this.`:""}</p>
    <div style="margin-top:16px">
      ${cands.length ? cands.map((c,i)=>`
        <div class="cand">
          ${c.poster?`<img src="${IMG+c.poster}" alt="">`:`<div class="noimg"></div>`}
          <div>
            <h4>${esc2(c.title)}</h4>
            <div class="meta">${esc2(c.year||"year unknown")}${c.original&&norm(c.original)!==norm(c.title)?" · "+esc2(c.original):""}${c.countries.length?" · "+esc2(c.countries.join(", ")):""}</div>
            <p>${esc2(c.overview||"No summary on TMDB.")}</p>
          </div>
          <button class="btn solid" data-pick="${i}" type="button">This one</button>
        </div>`).join("")
      : `<p class="noyet">TMDB has nothing under that title. Try renaming the show to its
         English title as TMDB lists it, then fetch again.</p>`}
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" data-skip type="button">Skip this one</button>
      ${queue.length?`<button class="btn ghost" data-stop type="button">Stop reviewing</button>`:""}
    </div>`);

  el.querySelector("[data-x]").onclick = ()=>close("pickSheet");
  el.querySelector("[data-skip]").onclick = ()=>{ close("pickSheet"); nextInQueue(); };
  const stop = el.querySelector("[data-stop]");
  if (stop) stop.onclick = ()=>{ queue = []; close("pickSheet"); toast("Review stopped"); };
  el.querySelectorAll("[data-pick]").forEach(b=>b.onclick = async ()=>{
    b.disabled = true; b.textContent = "Fetching…";
    try {
      const d = await details(cands[+b.dataset.pick]);
      const t = await apply(s, d);
      toast(t.length ? s.title+": "+t.join(", ") : s.title+": nothing missing to fill");
    } catch(err){ toast(String(err.message).slice(0,120)); }
    close("pickSheet");
    if (openId===s.id) renderReader(); else renderView();
    nextInQueue();
  });
}
function nextInQueue(){
  const next = queue.shift();
  if (!next){ renderChrome(); renderView(); return; }
  reviewOne(next.show, next.cands, next.why);
}

/* ── batch ──────────────────────────────────────────────────── */
function missingBits(s){
  return !s.summary || !s.poster || !s.episodes || !(s.videos||[]).length || !s.network || !s.country;
}
function openBatch(){
  if (!keys.tmdb) return openKeys(true);
  const all = DATA.shows;
  const todo = all.filter(missingBits);
  const el = sheet("batchSheet", `
    <div class="sec-h"><h2>Fill in what's missing</h2><div class="rule"></div>
      <button class="x big" data-x type="button" aria-label="Close">×</button></div>
    <p class="fine">${todo.length} of your ${all.length} titles are missing at least one of:
    poster, summary, episode count, platform, country or trailer. I'll look each one up on TMDB
    and fill <b>only the blanks</b> — anything you've already written or scored is left alone.</p>
    <p class="fine" style="margin-top:10px">Where the title and year match exactly, it fills in on its own.
    Where it's ambiguous, it waits and asks you — <i>School 2013</i>, <i>School 2017</i> and
    <i>School 2021</i> are exactly the kind of thing that goes wrong unattended.</p>
    <div class="row" style="margin-top:18px">
      <button class="btn solid" data-go type="button">Look up ${todo.length} titles</button>
      <button class="btn ghost" data-x2 type="button">Not now</button>
    </div>
    <div id="runArea" class="hidden">
      <div class="prog"><i id="progBar"></i></div>
      <p class="label" id="progText">Starting…</p>
      <div class="runlog" id="runLog"></div>
    </div>`);
  el.querySelector("[data-x]").onclick = ()=>close("batchSheet");
  el.querySelector("[data-x2]").onclick = ()=>close("batchSheet");
  el.querySelector("[data-go]").onclick = e=>{ e.target.disabled = true; runBatch(todo, el); };
}
async function runBatch(list, el){
  el.querySelector("#runArea").classList.remove("hidden");
  const bar = el.querySelector("#progBar"), txt = el.querySelector("#progText"),
        log = el.querySelector("#runLog");
  const say = (cls,msg)=>{ log.insertAdjacentHTML("beforeend",
    `<div class="${cls}">${msg}</div>`); log.scrollTop = log.scrollHeight; };

  let filled=0, asked=0, failed=0;
  queue = [];
  for (let i=0;i<list.length;i++){
    const s = list[i];
    bar.style.width = ((i+1)/list.length*100)+"%";
    txt.textContent = `${i+1} of ${list.length} · ${s.title}`;
    try {
      const r = await fetchOne(s, false);
      if (r.status==="filled"){
        filled++;
        say("ok", `✓ ${esc2(s.title)} — ${r.fields.length?esc2(r.fields.join(", ")):"already complete"}`);
      } else {
        asked++; queue.push({show:s, cands:r.cands, why:r.why});
        say("q", `? ${esc2(s.title)} — ${esc2(r.why)}`);
      }
    } catch(err){
      failed++;
      say("no", `✕ ${esc2(s.title)} — ${esc2(String(err.message).slice(0,70))}`);
      if (/key/i.test(err.message)) break;
    }
    await sleep(220);
  }
  txt.textContent = `Done · ${filled} filled in, ${asked} need you, ${failed} failed`;
  renderChrome(); renderView();
  if (queue.length){
    const go = document.createElement("button");
    go.className = "btn solid"; go.type = "button";
    go.textContent = `Review the ${queue.length} I couldn't call →`;
    go.style.marginTop = "14px";
    go.onclick = ()=>{ close("batchSheet"); nextInQueue(); };
    el.querySelector(".sheet-card").appendChild(go);
  }
}

/* ── Gemini: a first draft ──────────────────────────────────── */
async function gemini(prompt){
  if (!keys.gemini) throw new Error("No Gemini key yet — open the research desk and add one.");
  const model = keys.model || DEFAULT_MODEL;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(keys.gemini)}`,
    { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }] }) });
  const j = await r.json().catch(()=>({}));
  if (!r.ok){
    const m = (j.error && j.error.message) || ("Gemini said "+r.status);
    throw new Error(/not found|not supported/i.test(m)
      ? "That Gemini model name isn't available — change it in the research desk."
      : m);
  }
  const t = (((j.candidates||[])[0]||{}).content||{}).parts;
  const out = (t||[]).map(p=>p.text||"").join("").trim();
  if (!out) throw new Error("Gemini returned nothing.");
  return out;
}
const CRIT = ["Plot","Sequence","Characters","Chemistry","Impact on me"];
function draftPrompt(s){
  const marks = Array.isArray(s.scores)
    ? CRIT.map((c,i)=>s.scores[i]!=null?`${c}: ${s.scores[i]}/5`:null).filter(Boolean).join(", ")
    : (s.myRate!=null ? `Overall: ${s.myRate}/5` : "not scored");
  return [
`You are drafting a short entry for a personal drama journal. The writer is a long-time viewer
of Korean and Chinese dramas. This is a FIRST DRAFT that she will rewrite in her own words.`,
``,
`Show: ${s.title}${s.year?` (${s.year})`:""}`,
s.country?`Country: ${s.country==="KR"?"South Korea":s.country==="CN"?"China":s.country}`:"",
s.network?`Platform: ${s.network}`:"",
s.genres?`Genres: ${s.genres}`:"",
s.episodes?`Episodes: ${s.episodes}`:"",
s.summary?`Official synopsis: ${s.summary}`:"",
s.imdb?`IMDb rating: ${s.imdb}/10`:"",
`Her scores: ${marks}`,
s.progress?`Note on her progress: ${s.progress}`:"",
s.comment?`Her note: ${s.comment}`:"",
``,
`Write 150-220 words, in first person, in a warm conversational voice — a person telling a friend
what a show was like, not a review site.`,
``,
`Hard rules:`,
`- Use ONLY the synopsis above for plot. Invent no scenes, characters, twists or endings.`,
`- Her scores are the spine of it. If a score is low, say so plainly; if one score is much higher
  than the others, make that the point of the entry.`,
`- No spoilers beyond the synopsis.`,
`- No rating out of ten, no "overall" verdict line, no headings, no bullet points.`,
`- Do not claim she felt something specific that the scores don't support.`,
`- Plain prose only. Two or three paragraphs, blank line between them.`
].filter(Boolean).join("\n");
}
async function draftFor(s, btn){
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = "Drafting…";
  try {
    const text = await gemini(draftPrompt(s));
    s.review = text;
    s.reviewDraft = true;
    markDirty();
    renderReader();
    toast("Draft written — now make it yours");
  } catch(err){
    toast(String(err.message).slice(0,140));
  } finally { btn.disabled = false; btn.textContent = old; }
}

/* ── hooks into the article ─────────────────────────────────── */
function fmtDate(d){
  if (!d) return "";
  const [y,m] = String(d).split("-");
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return m ? M[+m-1]+" "+y : y;
}
function decorate(){
  const s = get(openId); if (!s) return;
  const bar = document.querySelector("#reader .r-bar-in"); if (!bar) return;
  const anchor = bar.querySelector(".label");

  if (!document.getElementById("fetchOne")){
    const b = document.createElement("button");
    b.className = "btn"; b.id = "fetchOne"; b.type = "button"; b.textContent = "⚡ Fetch details";
    b.onclick = async ()=>{
      if (!keys.tmdb) return openKeys(true);
      b.disabled = true; b.textContent = "Looking…";
      try {
        const r = await fetchOne(s, true);
        if (r.status==="filled"){
          toast(r.fields.length ? s.title+": "+r.fields.join(", ") : "Nothing missing to fill");
          renderReader();
        }
      } catch(err){ toast(String(err.message).slice(0,140)); }
      b.disabled = false; b.textContent = "⚡ Fetch details";
    };
    bar.insertBefore(b, anchor);
  }
  if (keys.gemini && !document.getElementById("draftBtn")){
    const d = document.createElement("button");
    d.className = "btn"; d.id = "draftBtn"; d.type = "button"; d.textContent = "✨ Draft a write-up";
    d.onclick = ()=>{
      if ((s.review||"").trim() && !s.reviewDraft &&
          !confirm("You've already written something here. Replace it with a fresh draft?")) return;
      draftFor(s, d);
    };
    bar.insertBefore(d, anchor);
  }

  const facts = document.querySelector("#reader .r-facts");
  if (facts && !facts.dataset.extra){
    facts.dataset.extra = "1";
    const add = [];
    if (s.episodes) add.push(s.episodes+" episode"+(s.episodes>1?"s":""));
    if (s.seasons && s.seasons>1) add.push(s.seasons+" seasons");
    if (s.firstAir) add.push(fmtDate(s.firstAir)+(s.lastAir&&s.lastAir!==s.firstAir?" – "+fmtDate(s.lastAir):""));
    add.forEach(t=>facts.insertAdjacentHTML("beforeend",`<span class="fact">${esc2(t)}</span>`));
  }

  const heads = [...document.querySelectorAll("#reader .sec-h h2")];
  const writeUp = heads.find(h=>h.textContent.trim()==="The write-up");
  if (s.summary && writeUp && !document.getElementById("summarySec")){
    const sec = document.createElement("section");
    sec.className = "sec"; sec.id = "summarySec";
    sec.innerHTML = `<div class="sec-h"><h2>What it's about</h2><div class="rule"></div></div>
      <p class="summary">${esc2(s.summary)}</p>
      <p class="label" style="margin-top:10px">Synopsis from TMDB</p>`;
    writeUp.closest(".sec").before(sec);
  }

  if (s.reviewDraft && writeUp && !document.getElementById("draftFlag")){
    const f = document.createElement("div");
    f.className = "draftflag"; f.id = "draftFlag";
    f.textContent = "AI draft — not yet in your words";
    writeUp.closest(".sec").querySelector(".prose").before(f);
  }
  const prose = document.querySelector('#reader [data-edit="review"]');
  if (prose && s.reviewDraft && !prose.dataset.draftWatch){
    prose.dataset.draftWatch = "1";
    prose.addEventListener("input", ()=>{
      if (s.reviewDraft){ delete s.reviewDraft; markDirty();
        const f = document.getElementById("draftFlag"); if (f) f.remove(); }
    });
  }
}

/* wrap renderReader so the article picks all this up every time */
const _renderReader = renderReader;
renderReader = function(){ _renderReader.apply(this, arguments); try { decorate(); } catch(e){} };

/* the GitHub panel blanks your token on purpose — say so, so it doesn't
   read as "it forgot" */
if (typeof openGh === "function"){
  const _openGh = openGh;
  openGh = function(){
    _openGh.apply(this, arguments);
    const t = document.getElementById("ghToken");
    if (t){
      const saved = !!(readGh().token);
      t.placeholder = saved ? "Saved — leave blank to keep it" : "github_pat_…";
    }
  };
}

/* masthead buttons */
const actions = document.querySelector(".mast-actions");
if (actions){
  const a = document.createElement("button");
  a.className = "btn"; a.type = "button"; a.textContent = "⚡ Fill in details";
  a.onclick = openBatch;
  const b = document.createElement("button");
  b.className = "btn ghost"; b.id = "deskBtn"; b.type = "button";
  b.onclick = ()=>openKeys(!keys.tmdb);
  actions.appendChild(a); actions.appendChild(b);
  refreshDesk();
}
})();
