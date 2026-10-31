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
      <form class="row" id="scanType" autocomplete="off"><input id="scanCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="14" placeholder="Or type the numbers under it" aria-label="Barcode number"><button type="submit">Look up</button></form>
    </div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-sc="close"]')) close(); });
    dlg.addEventListener('close', stop);
    dlg.querySelector('#scanType').addEventListener('submit', (e) => { e.preventDefault(); const c = $('#scanCode').value.replace(/\D/g, ''); if (c.length >= 6) found(c); else msg('Type the full number under the barcode (8 to 13 digits).'); });
  }
  const msg = (t) => { const m = $('#scanMsg'); if (m) m.textContent = t; };
  function stop() { try { reader && reader.reset(); } catch (e) {} reader = null; const v = $('#scanVid'); if (v && v.srcObject) { v.srcObject.getTracks().forEach((t) => t.stop()); v.srcObject = null; } }
  function close() { stop(); if (dlg && dlg.open) dlg.close(); }

  async function open() {
    ensure(); busy = false; $('#scanCode').value = ''; msg('Starting the camera…'); dlg.showModal();
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

  async function lookup(code) {
    const cache = (await DB.get('barcodes', {})) || {};
    if (cache[code]) return cache[code];
    const f = 'product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,quantity,product_quantity';
    let j = null;
    for (const host of ['world.openfoodfacts.org', 'world.openfoodfacts.net']) {
      try { const r = await fetch(`https://${host}/api/v2/product/${code}.json?fields=${f}`); if (r.status === 404) { j = { status: 0 }; break; } if (r.ok) { j = await r.json(); break; } } catch (e) {}
    }
    if (!j) throw new Error('offline');
    if (!j.product || j.status === 0) return null;
    const p = j.product, n = p.nutriments || {};
    const per100 = { kcal: n['energy-kcal_100g'] != null ? +n['energy-kcal_100g'] : n['energy_100g'] != null ? +n['energy_100g'] / 4.184 : null, protein: +n.proteins_100g || 0, carbs: +n.carbohydrates_100g || 0, fat: +n.fat_100g || 0 };
    if (per100.kcal == null || !(per100.kcal >= 0)) return { name: p.product_name || p.product_name_en || '', brand: p.brands || '', noData: true };
    const liquid = /ml|cl|l\b/i.test(String(p.serving_quantity_unit || p.quantity || '')) && !/g\b/i.test(String(p.serving_quantity_unit || ''));
    const out = { code, name: (p.product_name || p.product_name_en || 'Packaged food').trim(), brand: String(p.brands || '').split(',')[0].trim(), per100, unit: liquid ? 'ml' : 'g',
      serving: +p.serving_quantity > 0 ? +p.serving_quantity : null, servingText: p.serving_size || '', pack: +p.product_quantity > 0 ? +p.product_quantity : null };
    cache[code] = out; const ks = Object.keys(cache); if (ks.length > 200) delete cache[ks[0]];
    await DB.set('barcodes', cache);
    return out;
  }
  async function found(code) {
    if (busy) return; busy = true; msg('Found ' + code + '. Looking it up…');
    let p;
    try { p = await lookup(code); }
    catch (e) { busy = false; msg('No connection, so the food could not be looked up. Try again when you are online.'); return; }
    if (!p) { busy = false; msg(`${code} is not in the Open Food Facts database yet. Take a photo of the nutrition label with the Photo button instead.`); return; }
    if (p.noData) { busy = false; msg(`Found "${[p.brand, p.name].filter(Boolean).join(' ')}" but it has no calorie data. Take a photo of the nutrition label instead.`); return; }
    close();
    const amt = p.serving || 100, f = amt / 100, U = p.unit;
    const item = { name: p.name, brand: p.brand || null, portion: `${p.serving ? '1 serving (' + (p.servingText || amt + ' ' + U) + ')' : '100 ' + U}${p.pack ? ' · pack ' + p.pack + ' ' + U : ''} · label`, basis: 'brand',
      amount: amt, unit: U, kcal: Math.round(p.per100.kcal * f), protein: r1(p.per100.protein * f), carbs: r1(p.per100.carbs * f), fat: r1(p.per100.fat * f) };
    item.low = item.kcal; item.high = item.kcal;
    window.Plate.openMeal({ items: [item], scale: 1, confidence: null, note: `From the barcode (${code}), Open Food Facts label data${p.serving ? '' : ', per 100 ' + U}. Change the ${U === 'ml' ? 'ml' : 'grams'} to what you ate.`, source: 'barcode', cacheKey: '' });
  }

  $('#scanBtn').addEventListener('click', open);
  window.Scan = { open, lookup };
})();
