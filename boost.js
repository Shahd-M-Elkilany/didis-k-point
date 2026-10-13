/* ═══════════════════════════════════════════════════════════════════
   Didi's K-point — the boost
   Everything that makes the journal quicker to keep and nicer to look at:

     · quick actions on every cover (edit mode) and a "Finished it" sheet
     · an episode counter for what you're watching
     · a Needs-attention tray and a fix-it-in-a-list sheet
     · keyboard shortcuts
     · three ways to see the library: grid, cover wall, board
     · clickable details, Continue watching, shareable filtered links,
       cards that glide when filters change
     · picks from your own watchlist and "because you loved…"
     · a diary heatmap, charts on The numbers, a radar on every scorecard
     · trailer previews, poster-coloured articles, title cards with faces

   Loads last. Borrows app.js's globals and enrich.js's window.KP.
   ═══════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const LAYOUT_KEY  = "kpoint.layout";
const PREVIEW_KEY = "kpoint.previews";
const COLOR_KEY   = "kpoint.colors";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

let layout = (()=>{ try { return localStorage.getItem(LAYOUT_KEY)||"grid"; } catch(e){ return "grid"; } })();
if (!["grid","wall","board"].includes(layout)) layout = "grid";
let previews = (()=>{ try { return localStorage.getItem(PREVIEW_KEY)!=="off"; } catch(e){ return true; } })();
state.need = "all";

const today = ()=>new Date().toISOString().slice(0,10);
const thisMonth = ()=>{ const n=new Date(); return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0"); };
const r1 = v=>Math.round(v*10)/10;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const KP = ()=>window.KP || null;
const faceOf = n=>{ const k = KP(); return k ? k.face(n) : ""; };
const initials = n=>String(n).split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase();

/* ═══ model helpers ═════════════════════════════════════════════ */
function epOf(s){
  const m = String(s.progress||"").match(/(\d+)/);
  return m ? parseInt(m[1],10) : 0;
}
function touch(s){ s.touched = today(); }
function setEp(s, n){
  const max = s.episodes || 999;
  n = clamp(n, 0, max);
  s.progress = n ? "ep "+n : undefined;
  if (s.status!=="S" && s.status!=="D" && n) s.status = "S";
  touch(s); markDirty();
  if (s.episodes && n>=s.episodes && s.status!=="W"){
    setTimeout(()=>{
      if (confirm("That's the last episode of "+s.title+". Mark it as watched?")) setStatus(s,"W");
    }, 30);
  }
}
function setStatus(s, k){
  if (!STATUS[k] || s.status===k) return;
  const was = s.status;
  s.status = k; touch(s);
  if (k==="W" && !s.watched) s.watched = thisMonth();
  if (k==="W" && s.episodes) s.progress = undefined;
  markDirty(); refresh();
  if (k==="W" && was!=="W") openFinish(s);
  else toast(s.title+" → "+STATUS[k].name);
}
/* One number for the whole show. If it's already been scored five ways,
   slide all five so their average lands on the new number. */
function quickScore(s, v){
  v = clamp(r1(v),0,5);
  if (Array.isArray(s.scores) && s.scores.some(x=>typeof x==="number")){
    const a = avgOf(s.scores), d = v - a;
    s.scores = s.scores.map(x=>typeof x==="number" ? clamp(r1(x+d),0,5) : v);
    delete s.myRate;
  } else {
    s.myRate = v;
  }
  touch(s); markDirty();
}
function refresh(){
  renderChrome();
  if (openId) renderReader(); else renderView();
}

/* ═══ sheets (same look as the rest of the site) ════════════════ */
function sheet(id, inner, wide){
  let el = document.getElementById(id);
  if (!el){
    el = document.createElement("div");
    el.className = "sheet kp"; el.id = id;
    el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true");
    document.body.appendChild(el);
    el.addEventListener("click", e=>{ if (e.target===el) closeKp(el); });
  }
  el.innerHTML = `<div class="sheet-card${wide?" kp-wide":""}">${inner}</div>`;
  el.classList.add("on");
  return el;
}
function closeKp(el){ if (typeof el==="string") el = document.getElementById(el); if (el) el.classList.remove("on"); }
document.addEventListener("keydown", e=>{
  if (e.key!=="Escape") return;
  const open = [...document.querySelectorAll(".sheet.kp.on, .kp-lightbox.on")].pop();
  if (open){ e.stopImmediatePropagation(); e.preventDefault(); open.classList.remove("on");
    if (open.classList.contains("kp-lightbox")) open.innerHTML = ""; }
}, true);

/* ═══ stars ═════════════════════════════════════════════════════ */
function starsHTML(v, attr, big){
  let out = `<span class="kstars${big?" big":""}" role="group" aria-label="Score">`;
  for (let i=1;i<=5;i++){
    const f = v==null ? 0 : clamp(v-(i-1),0,1);
    out += `<span class="ks" style="--f:${Math.round(f*100)}%">★
      <button type="button" ${attr}="${i-0.5}" aria-label="${i-0.5} out of 5"></button>
      <button type="button" ${attr}="${i}" aria-label="${i} out of 5"></button></span>`;
  }
  return out + `</span>`;
}

/* ═══ card pieces ═══════════════════════════════════════════════ */
const SHORT = {W:"✓", S:"▶", L:"+", U:"?", D:"✕"};
window.kp_quick = function(s){
  const ms = myScore(s);
  const dots = ORDER.map(k=>`<button type="button" class="qd ${STATUS[k].cls}" data-qs="${k}"
      aria-pressed="${s.status===k}" title="${esc(STATUS[k].name)} — ${esc(STATUS[k].hint)}"
      aria-label="${esc(STATUS[k].name)}">${SHORT[k]}</button>`).join("");
  const ep = epOf(s);
  return `<div class="qa" data-qid="${esc(s.id)}">
    <div class="qa-row">${dots}</div>
    <div class="qa-row">${starsHTML(ms,"data-qr")}${ms!=null?`<span class="qa-n">${ms}</span>`:""}</div>
    <div class="qa-row">
      ${s.status==="S"||s.status==="D"?`<button type="button" class="qb" data-qep="1" title="One more episode">+1 ep${ep?` <i>${ep}${s.episodes?"/"+s.episodes:""}</i>`:""}</button>`:""}
      ${s.status!=="W"?`<button type="button" class="qb gold" data-qfin title="Finished it — date, score, a line">✓ Finished</button>`
        :`<button type="button" class="qb" data-qfin title="Change the date, score or line">✎ Finished</button>`}
    </div>
  </div>`;
};
window.kp_cardExtra = function(s){
  if (s.status!=="S" && !(s.status==="D" && s.progress)) return "";
  const ep = epOf(s);
  if (!ep && !s.episodes) return "";
  const pct = s.episodes ? Math.round(ep/s.episodes*100) : 0;
  return `<span class="c-prog" title="${ep?"Episode "+ep:"Not started"}${s.episodes?" of "+s.episodes:""}">
    <i style="width:${pct}%"></i></span>`;
};
window.kp_coverExtra = function(s){
  if (mediaSrc(s.poster)) return "";
  const faces = (s.cast||[]).slice(0,3);
  const net = netsOf(s)[0];
  if (!faces.length && !net) return "";
  return `<div class="tc">
    ${net?`<span class="tc-net">${esc(net)}</span>`:""}
    ${faces.length?`<span class="tc-faces">${faces.map(n=>{
      const f = faceOf(n);
      return f ? `<img src="${esc(f)}" alt="" loading="lazy" title="${esc(n)}">`
               : `<span class="tc-init" title="${esc(n)}">${esc(initials(n))}</span>`;
    }).join("")}</span>`:""}
  </div>`;
};

/* quick-action clicks — caught before the card itself opens */
document.addEventListener("click", e=>{
  const qa = e.target.closest(".qa");
  const f  = e.target.closest("[data-f]");
  if (!qa && !f) return;
  e.stopPropagation(); e.preventDefault();
  if (f){ const [k,...v] = f.dataset.f.split(":"); filterBy(k, v.join(":"), !!f.closest("#reader")); return; }
  const s = get(qa.dataset.qid); if (!s) return;
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.qs){ setStatus(s, b.dataset.qs); return; }
  if (b.dataset.qr){ quickScore(s, parseFloat(b.dataset.qr)); refresh(); toast(s.title+" · "+myScore(s)+" / 5"); return; }
  if (b.hasAttribute("data-qep")){ setEp(s, epOf(s)+1); refresh(); toast(s.title+" · episode "+epOf(s)+(s.episodes?" of "+s.episodes:"")); return; }
  if (b.hasAttribute("data-qfin")){
    if (s.status!=="W"){ setStatus(s,"W"); } else openFinish(s);
  }
}, true);

/* ═══ the "Finished it" sheet ═══════════════════════════════════ */
function openFinish(s){
  const ms = myScore(s);
  const w = s.watched ? String(s.watched) : thisMonth();
  const hasMonth = w.includes("-");
  const hasReview = !!(s.review||"").trim();
  let score = ms;
  const el = sheet("finishSheet", `
    <div class="sec-h"><h2>Finished</h2><div class="rule"></div>
      <button class="x big" data-x type="button" aria-label="Close">×</button></div>
    <h3 class="fin-title">${esc(s.title)}</h3>
    <div class="fin-grid">
      <div class="field"><span class="label">When did you finish it?</span>
        <div class="row">
          <input type="month" id="finMonth" value="${hasMonth?esc(w):""}" ${hasMonth?"":"hidden"}>
          <input type="number" id="finYear" min="1990" max="2040" value="${esc(w.split("-")[0])}" ${hasMonth?"hidden":""}>
          <button class="btn ghost" id="finSwap" type="button">${hasMonth?"Only remember the year":"I know the month"}</button>
        </div></div>
      <div class="field"><span class="label">Your score</span>
        <div class="row">${starsHTML(ms,"data-fs",true)}<span class="fin-n" id="finN">${ms!=null?ms:"—"}</span></div>
        <span class="fine">${Array.isArray(s.scores)?"Your five marks move together to land on this. Fine-tune them on the page.":"Tap a star — half stars too. You can score it five ways later."}</span></div>
      ${hasReview?"":`<label class="field"><span class="label">One line on it (optional)</span>
        <input id="finLine" placeholder="Stayed for the chemistry, cried at episode 14…" maxlength="280"></label>`}
    </div>
    <div class="row" style="margin-top:20px">
      <button class="btn solid" id="finSave" type="button">Save</button>
      <button class="btn ghost" data-x2 type="button">Skip for now</button>
    </div>`);
  const $e = sel=>el.querySelector(sel);
  const paint = ()=>{
    el.querySelectorAll(".kstars .ks").forEach((st,i)=>{
      const f = score==null ? 0 : clamp(score-i,0,1);
      st.style.setProperty("--f", Math.round(f*100)+"%");
    });
    $e("#finN").textContent = score!=null ? score : "—";
  };
  el.querySelectorAll("[data-fs]").forEach(b=>b.onclick = ()=>{ score = parseFloat(b.dataset.fs); paint(); });
  $e("#finSwap").onclick = ()=>{
    const m = $e("#finMonth"), y = $e("#finYear");
    const toYear = !m.hidden;
    if (toYear){ y.value = (m.value||thisMonth()).split("-")[0]; }
    else { m.value = (y.value||thisYear())+"-"+String(new Date().getMonth()+1).padStart(2,"0"); }
    m.hidden = toYear; y.hidden = !toYear;
    $e("#finSwap").textContent = toYear ? "I know the month" : "Only remember the year";
  };
  const done = ()=>closeKp(el);
  el.querySelector("[data-x]").onclick = done;
  el.querySelector("[data-x2]").onclick = done;
  $e("#finSave").onclick = ()=>{
    const m = $e("#finMonth"), y = $e("#finYear");
    const when = !m.hidden ? m.value : (y.value ? String(parseInt(y.value,10)) : "");
    if (when) s.watched = when;
    if (score!=null && score!==ms) quickScore(s, score);
    const line = $e("#finLine");
    if (line && line.value.trim()) s.review = line.value.trim();
    if (s.status!=="W") s.status = "W";
    if (s.episodes) s.progress = undefined;
    touch(s); markDirty(); done(); refresh();
    toast(s.title+" — finished "+watchLabel(s.watched)+(myScore(s)!=null?" · "+myScore(s)+" / 5":""));
  };
  setTimeout(()=>{ const l = $e("#finLine"); if (l) l.focus(); }, 60);
}
window.kp_finish = openFinish;

/* ═══ filtering helpers ═════════════════════════════════════════ */
const SELS = {genre:"#genreSel", net:"#netSel", year:"#yearSel", watched:"#watchedSel",
              country:"#countrySel", band:"#bandSel", kind:"#kindSel", sort:"#sortSel"};
function syncControls(){
  Object.entries(SELS).forEach(([k,sel])=>{
    const el = $(sel); if (!el) return;
    if ([...el.options].some(o=>o.value===state[k])) el.value = state[k];
    else if (k!=="sort" && state[k]!=="all"){
      el.insertAdjacentHTML("beforeend", `<option value="${esc(state[k])}">${esc(state[k])}</option>`);
      el.value = state[k];
    }
  });
  const q = $("#q"); if (q && q.value!==state.q) q.value = state.q;
  $$("#statusChips .chip[data-st]").forEach(c=>c.setAttribute("aria-pressed", String(c.dataset.st===state.status)));
  const t = $("#todoChip"); if (t) t.setAttribute("aria-pressed", String(!!state.todo));
  const p = $("#pickChip"); if (p) p.setAttribute("aria-pressed", String(!!state.picks));
}
const LABELS = {genre:v=>v, net:v=>v, year:v=>"Released "+v, country:v=>countryName(v)||v,
  watched:v=>"Watched "+watchLabel(v), status:v=>(STATUS[v]||{}).name||v};
function filterBy(key, val, fresh){
  if (fresh || view!=="library" || openId){
    Object.assign(state,{q:"",status:"all",genre:"all",net:"all",year:"all",
      watched:"all",country:"all",band:"all",kind:"all",todo:false,picks:false,need:"all"});
  }
  if (key==="person"){ const k = KP(); if (k) k.openPerson(val); return; }
  state[key] = val;
  syncControls();
  if (openId){ openId = null; $("#reader").classList.remove("on"); document.body.style.overflow=""; }
  if (view!=="library"){ view = "library"; renderTabs(); }
  renderView();
  history.replaceState(null, "", queryHash());
  const c = $("#controls"); if (c) c.scrollIntoView({behavior: reduceMotion?"auto":"smooth", block:"start"});
  toast("Showing "+(LABELS[key]?LABELS[key](val):val)+" — tap × on the tag to clear it");
}
window.kpFilter = filterBy;

/* ═══ Needs attention ═══════════════════════════════════════════ */
const NEEDS = {
  poster:{label:"No poster",        test:s=>!mediaSrc(s.poster)},
  date:  {label:"Watched, no date", test:s=>s.status==="W" && !s.watched},
  score: {label:"Watched, no score",test:s=>s.status==="W" && myScore(s)==null},
  ep:    {label:"Watching, no episode", test:s=>s.status==="S" && !epOf(s)}
};
const _visible = visible;
visible = function(base){
  const list = _visible(base);
  return state.need!=="all" && NEEDS[state.need] ? list.filter(NEEDS[state.need].test) : list;
};
const _activeFilters = activeFilters;
activeFilters = function(){
  const out = _activeFilters();
  if (state.need!=="all" && NEEDS[state.need])
    out.push({label:NEEDS[state.need].label, off:()=>{ state.need = "all"; }});
  return out;
};
const _clearFilters = clearFilters;
clearFilters = function(){ state.need = "all"; _clearFilters(); };

function attentionStrip(){
  if (!editMode) return "";
  const counts = Object.entries(NEEDS).map(([k,n])=>[k,n,DATA.shows.filter(n.test).length]).filter(x=>x[2]);
  if (!counts.length) return `<div class="attn ok"><span class="label">Needs attention</span> Nothing — every show is complete.</div>`;
  return `<div class="attn">
    <span class="label">Needs attention</span>
    ${counts.map(([k,n,c])=>`<button type="button" class="chip${state.need===k?" on":""}" data-need="${k}"
        aria-pressed="${state.need===k}">${c} · ${esc(n.label)}</button>`).join("")}
    <button type="button" class="btn solid" data-fixlist>Fix in a list →</button>
  </div>`;
}
document.addEventListener("click", e=>{
  const n = e.target.closest("[data-need]");
  if (n){ state.need = state.need===n.dataset.need ? "all" : n.dataset.need; renderView(); return; }
  if (e.target.closest("[data-fixlist]")) openFixList();
});

let fixTab = "poster";
function openFixList(tab){
  if (tab) fixTab = tab;
  const list = DATA.shows.filter(NEEDS[fixTab].test)
    .sort((a,b)=>(b.year||0)-(a.year||0) || a.title.localeCompare(b.title));
  const k = KP();
  const thumb = s=>{ const p = mediaSrc(s.poster);
    return p ? `<img class="fx-th" src="${esc(p)}" alt="">` : `<span class="fx-th none">${esc(initials(s.title))}</span>`; };
  const row = s=>{
    let ctl = "";
    if (fixTab==="poster") ctl = `
      <button class="btn ghost" data-fxup="${esc(s.id)}" type="button">Upload</button>
      ${k&&k.hasTmdb()?`<button class="btn ghost" data-fxfind="${esc(s.id)}" type="button">⚡ Find</button>`:""}`;
    if (fixTab==="date") ctl = `<input type="month" data-fxdate="${esc(s.id)}" aria-label="Month you finished ${esc(s.title)}">
      <button class="btn ghost" data-fxyear="${esc(s.id)}" type="button" title="Just the year">${thisYear()}</button>`;
    if (fixTab==="score") ctl = starsHTML(null, "data-fxs");
    if (fixTab==="ep") ctl = `<label class="fx-ep">ep <input type="number" min="0" max="${s.episodes||999}" data-fxep="${esc(s.id)}" value="${epOf(s)||""}" placeholder="0"></label>
      <span class="mono dim">of</span>
      <label class="fx-ep"><input type="number" min="1" max="999" data-fxtot="${esc(s.id)}" value="${s.episodes||""}" placeholder="?"></label>`;
    return `<div class="fx-row" data-fxrow="${esc(s.id)}">${thumb(s)}
      <button type="button" class="fx-name" data-open="${esc(s.id)}">${esc(s.title)}<em>${s.year||""}${s.network?" · "+esc(netsOf(s)[0]):""}</em></button>
      <span class="fx-ctl">${ctl}</span></div>`;
  };
  const el = sheet("fixSheet", `
    <div class="sec-h"><h2>Fix in a list</h2><div class="rule"></div>
      <button class="x big" data-x type="button" aria-label="Close">×</button></div>
    <div class="chips fx-tabs">${Object.entries(NEEDS).map(([key,n])=>{
      const c = DATA.shows.filter(n.test).length;
      return `<button type="button" class="chip" data-fxtab="${key}" aria-pressed="${fixTab===key}">${esc(n.label)} · ${c}</button>`;
    }).join("")}</div>
    ${fixTab==="poster"&&list.length?`<div class="row" style="margin:14px 0 4px">
      ${k&&k.hasTmdb()
        ? `<button class="btn solid" data-fxall type="button">⚡ Find all ${list.length} on TMDB</button>
           <span class="fine">Exact matches fill themselves in; anything unclear asks you.</span>`
        : `<button class="btn" data-fxkeys type="button">Add a TMDB key to find posters automatically</button>`}
    </div>`:""}
    <p class="fine" style="margin-top:10px">${list.length
      ? {poster:"Upload one, or let TMDB look.", date:"Pick the month — it saves as you go.",
         score:"Tap a star. Changes save as you go.", ep:"Type how far you got, and the total if it's missing."}[fixTab]
      : "Nothing left here."}</p>
    <div class="fx-list">${list.map(row).join("")}</div>`, true);

  el.querySelector("[data-x]").onclick = ()=>closeKp(el);
  el.querySelectorAll("[data-fxtab]").forEach(b=>b.onclick = ()=>openFixList(b.dataset.fxtab));
  const done = (s, msg)=>{
    markDirty(); renderChrome();
    const r = el.querySelector(`[data-fxrow="${CSS.escape(s.id)}"]`);
    if (r){ r.classList.add("fx-done"); setTimeout(()=>r.remove(), 450); }
    if (msg) toast(msg);
    if (!openId) renderView();
  };
  const fa = el.querySelector("[data-fxall]"); if (fa) fa.onclick = ()=>{ closeKp(el); k.batch(list); };
  const fk = el.querySelector("[data-fxkeys]"); if (fk) fk.onclick = ()=>{ closeKp(el); k && k.openKeys(); };
  el.querySelectorAll("[data-fxup]").forEach(b=>b.onclick = ()=>{
    const s = get(b.dataset.fxup);
    pickFiles("image/*", false, f=>{
      if (tooBig(f[0])) return;
      forgetImage(s.poster); s.poster = queueImage(s.id, f[0]);
      done(s, "Poster set for "+s.title);
    });
  });
  el.querySelectorAll("[data-fxfind]").forEach(b=>b.onclick = async ()=>{
    const s = get(b.dataset.fxfind);
    b.disabled = true; b.textContent = "Looking…";
    try {
      const r = await k.fetchOne(s, true);
      if (r.status==="filled") done(s, s.title+": "+(r.fields.join(", ")||"nothing missing"));
      else { b.disabled = false; b.textContent = "⚡ Find"; }
    } catch(err){ toast(String(err.message).slice(0,120)); b.disabled=false; b.textContent="⚡ Find"; }
  });
  el.querySelectorAll("[data-fxdate]").forEach(i=>i.onchange = ()=>{
    const s = get(i.dataset.fxdate); if (!i.value) return;
    s.watched = i.value; done(s, s.title+" — "+watchLabel(s.watched));
  });
  el.querySelectorAll("[data-fxyear]").forEach(b=>b.onclick = ()=>{
    const s = get(b.dataset.fxyear); s.watched = String(thisYear()); done(s, s.title+" — "+thisYear());
  });
  el.querySelectorAll("[data-fxs]").forEach(b=>b.onclick = ()=>{
    const s = get(b.closest("[data-fxrow]").dataset.fxrow);
    quickScore(s, parseFloat(b.dataset.fxs));
    done(s, s.title+" · "+myScore(s)+" / 5");
  });
  el.querySelectorAll(".fx-name").forEach(b=>b.addEventListener("click", ()=>closeKp(el)));
  el.querySelectorAll("[data-fxtot]").forEach(i=>i.onchange = ()=>{
    const s = get(i.dataset.fxtot); const v = parseInt(i.value,10);
    s.episodes = v>0 ? v : undefined; markDirty();
  });
  el.querySelectorAll("[data-fxep]").forEach(i=>i.onchange = ()=>{
    const s = get(i.dataset.fxep); const v = parseInt(i.value,10);
    if (v>0){ setEp(s, v); done(s, s.title+" · episode "+epOf(s)); }
  });
}
window.kpFixList = openFixList;

/* ═══ keyboard shortcuts ════════════════════════════════════════ */
function neighbours(){
  const list = visible();
  const i = list.findIndex(s=>s.id===openId);
  return { prev: i>0 ? list[i-1] : null, next: i>=0 && i<list.length-1 ? list[i+1] : null };
}
function needEdit(){ if (!editMode){ toast("Press E for edit mode first"); return true; } return false; }
document.addEventListener("keydown", e=>{
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (typingInField()) return;
  if (document.querySelector(".sheet.on")) return;
  const k = e.key;
  if (k==="/"){ e.preventDefault();
    if (openId) closeShow();
    if (view!=="library" && view!=="next") go("library");
    setTimeout(()=>{ const q = $("#q"); if (q){ q.focus(); q.select(); } }, 60); return; }
  if (k==="?"){ e.preventDefault(); openHelp(); return; }
  if (!openId){
    if (k==="v" && view==="library"){ setLayout(layout==="grid"?"wall":layout==="wall"?"board":"grid"); return; }
    return;
  }
  const s = get(openId); if (!s) return;
  if ((k==="ArrowRight" || k==="ArrowLeft") && !(e.target.closest && e.target.closest("[role=slider]"))){
    const n = neighbours()[k==="ArrowRight"?"next":"prev"];
    if (n){ e.preventDefault(); go("show/"+n.id); }
    return;
  }
  if (/^[0-5]$/.test(k)){ if (needEdit()) return;
    quickScore(s, parseInt(k,10)); refresh(); toast(s.title+" · "+myScore(s)+" / 5"); return; }
  const stKey = {w:"W", s:"S", l:"L", u:"U", d:"D"}[k.toLowerCase()];
  if (stKey){ if (needEdit()) return; setStatus(s, stKey); return; }
  if (k==="f"||k==="F"){ if (needEdit()) return; if (s.status!=="W") setStatus(s,"W"); else openFinish(s); return; }
  if (k==="+"||k==="="){ if (needEdit()) return; setEp(s, epOf(s)+1); refresh();
    toast("Episode "+epOf(s)+(s.episodes?" of "+s.episodes:"")); return; }
  if (k==="t"||k==="T"){ playTrailer(s); return; }
});
function openHelp(){
  const rows = [
    ["Anywhere", [["/","Search"],["?","These shortcuts"],["E","Edit mode on / off"],["Ctrl S","Save to GitHub"],["Esc","Close"]]],
    ["The library", [["V","Switch grid · wall · board"]]],
    ["An open show", [["← →","Previous / next show in your current list"],["1 – 5","Score it (edit mode)"],
      ["W S L U D","Watched · Watching · Watchlist · Unsure · Dropped (edit mode)"],
      ["F","Finished it"],["+","One more episode"],["T","Play the trailer"]]]
  ];
  const el = sheet("helpSheet", `
    <div class="sec-h"><h2>Keyboard shortcuts</h2><div class="rule"></div>
      <button class="x big" data-x type="button" aria-label="Close">×</button></div>
    ${rows.map(([h,list])=>`<div class="keys"><span class="label">${h}</span>
      ${list.map(([a,b])=>`<div class="krow"><kbd>${esc(a)}</kbd><span>${esc(b)}</span></div>`).join("")}</div>`).join("")}`);
  el.querySelector("[data-x]").onclick = ()=>closeKp(el);
}

/* ═══ layouts: grid · wall · board ══════════════════════════════ */
function setLayout(l){
  layout = l;
  try { localStorage.setItem(LAYOUT_KEY, l); } catch(e){}
  renderView();
}
function switcher(){
  return `<span class="lay-switch" role="group" aria-label="Layout">
    ${[["grid","Grid"],["wall","Cover wall"],["board","Board"]].map(([k,n])=>
      `<button type="button" data-layout="${k}" aria-pressed="${layout===k}">${n}</button>`).join("")}
    ${canHover?`<button type="button" class="prev-t" data-previews aria-pressed="${previews}"
      title="Play a muted trailer when you rest on a cover">▶ Previews ${previews?"on":"off"}</button>`:""}
  </span>`;
}
document.addEventListener("click", e=>{
  const b = e.target.closest("[data-layout]");
  if (b){ setLayout(b.dataset.layout); return; }
  const p = e.target.closest("[data-previews]");
  if (p){ previews = !previews; try { localStorage.setItem(PREVIEW_KEY, previews?"on":"off"); } catch(e){}
    renderView(); toast(previews ? "Trailer previews on" : "Trailer previews off"); }
});

function wallHTML(list){
  return `<div class="wall">${list.map(s=>{
    const p = mediaSrc(s.poster), ms = myScore(s), st = STATUS[s.status]||STATUS.L;
    const [bg] = INK_PAIRS[hash(s.id)%INK_PAIRS.length];
    return `<div class="wtile" data-id="${esc(s.id)}" tabindex="0" role="button" draggable="true"
        style="--bg:${bg}" aria-label="${esc(s.title)}">
      ${p ? imgTag(s.poster,"","") : `<span class="w-ttl">${esc(s.title)}</span>`}
      <span class="w-info"><b>${esc(s.title)}</b><span>${s.year||""} · ${esc(st.name)}${ms!=null?` · ${ms}`:""}</span></span>
      <span class="w-dot" style="background:${st.color}"></span>
    </div>`;
  }).join("")}</div>`;
}
function boardHTML(list){
  const by = {}; ORDER.forEach(k=>by[k]=[]);
  list.forEach(s=>{ (by[s.status]||by.L).push(s); });
  return `<div class="board">${ORDER.map(k=>{
    const st = STATUS[k];
    return `<section class="bcol" data-col="${k}" style="--c:${st.color}">
      <header><b>${st.name}</b><span class="mono">${by[k].length}</span><em>${esc(st.hint)}</em></header>
      <div class="blist">${by[k].slice(0,250).map(s=>{
        const p = mediaSrc(s.poster), ms = myScore(s), ep = epOf(s);
        const pct = s.episodes&&ep ? Math.round(ep/s.episodes*100) : 0;
        return `<div class="bcard" data-id="${esc(s.id)}" tabindex="0" role="button" draggable="true">
          ${p?`<img src="${esc(p)}" alt="" loading="lazy">`:`<span class="bth" style="background:${INK_PAIRS[hash(s.id)%INK_PAIRS.length][0]}">${esc(initials(s.title))}</span>`}
          <span class="bmeta"><b>${esc(s.title)}</b>
            <span class="mono">${s.year||""}${ms!=null?" · "+ms+"★":""}${ep?" · ep "+ep+(s.episodes?"/"+s.episodes:""):""}${k==="W"&&s.watched?" · "+esc(watchLabel(s.watched)):""}</span>
            ${pct?`<span class="c-prog"><i style="width:${pct}%"></i></span>`:""}</span>
        </div>`;
      }).join("")}${by[k].length>250?`<p class="fine">…and ${by[k].length-250} more. Narrow it with a filter.</p>`:""}</div>
    </section>`;
  }).join("")}</div>`;
}
/* dragging between columns */
let boardDrag = null;
document.addEventListener("dragstart", e=>{
  const c = e.target.closest && e.target.closest(".bcard");
  boardDrag = c ? c.dataset.id : null;
  if (c) c.classList.add("lifting");
}, true);
document.addEventListener("dragend", ()=>{
  boardDrag = null;
  $$(".bcol.over").forEach(c=>c.classList.remove("over"));
  $$(".bcard.lifting").forEach(c=>c.classList.remove("lifting"));
}, true);
document.addEventListener("dragover", e=>{
  if (!boardDrag) return;
  const col = e.target.closest && e.target.closest(".bcol"); if (!col) return;
  e.preventDefault();
  $$(".bcol.over").forEach(c=>{ if (c!==col) c.classList.remove("over"); });
  col.classList.add("over");
});
document.addEventListener("drop", e=>{
  if (!boardDrag) return;
  const col = e.target.closest && e.target.closest(".bcol"); if (!col) return;
  e.preventDefault();
  const s = get(boardDrag); boardDrag = null;
  col.classList.remove("over");
  if (!s || s.status===col.dataset.col) return;
  if (!editMode){ toast("Press E for edit mode, then drag"); return; }
  const to = col.dataset.col;
  /* re-render after the browser has finished the drag, not during it */
  setTimeout(()=>setStatus(s, to), 40);
});

/* ═══ Continue watching ═════════════════════════════════════════ */
function continueRow(){
  const list = DATA.shows.filter(s=>s.status==="S")
    .sort((a,b)=>String(b.touched||"").localeCompare(String(a.touched||""))
      || (epOf(b)/(b.episodes||99)) - (epOf(a)/(a.episodes||99)) || a.title.localeCompare(b.title));
  if (!list.length) return "";
  return `<div class="gridfull cont">
    <div class="sec-h"><h2>Continue watching</h2><div class="rule"></div><span class="label">${list.length}</span></div>
    <div class="cont-row">${list.map(s=>{
      const p = mediaSrc(s.poster), ep = epOf(s);
      const pct = s.episodes&&ep ? Math.round(ep/s.episodes*100) : 0;
      const [bg] = INK_PAIRS[hash(s.id)%INK_PAIRS.length];
      return `<div class="cw" data-id="${esc(s.id)}" tabindex="0" role="button">
        ${p?`<img src="${esc(p)}" alt="" loading="lazy">`:`<span class="cw-th" style="background:${bg}">${esc(initials(s.title))}</span>`}
        <span class="cw-meta"><b>${esc(s.title)}</b>
          <span class="mono">${ep?"Episode "+ep+(s.episodes?" of "+s.episodes:""):"Not started"+(s.episodes?" · "+s.episodes+" eps":"")}</span>
          <span class="c-prog"><i style="width:${pct}%"></i></span>
          <span class="qa cw-acts" data-qid="${esc(s.id)}">
            <button type="button" class="qb" data-qep="1">+1 ep</button>
            <button type="button" class="qb gold" data-qfin>✓ Finished</button></span>
        </span></div>`;
    }).join("")}</div></div>`;
}

/* ═══ library render: layouts, strips, gliding cards ════════════ */
const _renderGrid = renderGrid;
renderGrid = function(){
  const grid = $("#grid");
  const before = (!reduceMotion && layout==="grid") ? snapshot() : null;
  grid.classList.toggle("as-wall", layout==="wall");
  grid.classList.toggle("as-board", layout==="board");
  const plain = activeFilters().length===0 && !state.q.trim();

  if (layout==="grid"){
    _renderGrid();
    const top = attentionStrip() + (plain ? continueRow() : "");
    if (top) grid.insertAdjacentHTML("afterbegin", `<div class="gridfull">${top}</div>`);
  } else {
    const list = visible();
    $("#countLine").innerHTML =
      `<span class="big">${list.length}</span><span class="label">of ${DATA.shows.length} titles shown</span>`;
    grid.innerHTML = attentionStrip() +
      (list.length ? (layout==="wall" ? wallHTML(list) : boardHTML(list))
                   : `<p class="empty">Nothing matches that. Try clearing a filter.</p>`);
    if (layout==="board" && !editMode)
      grid.insertAdjacentHTML("afterbegin", `<p class="fine board-hint">Press <b>E</b> for edit mode, then drag a show to another column to change where you're at with it.</p>`);
  }
  $("#countLine").insertAdjacentHTML("beforeend", switcher());
  if (before) glide(before);
};
function snapshot(){
  const m = new Map();
  $$("#grid > .card[data-id]").forEach(c=>m.set(c.dataset.id, c.getBoundingClientRect()));
  return m;
}
function glide(before){
  const cards = $$("#grid > .card[data-id]");
  if (cards.length>220 || !before.size) return;
  cards.forEach(c=>{
    const old = before.get(c.dataset.id), now = c.getBoundingClientRect();
    if (old){
      const dx = old.left-now.left, dy = old.top-now.top;
      if (!dx && !dy) return;
      c.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:"none"}],
        {duration:380, easing:"cubic-bezier(.2,.7,.2,1)"});
    } else {
      c.animate([{opacity:0, transform:"scale(.94)"},{opacity:1, transform:"none"}],
        {duration:300, easing:"ease-out"});
    }
  });
}

/* ═══ shareable links ═══════════════════════════════════════════ */
const QKEYS = ["q","status","genre","net","year","watched","country","band","kind","need","sort"];
let lastListHash = "";
function queryHash(){
  const p = new URLSearchParams();
  QKEYS.forEach(k=>{
    const v = state[k];
    if (k==="sort" ? v && v!=="year" : (k==="q" ? v && v.trim() : v && v!=="all")) p.set(k, v);
  });
  if (state.todo) p.set("todo","1");
  if (state.picks) p.set("picks","1");
  if (view==="library" && layout!=="grid") p.set("layout", layout);
  const qs = p.toString();
  return "#/"+view+(qs?"?"+qs:"");
}
window.kp_fromQuery = function(qs){
  const p = new URLSearchParams(qs||"");
  if (!qs){ lastListHash = ""; return; }
  Object.assign(state,{q:"",status:"all",genre:"all",net:"all",year:"all",
    watched:"all",country:"all",band:"all",kind:"all",todo:false,picks:false,need:"all",sort:"year"});
  QKEYS.forEach(k=>{ if (p.has(k)) state[k] = p.get(k); });
  state.todo = p.get("todo")==="1"; state.picks = p.get("picks")==="1";
  if (p.has("layout") && ["grid","wall","board"].includes(p.get("layout"))) layout = p.get("layout");
  syncControls();
};
window.kp_backHash = ()=>lastListHash;
const _renderView = renderView;
renderView = function(){
  _renderView.apply(this, arguments);
  if (openId) return;
  const h = queryHash();
  lastListHash = h;
  const cur = location.hash || "";
  const sameView = cur.split("?")[0]==="#/"+view || (!cur && view==="library");
  if (sameView && cur!==h && (h.includes("?") || cur.includes("?"))) history.replaceState(null, "", h);
};

/* ═══ trailer previews on covers ════════════════════════════════ */
let hoverTimer = null, hoverEl = null;
function trailerId(s){
  const v = (s.videos||[]).find(v=>ytId(v.url));
  return v ? ytId(v.url) : null;
}
function stopPreview(){
  clearTimeout(hoverTimer); hoverTimer = null;
  if (hoverEl){ const t = hoverEl.querySelector(".tprev"); if (t) t.remove(); hoverEl = null; }
}
if (canHover){
  document.addEventListener("mouseover", e=>{
    if (!previews || editMode || openId) return;
    const cover = e.target.closest && e.target.closest("#grid .card > .cover, #grid .wtile");
    if (!cover || cover===hoverEl) return;
    stopPreview();
    const card = cover.closest("[data-id]"); const s = card && get(card.dataset.id);
    const id = s && trailerId(s); if (!id) return;
    hoverEl = cover;
    hoverTimer = setTimeout(()=>{
      if (hoverEl!==cover) return;
      cover.insertAdjacentHTML("beforeend", `<div class="tprev"><iframe tabindex="-1" title=""
        src="https://www.youtube-nocookie.com/embed/${esc(id)}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${esc(id)}&rel=0&modestbranding=1&iv_load_policy=3"
        allow="autoplay; encrypted-media"></iframe></div>`);
    }, 750);
  });
  document.addEventListener("mouseout", e=>{
    if (!hoverEl) return;
    const to = e.relatedTarget;
    if (to && hoverEl.contains(to)) return;
    if (e.target.closest && e.target.closest("#grid .card > .cover, #grid .wtile")===hoverEl) stopPreview();
  });
  window.addEventListener("scroll", ()=>{ if (hoverEl) stopPreview(); }, {passive:true});
}

/* ═══ article extras ════════════════════════════════════════════ */
function playTrailer(s){
  const id = trailerId(s);
  if (!id) return toast("No trailer saved for this one yet");
  let lb = document.getElementById("kpLightbox");
  if (!lb){
    lb = document.createElement("div"); lb.id = "kpLightbox"; lb.className = "kp-lightbox";
    document.body.appendChild(lb);
    lb.addEventListener("click", e=>{ if (e.target===lb || e.target.closest("[data-lbx]")){ lb.classList.remove("on"); lb.innerHTML=""; }});
  }
  lb.innerHTML = `<div class="lb-in"><button class="x big" data-lbx type="button" aria-label="Close">×</button>
    <div class="vembed"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}?autoplay=1&rel=0"
      title="${esc(s.title)} trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe></div></div>`;
  lb.classList.add("on");
}

/* colour from the poster */
let colorCache = {};
try { colorCache = JSON.parse(localStorage.getItem(COLOR_KEY)||"{}") || {}; } catch(e){}
function posterColor(src){
  if (colorCache[src]) return Promise.resolve(colorCache[src]);
  return new Promise(res=>{
    const im = new Image();
    if (/^https?:/.test(src) && !src.startsWith(location.origin)) im.crossOrigin = "anonymous";
    im.onload = ()=>{
      try {
        const c = document.createElement("canvas"); c.width = c.height = 36;
        const x = c.getContext("2d", {willReadFrequently:true});
        x.drawImage(im, 0, 0, 36, 36);
        const d = x.getImageData(0,0,36,36).data;
        const buckets = {};
        for (let i=0;i<d.length;i+=4){
          const [r,g,b] = [d[i],d[i+1],d[i+2]];
          const mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/510, sat = mx ? (mx-mn)/mx : 0;
          if (l<.12 || l>.88) continue;
          const key = (r>>5)+","+(g>>5)+","+(b>>5);
          const bk = buckets[key] || (buckets[key] = {n:0,r:0,g:0,b:0,s:0});
          bk.n++; bk.r+=r; bk.g+=g; bk.b+=b; bk.s+=sat;
        }
        let best = null, bestScore = -1;
        Object.values(buckets).forEach(bk=>{
          const sc = bk.n * (0.35 + bk.s/bk.n);
          if (sc>bestScore){ bestScore = sc; best = bk; }
        });
        if (!best) return res(null);
        const hex = "#"+[best.r,best.g,best.b].map(v=>Math.round(v/best.n).toString(16).padStart(2,"0")).join("");
        colorCache[src] = hex;
        try { localStorage.setItem(COLOR_KEY, JSON.stringify(colorCache)); } catch(e){}
        res(hex);
      } catch(e){ res(null); }
    };
    im.onerror = ()=>res(null);
    im.src = src;
  });
}
function shade(hex, f){
  const n = parseInt(hex.slice(1),16);
  const c = [n>>16&255, n>>8&255, n&255].map(v=>Math.round(f<0 ? v*(1+f) : v+(255-v)*f));
  return "#"+c.map(v=>v.toString(16).padStart(2,"0")).join("");
}

/* radar */
function radarSVG(series, size){
  const n = CRITERIA.length, R = size/2 - 40, cx = size/2, cy = size/2;
  const pt = (i,v)=>{ const a = -Math.PI/2 + i*2*Math.PI/n;
    return [cx + Math.cos(a)*R*v/5, cy + Math.sin(a)*R*v/5]; };
  const ring = v=>CRITERIA.map((c,i)=>pt(i,v).join(",")).join(" ");
  return `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="Scores on five criteria">
    ${[1,2,3,4,5].map(v=>`<polygon points="${ring(v)}" class="r-ring${v===5?" outer":""}"/>`).join("")}
    ${CRITERIA.map((c,i)=>{ const [x,y] = pt(i,5); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="r-spoke"/>`; }).join("")}
    ${series.map(sr=>`<polygon points="${sr.v.map((v,i)=>pt(i,v||0).join(",")).join(" ")}"
        style="fill:${sr.c};stroke:${sr.c}" class="r-shape"/>
      ${sr.v.map((v,i)=>{ const [x,y]=pt(i,v||0); return `<circle cx="${x}" cy="${y}" r="3" style="fill:${sr.c}"><title>${esc(sr.name)} · ${CRITERIA[i][1]} ${v!=null?v.toFixed(1):"—"}</title></circle>`; }).join("")}`).join("")}
    ${CRITERIA.map((c,i)=>{ const [x,y] = pt(i,6.35);
      return `<text x="${x}" y="${y}" class="r-lab" text-anchor="middle" dominant-baseline="middle">${esc(c[1].replace(" on me",""))}</text>`; }).join("")}
  </svg>`;
}

const _renderReaderB = renderReader;
renderReader = function(){
  _renderReaderB.apply(this, arguments);
  const s = get(openId); if (!s) return;
  try { decorateArticle2(s); } catch(e){ console.warn(e); }
};
function decorateArticle2(s){
  const r = $("#reader");
  const hero = r.querySelector(".r-hero");

  // clickable facts (not while editing — those fields are being typed in)
  if (hero && !editMode){
    const kick = hero.querySelector(".r-kicker");
    if (kick && genresOf(s).length)
      kick.innerHTML = genresOf(s).map(g=>`<button type="button" class="tag-f" data-f="genre:${esc(g)}">${esc(g)}</button>`).join(" · ");
    hero.querySelectorAll(".r-facts .fact").forEach(f=>{
      const t = f.textContent.trim();
      let key = null, val = null;
      if (String(s.year)===t){ key="year"; val=t; }
      else if (s.country && countryName(s.country)===t){ key="country"; val=s.country; }
      else if (netsOf(s).length && s.network===t){
        f.outerHTML = netsOf(s).map(n=>`<button type="button" class="fact tag-f" data-f="net:${esc(n)}">${esc(n)}</button>`).join("");
        return;
      }
      else if (s.watched && t==="Watched "+watchLabel(s.watched)){ key="watched"; val=String(s.watched); }
      if (key){ f.outerHTML = `<button type="button" class="fact tag-f" data-f="${key}:${esc(val)}">${esc(t)}</button>`; }
    });
  }

  // trailer + finished + episode buttons in the hero
  if (hero && !hero.querySelector(".hero-acts")){
    const tid = trailerId(s), ep = epOf(s);
    const acts = [];
    if (tid) acts.push(`<button type="button" class="hero-btn" data-trailer>▶ Watch the trailer</button>`);
    if (editMode && (s.status==="S"||s.status==="D")) acts.push(`<span class="qa hero-qa" data-qid="${esc(s.id)}">
      <button type="button" class="hero-btn" data-qep="1">+1 episode${ep?` · now ${ep}${s.episodes?"/"+s.episodes:""}`:""}</button></span>`);
    if (editMode) acts.push(`<span class="qa hero-qa" data-qid="${esc(s.id)}">
      <button type="button" class="hero-btn" data-qfin>${s.status==="W"?"✎ Finished — date & score":"✓ I finished it"}</button></span>`);
    if (acts.length) hero.insertAdjacentHTML("beforeend", `<div class="hero-acts">${acts.join("")}</div>`);
    if (s.status==="S" && s.episodes){
      const pct = Math.round(epOf(s)/s.episodes*100);
      hero.insertAdjacentHTML("beforeend", `<div class="hero-prog" title="${pct}% through"><i style="width:${pct}%"></i></div>`);
    }
    const tb = hero.querySelector("[data-trailer]"); if (tb) tb.onclick = ()=>playTrailer(s);
  }

  // prev / next
  const bar = r.querySelector(".r-bar-in");
  if (bar && !bar.querySelector(".nav-pn")){
    const {prev, next} = neighbours();
    bar.insertAdjacentHTML("beforeend", `<span class="nav-pn">
      <button class="btn ghost" type="button" ${prev?`data-open="${esc(prev.id)}" title="${esc(prev.title)}"`:"disabled"}>‹</button>
      <button class="btn ghost" type="button" ${next?`data-open="${esc(next.id)}" title="${esc(next.title)}"`:"disabled"}>›</button></span>`);
  }

  // radar beside the scorecard
  const v = Array.isArray(s.scores) ? s.scores : null;
  const scoresBox = r.querySelector(".scores");
  if (v && v.filter(x=>typeof x==="number").length>=3 && scoresBox && !r.querySelector(".radar-wrap")){
    scoresBox.insertAdjacentHTML("afterend", `<div class="radar-wrap">${radarSVG([{name:s.title, v, c:"var(--acc, var(--pink))"}], 280)}</div>`);
  }

  // colour from the poster
  const src = mediaSrc(s.poster);
  r.style.removeProperty("--acc"); r.style.removeProperty("--acc-d");
  if (src) posterColor(src).then(hex=>{
    if (!hex || openId!==s.id) return;
    r.style.setProperty("--acc", shade(hex, -0.12));
    r.style.setProperty("--acc-d", shade(hex, -0.72));
    r.style.setProperty("--acc-l", shade(hex, 0.55));
    r.classList.add("tinted");
  });
  else r.classList.remove("tinted");
}

/* ═══ diary heatmap ═════════════════════════════════════════════ */
const _renderDiary = renderDiary;
renderDiary = function(){
  _renderDiary.apply(this, arguments);
  const logged = DATA.shows.filter(s=>s.watched);
  if (!logged.length) return;
  const grid = {};
  logged.forEach(s=>{
    const [y,m] = String(s.watched).split("-");
    grid[y] = grid[y] || {};
    const k = m || "yr";
    grid[y][k] = (grid[y][k]||0)+1;
  });
  const years = Object.keys(grid).sort().reverse();
  const max = Math.max(...years.flatMap(y=>Object.entries(grid[y]).filter(([k])=>k!=="yr").map(([,v])=>v)), 1);
  let busiest = null;
  years.forEach(y=>Object.entries(grid[y]).forEach(([m,n])=>{ if (m!=="yr" && (!busiest || n>busiest.n)) busiest = {y,m,n}; }));
  const html = `<section class="sec heat">
    <div class="sec-h"><h2>Your year in dramas</h2><div class="rule"></div>
      ${busiest?`<span class="label">Busiest · ${MONTHS[+busiest.m-1]} ${busiest.y} · ${busiest.n}</span>`:""}</div>
    <div class="hm">
      <span></span>${MONTHS.map(m=>`<span class="hm-m">${m.slice(0,3)}</span>`).join("")}<span class="hm-m">Undated month</span>
      ${years.map(y=>`<span class="hm-y">${y}</span>${MONTHS.map((m,i)=>{
        const k = String(i+1).padStart(2,"0"), n = grid[y][k]||0;
        return `<button type="button" class="hm-c" style="--a:${n?(0.18+0.82*n/max).toFixed(2):0}"
          ${n?`data-f="watched:${y}-${k}"`:"disabled"} title="${m} ${y}: ${n} finished">${n||""}</button>`;
      }).join("")}<button type="button" class="hm-c yr" ${grid[y].yr?`data-f="watched:${y}"`:"disabled"}
          title="${y}, month not set: ${grid[y].yr||0}">${grid[y].yr||""}</button>`).join("")}
    </div>
    <p class="fine" style="margin-top:10px">Darker means more finished. Tap a month to see those shows.</p>
  </section>`;
  const head = $("#page .pagehead");
  if (head) head.insertAdjacentHTML("afterend", html);
};

/* ═══ charts on The numbers ═════════════════════════════════════ */
function donutSVG(parts, size){
  const total = parts.reduce((a,p)=>a+p.v,0) || 1;
  const R = size/2-6, r = R*0.6, cx = size/2, cy = size/2;
  let a0 = -Math.PI/2;
  const arc = (a1,a2)=>{
    const lg = a2-a1>Math.PI ? 1 : 0;
    const p = (rad,ang)=>[cx+Math.cos(ang)*rad, cy+Math.sin(ang)*rad];
    const [x1,y1]=p(R,a1),[x2,y2]=p(R,a2),[x3,y3]=p(r,a2),[x4,y4]=p(r,a1);
    return `M${x1},${y1} A${R},${R} 0 ${lg} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${lg} 0 ${x4},${y4}Z`;
  };
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="Library by status">
    ${parts.filter(p=>p.v).map(p=>{
      const a1 = a0, a2 = a0 + p.v/total*2*Math.PI - 0.012; a0 += p.v/total*2*Math.PI;
      return `<path d="${arc(a1,Math.max(a1+0.01,a2))}" style="fill:${p.c}" class="d-seg" data-stat="${p.k}">
        <title>${esc(p.n)} · ${p.v} (${Math.round(p.v/total*100)}%)</title></path>`;
    }).join("")}
    <text x="${cx}" y="${cy-6}" text-anchor="middle" class="d-n">${total}</text>
    <text x="${cx}" y="${cy+16}" text-anchor="middle" class="d-k">titles</text>
  </svg>`;
}
const _renderNumbers = renderNumbers;
renderNumbers = function(){
  _renderNumbers.apply(this, arguments);
  const page = $("#page");
  const all = DATA.shows;
  const c = {}; ORDER.forEach(k=>c[k]=all.filter(s=>s.status===k).length);
  const parts = ORDER.map(k=>({k, v:c[k], c:STATUS[k].color, n:STATUS[k].name}));

  // donut after the tiles
  const tiles = page.querySelector(".tiles");
  if (tiles) tiles.insertAdjacentHTML("afterend", `<section class="sec">
    <div class="sec-h"><h2>Where everything stands</h2><div class="rule"></div></div>
    <div class="donutwrap">${donutSVG(parts, 220)}
      <div class="dlegend">${parts.map(p=>`<button type="button" class="dl" data-stat="${p.k}">
        <i style="background:${p.c}"></i><b>${esc(p.n)}</b><span class="mono">${p.v} · ${Math.round(p.v/(all.length||1)*100)}%</span>
        <em>${esc(STATUS[p.k].hint)}</em></button>`).join("")}</div>
    </div></section>`);

  // radar next to the five-way bars
  const heads = [...page.querySelectorAll(".sec-h h2")];
  const five = heads.find(h=>/drives your verdict/.test(h.textContent));
  const full = all.filter(s=>Array.isArray(s.scores) && s.scores.filter(n=>typeof n==="number").length===5);
  if (five && full.length){
    const avg = CRITERIA.map((x,i)=>full.reduce((a,s)=>a+s.scores[i],0)/full.length);
    const sec = five.closest(".sec");
    const bars = sec.querySelector(".bars");
    if (bars){ bars.outerHTML = `<div class="five-split"><div>${bars.outerHTML}</div>
      <div class="radar-wrap">${radarSVG([{name:"Your average", v:avg, c:"var(--violet)"}], 260)}</div></div>`; }
  }

  // compare two shows
  const scoredish = all.filter(s=>Array.isArray(s.scores) && s.scores.filter(n=>typeof n==="number").length>=3)
    .sort((a,b)=>myScore(b)-myScore(a));
  if (scoredish.length>=2){
    const opts = sel=>scoredish.map(s=>`<option value="${esc(s.id)}"${s.id===sel?" selected":""}>${esc(s.title)} · ${myScore(s)}</option>`).join("");
    const html = `<section class="sec" id="cmpSec">
      <div class="sec-h"><h2>Put two side by side</h2><div class="rule"></div></div>
      <div class="row cmp-pick">
        <select class="sel" id="cmpA" aria-label="First show">${opts(scoredish[0].id)}</select>
        <span class="label">against</span>
        <select class="sel" id="cmpB" aria-label="Second show">${opts(scoredish[scoredish.length-1].id)}</select>
      </div>
      <div class="cmp-out" id="cmpOut"></div></section>`;
    const anchor = five ? five.closest(".sec") : tiles;
    if (anchor) anchor.insertAdjacentHTML("afterend", html);
    const draw = ()=>{
      const a = get($("#cmpA").value), b = get($("#cmpB").value);
      if (!a || !b) return;
      $("#cmpOut").innerHTML = `<div class="cmp-grid">
        ${radarSVG([{name:a.title, v:a.scores, c:"var(--pink)"},{name:b.title, v:b.scores, c:"var(--blue)"}], 300)}
        <div class="cmp-tab">
          <div class="ct-h"><span></span><button type="button" data-open="${esc(a.id)}" class="ct-a">${esc(a.title)}</button>
            <button type="button" data-open="${esc(b.id)}" class="ct-b">${esc(b.title)}</button></div>
          ${CRITERIA.map(([k,n],i)=>{ const x = a.scores[i], y = b.scores[i];
            return `<div class="ct-r"><span class="label">${esc(n)}</span>
              <span class="mono${x!=null&&y!=null&&x>y?" win":""}">${x!=null?x.toFixed(1):"—"}</span>
              <span class="mono${x!=null&&y!=null&&y>x?" win":""}">${y!=null?y.toFixed(1):"—"}</span></div>`; }).join("")}
          <div class="ct-r tot"><span class="label">Overall</span><span class="mono">${myScore(a)}</span><span class="mono">${myScore(b)}</span></div>
        </div></div>`;
    };
    $("#cmpA").onchange = draw; $("#cmpB").onchange = draw; draw();
  }

  // make the existing bar charts clickable
  const clickable = (re, key, map)=>{
    const h = heads.find(x=>re.test(x.textContent)); if (!h) return;
    h.closest(".sec").querySelectorAll(".brow").forEach(row=>{
      const name = row.querySelector(".bname").textContent.trim();
      const val = map ? map(name) : name; if (!val) return;
      row.classList.add("brow-f"); row.dataset.f = key+":"+val; row.setAttribute("role","button");
      row.tabIndex = 0; row.title = "Show these in the library";
    });
  };
  clickable(/finish vs\. what you collect/, "genre");
  clickable(/actually watch/, "net");
  clickable(/release year/, "year");
  clickable(/they're from/, "country", n=>{ const f = COUNTRIES.find(x=>x[1]===n); return f ? f[0] : (n==="Not tagged yet"?"untagged":null); });
};
document.addEventListener("click", e=>{
  const d = e.target.closest(".d-seg, .dl");
  if (d && d.dataset.stat) showStatus(d.dataset.stat);
});
document.addEventListener("keydown", e=>{
  if ((e.key==="Enter"||e.key===" ") && e.target.classList && e.target.classList.contains("brow-f")){
    e.preventDefault(); e.target.click();
  }
});

/* ═══ suggestions: your watchlist, and "because you loved…" ═════ */
function tasteProfile(){
  const scored = DATA.shows.filter(s=>myScore(s)!=null);
  const mean = scored.length ? scored.reduce((a,s)=>a+myScore(s),0)/scored.length : 3.5;
  const g = {}, cast = {}, net = {};
  scored.forEach(s=>{
    const m = myScore(s);
    genresOf(s).forEach(x=>{ (g[x]=g[x]||[]).push(m); });
    (s.cast||[]).slice(0,4).forEach(x=>{ (cast[x]=cast[x]||[]).push(m); });
    netsOf(s).forEach(x=>{ (net[x]=net[x]||[]).push(m); });
  });
  const stat = o=>{ const out = {};
    Object.entries(o).forEach(([k,a])=>{ const avg = a.reduce((x,y)=>x+y,0)/a.length;
      out[k] = {avg, n:a.length, lift:(avg-mean)*Math.min(1, a.length/3)}; });
    return out; };
  return {mean, g:stat(g), cast:stat(cast), net:stat(net)};
}
/* Rank the watchlist by what your own scores say you like: genres you rate
   above your usual, actors whose shows you've rated well, platforms too. */
function fromWatchlist(){
  const P = tasteProfile();
  return DATA.shows.filter(s=>s.status==="L" || s.status==="U").map(s=>{
    let sc = 0; const why = [];
    const gs = genresOf(s).map(x=>[x,P.g[x]]).filter(([,v])=>v && v.n>=2);
    gs.forEach(([,v])=>{ sc += v.lift/Math.sqrt(gs.length); });
    const bestG = gs.filter(([,v])=>v.lift>0.04).sort((a,b)=>b[1].lift-a[1].lift)[0];
    const people = (s.cast||[]).slice(0,4).map(n=>[n,P.cast[n]]).filter(([,v])=>v && v.avg>=P.mean+0.15)
      .sort((a,b)=>b[1].avg-a[1].avg);
    people.forEach(([,v])=>{ sc += v.lift*1.4; });
    if (people.length) why.push(`${people[0][0]} — you average ${people[0][1].avg.toFixed(1)} on their shows`);
    if (bestG) why.push(`you rate ${bestG[0]} above your usual (${bestG[1].avg.toFixed(1)} vs ${P.mean.toFixed(1)})`);
    netsOf(s).forEach(x=>{ const v = P.net[x]; if (v) sc += v.lift*0.4; });
    if (s.imdb) sc += (s.imdb-7.6)*0.12;
    return {s, sc, why};
  }).filter(x=>x.why.length && x.sc>0).sort((a,b)=>b.sc-a.sc).slice(0,9);
}
let loveCache = null, loveBusy = false;
async function loadLoved(){
  const k = KP();
  const loved = DATA.shows.filter(s=>s.tmdbId && myScore(s)!=null && myScore(s)>=4)
    .sort((a,b)=>myScore(b)-myScore(a)).slice(0,4);
  const owned = new Set(DATA.shows.map(s=>k.norm(s.title)));
  const out = [];
  for (const s of loved){
    const kind = isFilm(s) ? "movie" : "tv";
    try {
      const d = await k.tmdb(`/${kind}/${s.tmdbId}/recommendations`, {language:"en-US", page:"1"});
      const recs = (d.results||[]).map(x=>({ id:x.id, kind, title:x.name||x.title, original:x.original_name||x.original_title,
          year:((x.first_air_date||x.release_date)||"").slice(0,4), overview:x.overview, poster:x.poster_path,
          vote:x.vote_average, country:(x.origin_country||[])[0] }))
        .filter(x=>!owned.has(k.norm(x.title)) && !owned.has(k.norm(x.original)))
        .slice(0,8);
      if (recs.length) out.push({from:s, recs});
    } catch(err){ if (/key/i.test(err.message)) throw err; }
  }
  return out;
}
const _renderSuggest = window.renderSuggest;
window.renderSuggest = function(){
  if (_renderSuggest) _renderSuggest.apply(this, arguments);
  const page = $("#page"), head = page.querySelector(".pagehead");
  if (!head) return;
  const k = KP();
  const wl = fromWatchlist();
  let html = `<section class="sec">
    <div class="sec-h"><h2>Next from your own watchlist</h2><div class="rule"></div></div>
    ${wl.length ? `<p class="fine">Ranked by what your scores say you like — the genres you rate highest
      and the actors whose shows you've loved. No internet needed for this one.</p>
      <div class="wl-picks">${wl.map(({s,why})=>{
        const p = mediaSrc(s.poster);
        return `<button type="button" class="wl" data-open="${esc(s.id)}">
          ${p?`<img src="${esc(p)}" alt="" loading="lazy">`:`<span class="wl-th" style="background:${INK_PAIRS[hash(s.id)%INK_PAIRS.length][0]}">${esc(initials(s.title))}</span>`}
          <span><b>${esc(s.title)}</b><span class="mono">${s.year||""}${s.imdb?" · IMDb "+s.imdb:""}</span>
          ${why.map(w=>`<em>${esc(w)}</em>`).join("")}</span></button>`;
      }).join("")}</div>`
    : `<p class="noyet">Score a few more shows and this fills itself in.</p>`}
  </section>`;
  if (k && k.hasTmdb()){
    html += `<section class="sec" id="lovedSec">
      <div class="sec-h"><h2>Because you loved…</h2><div class="rule"></div></div>
      ${loveCache ? (loveCache.length ? loveCache.map(g=>`
        <div class="loved"><h3>Because you loved <button type="button" class="tag-f" data-open="${esc(g.from.id)}">${esc(g.from.title)}</button>
          <span class="mono">${myScore(g.from)}</span></h3>
          <div class="sugg">${g.recs.map(x=>`<div class="sug">
            ${x.poster?`<img src="${esc(k.img(x.poster))}" alt="" loading="lazy">`:`<div class="noimg"></div>`}
            <div><h4>${esc(x.title)}</h4>
              <div class="m">${esc(x.year||"—")}${x.kind==="movie"?" · film":""} · ${x.vote?x.vote.toFixed(1):"—"} on TMDB</div>
              <p>${esc(x.overview||"No summary on TMDB.")}</p>
              <div class="acts">
                <button class="mini solid" data-loveadd="${x.id}" data-kind="${x.kind}" data-t="${esc(x.title)}" data-y="${esc(x.year||"")}" data-c="${esc(x.country||"")}">+ Watchlist</button>
                <button class="mini" data-addshort2="${esc(x.title)}">+ Shortlist</button></div>
            </div></div>`).join("")}</div></div>`).join("")
        : `<p class="noyet">TMDB had nothing new for your favourites — you've already got them all.</p>`)
      : `<div class="sugnote"><button class="btn solid" id="loveGo" type="button">${loveBusy?"Looking…":"Find shows like your favourites"}</button>
          <span class="fine">Asks TMDB what's similar to your top-rated shows, and leaves out anything you already have.</span></div>`}
    </section>`;
  }
  head.insertAdjacentHTML("afterend", html);
  const go = $("#loveGo");
  if (go) go.onclick = async ()=>{
    go.disabled = true; go.textContent = "Looking…"; loveBusy = true;
    try { loveCache = await loadLoved(); window.renderSuggest(); }
    catch(err){ toast(String(err.message).slice(0,140)); go.disabled=false; go.textContent="Try again"; }
    finally { loveBusy = false; }
  };
  page.querySelectorAll("[data-addshort2]").forEach(b=>b.onclick = ()=>addToShortlist(b.dataset.addshort2));
  page.querySelectorAll("[data-loveadd]").forEach(b=>b.onclick = async ()=>{
    const title = b.dataset.t;
    let id = slugify(title), n = 1;
    while (get(id)) { n++; id = slugify(title)+"-"+n; }
    const show = { id, title, status:"L" };
    if (b.dataset.y) show.year = parseInt(b.dataset.y,10);
    if (b.dataset.kind==="movie") show.kind = "film";
    DATA.shows.unshift(show); markDirty(); renderChrome();
    b.disabled = true; b.textContent = "Fetching…";
    try { await k.apply(show, await k.details({kind:b.dataset.kind, id:+b.dataset.loveadd})); } catch(e){}
    loveCache = (loveCache||[]).map(g=>({from:g.from, recs:g.recs.filter(x=>x.id!==+b.dataset.loveadd)}));
    toast(title+" added to your watchlist");
    window.renderSuggest();
  });
};

/* ═══ first paint ═══════════════════════════════════════════════ */
/* boot() in app.js is still fetching data.json when this file runs, so
   the first render already goes through everything above. */
})();
