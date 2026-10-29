/* Plate: Gym tab. Layer 1: a tappable muscle map (zooms into the muscle you tap). Layer 2: that muscle's exercises. Layer 3: an animated demo.
   Body artwork: see gym-art.js (MIT). Animations: rig-lat.js (lat pulldown). */
(function () {
  'use strict';
  const { $, $$, esc } = window.Plate;
  const { GROUPS, ORDER, EX, EQ, DEMOS } = window.GymData;
  let ART = window.GymArt, who = 'male';          // the muscle map follows the profile: the female set is the same library and style
  const EXMAP = {}; EX.forEach((x) => { EXMAP[x.id] = x; });
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let CX = { front: 362, back: 1086 }, VY = 110, VH = 1270;          // horizontal centre of each body in the shared artwork space, and the height shown
  let side = 'front', sel = null, vb = null, anim = 0, built = false;

  /* ---------- the map ---------- */
  function build() {
    if (built) return; built = true;
    const svg = $('#gSvg');
    let html = '<defs><filter id="gglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter></defs>';
    for (const s of ['front', 'back']) {
      const a = ART[s], groups = {};
      for (const p of a.parts) if (p.g) (groups[p.g] = groups[p.g] || []).push(...p.d);
      const inert = a.parts.filter((p) => !p.g).flatMap((p) => p.d);
      html += `<g class="gside" data-side="${s}"${s === side ? '' : ' hidden'}>
        <path class="gbody" d="${a.outline}"/>
        <g class="ginert">${inert.map((d) => `<path d="${d}"/>`).join('')}</g>
        <g class="ghalo" data-halo="${s}"></g>
        ${Object.entries(groups).map(([g, ds]) => `<g class="mus" data-g="${g}" tabindex="0" role="button" aria-label="${esc(GROUPS[g].name)}"><title>${esc(GROUPS[g].name)}</title>${ds.map((d) => `<path d="${d}"/>`).join('')}</g>`).join('')}
      </g>`;
    }
    svg.innerHTML = html;
    $('#gChips').innerHTML = ORDER.map((g) => `<button type="button" data-chip="${g}">${esc(GROUPS[g].name)}</button>`).join('');
    setVB(fullVB(), false);
  }

  const stageH = (zoom) => (zoom ? 340 : Math.max(380, Math.min(Math.round(window.innerHeight * 0.6), 540)));
  const aspect = (zoom) => ($('#gStage').clientWidth || 358) / stageH(zoom);
  function fullVB() {
    const A = aspect(false), h = VH, w = h * A;
    return [CX[side] - w / 2, VY, w, h];
  }
  function groupVB(g) {
    const A = aspect(true), b = ART.bbox[GROUPS[g].art][GROUPS[g].side], [x, y, w, h] = b;
    let vw = Math.max(w * 2.0, h * 2.0 * A, 150); const vh = vw / A;
    return [x + w / 2 - vw / 2, y + h / 2 - vh / 2, vw, vh];
  }
  function setVB(v, animate) {
    cancelAnimationFrame(anim);
    const svg = $('#gSvg');
    if (!animate || !vb || reduce()) { vb = v; svg.setAttribute('viewBox', v.map((n) => n.toFixed(1)).join(' ')); return; }
    const from = vb.slice(), t0 = performance.now(), D = 520, ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);
    const step = (now) => {
      const u = Math.min(1, (now - t0) / D), k = ease(u);
      vb = from.map((n, i) => n + (v[i] - n) * k);
      svg.setAttribute('viewBox', vb.map((n) => n.toFixed(1)).join(' '));
      if (u < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  function showSide(s) {
    if (s !== side && vb) {                      // front and back share one canvas: slide the view across instantly so the zoom does not sweep over the empty space between them
      cancelAnimationFrame(anim); vb = vb.slice(); vb[0] += CX[s] - CX[side];
      $('#gSvg').setAttribute('viewBox', vb.map((n) => n.toFixed(1)).join(' '));
    }
    side = s;
    $$('.gside').forEach((el) => { if (el.dataset.side === s) el.removeAttribute('hidden'); else el.setAttribute('hidden', ''); });
    $$('[data-gside]').forEach((b) => b.classList.toggle('on', b.dataset.gside === s));
  }

  function select(g) {
    sel = g;
    const ag = GROUPS[g].art, st = $('#gStage');
    $$('[data-chip]').forEach((b) => b.classList.toggle('on', b.dataset.chip === g));
    $$('.mus').forEach((el) => el.classList.toggle('on', el.dataset.g === ag));
    $$('.ghalo').forEach((h) => { h.innerHTML = ''; });
    if (!ag) {                                       // cardio has no spot on the body map
      st.style.height = stageH(false) + 'px'; st.classList.remove('zoom'); $('#gLabel').hidden = true; $('#gReset').hidden = false; $('#gHint').hidden = true;
      setVB(fullVB(), true); renderPanel(g); return;
    }
    if (GROUPS[g].side !== side) showSide(GROUPS[g].side);
    const grp = $(`.gside[data-side="${side}"] .mus[data-g="${ag}"]`);
    if (grp) $(`[data-halo="${side}"]`).innerHTML = [...grp.querySelectorAll('path')].map((q) => `<path d="${q.getAttribute('d')}"/>`).join('');
    st.style.height = stageH(true) + 'px'; st.classList.add('zoom');
    $('#gLabel').innerHTML = `<b>${esc(GROUPS[g].name)}</b><span>${esc(GROUPS[g].latin)}</span>`; $('#gLabel').hidden = false;
    $('#gReset').hidden = false; $('#gHint').hidden = true;
    setVB(groupVB(g), true);
    renderPanel(g);
  }
  function reset() {
    sel = null;
    $$('.mus').forEach((el) => el.classList.remove('on')); $$('.ghalo').forEach((h) => { h.innerHTML = ''; });
    $$('[data-chip]').forEach((b) => b.classList.remove('on'));
    const st = $('#gStage'); st.style.height = stageH(false) + 'px'; st.classList.remove('zoom');
    $('#gLabel').hidden = true; $('#gReset').hidden = true; $('#gHint').hidden = false; $('#gPanel').innerHTML = '';
    setVB(fullVB(), true);
  }

  $('#gSvg').addEventListener('click', (e) => { const m = e.target.closest('.mus'); if (m) select(m.dataset.g === 'glutes' && sel === 'abductors' ? 'abductors' : m.dataset.g); });
  $('#gSvg').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('mus')) { e.preventDefault(); select(e.target.dataset.g); } });
  $('#gChips').addEventListener('click', (e) => { const b = e.target.closest('[data-chip]'); if (b) select(b.dataset.chip); });
  $('#gReset').addEventListener('click', reset);
  $$('[data-gside]').forEach((b) => b.addEventListener('click', () => { showSide(b.dataset.gside); if (sel) { sel = null; } reset(); }));
  window.addEventListener('resize', () => { if (!$('#view-gym').hidden && built) { const st = $('#gStage'); st.style.height = stageH(!!sel) + 'px'; setVB(sel ? groupVB(sel) : fullVB(), false); } });

  /* ---------- layer 2: exercises ---------- */
  const stars = (n) => `<span class="stars" role="img" aria-label="${n} out of 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
  const eqText = (x) => x.eq.map((q) => EQ[q] || q).join(' or ');
  const EVT = { emg: 'Based on muscle-activity (EMG) studies', coach: 'Based on coach rankings and articles', mixed: 'Based on research and coach rankings', social: 'Popular on social media; limited evidence' };
  const linkHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  function exRow(x, opts) {
    opts = opts || {};
    const src = (x.src || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(linkHost(u))}</a>`).join(' · ');
    return `<details class="ex2" data-ex="${x.id}"><summary><span class="exMain"><b>${esc(x.name)}</b><small>${esc(opts.detail || eqText(x))}</small></span>${stars(x.stars)}${x.demo ? '<span class="chip high">Demo</span>' : ''}</summary>
      <div class="exBody"><p>${esc(x.say)}</p><p>${esc(x.how)}</p>
      <p class="hint">${esc(EVT[x.ev] || EVT.coach)}${x.thin ? ' · limited data, treat the stars as a rough guide' : ''}</p>
      ${x.also && x.also.length ? `<p class="hint">Also works: ${x.also.map((a) => esc((GROUPS[a] || { name: a }).name.toLowerCase())).join(', ')}</p>` : ''}
      ${x.demo ? `<button type="button" class="primary" data-demo="${x.demo}">Watch the demo</button>` : ''}</div></details>`;
  }
  const forGroup = (g) => EX.filter((x) => x.g === g || (x.gs || []).includes(g)).sort((a, b) => b.stars - a.stars || (b.demo ? 1 : 0) - (a.demo ? 1 : 0) || a.name.localeCompare(b.name));
  function renderPanel(g) {
    const list = forGroup(g);
    $('#gPanel').innerHTML = `<div class="sectionHead"><h2>${esc(GROUPS[g].name)} exercises</h2><span class="hint">${list.length} · best first</span></div>
      <div class="exList2">${list.map((x) => exRow(x)).join('')}</div>
      <details class="note"><summary>About the star ratings</summary><p class="hint">Stars are a rough "community rating" from 1 to 5. They combine coach rankings, fitness articles and a few muscle-activity studies, which is what gym social media mostly repeats. TikTok and Reddit were not searched directly, and this is not a scientific score. Exercises marked "limited sources" rest on less. Use them to compare options, not as a verdict.</p></details>`;
  }
  $('#gPanel').addEventListener('click', (e) => { const b = e.target.closest('[data-demo]'); if (b) openDemo(b.dataset.demo); });
  window.Plate.gym = { EXMAP, exRow, stars, eqText, openDemo: (k) => openDemo(k), forGroup };

  /* ---------- layer 3: animated demo ---------- */
  const dlg = $('#gymDlg');
  let demo = null, raf = 0;
  function openDemo(key) {
    const D = DEMOS[key]; if (!D) return;
    syncSex();
    let fig = null; try { fig = localStorage.getItem('gym-fig'); } catch (e) {}
    if (fig !== 'male' && fig !== 'female') fig = who;
    if (window.Rig2 && window.Rig2.setBody) window.Rig2.setBody(fig);
    const Rig = D.rig === 'LatRig' ? window.LatRig : window.Rig2 && window.Rig2.make(key); if (!Rig) return;
    D.angle = D.angle || { min: Rig.range[0], max: Rig.range[1], def: Rig.theta };
    let theta = D.angle.def;
    try { const s = parseInt(localStorage.getItem('gym-angle-' + key), 10); if (s >= D.angle.min && s <= D.angle.max) theta = s; } catch (e) {}
    let trail = true; try { trail = localStorage.getItem('gym-trail') !== '0'; } catch (e) {}
    demo = { fig, D, Rig, key, t: reduce() ? 1.8 : 0, playing: !reduce(), speed: 1, trail, theta, dirty: true, shown: -1, last: null, down: null };
    $('#gymSheet').innerHTML = `
      <div class="closeRow"><button type="button" class="link" data-gx="close">Close</button></div>
      <div><div class="gx-eyebrow">${esc(D.eyebrow)}</div><h2 class="gx-title">${esc(D.title)}</h2></div>
      <section class="gx-stage" id="gxStage" aria-label="${esc(D.title)} animation">
        <svg viewBox="0 0 520 600" role="img" aria-label="Animated figure performing a ${esc(D.title.toLowerCase())}"><defs><filter id="glow" x="-60%" y="-30%" width="220%" height="160%"><feGaussianBlur stdDeviation="3.5"/></filter></defs><g id="gxFig"></g></svg>
        <div class="gx-legend"><span><i></i>${esc(D.legend)}</span><span><i class="as"></i>Assisting</span></div><div class="gx-hint">Drag to rotate</div>
      </section>
      <section aria-label="Rep tempo"><div class="gx-track" id="gxTrack" aria-hidden="true">${Rig.PHASES.map((p) => `<div class="gx-seg" style="flex:${p.dur}"></div>`).join('')}<div class="gx-head" id="gxHead"></div></div>
        <div class="gx-cue"><b id="gxName"></b><span id="gxCue"></span></div>
        <div class="hint" style="font-variant-numeric:tabular-nums">${Rig.PHASES.map((p) => p.name + ' ' + p.dur + ' s').join(' · ')}</div></section>
      <section class="gx-controls"><button type="button" class="primary" id="gxPlay" data-gx="play" aria-pressed="true">Pause</button>
        <div class="segs" role="group" aria-label="Speed"><button type="button" class="seg" data-gx="s05" aria-pressed="false">0.5×</button><button type="button" class="seg on" data-gx="s1" aria-pressed="true">1×</button></div>
        <div class="segs" role="group" aria-label="Figure"><button type="button" class="seg${fig === 'male' ? ' on' : ''}" data-gx="figm" aria-pressed="${fig === 'male'}">Male</button><button type="button" class="seg${fig === 'female' ? ' on' : ''}" data-gx="figf" aria-pressed="${fig === 'female'}">Female</button></div>
        <button type="button" class="seg${trail ? ' on' : ''}" data-gx="trail" aria-pressed="${trail}" title="Show the path the bar or hand travels">Path</button>
        <label class="gx-angle">Angle <input id="gxAngle" type="range" min="${D.angle.min}" max="${D.angle.max}" step="1" value="${theta}" aria-label="Camera angle"></label></section>
      <section class="gx-notes"><h3>Muscles</h3><dl class="gx-mus"><div><dt>Primary</dt><dd>${esc(D.primary)}</dd></div><div><dt>Assisting</dt><dd>${esc(D.assisting)}</dd></div></dl>
        <h3>Form</h3><ol>${D.form.map((f) => `<li>${esc(f)}</li>`).join('')}</ol>
        <h3>Avoid</h3><ul class="gx-avoid">${D.avoid.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></section>`;
    setPlaying(demo.playing);
    if (!dlg.open) dlg.showModal();
    demo.last = null; cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function setPlaying(p) { demo.playing = p; const b = $('#gxPlay'); b.textContent = p ? 'Pause' : 'Play'; b.setAttribute('aria-pressed', String(p)); demo.last = null; }
  function draw() {
    const { Rig, D } = demo, s = Rig.timeline(demo.t);
    $('#gxFig').innerHTML = Rig.frame(s.pull, demo.theta, s.eff, { trail: demo.trail, t: demo.t });
    if (s.phase !== demo.shown) {
      demo.shown = s.phase;
      $$('.gx-seg').forEach((el, i) => el.classList.toggle('on', i === s.phase));
      $('#gxName').textContent = Rig.PHASES[s.phase].name; $('#gxCue').textContent = D.cues[s.phase] || '';
    }
    $('#gxHead').style.left = ((((demo.t % Rig.CYCLE) + Rig.CYCLE) % Rig.CYCLE) / Rig.CYCLE * 100).toFixed(2) + '%';
  }
  function tick(now) {
    if (!demo || !dlg.open) return;
    if (demo.last === null) demo.last = now;
    const dt = Math.min(0.1, (now - demo.last) / 1000); demo.last = now;
    if (demo.playing) { demo.t += dt * demo.speed; demo.dirty = true; }
    if (demo.dirty) { demo.dirty = false; draw(); }
    raf = requestAnimationFrame(tick);
  }
  function setTheta(v) {
    const D = demo.D; demo.theta = Math.max(D.angle.min, Math.min(D.angle.max, v)); demo.dirty = true;
    const a = $('#gxAngle'); if (a) a.value = String(Math.round(demo.theta));
    try { localStorage.setItem('gym-angle-' + demo.key, String(Math.round(demo.theta))); } catch (e) {}
  }
  $('#gymSheet').addEventListener('click', (e) => {
    const b = e.target.closest('[data-gx]'); if (!b) return;
    const a = b.dataset.gx;
    if (a === 'close') { dlg.close(); return; }
    if (!demo) return;
    if (a === 'play') setPlaying(!demo.playing);
    if (a === 'trail') { demo.trail = !demo.trail; b.classList.toggle('on', demo.trail); b.setAttribute('aria-pressed', String(demo.trail)); demo.dirty = true; try { localStorage.setItem('gym-trail', demo.trail ? '1' : '0'); } catch (e) {} }
    if (a === 'figm' || a === 'figf') {
      demo.fig = a === 'figm' ? 'male' : 'female'; window.Rig2.setBody(demo.fig); try { localStorage.setItem('gym-fig', demo.fig); } catch (e) {}
      $$('[data-gx="figm"],[data-gx="figf"]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      demo.dirty = true;
    }
    if (a === 's05' || a === 's1') {
      demo.speed = a === 's05' ? 0.5 : 1;
      $$('[data-gx="s05"],[data-gx="s1"]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    }
  });
  $('#gymSheet').addEventListener('input', (e) => { if (e.target.id === 'gxAngle' && demo) setTheta(parseFloat(e.target.value)); });
  $('#gymSheet').addEventListener('pointerdown', (e) => { const st = e.target.closest('#gxStage'); if (st && demo) { demo.down = { x: e.clientX, th: demo.theta }; st.classList.add('drag'); try { st.setPointerCapture(e.pointerId); } catch (_) {} } });
  $('#gymSheet').addEventListener('pointermove', (e) => { if (demo && demo.down) setTheta(demo.down.th - (e.clientX - demo.down.x) * 0.25); });
  /* drag along the timeline to step through a rep */
  const scrubTo = (e) => { const tr = $('#gxTrack'); if (!tr || !demo) return; const r = tr.getBoundingClientRect(); demo.t = Math.min(0.9999, Math.max(0, (e.clientX - r.left) / r.width)) * demo.Rig.CYCLE; demo.dirty = true; };
  $('#gymSheet').addEventListener('pointerdown', (e) => { const tr = e.target.closest('#gxTrack'); if (tr && demo) { demo.scrub = { was: demo.playing }; setPlaying(false); try { tr.setPointerCapture(e.pointerId); } catch (_) {} scrubTo(e); } });
  $('#gymSheet').addEventListener('pointermove', (e) => { if (demo && demo.scrub) scrubTo(e); });
  const up = () => { if (demo && demo.scrub) { const w = demo.scrub.was; demo.scrub = null; if (w) setPlaying(true); } if (demo) demo.down = null; const st = $('#gxStage'); if (st) st.classList.remove('drag'); };
  $('#gymSheet').addEventListener('pointerup', up); $('#gymSheet').addEventListener('pointercancel', up);
  dlg.addEventListener('close', () => { if (dlg.open) return; cancelAnimationFrame(raf); demo = null; });          // stop drawing when closed: saves battery
  document.addEventListener('visibilitychange', () => { if (demo) demo.last = null; });

  async function syncSex() {
    let sx = 'male'; try { const p = await DB.get('profile', null); if (p && p.sex === 'female') sx = 'female'; } catch (e) {}
    if (sx === who) return;
    who = sx;
    const F = sx === 'female' && window.GymArtF;
    ART = F ? window.GymArtF : window.GymArt; if (!F) who = 'male';
    CX = F ? F.meta.cx : { front: 362, back: 1086 }; VY = F ? F.meta.y : 110; VH = F ? F.meta.h : 1270;
    if (built) { built = false; build(); if (sel) { const g = sel; sel = null; select(g); } else setVB(fullVB(), false); }
  }
  syncSex();
  window.Plate.hooks.gym = async () => { await syncSex(); build(); if (!sel) { const st = $('#gStage'); st.style.height = stageH(false) + 'px'; setVB(fullVB(), false); } };
  if (!$('#view-gym').hidden) window.Plate.hooks.gym();
})();
