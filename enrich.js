/* ═══════════════════════════════════════════════════════════════════
   Didi's K-point — the research desk
   TMDB for posters, summaries, episodes, air dates, platform, country,
   trailers and now cast and crew. OMDb for the IMDb rating. Gemini for
   a first draft of a write-up. Builds The people and Suggestions.

   Loads after app.js and borrows its globals. Nothing here edits it.
   Keys live in this browser only — never in the repo.
   ═══════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const KEYS_KEY = "kpoint.keys";
const GH_KEY   = "kpoint.gh";
const TMDB = "https://api.themoviedb.org/3";
const IMG  = "https://image.tmdb.org/t/p/w500";
const FACE = "https://image.tmdb.org/t/p/w185";
const DEFAULT_MODEL = "gemini-2.0-flash";
const CREW_JOBS = ["Director","Writer","Screenplay","Novel","Story",
                   "Executive Producer","Producer","Original Music Composer"];

let keys = { tmdb:"", omdb:"", gemini:"", model:DEFAULT_MODEL };
try { keys = Object.assign(keys, JSON.parse(localStorage.getItem(KEYS_KEY)||"{}")); } catch(e){}
function saveKeys(){ try { localStorage.setItem(KEYS_KEY, JSON.stringify(keys)); } catch(e){} }

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
const E = s => String(s==null?"":s).replace(/[&<>"']/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ── styles ─────────────────────────────────────────────────── */
const st = document.createElement("style");
st.textContent = `
.cand{display:grid;grid-template-columns:78px 1fr auto;gap:14px;align-items:start;
  border:1px solid var(--gold-d);background:var(--paper-2);padding:12px;margin-bottom:12px}
.cand img{width:78px;aspect-ratio:2/3;object-fit:cover;border:1px solid var(--gold-d);display:block}
.cand .noimg{width:78px;aspect-ratio:2/3;border:1px dashed var(--gold-d);background:var(--paper-3)}
.cand h4{margin:0 0 4px;font-family:"Cinzel",serif;font-weight:500;font-size:15px;letter-spacing:.04em}
.cand p{margin:0;font-size:15px;color:var(--ink-soft);line-height:1.5;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cand .meta{font-family:"DM Mono",monospace;font-size:11px;color:var(--ink-soft);margin-bottom:5px}
.prog{height:16px;border:1px solid var(--gold-d);background:var(--paper-3);margin:16px 0 8px}
.prog i{display:block;height:100%;background:var(--pink);width:0;transition:width .2s}
.runlog{font-family:"DM Mono",monospace;font-size:12px;max-height:190px;overflow-y:auto;
  border:1px solid var(--hair);padding:10px;margin-top:12px;line-height:1.7}
.runlog .ok{color:var(--grass)} .runlog .q{color:var(--orange)} .runlog .no{color:var(--pink)}
.draftflag{display:inline-block;font-family:"Jost",sans-serif;text-transform:uppercase;
  letter-spacing:.2em;font-size:9px;background:var(--orange);color:#fff;border-radius:40px;
  padding:5px 12px;margin-bottom:12px}
.summary{border-left:2px solid var(--gold);padding-left:16px;font-style:italic;
  color:var(--ink-soft);max-width:62ch}
.conn{display:grid;gap:8px;margin:16px 0}
.connrow{display:flex;align-items:center;gap:12px;border:1px solid var(--gold-d);
  background:var(--paper-2);padding:10px 14px;flex-wrap:wrap}
.connrow .dot{width:11px;height:11px;flex:none;border-radius:50%;border:1px solid var(--gold-d)}
.connrow .on{background:var(--grass)} .connrow .off{background:var(--paper-3)}
.connrow b{font-family:"Cinzel",serif;font-weight:500;font-size:13px;letter-spacing:.05em}
.connrow span{font-size:15px;color:var(--ink-soft)}
.connrow .btn{margin-left:auto}
.codebox{width:100%;border:1px solid var(--gold-d);background:var(--paper-2);padding:10px;
  font-family:"DM Mono",monospace;font-size:11px;min-height:80px;resize:vertical;
  word-break:break-all}

/* ── cast on an article ─────────────────────────────────────── */
.castrow{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(104px,1fr))}
.castone{text-align:center}
.castone .face{width:100%;aspect-ratio:1/1;border-radius:50%;object-fit:cover;display:block;
  border:1px solid var(--gold);background:var(--paper-3)}
.castone .init{width:100%;aspect-ratio:1/1;border-radius:50%;display:grid;place-items:center;
  border:1px solid var(--gold);background:var(--oxblood);color:var(--gold-l);
  font-family:"Cinzel",serif;font-weight:600;font-size:20px}
.castone b{display:block;margin-top:9px;font-family:"Cinzel",serif;font-weight:500;
  font-size:12.5px;letter-spacing:.03em;line-height:1.25}
.castone span{display:block;font-family:"DM Mono",monospace;font-size:10px;
  color:var(--ink-soft);margin-top:3px}
.crewline{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.crewline .cw{font-family:"DM Mono",monospace;font-size:11px;padding:5px 12px;border-radius:40px;
  border:1px solid var(--gold-d);color:var(--ink-soft)}
.crewline .cw b{color:var(--ink);font-weight:500}

/* ── the people page ────────────────────────────────────────── */
.peoplebar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:20px 0 6px}
.peoplebar input{flex:1 1 220px;min-width:0;border:1px solid var(--gold-d);
  background:var(--sheet);padding:10px 16px;border-radius:40px;
  font-family:"Jost",sans-serif;font-size:14px}
.pgrid{display:grid;gap:18px 14px;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));
  margin-top:22px}
.pcard{cursor:pointer;text-align:center;background:none;border:0;padding:0;font:inherit}
.pcard .face,.pcard .init{width:100%;aspect-ratio:1/1;border-radius:50%;object-fit:cover;
  display:block;border:1px solid var(--gold);transition:transform .16s,box-shadow .16s}
.pcard .init{display:grid;place-items:center;background:var(--oxblood);color:var(--gold-l);
  font-family:"Cinzel",serif;font-weight:600;font-size:26px}
.pcard:hover .face,.pcard:hover .init{transform:translateY(-3px);
  box-shadow:0 10px 22px #3a102047,0 0 0 2px var(--gold)}
.pcard[aria-expanded="true"] .face,.pcard[aria-expanded="true"] .init{box-shadow:0 0 0 3px var(--gold)}
.pcard b{display:block;margin-top:10px;font-family:"Cinzel",serif;font-weight:500;
  font-size:13px;letter-spacing:.03em;line-height:1.25;color:var(--oxblood)}
.pcard span{display:block;font-family:"DM Mono",monospace;font-size:10px;
  color:var(--ink-soft);margin-top:4px}
.pdetail{grid-column:1/-1;border:1px solid var(--gold);background:var(--sheet);
  padding:20px;box-shadow:0 0 0 4px var(--oxblood)}
.pdetail h3{font-family:"Cinzel",serif;font-weight:600;font-size:20px;letter-spacing:.05em;
  color:var(--oxblood)}
.pdetail .sub{font-family:"DM Mono",monospace;font-size:11px;color:var(--ink-soft);margin-top:5px}
.ptitles{display:flex;flex-wrap:wrap;gap:9px;margin-top:16px}
.ptitle{display:flex;align-items:center;gap:10px;border:1px solid var(--gold-d);
  background:var(--paper-2);padding:9px 14px;border-radius:40px;cursor:pointer;
  font-family:"Jost",sans-serif;font-size:12.5px}
.ptitle:hover{border-color:var(--gold);background:var(--paper-3)}
.ptitle em{font-style:normal;font-family:"DM Mono",monospace;font-size:10.5px;
  color:var(--ink-soft)}

/* ── suggestions ────────────────────────────────────────────── */
.sugg{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));
  margin-top:20px}
.sug{display:grid;grid-template-columns:86px 1fr;gap:14px;border:1px solid var(--gold-d);
  background:var(--sheet);padding:13px}
.sug.have{opacity:.62}
.sug img{width:86px;aspect-ratio:2/3;object-fit:cover;border:1px solid var(--gold-d);display:block}
.sug .noimg{width:86px;aspect-ratio:2/3;border:1px dashed var(--gold-d);background:var(--paper-3)}
.sug h4{font-family:"Cinzel",serif;font-weight:500;font-size:14.5px;letter-spacing:.04em;
  line-height:1.25;color:var(--oxblood)}
.sug .m{font-family:"DM Mono",monospace;font-size:10.5px;color:var(--ink-soft);margin:5px 0 7px}
.sug p{margin:0;font-size:14.5px;line-height:1.5;color:var(--ink-soft);
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.sug .acts{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.sug .mini{font-family:"Jost",sans-serif;text-transform:uppercase;letter-spacing:.14em;
  font-size:9px;padding:6px 11px;border-radius:40px;border:1px solid var(--gold-d);
  background:transparent;color:#6A4A18;cursor:pointer}
.sug .mini:hover{border-color:var(--gold);background:#c9963f1f}
.sug .mini.solid{background:var(--oxblood);border-color:var(--oxblood);color:var(--gold-l)}
.sug .own{font-family:"Jost",sans-serif;text-transform:uppercase;letter-spacing:.16em;
  font-size:9px;color:var(--grass);margin-top:10px;display:block}
.sugnote{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px}
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

/* ── setup code ─────────────────────────────────────────────── */
function b64enc(str){
  const bytes = new TextEncoder().encode(str);
  let bin = ""; bytes.forEach(b=>bin += String.fromCharCode(b));
  return btoa(bin);
}
function b64dec(b64){
  const bin = atob(b64.replace(/\s+/g,""));
  return new TextDecoder().decode(Uint8Array.from(bin, c=>c.charCodeAt(0)));
}
function readGh(){ try { return JSON.parse(localStorage.getItem(GH_KEY)||"{}"); } catch(e){ return {}; } }
function makeCode(){ return b64enc(JSON.stringify({ v:1, keys, gh:readGh() })); }
function useCode(code){
  const o = JSON.parse(b64dec(code));
  if (!o || o.v!==1) throw new Error("That doesn't look like a K-point setup code.");
  if (o.keys){ keys = Object.assign(keys, o.keys); saveKeys(); }
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
    ["TMDB","Posters, summaries, episodes, cast, trailers",!!keys.tmdb,"https://www.themoviedb.org/settings/api"],
    ["OMDb","IMDb ratings",!!keys.omdb,"https://www.omdbapi.com/apikey.aspx"],
    ["Gemini","Drafting write-ups",!!keys.gemini,"https://aistudio.google.com/apikey"],
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
      <div class="connrow"><span class="dot ${ok?"on":"off"}"></span>
        <b>${n}</b><span>${ok?"connected":"not set"} · ${E(what)}</span>
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
          <input id="kTmdb" type="password" value="${E(keys.tmdb)}" autocomplete="off"></label>
        <label class="field"><span class="label">OMDb key</span>
          <input id="kOmdb" type="password" value="${E(keys.omdb)}" autocomplete="off"></label>
        <label class="field"><span class="label">Gemini key</span>
          <input id="kGem" type="password" value="${E(keys.gemini)}" autocomplete="off"></label>
        <label class="field"><span class="label">Gemini model</span>
          <input id="kModel" value="${E(keys.model||DEFAULT_MODEL)}" autocomplete="off"></label>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn solid" data-save type="button">Save keys</button></div>
    </div>
    <div id="moveArea" class="hidden">
      <div class="sec-h" style="margin-top:24px"><h2>Move to another device</h2><div class="rule"></div></div>
      <p class="fine">This code holds every key above, including your GitHub token. Keep it in your
      password manager. <b>Treat it like a password.</b></p>
      <div class="row" style="margin-top:14px">
        <button class="btn solid" data-copy type="button">Copy my setup code</button>
        <button class="btn ghost" data-show type="button">Show it</button></div>
      <textarea class="codebox hidden" id="codeOut" readonly></textarea>
      <div class="sec-h" style="margin-top:24px"><h2>Or paste one in</h2><div class="rule"></div></div>
      <textarea class="codebox" id="codeIn" placeholder="Paste a setup code from your other device"></textarea>
      <div class="row" style="margin-top:12px">
        <button class="btn solid" data-use type="button">Use this code</button></div>
      <p class="fine" id="moveStatus" style="margin-top:10px"></p>
    </div>
    <p class="fine" id="kStatus" style="margin-top:16px"></p>`);

  const q = s => el.querySelector(s);
  q("[data-x]").onclick = ()=>close("keysSheet");
  q("[data-edit]").onclick = ()=>q("#editArea").classList.toggle("hidden");
  q("[data-move]").onclick = ()=>q("#moveArea").classList.toggle("hidden");
  q("[data-save]").onclick = ()=>{
    keys.tmdb = q("#kTmdb").value.trim(); keys.omdb = q("#kOmdb").value.trim();
    keys.gemini = q("#kGem").value.trim(); keys.model = q("#kModel").value.trim() || DEFAULT_MODEL;
    saveKeys(); refreshDesk(); toast("Saved on this browser"); openKeys(false);
  };
  q("[data-show]").onclick = ()=>{ const t=q("#codeOut"); t.value=makeCode(); t.classList.remove("hidden"); t.select(); };
  q("[data-copy]").onclick = async ()=>{
    const code = makeCode();
    try { await navigator.clipboard.writeText(code); q("#moveStatus").textContent="Copied. Paste it somewhere safe."; }
    catch(e){ const t=q("#codeOut"); t.value=code; t.classList.remove("hidden"); t.select();
      q("#moveStatus").textContent="Couldn't reach the clipboard — select the text above and copy it."; }
  };
  q("[data-use]").onclick = ()=>{
    const v = q("#codeIn").value.trim(); if (!v) return;
    try { useCode(v); refreshDesk(); q("#moveStatus").textContent="Done."; toast("Setup restored");
      setTimeout(()=>openKeys(false),600); }
    catch(err){ q("#moveStatus").textContent = err.message; }
  };
}
function refreshDesk(){
  const b = document.getElementById("deskBtn");
  if (b) b.textContent = allSet() ? "⚡ Research desk ✓"
       : keys.tmdb ? "⚡ Research desk" : "⚡ Set up research desk";
}

/* ── TMDB ───────────────────────────────────────────────────── */
/* TMDB throws the occasional 500 or 429 under load. Those are worth
   waiting out — a wrong key or a missing title never is. */
async function tmdb(path, params){
  if (!keys.tmdb) throw new Error("No TMDB key yet — open the research desk and add one.");
  const u = new URL(TMDB+path);
  u.searchParams.set("api_key", keys.tmdb);
  Object.entries(params||{}).forEach(([k,v])=>u.searchParams.set(k,v));

  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt++){
    if (attempt) await sleep(700 * Math.pow(2, attempt - 1));
    let r;
    try { r = await fetch(u); }
    catch(e){ lastStatus = 0; continue; }
    if (r.ok) return r.json();
    lastStatus = r.status;
    if (r.status === 401) throw new Error("TMDB rejected that key.");
    if (r.status === 404) throw new Error("TMDB has no record at that address.");
    if (r.status !== 429 && r.status < 500) throw new Error("TMDB said "+r.status);
  }
  throw new Error(lastStatus === 429
    ? "TMDB is rate-limiting you — wait a minute and run it again."
    : lastStatus >= 500
      ? "TMDB is having a wobble (error "+lastStatus+"). It's their end — try again shortly."
      : "Couldn't reach TMDB. Check your connection.");
}
async function searchCandidates(s){
  const q = s.title.replace(/\s*\d+\s*&\s*\d+\s*$/,"").trim();
  const film = (typeof isFilm==="function") && isFilm(s);
  const first = film ? "movie" : "tv", second = film ? "tv" : "movie";
  const map = (res,kind)=>(res.results||[]).map(x=>({
    kind, id:x.id, title:x.name||x.title, original:x.original_name||x.original_title,
    year:((x.first_air_date||x.release_date)||"").slice(0,4), overview:x.overview,
    poster:x.poster_path, countries:x.origin_country||[]
  }));
  let out = map(await tmdb("/search/"+first, {query:q, include_adult:"false"}), first);
  if (!out.length) out = map(await tmdb("/search/"+second, {query:q, include_adult:"false"}), second);
  return out.slice(0,6);
}
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
  const d = await tmdb(`/${c.kind}/${c.id}`, {append_to_response:"videos,external_ids,credits"});
  const vids = ((d.videos||{}).results)||[];
  const trailer = vids.find(v=>v.site==="YouTube" && v.type==="Trailer")
               || vids.find(v=>v.site==="YouTube" && v.type==="Teaser")
               || vids.find(v=>v.site==="YouTube");
  const cr = d.credits||{};
  const cast = (cr.cast||[]).slice(0,6).map(p=>({name:p.name, role:p.character, photo:p.profile_path}));
  const crewRaw = (cr.crew||[]).filter(p=>CREW_JOBS.includes(p.job));
  (d.created_by||[]).forEach(p=>crewRaw.unshift({name:p.name, job:"Creator", profile_path:p.profile_path}));
  const seen = new Set(), crew = [];
  crewRaw.forEach(p=>{
    const k = p.name+"|"+p.job;
    if (seen.has(k) || crew.length>=5) return;
    seen.add(k); crew.push({name:p.name, job:p.job, photo:p.profile_path});
  });
  return {
    tmdbId:c.id, kind:c.kind,
    summary:(d.overview||"").trim(),
    poster:d.poster_path ? IMG+d.poster_path : null,
    episodes:d.number_of_episodes||null, seasons:d.number_of_seasons||null,
    firstAir:d.first_air_date||d.release_date||null, lastAir:d.last_air_date||null,
    networks:(d.networks||[]).map(n=>n.name),
    companies:(d.production_companies||[]).map(n=>n.name),
    country:CC[(d.origin_country||[])[0]] || null,
    imdbId:((d.external_ids||{}).imdb_id)||null,
    trailer:trailer ? "https://www.youtube.com/watch?v="+trailer.key : null,
    trailerName:trailer ? trailer.name : null,
    cast, crew, isFilm:c.kind==="movie"
  };
}
async function imdbRating(imdbId){
  if (!keys.omdb || !imdbId) return null;
  try {
    const r = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(keys.omdb)}&i=${encodeURIComponent(imdbId)}`);
    if (!r.ok) return null;
    const v = parseFloat((await r.json()).imdbRating);
    return isNaN(v) ? null : v;
  } catch(e){ return null; }
}
async function grabPoster(s, url){
  try {
    const r = await fetch(url, {mode:"cors"});
    if (!r.ok) throw new Error("no");
    const blob = await r.blob();
    return queueImage(s.id, new File([blob],"poster.jpg",{type:blob.type||"image/jpeg"}));
  } catch(e){ return url; }
}

/* people are stored once, at the top of data.json, not per show */
function rememberPerson(name, photo){
  if (!name) return;
  DATA.people = DATA.people || {};
  if (!DATA.people[name]) DATA.people[name] = {};
  if (photo && !DATA.people[name].p) DATA.people[name].p = photo;
}

async function apply(s, d){
  const touched = [];
  s.tmdbId = d.tmdbId;
  if (d.isFilm && !s.kind){ s.kind = "film"; touched.push("film"); }
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
  if (d.cast.length && !(s.cast||[]).length){
    s.cast = d.cast.map(p=>p.name);
    s.roles = d.cast.map(p=>p.role||"").filter(Boolean).length ? d.cast.map(p=>p.role||"") : undefined;
    d.cast.forEach(p=>rememberPerson(p.name, p.photo));
    touched.push("cast");
  }
  if (d.crew.length && !(s.crew||[]).length){
    s.crew = d.crew.map(p=>({name:p.name, job:p.job}));
    d.crew.forEach(p=>rememberPerson(p.name, p.photo));
    touched.push("crew");
  }
  if (d.poster && !s.poster){ s.poster = await grabPoster(s, d.poster); touched.push("poster"); }
  if (d.trailer && !(s.videos||[]).length){
    s.videos = [{url:d.trailer, title:d.trailerName||"Trailer"}]; touched.push("trailer");
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
    return {status:"filled", fields:await apply(s,d), name:verdict.pick.title};
  }
  if (interactive){ reviewOne(s, cands, verdict.why); return {status:"asking"}; }
  return {status:"queued", why:verdict.why, cands};
}

/* ── review queue ───────────────────────────────────────────── */
let queue = [];
function reviewOne(s, cands, why){
  const el = sheet("pickSheet", `
    <div class="sec-h"><h2>Which one is it?</h2><div class="rule"></div>
      <button class="x big" data-x type="button" aria-label="Close">×</button></div>
    <p class="fine"><b>${E(s.title)}</b>${s.year?` · your sheet says ${s.year}`:""} —
      ${E(why||"needs a look")}.${queue.length?` ${queue.length} more after this.`:""}</p>
    <div style="margin-top:16px">
      ${cands.length ? cands.map((c,i)=>`
        <div class="cand">
          ${c.poster?`<img src="${IMG+c.poster}" alt="">`:`<div class="noimg"></div>`}
          <div><h4>${E(c.title)}</h4>
            <div class="meta">${E(c.year||"year unknown")}${c.kind==="movie"?" · film":""}${c.countries.length?" · "+E(c.countries.join(", ")):""}</div>
            <p>${E(c.overview||"No summary on TMDB.")}</p></div>
          <button class="btn solid" data-pick="${i}" type="button">This one</button>
        </div>`).join("")
      : `<p class="noyet">TMDB has nothing under that title. Try renaming it to the English title
         TMDB uses, then fetch again.</p>`}
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" data-skip type="button">Skip this one</button>
      ${queue.length?`<button class="btn ghost" data-stop type="button">Stop reviewing</button>`:""}
    </div>`);
  el.querySelector("[data-x]").onclick = ()=>close("pickSheet");
  el.querySelector("[data-skip]").onclick = ()=>{ close("pickSheet"); nextInQueue(); };
  const stop = el.querySelector("[data-stop]");
  if (stop) stop.onclick = ()=>{ queue=[]; close("pickSheet"); toast("Review stopped"); };
  el.querySelectorAll("[data-pick]").forEach(b=>b.onclick = async ()=>{
    b.disabled = true; b.textContent = "Fetching…";
    try {
      const t = await apply(s, await details(cands[+b.dataset.pick]));
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
  return !s.summary || !s.poster || !s.episodes || !(s.videos||[]).length
      || !s.network || !s.country || !(s.cast||[]).length;
}
function openBatch(){
  if (!keys.tmdb) return openKeys(true);
  const all = DATA.shows, todo = all.filter(missingBits);
  const el = sheet("batchSheet", `
    <div class="sec-h"><h2>Fill in what's missing</h2><div class="rule"></div>
      <button class="x big" data-x type="button" aria-label="Close">×</button></div>
    <p class="fine">${todo.length} of your ${all.length} titles are missing at least one of: poster,
    summary, episode count, platform, country, cast or trailer. I'll fill <b>only the blanks</b>.</p>
    <p class="fine" style="margin-top:10px">Exact title and year matches fill themselves in;
    anything ambiguous waits and asks you.</p>
    <div class="row" style="margin-top:18px">
      <button class="btn solid" data-go type="button">Look up ${todo.length} titles</button>
      <button class="btn ghost" data-x2 type="button">Not now</button></div>
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
  const say = (c,m)=>{ log.insertAdjacentHTML("beforeend",`<div class="${c}">${m}</div>`);
                       log.scrollTop = log.scrollHeight; };
  let filled=0, asked=0, failed=0;
  queue = [];
  for (let i=0;i<list.length;i++){
    const s = list[i];
    bar.style.width = ((i+1)/list.length*100)+"%";
    txt.textContent = `${i+1} of ${list.length} · ${s.title}`;
    try {
      const r = await fetchOne(s, false);
      if (r.status==="filled"){ filled++;
        say("ok", `✓ ${E(s.title)} — ${r.fields.length?E(r.fields.join(", ")):"already complete"}`); }
      else { asked++; queue.push({show:s, cands:r.cands, why:r.why});
        say("q", `? ${E(s.title)} — ${E(r.why)}`); }
    } catch(err){
      failed++; say("no", `✕ ${E(s.title)} — ${E(String(err.message).slice(0,70))}`);
      if (/key/i.test(err.message)) break;
    }
    await sleep(220);
  }
  txt.textContent = `Done · ${filled} filled in, ${asked} need you, ${failed} failed`;
  renderChrome(); renderView();
  if (queue.length){
    const go = document.createElement("button");
    go.className = "btn solid"; go.type = "button"; go.style.marginTop = "14px";
    go.textContent = `Review the ${queue.length} I couldn't call →`;
    go.onclick = ()=>{ close("batchSheet"); nextInQueue(); };
    el.querySelector(".sheet-card").appendChild(go);
  }
}

/* ── Gemini ─────────────────────────────────────────────────── */
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
      ? "That Gemini model name isn't available — change it in the research desk." : m);
  }
  const parts = (((j.candidates||[])[0]||{}).content||{}).parts;
  const out = (parts||[]).map(p=>p.text||"").join("").trim();
  if (!out) throw new Error("Gemini returned nothing.");
  return out;
}
const CRIT = ["Plot","Sequence","Characters","Chemistry","Impact on me"];
function draftPrompt(s){
  const marks = Array.isArray(s.scores)
    ? CRIT.map((c,i)=>s.scores[i]!=null?`${c}: ${s.scores[i]}/5`:null).filter(Boolean).join(", ")
    : (s.myRate!=null ? `Overall: ${s.myRate}/5` : "not scored");
  return [
`You are drafting a short entry for a personal drama journal. The writer is a long-time viewer of
Korean and Chinese dramas. This is a FIRST DRAFT that she will rewrite in her own words.`,``,
`Show: ${s.title}${s.year?` (${s.year})`:""}`,
s.country?`Country: ${s.country==="KR"?"South Korea":s.country==="CN"?"China":s.country}`:"",
s.network?`Platform: ${s.network}`:"", s.genres?`Genres: ${s.genres}`:"",
s.episodes?`Episodes: ${s.episodes}`:"",
(s.cast||[]).length?`Cast: ${s.cast.join(", ")}`:"",
s.summary?`Official synopsis: ${s.summary}`:"", s.imdb?`IMDb rating: ${s.imdb}/10`:"",
`Her scores: ${marks}`,
s.progress?`Note on her progress: ${s.progress}`:"", s.comment?`Her note: ${s.comment}`:"",``,
`Write 150-220 words, first person, warm and conversational — telling a friend what a show was
like, not a review site.`,``,
`Hard rules:`,
`- Use ONLY the synopsis above for plot. Invent no scenes, characters, twists or endings.`,
`- Her scores are the spine. If a score is low say so; if one is much higher than the rest,
  make that the point.`,
`- No spoilers beyond the synopsis. No rating out of ten, no verdict line, no headings, no bullets.`,
`- Do not claim she felt something the scores don't support.`,
`- Plain prose. Two or three paragraphs, blank line between them.`
].filter(Boolean).join("\n");
}
async function draftFor(s, btn){
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = "Drafting…";
  try {
    s.review = await gemini(draftPrompt(s));
    s.reviewDraft = true;
    markDirty(); renderReader();
    toast("Draft written — now make it yours");
  } catch(err){ toast(String(err.message).slice(0,140)); }
  finally { btn.disabled = false; btn.textContent = old; }
}

/* ═══ THE PEOPLE ════════════════════════════════════════════════ */
let peopleMode = "all", peopleQ = "", peopleOpen = "";
function faceFor(name, cls){
  const p = ((DATA.people||{})[name]||{}).p;
  if (p) return `<img class="${cls}" src="${FACE+p}" alt="" loading="lazy">`;
  const initials = name.split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase();
  return `<span class="${cls==="face"?"init":"init"}">${E(initials)}</span>`;
}
function buildPeople(){
  const map = new Map();
  DATA.shows.forEach(s=>{
    (s.cast||[]).forEach((n,i)=>{
      if (!n) return;
      const e = map.get(n) || {name:n, jobs:new Set(), shows:[]};
      e.jobs.add("Cast"); e.shows.push({s, as:(s.roles||[])[i]||""});
      map.set(n, e);
    });
    (s.crew||[]).forEach(c=>{
      if (!c || !c.name) return;
      const e = map.get(c.name) || {name:c.name, jobs:new Set(), shows:[]};
      e.jobs.add(c.job||"Crew"); e.shows.push({s, as:c.job||""});
      map.set(c.name, e);
    });
  });
  return [...map.values()].map(p=>{
    const scored = p.shows.map(x=>myScore(x.s)).filter(v=>v!=null);
    return Object.assign(p, {
      jobs:[...p.jobs],
      count:new Set(p.shows.map(x=>x.s.id)).size,
      avg: scored.length ? Math.round(scored.reduce((a,b)=>a+b,0)/scored.length*10)/10 : null
    });
  });
}
function matchesMode(p){
  if (peopleMode==="all") return true;
  if (peopleMode==="cast") return p.jobs.includes("Cast");
  if (peopleMode==="writer") return p.jobs.some(j=>/Writer|Screenplay|Creator|Story|Novel/i.test(j));
  if (peopleMode==="director") return p.jobs.some(j=>/Director/i.test(j));
  if (peopleMode==="producer") return p.jobs.some(j=>/Producer/i.test(j));
  return true;
}
window.renderPeople = function(){
  const all = buildPeople();
  const q = peopleQ.trim().toLowerCase();
  const list = all.filter(p=>matchesMode(p) && (!q || p.name.toLowerCase().includes(q)))
                  .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));
  const modes = [["all","Everyone"],["cast","Actors"],["writer","Writers"],
                 ["director","Directors"],["producer","Producers"]];

  document.getElementById("page").innerHTML = `
    <div class="pagehead">
      <h2 class="pagetitle">The people</h2>
      <p class="fine">${all.length ? `${all.length} names across your library, gathered from TMDB.
        The ones you've seen most come first. Tap anybody to see everything of theirs you own.`
        : `Nobody yet. Cast and crew arrive with <b>⚡ Fill in details</b> in Studio — the same
        run that fetches posters and summaries.`}</p>
    </div>
    ${all.length?`
    <div class="peoplebar">
      <input id="pq" placeholder="Find a name…" value="${E(peopleQ)}">
      <div class="chips">${modes.map(([v,n])=>
        `<button class="chip" data-pmode="${v}" aria-pressed="${peopleMode===v}" type="button">${n}</button>`).join("")}</div>
    </div>
    <p class="label" style="margin-top:12px">${list.length} shown</p>
    <div class="pgrid">${list.slice(0,180).map(p=>{
      const open = peopleOpen===p.name;
      return `<button class="pcard" type="button" data-person="${E(p.name)}" aria-expanded="${open}">
        ${faceFor(p.name,"face")}
        <b>${E(p.name)}</b>
        <span>${p.count} title${p.count>1?"s":""}${p.avg!=null?" · "+p.avg:""}</span>
      </button>` + (open ? personPanel(p) : "");
    }).join("")}</div>` : ""}`;

  const pq = document.getElementById("pq");
  if (pq) pq.addEventListener("input", e=>{
    peopleQ = e.target.value;
    clearTimeout(window.__pqt);
    window.__pqt = setTimeout(()=>renderPeople(), 160);
  });
  document.querySelectorAll("[data-pmode]").forEach(b=>b.onclick = ()=>{
    peopleMode = b.dataset.pmode; peopleOpen = ""; renderPeople(); });
  document.querySelectorAll("[data-person]").forEach(b=>b.onclick = ()=>{
    peopleOpen = (peopleOpen===b.dataset.person) ? "" : b.dataset.person;
    renderPeople();
  });
  document.querySelectorAll("[data-goshow]").forEach(b=>b.onclick = e=>{
    e.stopPropagation(); location.hash = "#/show/"+b.dataset.goshow; });
};
function personPanel(p){
  const uniq = [];
  const seen = new Set();
  p.shows.forEach(x=>{ if (!seen.has(x.s.id)){ seen.add(x.s.id); uniq.push(x); } });
  uniq.sort((a,b)=>(b.s.year||0)-(a.s.year||0));
  return `<div class="pdetail">
    <h3>${E(p.name)}</h3>
    <div class="sub">${E(p.jobs.join(" · "))} · ${p.count} title${p.count>1?"s":""}${
      p.avg!=null?` · you average ${p.avg} on their work`:""}</div>
    <div class="ptitles">${uniq.map(x=>{
      const ms = myScore(x.s);
      return `<button class="ptitle" type="button" data-goshow="${E(x.s.id)}">
        ${E(x.s.title)}<em>${x.s.year||""}${x.as?" · "+E(x.as):""}${ms!=null?" · "+ms:""}</em></button>`;
    }).join("")}</div>
  </div>`;
}

/* ═══ SUGGESTIONS ═══════════════════════════════════════════════ */
let sugCache = null, sugBusy = false;
function ownedIndex(){
  const m = new Map();
  DATA.shows.forEach(s=>m.set(norm(s.title), s));
  return m;
}
async function discover(country, sort, extra){
  const p = Object.assign({
    with_origin_country: country, sort_by: sort, include_adult:"false",
    language:"en-US", page:"1"
  }, extra||{});
  const d = await tmdb("/discover/tv", p);
  return (d.results||[]).map(x=>({
    id:x.id, title:x.name, original:x.original_name,
    year:(x.first_air_date||"").slice(0,4), overview:x.overview,
    poster:x.poster_path, vote:x.vote_average, votes:x.vote_count, country
  }));
}
async function loadSuggestions(){
  const today = new Date();
  const ago = new Date(today.getTime() - 120*864e5).toISOString().slice(0,10);
  const old = new Date(today.getTime() - 730*864e5).toISOString().slice(0,10);
  const trending = [], gems = [];
  for (const c of ["KR","CN"]){
    trending.push(...await discover(c, "popularity.desc", {"first_air_date.gte":ago}));
    await sleep(200);
    gems.push(...await discover(c, "vote_average.desc",
      {"vote_count.gte":"120","first_air_date.lte":old}));
    await sleep(200);
  }
  const dedupe = arr => {
    const seen = new Set();
    return arr.filter(x=>{ const k = norm(x.title); if (seen.has(k)) return false; seen.add(k); return true; });
  };
  return {
    trending: dedupe(trending).sort((a,b)=>b.votes-a.votes).slice(0,18),
    gems: dedupe(gems).filter(g=>g.vote>=7.8).slice(0,18)
  };
}
function sugCard(x, owned){
  const have = owned.get(norm(x.title));
  return `<div class="sug${have?" have":""}">
    ${x.poster?`<img src="${IMG+x.poster}" alt="" loading="lazy">`:`<div class="noimg"></div>`}
    <div>
      <h4>${E(x.title)}</h4>
      <div class="m">${E(x.year||"—")} · ${x.country==="KR"?"Korean":"Chinese"} · ${x.vote?x.vote.toFixed(1):"—"} on TMDB</div>
      <p>${E(x.overview||"No summary on TMDB.")}</p>
      ${have
        ? `<span class="own">✓ Already in your library — ${E(STATUS[have.status].name)}</span>`
        : `<div class="acts">
             <button class="mini solid" data-addlib="${E(x.title)}" data-y="${E(x.year||"")}"
               data-c="${E(x.country)}" data-tid="${x.id}">+ Watchlist</button>
             <button class="mini" data-addshort="${E(x.title)}">+ Shortlist</button>
           </div>`}
    </div></div>`;
}
window.renderSuggest = function(){
  const owned = ownedIndex();
  const page = document.getElementById("page");
  const body = !keys.tmdb
    ? `<p class="noyet">This page runs on TMDB. Open <b>Studio → Research desk</b> and add a TMDB
       key — it's free and takes a minute.</p>`
    : !sugCache
      ? `<div class="sugnote"><button class="btn solid" id="sugGo" type="button">
           ${sugBusy?"Looking…":"Fetch what's out there"}</button>
         <span class="fine">Six requests to TMDB. Nothing is saved until you add something.</span></div>`
      : `<section class="sec">
           <div class="sec-h"><h2>Trending now</h2><div class="rule"></div>
             <span class="label">${sugCache.trending.length} titles</span></div>
           <p class="fine">Korean and Chinese series that started or returned in the last four
           months, ordered by how much attention they're getting.</p>
           <div class="sugg">${sugCache.trending.map(x=>sugCard(x,owned)).join("")}</div>
         </section>
         <section class="sec">
           <div class="sec-h"><h2>Hidden gems</h2><div class="rule"></div>
             <span class="label">${sugCache.gems.length} titles</span></div>
           <p class="fine">Highly rated, at least two years old, and not trending — the ones that
           quietly did well while you were watching something else.</p>
           <div class="sugg">${sugCache.gems.map(x=>sugCard(x,owned)).join("")}</div>
         </section>
         <div class="sugnote" style="margin-top:26px">
           <button class="btn ghost" id="sugAgain" type="button">Fetch again</button>
           <span class="fine">Data from TMDB. MyDramaList has no public API, so this is the
           closest live source for Korean and Chinese popularity.</span></div>`;

  page.innerHTML = `
    <div class="pagehead">
      <h2 class="pagetitle">Suggestions</h2>
      <p class="fine">What's airing and what you missed. Anything already in your ${DATA.shows.length}
      titles is marked, so you're only ever looking at things you don't have.</p>
    </div>${body}`;

  const go = document.getElementById("sugGo") || document.getElementById("sugAgain");
  if (go) go.onclick = async ()=>{
    go.disabled = true; go.textContent = "Looking…"; sugBusy = true;
    try { sugCache = await loadSuggestions(); renderSuggest(); }
    catch(err){ toast(String(err.message).slice(0,140)); go.disabled=false; go.textContent="Try again"; }
    finally { sugBusy = false; }
  };
  page.querySelectorAll("[data-addshort]").forEach(b=>b.onclick = ()=>{
    addToShortlist(b.dataset.addshort); });
  page.querySelectorAll("[data-addlib]").forEach(b=>b.onclick = async ()=>{
    const title = b.dataset.addlib;
    let id = slugify(title), n = 1;
    while (get(id)) { n++; id = slugify(title)+"-"+n; }
    const show = { id, title, status:"L" };
    if (b.dataset.y) show.year = parseInt(b.dataset.y,10);
    if (b.dataset.c) show.country = b.dataset.c;
    DATA.shows.unshift(show);
    markDirty(); renderChrome();
    b.disabled = true; b.textContent = "Fetching…";
    try { await apply(show, await details({kind:"tv", id:+b.dataset.tid})); } catch(e){}
    toast(title+" added to your watchlist");
    renderSuggest();
  });
};

/* ── article decoration ─────────────────────────────────────── */
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
    add.forEach(t=>facts.insertAdjacentHTML("beforeend",`<span class="fact">${E(t)}</span>`));
  }

  const heads = [...document.querySelectorAll("#reader .sec-h h2")];
  const writeUp = heads.find(h=>h.textContent.trim()==="The write-up");

  if (s.summary && writeUp && !document.getElementById("summarySec")){
    const sec = document.createElement("section");
    sec.className = "sec"; sec.id = "summarySec";
    sec.innerHTML = `<div class="sec-h"><h2>What it's about</h2><div class="rule"></div></div>
      <p class="summary">${E(s.summary)}</p>
      <p class="label" style="margin-top:10px">Synopsis from TMDB</p>`;
    writeUp.closest(".sec").before(sec);
  }

  if ((s.cast||[]).length && writeUp && !document.getElementById("castSec")){
    const sec = document.createElement("section");
    sec.className = "sec"; sec.id = "castSec";
    sec.innerHTML = `<div class="sec-h"><h2>Who's in it</h2><div class="rule"></div></div>
      <div class="castrow">${s.cast.map((n,i)=>`
        <button class="castone pcard" type="button" data-toperson="${E(n)}">
          ${faceFor(n,"face")}<b>${E(n)}</b>
          ${(s.roles||[])[i]?`<span>${E(s.roles[i])}</span>`:""}
        </button>`).join("")}</div>
      ${(s.crew||[]).length?`<div class="crewline">${s.crew.map(c=>
        `<span class="cw">${E(c.job)} · <b>${E(c.name)}</b></span>`).join("")}</div>`:""}`;
    writeUp.closest(".sec").before(sec);
    sec.querySelectorAll("[data-toperson]").forEach(b=>b.onclick = ()=>{
      peopleOpen = b.dataset.toperson; peopleMode = "all"; peopleQ = "";
      location.hash = "#/people";
    });
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
const _renderReader = renderReader;
renderReader = function(){ _renderReader.apply(this, arguments); try { decorate(); } catch(e){} };

if (typeof openGh === "function"){
  const _openGh = openGh;
  openGh = function(){
    _openGh.apply(this, arguments);
    const t = document.getElementById("ghToken");
    if (t) t.placeholder = readGh().token ? "Saved — leave blank to keep it" : "github_pat_…";
  };
}

/* masthead buttons — staged into Studio by app.js */
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
