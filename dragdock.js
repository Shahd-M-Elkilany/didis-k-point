/* ═══════════════════════════════════════════════════════════════════
   Didi's K-point — the drop dock
   Browsers don't scroll the page while you drag, so a shortlist that
   has scrolled off the top is impossible to reach. Two answers:

     1. a drop bar that pins itself to the top of the screen the
        moment you pick a cover up, from any page;
     2. the page scrolls on its own when you drag near an edge.

   Loads after app.js and borrows addToShortlist() and get().
   ═══════════════════════════════════════════════════════════════ */
(function(){
"use strict";

const dock = document.createElement("div");
dock.id = "dragdock";
dock.setAttribute("aria-hidden","true");
dock.innerHTML = `<span class="dd-in">
    <span class="dd-star">★</span>
    <span class="dd-txt">Drop here &mdash; <b>Your shortlist</b></span>
  </span>`;
document.addEventListener("DOMContentLoaded", ()=>document.body.appendChild(dock));
if (document.body) document.body.appendChild(dock);

let dragging = false, held = "";

/* ── picking a cover up ─────────────────────────────────────── */
document.addEventListener("dragstart", e=>{
  const t = e.target;
  const card = (t && t.closest) ? t.closest("[data-id]") : null;
  if (!card || !card.dataset.id) return;
  dragging = true;
  held = card.dataset.id;
  document.body.classList.add("dragging-card");
  try {
    const dt = e.dataTransfer;
    const has = [...(dt.types||[])].includes("text/kpoint-id");
    if (!has) dt.setData("text/kpoint-id", card.dataset.id);
    const s = (typeof get === "function") ? get(card.dataset.id) : null;
    if (s && !String(dt.getData("text/plain")||"")) dt.setData("text/plain", s.title);
    dt.effectAllowed = "copy";
  } catch(err){}
}, true);

function letGo(){
  dragging = false; held = "";
  document.body.classList.remove("dragging-card");
  dock.classList.remove("over");
  stopScroll();
}
document.addEventListener("dragend", letGo, true);
document.addEventListener("drop", ()=>setTimeout(letGo, 0), true);

/* ── the dock itself ────────────────────────────────────────── */
dock.addEventListener("dragover", e=>{
  if (!dragging) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  dock.classList.add("over");
});
dock.addEventListener("dragleave", ()=>dock.classList.remove("over"));
dock.addEventListener("drop", e=>{
  e.preventDefault();
  dock.classList.remove("over");
  let id = "";
  try { id = e.dataTransfer.getData("text/kpoint-id"); } catch(err){}
  if (!id) id = held;
  const s = (typeof get === "function") ? get(id) : null;
  let title = s ? s.title : "";
  if (!title){ try { title = e.dataTransfer.getData("text/plain"); } catch(err){} }
  if (title && typeof addToShortlist === "function") addToShortlist(title.trim());
  letGo();
});

/* ── scroll the page while dragging near an edge ────────────── */
let raf = null, speed = 0;
function step(){
  if (!speed){ raf = null; return; }
  window.scrollBy(0, speed);
  raf = requestAnimationFrame(step);
}
function stopScroll(){ speed = 0; if (raf){ cancelAnimationFrame(raf); raf = null; } }
document.addEventListener("dragover", e=>{
  if (!dragging) return;
  const y = e.clientY, h = window.innerHeight, edge = 130;
  if (y < edge)            speed = -Math.ceil((edge - y) / 5);
  else if (y > h - edge)   speed =  Math.ceil((y - (h - edge)) / 5);
  else                     speed = 0;
  if (speed && !raf) raf = requestAnimationFrame(step);
  if (!speed) stopScroll();
});
window.addEventListener("blur", letGo);
})();
