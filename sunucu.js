// Çini Kasa sunucusu. Bu bilgisayardan da aynı ağdaki cihazlardan da şifreyle açılır. Veriler veri.json dosyasında durur.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const TUR = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css;charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain;charset=utf-8' };
const AD = /^[\w.:-]{1,200}$/, RESIM = /^image\/(png|jpeg|webp|gif)$/;

const sifreler = require('./lib/sifre');

function baslat({ port = 4173, veriKlasoru, kok = __dirname, yedekKlasoru }) {
  const dosya = path.join(veriKlasoru, 'veri.json'), yedekler = path.join(veriKlasoru, 'yedek'), saatlik = path.join(veriKlasoru, 'saatlik'), bloblar = path.join(veriKlasoru, 'blob');
  const disYedek = yedekKlasoru || path.join(os.homedir(), 'Cini Kasa Yedek'), agDosya = path.join(veriKlasoru, 'ag.json');
  for (const d of [yedekler, saatlik, bloblar, disYedek]) fs.mkdirSync(d, { recursive: true });

  // Ana dosya okunamazsa en yeni sağlam yedekten açılır; bozuk dosya silinmez.
  const oku = f => { const d = JSON.parse(fs.readFileSync(f, 'utf8')); if (!d.products) throw new Error('eksik'); return d; };
  const yukle = () => {
    if (fs.existsSync(dosya)) {
      try { return oku(dosya); } catch { fs.copyFileSync(dosya, `${dosya}.bozuk-${Date.now()}`); }
    } else if (!fs.readdirSync(yedekler).length && !fs.readdirSync(saatlik).length) return oku(path.join(kok, 'baslangic.json'));
    const adaylar = [saatlik, yedekler, disYedek].flatMap(k => fs.readdirSync(k).filter(f => f.endsWith('.json')).map(f => path.join(k, f)))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const f of adaylar) { try { return oku(f); } catch {} }
    throw new Error('Veri dosyası ve yedekler okunamadı: ' + veriKlasoru);
  };
  const veri = yukle();

  let ag;
  try { ag = JSON.parse(fs.readFileSync(agDosya, 'utf8')); } catch { ag = {}; }
  // Eski sürümlerin PIN'i yerine şifre gelir; ilk şifre KASA_SIFRE ya da 184904'tür.
  if (!ag.sifre) { ag.sifre = sifreler.hashle(process.env.KASA_SIFRE || sifreler.VARSAYILAN); delete ag.pin; }
  ag.gizli = ag.gizli || crypto.randomBytes(24).toString('hex');
  const agKaydet = () => fs.writeFileSync(agDosya, JSON.stringify(ag), { mode: 0o600 });
  agKaydet();
  const bilet = () => crypto.createHash('sha256').update(ag.gizli + ag.sifre).digest('hex');
  const cerez = () => `kasa=${bilet()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`;
  const hatalar = new Map();
  const girdiMi = q => { const m = (q.headers.cookie || '').match(/(?:^|;\s*)kasa=([0-9a-f]{64})/); return !!m && crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(bilet())); };
  const adresler = () => Object.values(os.networkInterfaces()).flat().filter(a => a.family === 'IPv4' && !a.internal).map(a => a.address);
  const dinleyen = new Set();
  let zaman = null;

  const yaz = () => {
    zaman = null;
    // Windows'ta dosya anlık kilitlenebilir; kayıt kaybolmasın diye kısa süre sonra tekrar denenir.
    try {
      const fd = fs.openSync(dosya + '.tmp', 'w');
      fs.writeSync(fd, JSON.stringify(veri)); fs.fsyncSync(fd); fs.closeSync(fd);
      fs.renameSync(dosya + '.tmp', dosya);
    } catch (e) { console.error('Kayıt tekrar denenecek:', e.message); zaman = setTimeout(yaz, 1000); return; }
    const s = new Date(), saat = path.join(saatlik, String(s.getHours()).padStart(2, '0') + '.json');
    if (!fs.existsSync(saat) || Date.now() - fs.statSync(saat).mtimeMs > 3600e3) fs.copyFileSync(dosya, saat);
    const gun = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`, yedek = path.join(yedekler, gun + '.json');
    if (!fs.existsSync(yedek)) {
      fs.copyFileSync(dosya, yedek);
      fs.readdirSync(yedekler).sort().slice(0, -60).forEach(f => fs.unlinkSync(path.join(yedekler, f)));
      try {
        fs.copyFileSync(dosya, path.join(disYedek, gun + '.json'));
        fs.cpSync(bloblar, path.join(disYedek, 'gorseller'), { recursive: true });
        fs.readdirSync(disYedek).filter(f => f.endsWith('.json')).sort().slice(0, -60).forEach(f => fs.unlinkSync(path.join(disYedek, f)));
      } catch {}
    }
  };
  const planla = () => { zaman = zaman || setTimeout(yaz, 200); };
  const yay = o => { for (const r of dinleyen) r.write(`data: ${JSON.stringify(o)}\n\n`); };
  const govde = (q, sinir = 5e6) => new Promise((ok, no) => {
    const p = []; let n = 0;
    q.on('data', d => { n += d.length; if (n > sinir) { no(new Error('büyük')); q.destroy(); } else p.push(d); });
    q.on('end', () => ok(Buffer.concat(p)));
  });

  const sunucu = http.createServer(async (q, s) => {
    const u = decodeURIComponent(new URL(q.url, 'http://x').pathname), son = (c, b = '') => { s.statusCode = c; s.end(b); };
    if (!new RegExp(`^(localhost|\\d+\\.\\d+\\.\\d+\\.\\d+|[\\w-]+\\.local):${port}$`, 'i').test(q.headers.host || '')) return son(403);
    try {
      if (u === '/giris') {
        s.setHeader('content-type', TUR['.html']);
        if (q.method !== 'POST') return s.end(sifreler.sayfa());
        const ip = q.socket.remoteAddress, h = hatalar.get(ip) || { n: 0, t: 0 };
        if (h.n >= 5 && Date.now() - h.t < 60000) return s.end(sifreler.sayfa('Çok fazla deneme. 1 dakika bekleyin.'));
        const girilen = new URLSearchParams((await govde(q, 1000)).toString()).get('sifre') || '';
        if (!sifreler.dogrula(girilen, ag.sifre)) { hatalar.set(ip, { n: h.n >= 5 ? 1 : h.n + 1, t: Date.now() }); return s.end(sifreler.sayfa('Şifre yanlış.')); }
        hatalar.delete(ip);
        s.statusCode = 303; s.setHeader('location', '/'); s.setHeader('set-cookie', cerez());
        return s.end();
      }
      if (u === '/cikis') {
        s.statusCode = 303; s.setHeader('location', '/giris');
        s.setHeader('set-cookie', 'kasa=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return s.end();
      }
      if (!girdiMi(q)) {
        if (u.startsWith('/api/')) return son(401);
        s.statusCode = 302; s.setHeader('location', '/giris'); return s.end();
      }
      if (u.startsWith('/api/')) {
        if (q.method !== 'GET' && q.headers['x-kasa'] !== '1') return son(403);
        if (u === '/api/hepsi') { s.setHeader('content-type', 'application/json'); return s.end(JSON.stringify(veri)); }
        if (u === '/api/olaylar') {
          s.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
          s.write(':\n\n'); dinleyen.add(s); q.on('close', () => dinleyen.delete(s)); return;
        }
        if (u === '/api/ag') {
          s.setHeader('content-type', 'application/json;charset=utf-8');
          if (q.method === 'POST') {
            const { eski, yeni } = JSON.parse(await govde(q, 1000));
            if (!sifreler.dogrula(eski, ag.sifre)) { s.statusCode = 400; return s.end(JSON.stringify({ hata: 'Mevcut şifre yanlış.' })); }
            if (!sifreler.gecerli(yeni)) { s.statusCode = 400; return s.end(JSON.stringify({ hata: 'Yeni şifre 4 ile 64 karakter arasında olmalı.' })); }
            ag.sifre = sifreler.hashle(yeni); agKaydet();
            s.setHeader('set-cookie', cerez());
          }
          return s.end(JSON.stringify({ port, adresler: adresler(), ad: os.hostname().replace(/\.local$/, '') + '.local', yedek: disYedek }));
        }
        if (u === '/api/blob' && q.method === 'POST') {
          const t = q.headers['content-type'] || '';
          if (!RESIM.test(t)) return son(415);
          const id = crypto.randomBytes(16).toString('hex'), b = await govde(q, 20e6);
          fs.writeFileSync(path.join(bloblar, id), b); fs.writeFileSync(path.join(bloblar, id + '.tur'), t);
          s.setHeader('content-type', 'application/json');
          return s.end(JSON.stringify({ id, url: '/_blob/' + id, sizeBytes: b.length, contentType: t }));
        }
        const m = u.match(/^\/api\/doc\/([^/]+)\/([^/]+)$/);
        if (!m || !AD.test(m[1]) || !AD.test(m[2])) return son(400);
        const [, c, id] = m, kim = q.headers['x-kaynak'] || '';
        if (q.method === 'PUT') {
          const d = JSON.parse(await govde(q));
          (veri[c] = veri[c] || {})[id] = d; planla(); yay({ c, id, d, kim }); return son(204);
        }
        if (q.method === 'DELETE') { if (veri[c]) delete veri[c][id]; planla(); yay({ c, id, d: null, kim }); return son(204); }
        return son(405);
      }
      if (u.startsWith('/_blob/')) {
        const id = u.slice(7);
        if (!/^[0-9a-f]{32}$/.test(id)) return son(404);
        s.setHeader('content-type', fs.readFileSync(path.join(bloblar, id + '.tur'), 'utf8'));
        return s.end(fs.readFileSync(path.join(bloblar, id)));
      }
      const site = path.join(kok, 'site'), f = path.normalize(path.join(site, u === '/' ? 'index.html' : u));
      if (!f.startsWith(site + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return son(404);
      s.setHeader('content-type', TUR[path.extname(f).toLowerCase()] || 'application/octet-stream');
      s.setHeader('cache-control', 'no-cache');
      s.end(fs.readFileSync(f));
    } catch { if (!s.headersSent) son(500); else s.end(); }
  });
  const bitir = () => { if (zaman) { clearTimeout(zaman); yaz(); } };
  return new Promise((ok, no) => { sunucu.once('error', no); sunucu.listen(port, '0.0.0.0', () => ok({ url: `http://localhost:${port}`, bitir, sunucu })); });
}

module.exports = { baslat };
if (require.main === module) {
  const klasor = process.env.KASA_VERI || path.join(__dirname, 'veri');
  fs.mkdirSync(klasor, { recursive: true });
  const port = +process.env.KASA_PORT || 4173;
  baslat({ veriKlasoru: klasor, port, yedekKlasoru: process.env.KASA_YEDEK }).then(async r => {
    console.log('Bu bilgisayar : ' + r.url);
    Object.values(os.networkInterfaces()).flat().filter(a => a.family === 'IPv4' && !a.internal).forEach(a => console.log(`Ağdan giriş   : http://${a.address}:${port}`));
    console.log('Giriş şifresi : ilk kurulumda ' + sifreler.VARSAYILAN + ', Yönetim > Giriş ve Ağ bölümünden değiştirilir');
    console.log('Veri klasörü  : ' + klasor);
    console.log('\nKasa çalışıyor. Bu pencereyi kapatmayın.');
    for (const sinyal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sinyal, () => { r.bitir(); process.exit(0); });
  }).catch(e => {
    console.error(e.code === 'EADDRINUSE' ? `Kasa zaten açık veya ${port} portu kullanımda.` : 'Kasa başlatılamadı: ' + e.message);
    process.exitCode = 1;
  });
}
