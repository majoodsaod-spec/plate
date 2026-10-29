/* Plate: product lookup in Open Food Facts (free, community-maintained label data, no key).
   The AI names the product; this code finds the real label values and does the maths itself.
   Strict matching: a wrong product is worse than no product, so we only accept clear matches. */
(function (root) {
  'use strict';
  const tok = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  const GENERIC = new Set(['bar','bars','pack','packet','box','bottle','can','tin','cup','original','classic','regular','standard','size','mini','large','small','medium','piece','pieces','single','the','and','with','of','drink','snack','chocolate']);
  // Words that mean "a different product": a burger must not match its sauce, a dressing, a mix...
  const OTHER = new Set(['sauce','sauces','dressing','dip','spread','seasoning','mayo','mayonnaise','ketchup','syrup','powder','mix','kit','topping','marinade','paste','relish','glaze','oil','flavour','flavor','flavoured','flavored','crisps','chips','cereal','biscuit','biscuits','cookie','cookies','ice','cream','shake','milkshake']);
  const GULF = ['en:qatar', 'en:united-arab-emirates', 'en:saudi-arabia', 'en:kuwait', 'en:bahrain', 'en:oman'];

  async function off(item, region) {
    const brandT = tok(item.brand), nameT = tok(item.name).filter((t) => !brandT.includes(t) && !GENERIC.has(t));
    if (!brandT.length) return null;
    const q = encodeURIComponent((item.brand + ' ' + item.name).trim());
    const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=12' +
      '&fields=product_name,brands,nutriments,countries_tags&search_terms=' + q;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 5000);
    let data;
    try { const res = await fetch(url, { signal: ctl.signal }); if (!res.ok) return null; data = await res.json(); }
    catch (e) { return null; } finally { clearTimeout(timer); }

    let best = null;
    for (const p of (data.products || [])) {
      const n = p.nutriments || {};
      const kcal = n['energy-kcal_100g'] != null ? +n['energy-kcal_100g'] : (n['energy_100g'] != null ? +n['energy_100g'] / 4.184 : NaN);
      if (!isFinite(kcal) || kcal <= 0) continue;
      const pb = tok(p.brands), pn = tok(p.product_name);
      if (!brandT.some((t) => pb.includes(t))) continue;
      const extra = pn.filter((t) => !nameT.includes(t) && !brandT.includes(t) && !tok(item.name).includes(t));
      if (extra.some((t) => OTHER.has(t))) continue;
      const hit = nameT.length ? nameT.filter((t) => pn.includes(t)).length / nameT.length : 0.7;   // brand-only name: accept a brand match
      if (hit < 0.6) continue;
      const c = p.countries_tags || [];
      const score = hit * 2 - 0.25 * extra.length + (c.includes('en:' + String(region || '').toLowerCase().replace(/\s+/g, '-')) ? 1.5 : 0) + (c.some((x) => GULF.includes(x)) ? 0.5 : 0);
      if (!best || score > best.score) best = { score, p, kcal, n };
    }
    if (!best) return null;
    const v = (k) => (isFinite(+best.n[k]) ? +best.n[k] : 0);
    return { product: best.p.product_name, per100: { kcal: best.kcal, protein: v('proteins_100g'), carbs: v('carbohydrates_100g'), fat: v('fat_100g') } };
  }

  root.Lookup = { off };
})(window);
