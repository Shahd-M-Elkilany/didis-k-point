/* ═══════════════════════════════════════════════════════════════════
   Didi's K-point
   Data lives in data.json. Edits are held in memory, kept in this
   browser as a draft, and committed to GitHub when you hit Save.
   Pictures you add wait in IndexedDB until that commit, so closing
   the tab before saving doesn't lose them.
   ═══════════════════════════════════════════════════════════════ */

const CRITERIA = [["plot","Plot"],["sequence","Sequence"],["characters","Characters"],
                  ["chemistry","Chemistry"],["impact","Impact on me"]];
const STATUS = {
  W:{name:"Watched",  cls:"w", color:"var(--pink)",   on:"var(--on-pink)"},
  S:{name:"Watching", cls:"s", color:"var(--yellow)", on:"var(--on-yellow)"},
  L:{name:"Watchlist",cls:"l", color:"var(--blue)",   on:"var(--on-blue)"},
  U:{name:"Unsure",   cls:"u", color:"var(--violet)", on:"var(--on-violet)"}
};
const ORDER = ["W","S","L","U"];
const COUNTRIES = [["KR","Korean"],["CN","Chinese"],["JP","Japanese"],["OT","Other"]];
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
const LAYOUTS = [["standard","Standard"],["poster","Poster-led"],
                 ["essay","Photo essay"],["quick","Quick take"]];
const VIEWS = [["library","The library"],["diary","The diary"],["ranking","The ranking"],
               ["numbers","The numbers"],["next","Next up"]];
const BANDS = [["45","4.5 and up"],["4","4 to 4.5"],["35","3.5 to 4"],
               ["3","3 to 3.5"],["lt3","Under 3"],["none","Not scored"]];
const INK_PAIRS = [
  ["var(--pink)","var(--on-pink)","var(--yellow)"],
  ["var(--blue)","var(--on-blue)","var(--pink)"],
  ["var(--violet)","var(--on-violet)","var(--cyan)"],
  ["var(--cyan)","var(--on-yellow)","var(--violet)"],
  ["var(--yellow)","var(--on-yellow)","var(--blue)"],
  ["var(--orange)","var(--on-yellow)","var(--violet)"],
  ["var(--grass)","var(--on-yellow)","var(--pink)"],
  ["var(--ink)","var(--paper)","var(--pink)"]
];
const DRAFT_KEY = "kpoint.draft";
const GH_KEY    = "kpoint.gh";
const TRASH_KEY = "kpoint.trash";

let DATA = { name:"Didi's K-point", shows:[] };
let pending = Object.create(null);     // path -> {blob, url, done}
let trash = [];                        // repo files to delete on the next save
const broken = new Set();              // paths that failed to load
let dirty = false, editMode = false, openId = null, view = "library";
let rankSort = {key:"avg", dir:-1};
let gh = { owner:"", repo:"", branch:"main", token:"" };
const state = { q:"", status:"all", genre:"all", net:"all", year:"all",
                watched:"all", country:"all", band:"all", todo:false, sort:"year" };

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function hash(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return Math.abs(h); }
function slugify(t){
  return (t||"show").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-")
    .replace(/^-|-$/g,"").slice(0,48) || "show";
}
function genresOf(s){ return (s.genres||"").split(",").map(x=>x.trim()).filter(Boolean); }
function netsOf(s){ return (s.network||"").split(",").map(x=>x.trim()).filter(Boolean); }
function avgOf(sc){
  if (!Array.isArray(sc)) return null;
  const v = sc.filter(n=>typeof n==="number" && !isNaN(n));
  return v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length*10)/10 : null;
}
function myScore(s){ return avgOf(s.scores) ?? (typeof s.myRate==="number" ? s.myRate : null); }
function gapOf(s){
  const m = myScore(s);
  if (m==null || !s.imdb) return null;
  return Math.round((m*2 - s.imdb)*10)/10;
}
function countryName(c){ const f = COUNTRIES.find(x=>x[0]===c); return f ? f[1] : ""; }
function watchLabel(w){
  if (!w) return "";
  const [y,m] = String(w).split("-");
  return m ? MONTHS[parseInt(m,10)-1]+" "+y : y;
}
function needsWriteUp(s){ return (s.status==="W") && myScore(s)!=null && !(s.review||"").trim(); }

/* A picture resolves to the blob you just added, or the file in the
   repo — and to nothing at all once we know that file isn't there,
   so the page falls back to its drawn cover instead of a broken icon. */
function mediaSrc(p){
  if (!p) return null;
  if (pending[p]) return pending[p].url;
  return broken.has(p) ? null : p;
}
let failTimer = null;
function imgFail(path){
  if (!path || broken.has(path)) return;
  broken.add(path);
  clearTimeout(failTimer);
  failTimer = setTimeout(()=>{
    renderView();
    if (openId) renderReader();
    toast(broken.size===1
      ? "A picture is missing — it was added but never saved. Add it again."
      : broken.size+" pictures are missing — they were added but never saved.");
  }, 90);
}
function imgTag(path, cls, alt){
  const src = mediaSrc(path);
  if (!src) return "";
  return `<img${cls?` class="${cls}"`:""} src="${esc(src)}" alt="${esc(alt||"")}"
    loading="lazy" onerror="imgFail('${esc(path)}')">`;
}

/* ── picture drawer (IndexedDB) ─────────────────────────────── */
function idb(){
  return new Promise((res,rej)=>{
    const rq = indexedDB.open("kpoint", 1);
    rq.onupgradeneeded = ()=>{
      if (!rq.result.objectStoreNames.contains("pending")) rq.result.createObjectStore("pending");
    };
    rq.onsuccess = ()=>res(rq.result);
    rq.onerror   = ()=>rej(rq.error);
  });
}
async function idbPut(k,v){
  try { const d = await idb(); d.transaction("pending","readwrite").objectStore("pending").put(v,k); } catch(e){}
}
async function idbDel(k){
  try { const d = await idb(); d.transaction("pending","readwrite").objectStore("pending").delete(k); } catch(e){}
}
async function idbAll(){
  try {
    const d  = await idb();
    const st = d.transaction("pending","readonly").objectStore("pending");
    const keys = st.getAllKeys(), vals = st.getAll();
    return await new Promise(res=>{
      st.transaction.oncomplete = ()=>{
        const out = {};
        (keys.result||[]).forEach((k,i)=>{ const v=(vals.result||[])[i]; if (v) out[k]=v; });
        res(out);
      };
      st.transaction.onerror = ()=>res({});
    });
  } catch(e){ return {}; }
}

/* ── boot ───────────────────────────────────────────────────── */
(async function boot(){
  try { gh = Object.assign(gh, JSON.parse(localStorage.getItem(GH_KEY)||"{}")); } catch(e){}
  try { trash = JSON.parse(localStorage.getItem(TRASH_KEY)||"[]") || []; } catch(e){ trash = []; }

  let live = null;
  try {
    const r = await fetch("data.json?v="+Date.now(), {cache:"no-store"});
    if (r.ok) live = await r.json();
  } catch(e){}
  if (live) DATA = live;

  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY)||"null"); } catch(e){}
  if (draft && draft.shows && draft.shows.length){
    DATA = draft; dirty = true;
    setTimeout(()=>toast("Unsaved changes from last time were restored"), 400);
  }
  if (!DATA.shows) DATA.shows = [];

  const stored = await idbAll();
  Object.keys(stored).forEach(k=>{
    try { pending[k] = { blob:stored[k], url:URL.createObjectURL(stored[k]) }; } catch(e){}
  });
  if (Object.keys(stored).length){
    dirty = true;
    setTimeout(()=>toast(Object.keys(stored).length+" picture(s) still waiting to be saved"), 900);
  }

  wireChrome();
  renderTabs(); renderChrome();
  window.addEventListener("hashchange", route);
  route();
  updateSaveBar();
})();

/* ── routing ────────────────────────────────────────────────── */
function route(){
  const h = (location.hash||"").replace(/^#\/?/,"");
  const [a,b] = h.split("/");
  if (a==="show" && b){
    const s = get(decodeURIComponent(b));
    if (s){ openId = s.id; renderReader(); return; }
  }
  if (openId){ openId = null; $("#reader").classList.remove("on"); document.body.style.overflow=""; }
  view = VIEWS.some(v=>v[0]===a) ? a : "library";
  renderTabs(); renderView();
}
function go(hashPath){ location.hash = "#/"+hashPath; }

/* ── model ──────────────────────────────────────────────────── */
function get(id){ return DATA.shows.find(s=>s.id===id); }
function markDirty(){
  dirty = true;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(DATA)); } catch(e){}
  updateSaveBar();
}
function unsavedPics(){ return Object.keys(pending).filter(p=>!pending[p].done).length; }
function updateSaveBar(){
  $("#saveBar").classList.toggle("on", dirty || trash.length>0);
  const n = unsavedPics(), d = trash.length;
  const extra = [
    n ? n+" picture"+(n>1?"s":"")+" waiting" : "",
    d ? d+" to remove" : ""
  ].filter(Boolean).join(" · ");
  $("#saveCount").textContent = gh.token
    ? "Unsaved" + (extra ? " · "+extra : "")
    : "Unsaved — connect GitHub to publish";
}

/* ── tabs + chrome ──────────────────────────────────────────── */
function renderTabs(){
  $("#tabs").innerHTML = VIEWS.map(([v,n])=>
    `<button type="button" class="tab" data-view="${v}" aria-pressed="${view===v}">${n}</button>`).join("");
}
function renderChrome(){
  const all = DATA.shows;
  const yrs = all.map(s=>s.year).filter(Boolean);
  $("#mastRange").textContent = yrs.length ? Math.min(...yrs)+" — "+Math.max(...yrs) : "—";
  $("#mastCount").textContent = all.length;

  const c = {W:0,S:0,L:0,U:0};
  all.forEach(s=>{ if (c[s.status]!=null) c[s.status]++; });
  $("#statBand").innerHTML =
    ORDER.map(k=>`<div class="stat ${STATUS[k].cls}"><span class="n">${c[k]}</span><span class="k">${STATUS[k].name}</span></div>`).join("") +
    `<div class="band-note">${all.filter(s=>myScore(s)!=null).length} scored · ${all.filter(s=>(s.review||"").trim()).length} written up · ${all.filter(needsWriteUp).length} waiting on words</div>`;

  if (!$("#statusChips").children.length){
    $("#statusChips").innerHTML =
      `<button class="chip" data-st="all" aria-pressed="true" type="button">All</button>` +
      ORDER.map(k=>`<button class="chip ${STATUS[k].cls}" data-st="${k}" aria-pressed="false" type="button">${STATUS[k].name}</button>`).join("") +
      `<button class="chip todo" id="todoChip" aria-pressed="false" type="button">✎ Needs a write-up</button>`;
  }

  const g=new Set(), n=new Set(), y=new Set(), w=new Set(), co=new Set();
  all.forEach(s=>{
    genresOf(s).forEach(x=>g.add(x));
    netsOf(s).forEach(x=>n.add(x));
    if (s.year) y.add(s.year);
    if (s.watched) w.add(String(s.watched));
    if (s.country) co.add(s.country);
  });
  fill("#genreSel","All genres",[...g].sort().map(v=>[v,v]));
  fill("#netSel","All platforms",[...n].sort().map(v=>[v,v]));
  fill("#yearSel","All release years",[...y].sort((a,b)=>b-a).map(v=>[v,"Released "+v]));
  fill("#bandSel","Any score",BANDS);
  const coOpts = COUNTRIES.filter(([k])=>co.has(k)).map(([k,l])=>[k,l]);
  coOpts.push(["untagged","Not tagged yet"]);
  fill("#countrySel","Anywhere",coOpts);

  const years = [...new Set([...w].map(x=>x.split("-")[0]))].sort().reverse();
  const opts = [];
  years.forEach(yr=>{
    opts.push([yr,"Watched in "+yr]);
    [...w].filter(x=>x.startsWith(yr) && x.includes("-")).sort().reverse()
      .forEach(x=>opts.push([x,"　· "+watchLabel(x)]));
  });
  opts.push(["none","Not logged yet"]);
  fill("#watchedSel","Watched — any time",opts);

  const scored = all.map(myScore).filter(v=>v!=null);
  $("#footStat").textContent = scored.length
    ? "Average of your scores: "+(scored.reduce((a,b)=>a+b,0)/scored.length).toFixed(2)+" / 5"
    : "";
}
function fill(sel, allLabel, pairs){
  const el = $(sel); if (!el) return;
  const prev = el.value;
  el.innerHTML = `<option value="all">${allLabel}</option>` +
    pairs.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join("");
  if (prev && [...el.options].some(o=>o.value===prev)) el.value = prev;
}

/* ── filtering ──────────────────────────────────────────────── */
function inBand(s){
  const m = myScore(s);
  switch(state.band){
    case "45":  return m!=null && m>=4.5;
    case "4":   return m!=null && m>=4 && m<4.5;
    case "35":  return m!=null && m>=3.5 && m<4;
    case "3":   return m!=null && m>=3 && m<3.5;
    case "lt3": return m!=null && m<3;
    case "none":return m==null;
    default:    return true;
  }
}
function visible(base){
  const q = state.q.trim().toLowerCase();
  const list = (base||DATA.shows).filter(s=>{
    if (state.todo && !needsWriteUp(s)) return false;
    if (state.status!=="all" && s.status!==state.status) return false;
    if (state.genre!=="all" && !genresOf(s).includes(state.genre)) return false;
    if (state.net!=="all" && !netsOf(s).includes(state.net)) return false;
    if (state.year!=="all" && String(s.year)!==state.year) return false;
    if (state.country!=="all"){
      if (state.country==="untagged"){ if (s.country) return false; }
      else if (s.country!==state.country) return false;
    }
    if (!inBand(s)) return false;
    if (state.watched!=="all"){
      const w = s.watched ? String(s.watched) : "";
      if (state.watched==="none"){ if (w) return false; }
      else if (!w || !w.startsWith(state.watched)) return false;
    }
    if (q){
      const hay = [s.title,s.network,s.genres,s.review,s.comment].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const crit = i=>(a,b)=>{
    const av = Array.isArray(a.scores)?a.scores[i]:null, bv = Array.isArray(b.scores)?b.scores[i]:null;
    return (bv??-1)-(av??-1) || a.title.localeCompare(b.title);
  };
  const by = {
    year:(a,b)=>(b.year||0)-(a.year||0) || a.title.localeCompare(b.title),
    yearAsc:(a,b)=>(a.year||0)-(b.year||0) || a.title.localeCompare(b.title),
    watched:(a,b)=>String(b.watched||"").localeCompare(String(a.watched||"")) || a.title.localeCompare(b.title),
    mine:(a,b)=>(myScore(b)??-1)-(myScore(a)??-1) || a.title.localeCompare(b.title),
    imdb:(a,b)=>(b.imdb??-1)-(a.imdb??-1) || a.title.localeCompare(b.title),
    over:(a,b)=>(gapOf(b)??-99)-(gapOf(a)??-99),
    under:(a,b)=>(gapOf(a)??99)-(gapOf(b)??99),
    az:(a,b)=>a.title.localeCompare(b.title),
    c0:crit(0), c1:crit(1), c2:crit(2), c3:crit(3), c4:crit(4)
  };
  return list.sort(by[state.sort]||by.year);
}

/* ── views ──────────────────────────────────────────────────── */
function renderView(){
  const lib = (view==="library" || view==="next");
  $("#controls").classList.toggle("hidden", !lib);
  $("#countLine").classList.toggle("hidden", !lib);
  $("#grid").classList.toggle("hidden", view!=="library");
  $("#page").classList.toggle("hidden", view==="library");
  if (view==="library") renderGrid();
  else if (view==="next") renderNext();
  else if (view==="diary") renderDiary();
  else if (view==="ranking") renderRanking();
  else if (view==="numbers") renderNumbers();
}

function coverHTML(s){
  const [bg,fg,accent] = INK_PAIRS[hash(s.id)%INK_PAIRS.length];
  const st = STATUS[s.status]||STATUS.L;
  const ms = myScore(s);
  const poster = mediaSrc(s.poster);
  return `<div class="cover" style="color:${poster?"var(--paper)":fg}">
    <div class="slab" style="background:${bg};background-image:linear-gradient(118deg, ${accent} 0 34%, transparent 34%)"></div>
    ${imgTag(s.poster,"","")}
    <div class="dots"></div>
    <span class="yr"${poster?' style="background:var(--ink);color:var(--paper);border-color:var(--ink)"':""}>${s.year||"TBA"}</span>
    <span class="stamp" style="background:${st.color};color:${st.on}">${st.name}</span>
    ${poster?"":`<div class="ttl">${esc(s.title)}</div>`}
    ${ms!=null?`<span class="mypick">My score</span><span class="score">${ms}</span>`:""}
  </div>`;
}
function cardHTML(s){
  const bits = [];
  if (s.country) bits.push(countryName(s.country));
  if (s.network) bits.push(esc(s.network));
  if (s.imdb) bits.push("IMDb "+s.imdb);
  if (s.watched) bits.push("watched "+esc(watchLabel(s.watched)));
  if (s.progress) bits.push(esc(s.progress));
  if ((s.review||"").trim()) bits.push("✎ written up");
  const st = STATUS[s.status]||STATUS.L;
  return `<div class="card" data-id="${esc(s.id)}" tabindex="0" role="button">
    <div class="quick">
      <button type="button" data-cycle="${esc(s.id)}" title="Change status">${st.name}</button>
      <button type="button" data-setposter="${esc(s.id)}" title="${s.poster?"Replace the poster":"Set the poster"}">Poster</button>
      ${s.poster?`<button type="button" data-clearposter="${esc(s.id)}" title="Remove the poster">✕</button>`:""}
    </div>
    ${coverHTML(s)}
    <div class="c-meta">
      <span class="c-name">${esc(s.title)}</span>
      <span class="c-sub">${bits.join(" · ")||"&nbsp;"}</span>
    </div></div>`;
}
function renderGrid(){
  const list = visible(), total = DATA.shows.length;
  $("#countLine").innerHTML =
    `<span class="big">${list.length}</span><span class="label">of ${total} titles shown</span>` +
    (list.length!==total ? `<button class="btn ghost" id="clearF" type="button">Clear filters</button>` : "");
  const cf = $("#clearF");
  if (cf) cf.onclick = clearFilters;
  $("#grid").innerHTML = list.length ? list.map(cardHTML).join("")
    : `<p class="empty">Nothing matches that. Try clearing a filter.</p>`;
}
function clearFilters(){
  Object.assign(state,{q:"",status:"all",genre:"all",net:"all",year:"all",
                       watched:"all",country:"all",band:"all",todo:false});
  $("#q").value="";
  ["#genreSel","#netSel","#yearSel","#watchedSel","#countrySel","#bandSel"].forEach(s=>{ if($(s)) $(s).value="all"; });
  $$("#statusChips .chip").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.st==="all")));
  $("#todoChip").setAttribute("aria-pressed","false");
  renderView();
}

/* ── the diary ──────────────────────────────────────────────── */
function renderDiary(){
  const logged = DATA.shows.filter(s=>s.watched);
  const unlogged = DATA.shows.filter(s=>s.status==="W" && !s.watched).length;
  const byYear = {};
  logged.forEach(s=>{
    const [y,m] = String(s.watched).split("-");
    byYear[y] = byYear[y] || {};
    const key = m || "00";
    (byYear[y][key] = byYear[y][key] || []).push(s);
  });
  const years = Object.keys(byYear).sort().reverse();

  $("#page").innerHTML = `
    <div class="pagehead">
      <h2 class="pagetitle">The diary</h2>
      <p class="fine">What you actually finished, month by month. ${logged.length} logged${
        unlogged ? ` · ${unlogged} watched shows have no date yet — add one in any article` : ""}.</p>
    </div>
    ${years.length ? years.map(y=>{
      const months = Object.keys(byYear[y]).sort().reverse();
      const total = months.reduce((n,m)=>n+byYear[y][m].length,0);
      const scored = months.flatMap(m=>byYear[y][m]).map(myScore).filter(v=>v!=null);
      return `<section class="sec">
        <div class="sec-h"><h2>${y}</h2><div class="rule"></div>
          <span class="label">${total} finished${scored.length?" · avg "+(scored.reduce((a,b)=>a+b,0)/scored.length).toFixed(2):""}</span></div>
        <div class="timeline">${months.map(m=>{
          const items = byYear[y][m];
          const sc = items.map(myScore).filter(v=>v!=null);
          return `<div class="tl-month">
            <div class="tl-label"><b>${m==="00"?"Sometime that year":MONTHS[parseInt(m,10)-1]}</b>
              <span class="mono">${items.length} title${items.length>1?"s":""}${
                sc.length?" · "+(sc.reduce((a,b)=>a+b,0)/sc.length).toFixed(1)+" avg":""}</span></div>
            <div class="tl-items">${items.map(s=>{
              const ms = myScore(s);
              return `<button class="tl-card" type="button" data-open="${esc(s.id)}">
                <span class="tl-dot" style="background:${INK_PAIRS[hash(s.id)%INK_PAIRS.length][0]}"></span>
                <span class="tl-name">${esc(s.title)}</span>
                ${ms!=null?`<span class="tl-score mono">${ms}</span>`:""}
              </button>`;
            }).join("")}</div>
          </div>`;
        }).join("")}</div>
      </section>`;
    }).join("") : `<p class="empty">Nothing dated yet. Open any show and set the month you finished it.</p>`}`;
}

/* ── the ranking ────────────────────────────────────────────── */
function renderRanking(){
  const cols = [["title","Title","l"],["year","Year","n"],
    ...CRITERIA.map(([k,n],i)=>["c"+i,n,"n"]),
    ["avg","Mine","n"],["imdb","IMDb","n"],["gap","Gap","n"]];
  const val = (s,k)=>{
    if (k==="title") return s.title;
    if (k==="year") return s.year||0;
    if (k==="avg") return myScore(s);
    if (k==="imdb") return s.imdb??null;
    if (k==="gap") return gapOf(s);
    const i = +k.slice(1);
    return Array.isArray(s.scores) ? s.scores[i] : null;
  };
  const rows = DATA.shows.filter(s=>myScore(s)!=null).sort((a,b)=>{
    const av = val(a,rankSort.key), bv = val(b,rankSort.key);
    if (rankSort.key==="title") return rankSort.dir * String(av).localeCompare(String(bv));
    return rankSort.dir * ((av??-99) - (bv??-99)) || a.title.localeCompare(b.title);
  });

  $("#page").innerHTML = `
    <div class="pagehead">
      <h2 class="pagetitle">The ranking</h2>
      <p class="fine">Every show you've scored, ${rows.length} of them. Tap a column to rank by it —
      the five marks stand on their own, so you can find the best chemistry or the sharpest plot
      without the average flattening it.</p>
    </div>
    <div class="tablewrap">
      <table class="rank">
        <thead><tr><th class="num">#</th>${cols.map(([k,n,t])=>
          `<th class="${t==="n"?"num":""}${rankSort.key===k?" sorted":""}">
            <button type="button" data-sort="${k}">${n}${rankSort.key===k?(rankSort.dir<0?" ▾":" ▴"):""}</button></th>`).join("")}</tr></thead>
        <tbody>${rows.map((s,i)=>{
          const g = gapOf(s);
          return `<tr data-open="${esc(s.id)}">
            <td class="num mono dim">${i+1}</td>
            <td class="l"><b>${esc(s.title)}</b>${s.country?` <span class="tag">${esc(s.country)}</span>`:""}</td>
            <td class="num mono dim">${s.year||"—"}</td>
            ${CRITERIA.map((c,ci)=>{
              const v = Array.isArray(s.scores)?s.scores[ci]:null;
              return `<td class="num mono">${v!=null?`<span class="pip" style="--p:${v/5*100}%">${v.toFixed(1)}</span>`:"·"}</td>`;
            }).join("")}
            <td class="num mono strong">${myScore(s).toFixed(1)}</td>
            <td class="num mono dim">${s.imdb??"—"}</td>
            <td class="num mono ${g==null?"dim":g>0?"up":"down"}">${g==null?"—":(g>0?"+":"")+g.toFixed(1)}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>
    <p class="fine" style="margin-top:14px"><b>Gap</b> is your score doubled to IMDb's ten-point scale,
    minus IMDb. Positive means you rated it higher than the crowd.</p>`;
}

/* ── the numbers ────────────────────────────────────────────── */
function bars(items, opts){
  const o = opts||{};
  const max = Math.max(...items.map(i=>i.v), o.max||0) || 1;
  return `<div class="bars">${items.map(i=>`
    <div class="brow">
      <span class="bname">${esc(i.k)}</span>
      <span class="btrack"><i style="width:${Math.max(2,i.v/max*100)}%;background:${i.c||"var(--pink)"}"></i></span>
      <span class="bval mono">${o.fmt?o.fmt(i.v):i.v}</span>
    </div>`).join("")}</div>`;
}
function renderNumbers(){
  const all = DATA.shows;
  const watched = all.filter(s=>s.status==="W");
  const scored = all.filter(s=>myScore(s)!=null);
  const avg = scored.length ? scored.map(myScore).reduce((a,b)=>a+b,0)/scored.length : 0;
  const best = scored.slice().sort((a,b)=>myScore(b)-myScore(a))[0];
  const worst = scored.slice().sort((a,b)=>myScore(a)-myScore(b))[0];

  const byYear = {};
  scored.forEach(s=>{ if(s.year){ (byYear[s.year]=byYear[s.year]||[]).push(myScore(s)); }});
  const yearRows = Object.keys(byYear).sort().map(y=>({
    k:y, v:Math.round(byYear[y].reduce((a,b)=>a+b,0)/byYear[y].length*100)/100 }));

  const gW={}, gL={};
  all.forEach(s=>genresOf(s).forEach(g=>{
    if (s.status==="W") gW[g]=(gW[g]||0)+1;
    if (s.status==="L") gL[g]=(gL[g]||0)+1;
  }));
  const topGenres = Object.keys({...gW,...gL})
    .map(g=>({g, w:gW[g]||0, l:gL[g]||0, t:(gW[g]||0)+(gL[g]||0)}))
    .sort((a,b)=>b.t-a.t).slice(0,10);
  const gMax = Math.max(...topGenres.map(x=>x.t),1);

  const nets = {};
  watched.forEach(s=>netsOf(s).forEach(n=>nets[n]=(nets[n]||0)+1));
  const netRows = Object.entries(nets).sort((a,b)=>b[1]-a[1]).slice(0,10)
    .map(([k,v])=>({k, v, c:"var(--blue)"}));

  const full = all.filter(s=>Array.isArray(s.scores) && s.scores.filter(n=>typeof n==="number").length===5);
  const critRows = CRITERIA.map(([k,n],i)=>{
    const vals = full.map(s=>s.scores[i]).filter(v=>typeof v==="number");
    return {k:n, v: vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100 : 0,
            c:"var(--violet)"};
  });

  const gaps = all.filter(s=>gapOf(s)!=null).sort((a,b)=>gapOf(b)-gapOf(a));
  const over = gaps.slice(0,5), under = gaps.slice(-5).reverse();

  const cc = {};
  all.forEach(s=>{ const k = s.country||"untagged"; cc[k]=(cc[k]||0)+1; });

  $("#page").innerHTML = `
    <div class="pagehead">
      <h2 class="pagetitle">The numbers</h2>
      <p class="fine">Your taste, counted. Everything here comes from the ${all.length} titles in the library —
      ${scored.length} of them scored.</p>
    </div>

    <div class="tiles">
      <div class="tile"><span class="t-n">${watched.length}</span><span class="t-k">Finished</span></div>
      <div class="tile"><span class="t-n">${avg.toFixed(2)}</span><span class="t-k">Average score</span></div>
      <div class="tile"><span class="t-n">${full.length}</span><span class="t-k">Scored all five ways</span></div>
      <div class="tile"><span class="t-n">${all.filter(s=>s.status==="L").length}</span><span class="t-k">Still waiting</span></div>
    </div>

    <div class="twoup">
      <div class="panel"><span class="label">Your highest</span>
        <button class="bigname" type="button" data-open="${best?esc(best.id):""}">${best?esc(best.title):"—"}</button>
        <span class="mono">${best?myScore(best).toFixed(1)+" / 5":""}</span></div>
      <div class="panel"><span class="label">Your lowest</span>
        <button class="bigname" type="button" data-open="${worst?esc(worst.id):""}">${worst?esc(worst.title):"—"}</button>
        <span class="mono">${worst?myScore(worst).toFixed(1)+" / 5":""}</span></div>
    </div>

    <section class="sec">
      <div class="sec-h"><h2>Which of the five drives your verdict</h2><div class="rule"></div></div>
      <p class="fine" style="margin-bottom:14px">Averaged across the ${full.length} shows you scored on all five.
      The one that runs highest is what you forgive a show for; the lowest is what you actually notice.</p>
      ${bars(critRows,{max:5,fmt:v=>v.toFixed(2)})}
    </section>

    <section class="sec">
      <div class="sec-h"><h2>Average score by release year</h2><div class="rule"></div></div>
      ${yearRows.length?bars(yearRows,{max:5,fmt:v=>v.toFixed(2)}):`<p class="noyet">Not enough scored yet.</p>`}
    </section>

    <section class="sec">
      <div class="sec-h"><h2>What you finish vs. what you collect</h2><div class="rule"></div></div>
      <p class="fine" style="margin-bottom:14px">Pink is finished, blue is still on the watchlist.</p>
      <div class="bars">${topGenres.map(x=>`
        <div class="brow">
          <span class="bname">${esc(x.g)}</span>
          <span class="btrack split">
            <i style="width:${x.w/gMax*100}%;background:var(--pink)"></i>
            <i style="width:${x.l/gMax*100}%;background:var(--blue)"></i></span>
          <span class="bval mono">${x.w}/${x.l}</span>
        </div>`).join("")}</div>
    </section>

    <section class="sec">
      <div class="sec-h"><h2>Where you actually watch</h2><div class="rule"></div></div>
      ${netRows.length?bars(netRows):`<p class="noyet">No platforms recorded.</p>`}
    </section>

    <section class="sec">
      <div class="sec-h"><h2>You vs. the crowd</h2><div class="rule"></div></div>
      <div class="twoup">
        <div>
          <span class="label">You liked these more than everyone else</span>
          <ol class="gaplist">${over.map(s=>`<li><button type="button" data-open="${esc(s.id)}">${esc(s.title)}</button>
            <span class="mono up">+${gapOf(s).toFixed(1)}</span>
            <span class="mono dim">${myScore(s).toFixed(1)}×2 vs ${s.imdb}</span></li>`).join("")}</ol>
        </div>
        <div>
          <span class="label">And these you didn't buy</span>
          <ol class="gaplist">${under.map(s=>`<li><button type="button" data-open="${esc(s.id)}">${esc(s.title)}</button>
            <span class="mono down">${gapOf(s).toFixed(1)}</span>
            <span class="mono dim">${myScore(s).toFixed(1)}×2 vs ${s.imdb}</span></li>`).join("")}</ol>
        </div>
      </div>
    </section>

    <section class="sec">
      <div class="sec-h"><h2>Where they're from</h2><div class="rule"></div></div>
      ${bars(Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({
        k: k==="untagged" ? "Not tagged yet" : countryName(k), v,
        c: k==="untagged" ? "var(--ink-soft)" : "var(--grass)" })))}
      ${cc.untagged?`<p class="fine" style="margin-top:12px">${cc.untagged} titles have no country yet —
        filter the library by <b>Not tagged yet</b> to clear them out.</p>`:""}
    </section>`;
}

/* ── next up ────────────────────────────────────────────────── */
function renderNext(){
  const base = DATA.shows.filter(s=>s.status==="L");
  const list = visible(base);
  $("#countLine").innerHTML =
    `<span class="big">${list.length}</span><span class="label">on the watchlist</span>
     <button class="btn solid" id="shuffle" type="button">🎲 Pick one for me</button>` +
    (list.length!==base.length?`<button class="btn ghost" id="clearF" type="button">Clear filters</button>`:"");
  const cf = $("#clearF"); if (cf) cf.onclick = clearFilters;
  const sh = $("#shuffle");
  if (sh) sh.onclick = ()=>{
    if (!list.length) return toast("Nothing left to pick from");
    const pick = list[Math.floor(Math.random()*list.length)];
    toast("Tonight: "+pick.title);
    go("show/"+pick.id);
  };
  $("#page").innerHTML = `
    <div class="pagehead">
      <h2 class="pagetitle">Next up</h2>
      <p class="fine">${base.length} shows you've lined up and not started. Narrow it with the filters
      above, or let the dice decide.</p>
    </div>
    <div class="grid flat">${list.length?list.map(cardHTML).join(""):`<p class="empty">Nothing matches.</p>`}</div>`;
}

/* ── article ────────────────────────────────────────────────── */
function renderReader(){
  const s = get(openId);
  if (!s) return;
  const r = $("#reader");
  r.classList.add("on");
  document.body.style.overflow = "hidden";
  r.innerHTML = articleHTML(s);
  r.scrollTop = 0;
  wireArticle(s);
}
function closeShow(){ go(view); }

function ytId(u){
  const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function hostOf(u){ try{ return new URL(u).hostname.replace(/^www\./,""); }catch(e){ return "the web"; } }

function articleHTML(s){
  const [bg,fg] = INK_PAIRS[hash(s.id)%INK_PAIRS.length];
  const st = STATUS[s.status]||STATUS.L;
  const ms = myScore(s), gp = gapOf(s);
  const lay = s.layout || "standard";
  const poster = mediaSrc(s.poster);

  const facts = [];
  if (s.year) facts.push(s.year);
  if (s.country) facts.push(countryName(s.country));
  if (s.network) facts.push(s.network);
  if (s.imdb) facts.push("IMDb "+s.imdb);
  if (s.watched) facts.push("Watched "+watchLabel(s.watched));
  if (s.progress) facts.push(s.progress);
  if (s.comment) facts.push(s.comment);

  const hero = `
    <article class="r-hero" style="background:${bg}; color:${fg}">
      <div class="dots"></div>
      <div class="r-kicker" data-edit="genres" data-empty="Add genres, comma separated">${esc(s.genres||"")}</div>
      <h1 class="r-title" data-edit="title">${esc(s.title)}</h1>
      <div class="r-facts">${facts.map(f=>`<span class="fact">${esc(f)}</span>`).join("")}</div>
    </article>`;

  const posterBroken = !!s.poster && !poster;
  const posterBlock = poster
    ? `${imgTag(s.poster,"r-poster",s.title+" poster")}
       <div class="row editonly" style="margin-top:12px">
         <button class="btn ghost" id="posterSwap" type="button">Replace poster</button>
         <button class="btn ghost" id="posterRm" type="button">✕ Remove poster</button>
       </div>`
    : `${posterBroken?`<p class="noyet" style="margin-top:26px">The poster for this one is missing — it was added but never saved to GitHub.</p>`:""}
       <div class="drop editonly" id="posterDrop" style="margin-top:${posterBroken?14:26}px">Add a poster — click, or drag one in</div>
       ${posterBroken?`<div class="row editonly" style="margin-top:10px">
         <button class="btn ghost" id="posterRm" type="button">✕ Clear the dead link</button></div>`:""}`;

  const details = `
    <section class="sec editonly">
      <div class="sec-h"><h2>Details</h2><div class="rule"></div></div>
      <div class="fgrid">
        <label class="field"><span class="label">Released</span>
          <input id="f-year" type="number" min="1990" max="2040" value="${s.year||""}"></label>
        <label class="field"><span class="label">From</span>
          <select id="f-country"><option value="">Not tagged</option>${COUNTRIES.map(([k,l])=>
            `<option value="${k}"${s.country===k?" selected":""}>${l}</option>`).join("")}</select></label>
        <label class="field"><span class="label">Platform</span>
          <input id="f-network" value="${esc(s.network||"")}" placeholder="tvN, Netflix"></label>
        <label class="field"><span class="label">IMDb</span>
          <input id="f-imdb" type="number" step="0.1" min="0" max="10" value="${s.imdb||""}"></label>
        <label class="field"><span class="label">Status</span>
          <select id="f-status">${ORDER.map(k=>`<option value="${k}"${s.status===k?" selected":""}>${STATUS[k].name}</option>`).join("")}</select></label>
        <label class="field"><span class="label">Watched — year</span>
          <input id="f-wyear" type="number" min="2000" max="2040" placeholder="2026"
            value="${s.watched?String(s.watched).split("-")[0]:""}"></label>
        <label class="field"><span class="label">Watched — month</span>
          <select id="f-wmonth"><option value="">—</option>${MONTHS.map((m,i)=>{
            const v = String(i+1).padStart(2,"0");
            const cur = s.watched ? String(s.watched).split("-")[1] : "";
            return `<option value="${v}"${cur===v?" selected":""}>${m}</option>`;
          }).join("")}</select></label>
        <label class="field"><span class="label">Where you stopped</span>
          <input id="f-progress" value="${esc(s.progress||"")}" placeholder="ep 9"></label>
        <label class="field"><span class="label">Note</span>
          <input id="f-comment" value="${esc(s.comment||"")}" placeholder="Downloaded, film not a series…"></label>
      </div>
      <div class="sec-h" style="margin-top:26px"><h2>Article layout</h2><div class="rule"></div></div>
      <div class="laypick">${LAYOUTS.map(([v,n])=>
        `<button type="button" data-lay="${v}" aria-pressed="${lay===v}">${n}</button>`).join("")}</div>
    </section>`;

  const scoreRows = CRITERIA.map(([k,n],i)=>{
    const v = Array.isArray(s.scores) ? s.scores[i] : null;
    return `<div class="srow"><span class="sn">${n}</span>
      <span class="bar" data-bar="${i}" role="slider" tabindex="0"
        aria-label="${n}" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${v||0}">
        <i style="width:${v?(v/5*100):0}%"></i></span>
      <span class="sv" data-sv="${i}">${v!=null?Number(v).toFixed(1):"—"}</span></div>`;
  }).join("");

  const scores = `
    <section class="sec">
      <div class="sec-h"><h2>The scorecard</h2><div class="rule"></div></div>
      <div class="scores">${scoreRows}</div>
      <div class="verdict">
        <span class="bignum" id="bigAvg">${ms!=null?ms:"—"}<small>/5</small></span>
        <span class="label">${Array.isArray(s.scores)?"Your verdict · average of five":(ms!=null?"Your overall score":"Not scored yet")}${
          gp!=null?`<br><span class="${gp>0?"up":"down"}">${gp>0?"+":""}${gp.toFixed(1)} against IMDb's ${s.imdb}</span>`:""}</span>
        <span class="row editonly" style="margin-left:auto">
          <button class="btn ghost" id="clearScores" type="button">Clear marks</button></span>
      </div>
      ${!Array.isArray(s.scores)&&ms!=null?`<p class="fine" style="margin-top:12px">Only an overall score came across from the sheet. Drag the bars to break it into the five marks.</p>`:""}
    </section>`;

  const review = (s.review||"").trim();
  const reviewBlock = `
    <section class="sec">
      <div class="sec-h"><h2>The write-up</h2><div class="rule"></div></div>
      <div class="prose" data-edit="review" data-empty="Say your piece. Leave a blank line between paragraphs.">${
        review ? review.split(/\n{2,}/).map(p=>"<p>"+esc(p).replace(/\n/g,"<br>")+"</p>").join("") : ""
      }</div>
    </section>`;

  const gallery = (s.gallery||[]);
  const anyStill = gallery.some(g=>mediaSrc(g.src)) || (editMode && gallery.length);
  const galBlock = `
    <section class="sec">
      <div class="sec-h"><h2>Stills</h2><div class="rule"></div></div>
      ${anyStill?`<div class="gal">${gallery.map((g,i)=>{
        const src = mediaSrc(g.src);
        if (!src && !editMode) return "";
        return `<figure>
          ${src ? imgTag(g.src,"",g.caption||s.title)
                : `<div style="aspect-ratio:4/3;border:2px dashed var(--ink);background:var(--paper-2);
                     display:grid;place-items:center;text-align:center;padding:10px;
                     font-family:'Oswald',sans-serif;font-size:10px;letter-spacing:.12em;
                     text-transform:uppercase;color:var(--ink-soft)">Missing —<br>remove it</div>`}
          <button class="x" type="button" data-rmimg="${i}" aria-label="Remove this picture"
            title="Remove this picture">×</button>
          <figcaption data-edit="gallery.${i}.caption" data-empty="Caption">${esc(g.caption||"")}</figcaption>
        </figure>`;
      }).join("")}</div>`:(!editMode?`<p class="noyet">No stills yet.</p>`:"")}
      <div class="drop editonly" id="galDrop" style="margin-top:14px">Add pictures — click, drag them in, or just paste</div>
      ${editMode&&gallery.length?`<p class="label" style="margin-top:10px">The ✕ on a picture removes it.</p>`:""}
    </section>`;

  const vids = (s.videos||[]);
  const vidBlock = `
    <section class="sec">
      <div class="sec-h"><h2>Watch</h2><div class="rule"></div></div>
      ${vids.length?`<div class="vids">${vids.map((v,i)=>{
        const id = ytId(v.url);
        const body = id
          ? `<div class="vembed"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}" title="${esc(v.title||"Trailer")}" allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
          : `<a class="vlink" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer"><span class="play">▶</span><span><b>${esc(v.title||"Watch the clip")}</b><span>${esc(v.url)}</span></span></a>`;
        return `<div class="vrow"><div style="flex:1;min-width:0">${body}</div>
          <button class="x editonly" type="button" data-rmvid="${i}" aria-label="Remove video">×</button></div>`;
      }).join("")}</div>`:(!editMode?`<p class="noyet">No trailer yet.</p>`:"")}
      <div class="row editonly" style="margin-top:14px">
        <input id="vidUrl" placeholder="Paste a YouTube or trailer link"
          style="flex:1 1 240px; min-width:0; border:2px solid var(--ink); background:var(--paper-2); padding:8px 10px">
        <button class="btn" id="vidAdd" type="button">Add</button>
      </div>
    </section>`;

  const body = (lay==="poster")
    ? `<div class="posterwrap">${poster?imgTag(s.poster,"r-poster",""):""}${hero}</div>
       <div class="after-poster">${poster?"":posterBlock}${details}${scores}${reviewBlock}${galBlock}${vidBlock}</div>`
    : (lay==="quick")
    ? `${hero}${details}${scores}${reviewBlock}${vidBlock}${galBlock}`
    : (lay==="essay")
    ? `${hero}${posterBlock}${galBlock}${reviewBlock}${scores}${vidBlock}${details}`
    : `${hero}${posterBlock}${scores}${reviewBlock}${galBlock}${vidBlock}${details}`;

  return `
  <div class="r-bar"><div class="r-bar-in">
    <button class="btn" id="backBtn" type="button">← Back</button>
    <button class="btn" id="artEdit" type="button" aria-pressed="${editMode}">✎ Edit mode</button>
    <button class="btn ghost editonly" id="delBtn" type="button">Delete</button>
    <span class="label" style="margin-left:auto">${st.name}</span>
  </div></div>
  <div class="r-body lay-${lay}" id="artBody">${body}</div>`;
}

function wireArticle(s){
  const id = s.id;
  const on = (sel,ev,fn)=>{ const e=$(sel); if(e) e.addEventListener(ev,fn); };

  on("#backBtn","click",closeShow);
  on("#artEdit","click",()=>{ setEdit(!editMode); renderReader(); });
  on("#delBtn","click",()=>{
    if (!confirm("Remove “"+s.title+"” from the magazine? This can't be undone once you save.")) return;
    DATA.shows = DATA.shows.filter(x=>x.id!==id);
    markDirty(); toast("Removed"); closeShow();
  });

  $$("#reader [data-edit]").forEach(el=>{
    el.setAttribute("contenteditable", editMode ? "true" : "false");
    el.addEventListener("input", ()=>{
      const path = el.dataset.edit;
      const val = el.innerText.replace(/ /g," ").replace(/\n{3,}/g,"\n\n").trim();
      if (path==="review") s.review = val;
      else if (path==="title") s.title = val;
      else if (path==="genres") s.genres = val;
      else if (path.startsWith("gallery.")){
        const i = parseInt(path.split(".")[1],10);
        if (s.gallery && s.gallery[i]) s.gallery[i].caption = val;
      }
      markDirty();
    });
  });

  const bind = (sel, fn)=>on(sel,"input",e=>{ fn(e.target.value); markDirty(); });
  bind("#f-network", v=>s.network=v);
  bind("#f-progress", v=>s.progress=v||undefined);
  bind("#f-comment", v=>s.comment=v||undefined);
  bind("#f-year", v=>s.year = v?parseInt(v,10):undefined);
  bind("#f-imdb", v=>s.imdb = v?parseFloat(v):undefined);
  on("#f-country","change",e=>{ s.country = e.target.value||undefined; markDirty(); renderReader(); });
  on("#f-status","change",e=>{ s.status=e.target.value; markDirty(); renderReader(); });
  const setWatched = ()=>{
    const y = ($("#f-wyear")||{}).value, m = ($("#f-wmonth")||{}).value;
    s.watched = y ? (m ? y+"-"+m : y) : undefined;
    markDirty();
  };
  on("#f-wyear","input",setWatched);
  on("#f-wmonth","change",setWatched);

  $$("[data-lay]").forEach(b=>b.addEventListener("click",()=>{
    s.layout = b.dataset.lay; markDirty(); renderReader();
  }));

  $$("#reader [data-bar]").forEach(bar=>{
    const idx = +bar.dataset.bar;
    const apply = ev=>{
      if (!editMode) return;
      const rect = bar.getBoundingClientRect();
      const x = ((ev.clientX ?? 0) - rect.left) / rect.width;
      setScore(s, idx, Math.max(0, Math.min(5, Math.round(x*5*10)/10)));
    };
    bar.addEventListener("pointerdown", e=>{
      if (!editMode) return;
      bar.setPointerCapture(e.pointerId); apply(e);
      const move = ev=>apply(ev);
      bar.addEventListener("pointermove",move);
      document.addEventListener("pointerup", ()=>bar.removeEventListener("pointermove",move), {once:true});
    });
    bar.addEventListener("keydown", e=>{
      if (!editMode) return;
      const cur = (Array.isArray(s.scores)?s.scores[idx]:0)||0;
      if (e.key==="ArrowRight"||e.key==="ArrowUp"){ setScore(s,idx,Math.min(5,cur+0.1)); e.preventDefault(); }
      if (e.key==="ArrowLeft"||e.key==="ArrowDown"){ setScore(s,idx,Math.max(0,cur-0.1)); e.preventDefault(); }
    });
  });
  on("#clearScores","click",()=>{ delete s.scores; delete s.myRate; markDirty(); renderReader(); });

  on("#posterDrop","click",()=>pickFiles("image/*",false,f=>addPoster(s,f[0])));
  on("#posterSwap","click",()=>pickFiles("image/*",false,f=>addPoster(s,f[0])));
  on("#posterRm","click",()=>removePoster(s));
  on("#galDrop","click",()=>pickFiles("image/*",true,f=>addGallery(s,[...f])));
  $$("[data-rmimg]").forEach(b=>b.addEventListener("click",()=>{
    const i = +b.dataset.rmimg;
    const gone = (s.gallery||[])[i];
    if (gone) forgetImage(gone.src);
    s.gallery.splice(i,1);
    if (!s.gallery.length) delete s.gallery;
    markDirty(); renderReader();
    toast("Picture removed — hit Save to publish that");
  }));
  $$("[data-rmvid]").forEach(b=>b.addEventListener("click",()=>{
    s.videos.splice(+b.dataset.rmvid,1); markDirty(); renderReader();
  }));
  on("#vidAdd","click",()=>{
    let u = ($("#vidUrl").value||"").trim(); if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://"+u;
    s.videos = (s.videos||[]).concat([{url:u, title:"Watch on "+hostOf(u)}]);
    markDirty(); renderReader();
  });

  const bodyEl = $("#artBody");
  if (bodyEl){
    bodyEl.addEventListener("dragover", e=>{ if(editMode){ e.preventDefault(); $("#dropveil").classList.add("on"); }});
    bodyEl.addEventListener("dragleave", ()=>$("#dropveil").classList.remove("on"));
    bodyEl.addEventListener("drop", e=>{
      $("#dropveil").classList.remove("on");
      if (!editMode) return;
      e.preventDefault();
      const files = [...(e.dataTransfer.files||[])].filter(f=>f.type.startsWith("image/"));
      if (!files.length) return;
      if (!mediaSrc(s.poster)) { addPoster(s, files[0]); if (files.length>1) addGallery(s, files.slice(1)); }
      else addGallery(s, files);
    });
  }
}
function setScore(s, idx, val){
  if (!Array.isArray(s.scores)) s.scores = [null,null,null,null,null];
  s.scores[idx] = Math.round(val*10)/10;
  const bar = document.querySelector(`[data-bar="${idx}"]`);
  if (bar){ bar.querySelector("i").style.width = (s.scores[idx]/5*100)+"%";
            bar.setAttribute("aria-valuenow", s.scores[idx]); }
  const sv = document.querySelector(`[data-sv="${idx}"]`);
  if (sv) sv.textContent = s.scores[idx].toFixed(1);
  const big = $("#bigAvg"), a = avgOf(s.scores);
  if (big) big.innerHTML = (a!=null?a:"—")+"<small>/5</small>";
  markDirty();
}

/* ── media ──────────────────────────────────────────────────── */
function pickFiles(accept, multiple, cb){
  const i = document.createElement("input");
  i.type="file"; i.accept=accept; i.multiple=!!multiple; i.className="hidden";
  i.onchange = ()=>{ if (i.files && i.files.length) cb(i.files); i.remove(); };
  document.body.appendChild(i); i.click();
}
function queueImage(showId, file){
  const ext = (file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"") || "jpg";
  const path = "images/"+showId+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,6)+"."+ext;
  pending[path] = { blob:file, url:URL.createObjectURL(file) };
  broken.delete(path);
  idbPut(path, file);
  return path;
}
function saveTrash(){ try { localStorage.setItem(TRASH_KEY, JSON.stringify(trash)); } catch(e){} }

/* Drop a picture. If it was only waiting to be uploaded it just goes
   away; if it's already a file in the repo it's queued for deletion
   there on your next save, so the repo doesn't fill up with orphans. */
function forgetImage(path){
  if (!path) return;
  const wasPending = !!pending[path];
  const wasCommitted = wasPending ? pending[path].done : true;
  if (wasPending){
    try { URL.revokeObjectURL(pending[path].url); } catch(e){}
    delete pending[path];
    if (!wasCommitted) idbDel(path);
  }
  broken.delete(path);
  if (wasCommitted && /^images\//.test(path) && !trash.includes(path)){
    trash.push(path); saveTrash();
  }
}
function removePoster(s){
  forgetImage(s.poster);
  delete s.poster;
  markDirty();
  if (openId) renderReader(); else renderView();
  toast("Poster removed — hit Save to publish that");
}
function tooBig(file){
  if (file.size > 20*1024*1024){ toast("That picture is over 20 MB — too big for GitHub"); return true; }
  return false;
}
function addPoster(s, file){
  if (!file || tooBig(file)) return;
  forgetImage(s.poster);
  s.poster = queueImage(s.id, file); markDirty(); renderReader();
}
function addGallery(s, files){
  const ok = files.filter(f=>f && f.type.startsWith("image/") && !tooBig(f));
  if (!ok.length) return;
  s.gallery = (s.gallery||[]).concat(ok.map(f=>({src:queueImage(s.id,f), caption:""})));
  markDirty(); renderReader();
}
document.addEventListener("paste", e=>{
  if (!editMode || !openId) return;
  const items = [...(e.clipboardData?.items||[])].filter(i=>i.type.startsWith("image/"));
  if (!items.length) return;
  e.preventDefault();
  const s = get(openId);
  const files = items.map(i=>i.getAsFile()).filter(Boolean);
  if (!mediaSrc(s.poster) && files.length) addPoster(s, files[0]);
  else addGallery(s, files);
  toast("Picture added — hit Save to publish it");
});

/* ── wiring ─────────────────────────────────────────────────── */
function setEdit(v){
  editMode = v;
  document.body.classList.toggle("editing", v);
  $("#editToggle").setAttribute("aria-pressed", String(v));
  $("#editToggle").textContent = v ? "✓ Editing" : "✎ Edit mode";
}
function wireChrome(){
  $("#tabs").addEventListener("click", e=>{
    const b = e.target.closest("[data-view]"); if (b) go(b.dataset.view);
  });
  $("#editToggle").addEventListener("click", ()=>{
    setEdit(!editMode);
    if (editMode && !gh.token) toast("Connect GitHub when you're ready to publish");
    if (openId) renderReader();
  });

  document.addEventListener("click", e=>{
    const o = e.target.closest("[data-open]");
    if (o && o.dataset.open){ go("show/"+o.dataset.open); }
    const so = e.target.closest("[data-sort]");
    if (so){
      const k = so.dataset.sort;
      rankSort = (rankSort.key===k) ? {key:k, dir:-rankSort.dir} : {key:k, dir: k==="title"?1:-1};
      renderRanking();
    }
  });

  const gridClick = e=>{
    const cyc = e.target.closest("[data-cycle]");
    if (cyc){ e.stopPropagation();
      const s = get(cyc.dataset.cycle);
      s.status = ORDER[(ORDER.indexOf(s.status)+1)%ORDER.length];
      markDirty(); renderChrome(); renderView(); return; }
    const cp = e.target.closest("[data-clearposter]");
    if (cp){ e.stopPropagation(); removePoster(get(cp.dataset.clearposter)); return; }
    const sp = e.target.closest("[data-setposter]");
    if (sp){ e.stopPropagation();
      const s = get(sp.dataset.setposter);
      pickFiles("image/*",false,f=>{
        if (tooBig(f[0])) return;
        forgetImage(s.poster);
        s.poster = queueImage(s.id,f[0]); markDirty(); renderView();
        toast("Poster set — hit Save to publish it");
      });
      return; }
    const card = e.target.closest("[data-id]");
    if (card) go("show/"+card.dataset.id);
  };
  $("#grid").addEventListener("click", gridClick);
  $("#page").addEventListener("click", gridClick);

  const cardKey = e=>{
    if (e.key==="Enter"||e.key===" "){
      const card = e.target.closest("[data-id]");
      if (card){ e.preventDefault(); go("show/"+card.dataset.id); }
    }
  };
  $("#grid").addEventListener("keydown", cardKey);
  $("#page").addEventListener("keydown", cardKey);

  const dragOver = e=>{
    if (!editMode) return;
    const card = e.target.closest("[data-id]"); if (!card) return;
    e.preventDefault(); card.classList.add("dragover");
  };
  const dragLeave = e=>{ const c = e.target.closest("[data-id]"); if (c) c.classList.remove("dragover"); };
  const dropOn = e=>{
    if (!editMode) return;
    const card = e.target.closest("[data-id]"); if (!card) return;
    e.preventDefault(); card.classList.remove("dragover");
    const f = [...(e.dataTransfer.files||[])].find(x=>x.type.startsWith("image/"));
    if (!f || tooBig(f)) return;
    const s = get(card.dataset.id);
    forgetImage(s.poster);
    s.poster = queueImage(s.id, f); markDirty(); renderView();
    toast("Poster set for "+s.title+" — hit Save to publish it");
  };
  ["#grid","#page"].forEach(sel=>{
    $(sel).addEventListener("dragover", dragOver);
    $(sel).addEventListener("dragleave", dragLeave);
    $(sel).addEventListener("drop", dropOn);
  });

  $("#statusChips").addEventListener("click", e=>{
    const todo = e.target.closest("#todoChip");
    if (todo){ state.todo = !state.todo; todo.setAttribute("aria-pressed",String(state.todo)); renderView(); return; }
    const b = e.target.closest("[data-st]"); if (!b) return;
    state.status = b.dataset.st;
    $$("#statusChips .chip[data-st]").forEach(c=>c.setAttribute("aria-pressed", String(c===b)));
    renderView();
  });
  let qt=null;
  $("#q").addEventListener("input", e=>{
    clearTimeout(qt); qt=setTimeout(()=>{ state.q=e.target.value; renderView(); },140);
  });
  const sel = {"#genreSel":"genre","#netSel":"net","#yearSel":"year","#watchedSel":"watched",
               "#countrySel":"country","#bandSel":"band","#sortSel":"sort"};
  Object.keys(sel).forEach(k=>{ const el=$(k); if(el) el.addEventListener("change", e=>{ state[sel[k]]=e.target.value; renderView(); }); });

  $("#addBtn").addEventListener("click", ()=>{
    const t = prompt("What's it called?"); if (!t || !t.trim()) return;
    let id = slugify(t), n = 1;
    while (get(id)) { n++; id = slugify(t)+"-"+n; }
    DATA.shows.unshift({ id, title:t.trim(), year:new Date().getFullYear(), status:"S" });
    setEdit(true); markDirty(); renderChrome(); go("show/"+id);
  });

  document.addEventListener("keydown", e=>{
    if (e.key==="Escape"){
      if ($("#ghSheet").classList.contains("on")) $("#ghSheet").classList.remove("on");
      else if (openId) closeShow();
    }
    if ((e.metaKey||e.ctrlKey) && e.key==="s"){ e.preventDefault(); saveAll(); }
  });
  window.addEventListener("beforeunload", e=>{ if (dirty){ e.preventDefault(); e.returnValue=""; }});

  $("#ghBtn").addEventListener("click", openGh);
  $("#ghClose").addEventListener("click", ()=>$("#ghSheet").classList.remove("on"));
  $("#ghSheet").addEventListener("click", e=>{ if (e.target===$("#ghSheet")) $("#ghSheet").classList.remove("on"); });
  $("#ghSave").addEventListener("click", connectGh);
  $("#ghForget").addEventListener("click", ()=>{
    gh.token=""; localStorage.removeItem(GH_KEY);
    $("#ghToken").value=""; $("#ghStatus").textContent="Token forgotten on this device.";
    updateSaveBar();
  });
  $("#saveBtn").addEventListener("click", saveAll);
  $("#discardBtn").addEventListener("click", async ()=>{
    if (!confirm("Throw away every unsaved change and reload from GitHub?")) return;
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(TRASH_KEY);
    for (const p of Object.keys(pending)) await idbDel(p);
    trash = []; dirty = false; location.reload();
  });
}

/* ── GitHub ─────────────────────────────────────────────────── */
function repoSlug(name){
  return name.trim().replace(/[^A-Za-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"");
}
function onGithubPages(){
  return /\.github\.io$/i.test(location.hostname) || location.hostname==="localhost";
}
function openGh(){
  $("#ghOwner").value = gh.owner || "";
  $("#ghRepo").value  = gh.repo  || "";
  $("#ghBranch").value= gh.branch|| "main";
  $("#ghToken").value = "";
  $("#ghStatus").textContent = gh.token
    ? "Connected as "+gh.owner+"/"+gh.repo+". Leave the token blank to keep the one already saved."
    : "Not connected yet.";
  $("#ghSheet").classList.add("on");
}
async function connectGh(){
  const owner = $("#ghOwner").value.trim();
  const rawRepo = $("#ghRepo").value.trim();
  const repo = repoSlug(rawRepo);
  const branch = $("#ghBranch").value.trim() || "main";
  const token = $("#ghToken").value.trim() || gh.token;
  const say = m => { $("#ghStatus").innerHTML = m; };

  if (!owner || !repo || !token){ say("Username, repository and token are all needed."); return; }
  if (repo !== rawRepo){
    $("#ghRepo").value = repo;
    say(`A repository name can't contain spaces or apostrophes, so I've changed it to
         <b>${esc(repo)}</b>. If that isn't right, open your repo on GitHub and copy the
         name out of the address bar. Then hit Connect again.`);
    return;
  }
  say("Checking…");
  let r;
  try {
    r = await fetch(`https://api.github.com/repos/${owner}/${repo}`,
                    {headers: ghHeaders({owner,repo,branch,token})});
  } catch(err){
    say(onGithubPages()
      ? "Couldn't reach GitHub. Check your internet connection and try again."
      : `This page can't talk to GitHub — the request was blocked before it left the browser.
         Saving only works on your live <b>github.io</b> site, not on a preview or a file
         opened from your computer. Everything else on this page works fine here.`);
    return;
  }
  if (!r.ok){
    say(r.status===404
        ? `No repository called <b>${esc(owner)}/${esc(repo)}</b> that this token can see.
           Check the spelling, and that the token lists this repository under
           <b>Only select repositories</b>.`
      : r.status===401 ? "That token was rejected. It may have expired — make a new one."
      : r.status===403 ? `The token reached GitHub but isn't allowed in. It needs
           <b>Contents: Read and write</b> on this repository.`
      : "GitHub said "+r.status+".");
    return;
  }
  gh = {owner, repo, branch, token};
  localStorage.setItem(GH_KEY, JSON.stringify(gh));
  say("Connected. Your changes can publish now.");
  updateSaveBar();
  toast("Connected to "+owner+"/"+repo);
}
function ghHeaders(g){
  return { Authorization:"Bearer "+((g||gh).token), Accept:"application/vnd.github+json",
           "X-GitHub-Api-Version":"2022-11-28" };
}
function b64text(str){
  const bytes = new TextEncoder().encode(str);
  let bin = ""; bytes.forEach(b=>bin += String.fromCharCode(b));
  return btoa(bin);
}
function b64blob(blob){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload  = ()=>res(String(fr.result).split(",")[1]);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}
async function putFile(path, contentB64, message){
  let sha;
  try {
    const head = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${path}?ref=${gh.branch}`,
      {headers: ghHeaders(), cache:"no-store"});
    if (head.ok) sha = (await head.json()).sha;
  } catch(e){}
  const r = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${path}`, {
    method:"PUT", headers: Object.assign({"Content-Type":"application/json"}, ghHeaders()),
    body: JSON.stringify({ message, content:contentB64, branch:gh.branch, sha })
  });
  if (!r.ok){
    const j = await r.json().catch(()=>({}));
    throw new Error((j.message||"GitHub refused the write")+" ("+path+")");
  }
  return r.json();
}
async function deleteFile(path){
  const head = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${path}?ref=${gh.branch}`,
    {headers: ghHeaders(), cache:"no-store"});
  if (!head.ok) return;                       // already gone, nothing to do
  const sha = (await head.json()).sha;
  await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${path}`, {
    method:"DELETE", headers: Object.assign({"Content-Type":"application/json"}, ghHeaders()),
    body: JSON.stringify({ message:"Remove "+path, sha, branch:gh.branch })
  });
}
async function saveAll(){
  if (!dirty && !trash.length) return toast("Nothing to save");
  if (!gh.token){ openGh(); return; }
  const btn = $("#saveBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const todo = Object.keys(pending).filter(p=>!pending[p].done);
    for (let i=0;i<todo.length;i++){
      btn.textContent = `Picture ${i+1}/${todo.length}…`;
      await putFile(todo[i], await b64blob(pending[todo[i]].blob), "Add "+todo[i]);
      pending[todo[i]].done = true;   // keep showing the local copy until you reload
      await idbDel(todo[i]);          // it no longer needs to wait in the drawer
    }

    btn.textContent = "Saving…";
    DATA.updated = new Date().toISOString().slice(0,10);
    await putFile("data.json", b64text(JSON.stringify(DATA,null,1)+"\n"), "Update the journal");

    // Only once data.json no longer points at them: clear out removed pictures.
    const used = new Set();
    DATA.shows.forEach(x=>{
      if (x.poster) used.add(x.poster);
      (x.gallery||[]).forEach(g=>used.add(g.src));
    });
    const bin = trash.filter(p=>!used.has(p));
    for (let i=0;i<bin.length;i++){
      btn.textContent = `Tidying ${i+1}/${bin.length}…`;
      try { await deleteFile(bin[i]); } catch(e){}
    }
    trash = trash.filter(p=>used.has(p));
    saveTrash();

    dirty = false;
    localStorage.removeItem(DRAFT_KEY);
    updateSaveBar();
    toast(todo.length
      ? "Published — pictures take about a minute to show up for everyone else"
      : "Published — the site updates in about a minute");
    renderChrome(); renderView();
    if (openId) renderReader();
  } catch(err){
    toast(String(err.message).slice(0,140));
  } finally {
    btn.disabled = false; btn.textContent = "Save to GitHub";
  }
}

/* ── toast ──────────────────────────────────────────────────── */
let toastTimer = null;
function toast(msg){
  const t = $("#toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove("on"), 2600);
}
