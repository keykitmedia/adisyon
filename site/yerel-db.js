// Sayfanın beklediği veri arayüzünü sunucuya bağlar. Yerelde anlık olay akışı, Vercel'de kısa aralıklı sorgu kullanılır.
(() => {
  const kim = Math.random().toString(36).slice(2), bas = { 'x-kasa': '1', 'x-kaynak': kim };
  const dinleyen = [];
  let st = null;
  const hazir = fetch('/api/hepsi').then(async r => {
    if (r.status === 401) { location.href = '/giris'; return new Promise(() => {}); }
    if (!r.ok) throw new Error(await r.text());
    const v = await r.json();
    st = v;
    if (r.headers.get('x-kasa-mod') === 'bulut') yokla(+r.headers.get('x-kasa-rev') || 0); else olaylar();
  });
  // Vercel'de sürekli açık bağlantı yok; değişiklikler birkaç saniyede bir alınır, aynı kalanlar atlanır.
  function yokla(rev) {
    const tur = async () => {
      try {
        const r = await fetch('/api/degisiklikler?rev=' + rev);
        if (r.status === 401) { location.href = '/giris'; return; }
        if (r.ok) {
          const o = await r.json(), degisen = new Set();
          for (const x of o.list) {
            if (x.kim === kim) continue;
            const once = st[x.c]?.[x.id] ?? null;
            if (JSON.stringify(once) === JSON.stringify(x.d)) continue;
            if (x.d) (st[x.c] = st[x.c] || {})[x.id] = x.d; else if (st[x.c]) delete st[x.c][x.id];
            degisen.add(x.c);
          }
          rev = Math.max(rev, o.rev);
          degisen.forEach(bildir);
        }
      } catch {}
      setTimeout(tur, document.hidden ? 15000 : 2500);
    };
    setTimeout(tur, 2500);
  }
  const don = o => { Object.values(o).forEach(v => v && typeof v === 'object' && don(v)); return Object.freeze(o); };
  const anlik = (c, w) => {
    let r = Object.entries(st[c] || {});
    if (w) r = r.filter(([, d]) => { const v = d[w[0]]; return w[1] === '==' ? v === w[2] : w[1] === '<' ? v < w[2] : w[1] === '>' ? v > w[2] : w[1] === '<=' ? v <= w[2] : v >= w[2]; });
    const docs = r.map(([id, d]) => { const f = don(JSON.parse(JSON.stringify(d))); return { id, exists: true, data: () => f, metadata: {} }; });
    return { docs, size: docs.length, empty: !docs.length };
  };
  const bildir = c => dinleyen.filter(s => s.c === c).forEach(s => s.cb(anlik(c, s.w)));
  function olaylar() {
    const kaynak = new EventSource('/api/olaylar');
    let ilk = true;
    // Bağlantı kopup gelince arada kaçan değişiklikler yeniden alınır.
    kaynak.onopen = async () => {
      if (ilk) { ilk = false; return; }
      const r = await fetch('/api/hepsi');
      if (r.status === 401) { location.href = '/giris'; return; }
      st = await r.json();
      [...new Set(dinleyen.map(s => s.c))].forEach(bildir);
    };
    kaynak.onmessage = e => {
      const o = JSON.parse(e.data);
      if (o.kim === kim) return;
      if (o.d) (st[o.c] = st[o.c] || {})[o.id] = o.d; else if (st[o.c]) delete st[o.c][o.id];
      bildir(o.c);
    };
  }
  const istek = async (y, u, g) => {
    const r = await fetch(u, { method: y, headers: bas, body: g });
    if (r.status === 401) location.href = '/giris';
    if (!r.ok) throw { code: 'unavailable' };
    return r;
  };
  const koleksiyon = (c, w) => ({
    where: (f, op, v) => koleksiyon(c, [f, op, v]),
    get: async () => { await hazir; return anlik(c, w); },
    onSnapshot(cb) { const s = { c, w, cb }; hazir.then(() => { dinleyen.push(s); cb(anlik(c, s.w)); }); return () => dinleyen.splice(dinleyen.indexOf(s), 1); }
  });
  const belge = p => {
    const [c, id] = p.split('/'), u = `/api/doc/${encodeURIComponent(c)}/${encodeURIComponent(id)}`;
    return {
      set: async d => { await hazir; await istek('PUT', u, JSON.stringify(d)); (st[c] = st[c] || {})[id] = JSON.parse(JSON.stringify(d)); bildir(c); },
      delete: async () => { await hazir; await istek('DELETE', u); if (st[c]) delete st[c][id]; bildir(c); }
    };
  };
  const servis = {
    db: { collection: c => koleksiyon(c), doc: belge },
    assets: { upload: async b => (await fetch('/api/blob', { method: 'POST', headers: { ...bas, 'content-type': b.type }, body: b })).json() },
    downloads: { save: async ({ filename, data }) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      a.download = filename; a.click();
      return { status: 'saved' };
    } }
  };
  window.claude = { use: async n => servis[n] || null };
})();
