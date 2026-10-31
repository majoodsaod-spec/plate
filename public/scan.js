/* Plate: scan a packaged food's barcode, look it up in Open Food Facts (free, no key), and open the usual check-and-save sheet with the label's numbers. */
(function () {
  'use strict';
  const { $, esc } = window.Plate;
  let dlg = null, reader = null, busy = false;
  const r1 = (n) => Math.round(n * 10) / 10;

  function loadLib() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/zxing.min.js'; s.onload = () => res(); s.onerror = () => rej(new Error('Could not load the scanner. Check your connection.')); document.head.appendChild(s); });
  }
  function ensure() {
    if (dlg) return;
    dlg = document.createElement('dialog'); dlg.id = 'scanDlg';
    dlg.innerHTML = `<div class="sheet scanSheet"><div class="closeRow"><button type="button" class="link" data-sc="close">Cancel</button></div>
      <h2 style="margin:0">Scan a barcode</h2>
      <div class="scanView"><video id="scanVid" playsinline muted autoplay></video><div class="scanAim" aria-hidden="true"><i></i></div></div>
      <p class="hint" id="scanMsg" role="status">Point the camera at the barcode on the pack.</p>
      <div id="scanLabel" hidden><label class="photoBtn primary" for="scanLabelIn"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Photo the nutrition label</label><input id="scanLabelIn" type="file" accept="image/*" capture="environment" hidden>
        <p class="hint" style="margin:6px 0 0">Plate reads it and remembers this barcode, so next time (on any of your devices) it is instant.</p></div>
      <form class="row" id="scanType" autocomplete="off"><input id="scanCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="14" placeholder="Or type the numbers under it" aria-label="Barcode number"><button type="submit">Look up</button></form>
    </div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-sc="close"]')) close(); });
    dlg.addEventListener('close', stop);
    dlg.querySelector('#scanLabelIn').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) readLabel(f); });
    dlg.querySelector('#scanType').addEventListener('submit', (e) => { e.preventDefault(); const c = $('#scanCode').value.replace(/\D/g, ''); if (c.length >= 6) found(c); else msg('Type the full number under the barcode (8 to 13 digits).'); });
  }
  const msg = (t) => { const m = $('#scanMsg'); if (m) m.textContent = t; };
  function stop() { try { reader && reader.reset(); } catch (e) {} reader = null; const v = $('#scanVid'); if (v && v.srcObject) { v.srcObject.getTracks().forEach((t) => t.stop()); v.srcObject = null; } }
  function close() { stop(); if (dlg && dlg.open) dlg.close(); }

  async function open() {
    ensure(); busy = false; pending = null; $('#scanCode').value = ''; $('#scanLabel').hidden = true; dlg.querySelector('.scanSheet').classList.remove('noCam'); msg('Starting the camera…'); dlg.showModal();
    try {
      await loadLib();
      const Z = window.ZXing, hints = new Map();
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      reader = new Z.BrowserMultiFormatReader(hints, 300);
      await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }, $('#scanVid'), (res) => { if (res && !busy) { try { navigator.vibrate && navigator.vibrate(60); } catch (e) {} found(res.getText()); } });
      msg('Point the camera at the barcode on the pack.');
    } catch (e) {
      msg(e && e.name === 'NotAllowedError' ? 'Camera access is off. iPhone: Settings → Plate (or Safari) → Camera → Allow. You can also type the number below.' : (e.message || 'The camera did not start.') + ' You can type the number below.');
    }
  }

  /* the server tries, in order: Plate's shared list (products people here already scanned or photographed), Open Food Facts,
     USDA branded foods, then the product name plus a web search for its label. Without the server (offline or not updated) the app asks
     Open Food Facts directly. Every product found is kept on this phone too. */
  let pending = null;
  async function direct(code) {
    const f = 'product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,quantity,product_quantity';
    let j = null;
    try { const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${f}`); if (r.status === 404) j = { status: 0 }; else if (r.ok) j = await r.json(); } catch (e) {}
    if (!j) throw new Error('offline');
    if (!j.product || j.status === 0) return null;
    const p = j.product, n = p.nutriments || {};
    const kcal = n['energy-kcal_100g'] != null ? +n['energy-kcal_100g'] : n['energy_100g'] != null ? +n['energy_100g'] / 4.184 : null;
    if (kcal == null || !(kcal >= 0)) return { name: p.product_name || p.product_name_en || '', brand: p.brands || '', noData: true };
    const liquid = /ml|cl|l\b/i.test(String(p.serving_quantity_unit || p.quantity || '')) && !/g\b/i.test(String(p.serving_quantity_unit || ''));
    return { name: (p.product_name || p.product_name_en || 'Packaged food').trim(), brand: String(p.brands || '').split(',')[0].trim(), unit: liquid ? 'ml' : 'g',
      per100: { kcal: Math.round(kcal), protein: +n.proteins_100g || 0, carbs: +n.carbohydrates_100g || 0, fat: +n.fat_100g || 0 }, perServing: null,
      serving: +p.serving_quantity > 0 ? +p.serving_quantity : null, servingText: p.serving_size || '', pack: +p.product_quantity > 0 ? +p.product_quantity : null, src: 'Open Food Facts' };
  }
  async function lookup(code) {
    const cache = (await DB.get('barcodes', {})) || {};
    if (cache[code] && (cache[code].per100 || cache[code].perServing)) return { found: true, product: cache[code] };
    let r = null;
    if (Auth.token()) {
      const region = (await DB.get('region', 'Qatar')) || 'Qatar';
      try { r = await Auth.call('/barcode?code=' + code + '&region=' + encodeURIComponent(region)); }
      catch (e) { if (e.offline) throw e; r = null; }                          // an old server: fall back below
    }
    if (!r) { const p = await direct(code); r = p && !p.noData ? { found: true, product: p } : { found: false, name: p ? { name: p.name, brand: p.brand } : null }; }
    if (r.found) { cache[code] = r.product; const ks = Object.keys(cache); if (ks.length > 300) delete cache[ks[0]]; await DB.set('barcodes', cache); }
    return r;
  }
  async function found(code) {
    if (busy) return; busy = true; msg('Found ' + code + '. Looking it up…');
    let r;
    try { r = await lookup(code); }
    catch (e) { busy = false; msg('No connection, so the food could not be looked up. Try again when you are online.'); return; }
    if (!r.found) {
      pending = { code, name: r.name };
      const nm = r.name && r.name.name ? `"${[r.name.brand, r.name.name].filter(Boolean).join(' ')}" was found, but not its calories. ` : 'This product is not in any of the food databases yet. ';
      msg(nm + 'Take a photo of its nutrition label and Plate will read it.');
      $('#scanLabel').hidden = !Auth.token(); stop(); dlg.querySelector('.scanSheet').classList.add('noCam'); return;
    }
    show(code, r.product, r.approx);
  }
  async function readLabel(file) {
    if (!pending) return;
    msg('Reading the label…'); $('#scanLabel').hidden = true;
    try {
      const image = await AI.imageToBase64(file, 1400, 0.85);
      const r = await Auth.call('/barcode/label', { body: { code: pending.code, image, name: pending.name && pending.name.name, brand: pending.name && pending.name.brand } });
      if (!r.found) { msg('Could not read a nutrition table in that photo. Try again closer, flat and in good light.'); $('#scanLabel').hidden = false; return; }
      const cache = (await DB.get('barcodes', {})) || {}; cache[pending.code] = r.product; await DB.set('barcodes', cache);
      show(pending.code, r.product, false, true);
    } catch (e) { msg(/Not found|POST only|404/.test(e.message) ? 'Your server needs the new worker.js to read labels.' : e.message); $('#scanLabel').hidden = false; }
  }
  function show(code, p, approx, fromLabel) {
    close();
    const U = p.unit === 'ml' ? 'ml' : 'g', where = fromLabel ? 'read from your label photo' : p.shared ? 'saved earlier' : approx ? 'found on the web, check it against the pack' : (p.src || 'label data').replace(/^web:.*/, 'web');
    let item;
    if (p.per100) {
      const amt = p.serving || 100, f = amt / 100;
      item = { amount: amt, unit: U, kcal: Math.round(p.per100.kcal * f), protein: r1(p.per100.protein * f), carbs: r1(p.per100.carbs * f), fat: r1(p.per100.fat * f),
        portion: `${p.serving ? '1 serving (' + (p.servingText || amt + ' ' + U) + ')' : '100 ' + U}${p.pack ? ' · pack ' + p.pack + ' ' + U : ''} · label` };
    } else {
      item = { amount: 1, unit: 'serving', kcal: Math.round(p.perServing.kcal), protein: r1(p.perServing.protein), carbs: r1(p.perServing.carbs), fat: r1(p.perServing.fat), portion: (p.servingText || '1 serving') + ' · label' };
    }
    Object.assign(item, { name: p.name || 'Packaged food', brand: p.brand || null, basis: 'brand', low: item.kcal, high: item.kcal });
    window.Plate.openMeal({ items: [item], scale: 1, confidence: approx ? 'medium' : null, note: `Barcode ${code}, ${where}.${p.per100 ? ' Change the ' + (U === 'ml' ? 'ml' : 'grams') + ' to what you ate.' : ''}`, source: 'barcode', cacheKey: '', barcode: { code, product: p, item: Object.assign({}, item) } });
  }
  /* if you corrected the numbers, the shared copy (and this phone's) learns it, so the next scan is right */
  window.Plate.afterSave = async (st, items) => {
    if (!st || st.source !== 'barcode' || !st.barcode || !items[0]) return;
    const o = st.barcode.item, it = items[0], per = (x) => (x.amount > 0 ? x.kcal / x.amount : 0);
    const changed = ['kcal', 'protein', 'carbs', 'fat'].some((k) => { const a = o.amount > 0 ? o[k] / o.amount : 0, b = it.amount > 0 ? it[k] / it.amount : 0; return Math.abs(a - b) > Math.max(0.02 * Math.abs(a), 0.01); });
    if (!changed || !(per(it) > 0)) return;
    const p = Object.assign({}, st.barcode.product), k = it.unit === 'serving' ? 1 : 100 / it.amount, v = { kcal: Math.round(it.kcal * k), protein: r1(it.protein * k), carbs: r1(it.carbs * k), fat: r1(it.fat * k) };
    if (it.unit === 'serving') { p.perServing = v; p.per100 = null; } else p.per100 = v;
    p.name = it.name || p.name;
    const cache = (await DB.get('barcodes', {})) || {}; cache[st.barcode.code] = p; await DB.set('barcodes', cache);
    try { await Auth.call('/barcode/fix', { body: { code: st.barcode.code, product: p } }); } catch (e) {}
  };

  $('#scanBtn').addEventListener('click', open);
  window.Scan = { open, lookup };
})();
