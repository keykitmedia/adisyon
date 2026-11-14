// Çini Kasa masaüstü uygulaması: solda Vercel'deki kasa, sağda Yemeksepeti ve Trendyol panelleri.
// Her siteye kullanıcı kendisi giriş yapar; uygulama şifre saklamaz.
const { app, BaseWindow, BrowserWindow, WebContentsView, ipcMain, Menu } = require('electron');
const fs = require('fs'), path = require('path');

const KASA = process.env.KASA_URL || 'https://adisyon-omega.vercel.app';
const PANELLER = {
  ys: { ad: 'Yemeksepeti', url: process.env.YS_URL || 'https://partner-app.yemeksepeti.com/live-orders', kok: 'https://partner-app.yemeksepeti.com/' },
  ty: { ad: 'Trendyol', url: process.env.TY_URL || 'https://partner.tgoyemek.com/auth/login?redirect=%2F', kok: 'https://partner.tgoyemek.com/' }
};
const BAR = 40, BOY = { kucuk: 380, orta: 520, buyuk: 760 };

let pencere, kasa, ust, mod = 'orta', aktif = 'ys';
const panel = {}, yeni = { ys: false, ty: false };
const ayarDosya = () => path.join(app.getPath('userData'), 'pencere.json');
try { ({ mod = mod, aktif = aktif } = JSON.parse(fs.readFileSync(ayarDosya(), 'utf8'))); } catch {}
if (!PANELLER[aktif]) aktif = 'ys';

const kaydet = () => fs.writeFileSync(ayarDosya(), JSON.stringify({ mod, aktif }));
const durum = () => ust && ust.webContents.send('durum', { mod, aktif, yeni, adlar: Object.fromEntries(Object.entries(PANELLER).map(([k, p]) => [k, p.ad])) });

// Boyutlar pencerenin iç alanından alınır; Windows'ta menü çubuğu kaldırıldığı için görünümler üstten kaymaz.
function yerlesim() {
  if (!pencere) return;
  const [G, Y] = pencere.getContentSize();
  for (const [k, v] of Object.entries(panel)) v.setVisible(mod !== 'kapali' && k === aktif);
  if (mod === 'kapali') {
    kasa.setBounds({ x: 0, y: 0, width: G, height: Y });
    ust.setBounds({ x: Math.max(0, G - 268), y: Math.max(0, Y - 52), width: 260, height: BAR });
  } else {
    const g = Math.round(mod === 'tam' ? G : Math.min(BOY[mod] || BOY.orta, G - 360)), x = G - g;
    kasa.setBounds({ x: 0, y: 0, width: Math.max(x, 1), height: Y });
    ust.setBounds({ x, y: 0, width: g, height: BAR });
    panel[aktif].setBounds({ x, y: BAR, width: g, height: Math.max(Y - BAR, 1) });
  }
  durum();
}

function modAyarla(m) { mod = m; kaydet(); yerlesim(); }
function sec(k) {
  if (!PANELLER[k]) return;
  aktif = k; yeni[k] = false;
  if (mod === 'kapali') mod = 'orta';
  kaydet(); yerlesim();
}

// Yeni sipariş belirtisi: panel bildirim gösterirse, ses çalarsa veya başlığında sayı belirirse sekmede uyarı yanar.
function bildir(k) {
  if (k === aktif && mod !== 'kapali' && pencere.isFocused()) return;
  yeni[k] = true; durum();
  if (!pencere.isFocused()) {
    if (process.platform === 'darwin') app.dock?.bounce('informational');
    else pencere.flashFrame(true);
  }
}

const BILDIRIM_KANCASI = `(() => {
  if (window.__ckBildirim || !window.Notification) return;
  window.__ckBildirim = 1;
  const N = window.Notification;
  function B(baslik, secenek) { console.log('__ck_bildirim__'); return new N(baslik, secenek); }
  B.prototype = N.prototype;
  B.requestPermission = (...a) => N.requestPermission(...a);
  Object.defineProperty(B, 'permission', { get: () => N.permission });
  window.Notification = B;
})()`;

function panelKur(k) {
  const p = PANELLER[k], v = new WebContentsView(), wc = v.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(p.kok)) { wc.loadURL(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  wc.on('dom-ready', () => wc.executeJavaScript(BILDIRIM_KANCASI).catch(() => {}));
  wc.on('console-message', (e, ...a) => { if (String(e.message ?? a[1] ?? '').includes('__ck_bildirim__')) bildir(k); });
  wc.on('media-started-playing', () => bildir(k));
  wc.on('page-title-updated', (_e, baslik) => { if (/\(\d+\)|yeni sipariş|new order/i.test(baslik)) bildir(k); });
  wc.on('focus', () => { if (yeni[k]) { yeni[k] = false; durum(); } });
  wc.loadURL(p.url);
  return v;
}

// Kasa sitesi açılamazsa uygulama boş kalmasın; tekrar deneme düğmesi gösterilir.
function hataSayfasi(wc, adres) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#171310;color:#f6f0e7;font:16px system-ui,sans-serif;text-align:center">
    <div><h2 style="margin:0 0 8px">Kasa açılamadı</h2><p style="color:#b8ad9f;margin:0 0 16px">İnternet bağlantısını kontrol edin.</p>
    <button onclick="location.href=${JSON.stringify(adres)}" style="padding:12px 20px;border:0;border-radius:8px;background:#c8101c;color:#fff;font-size:16px">Tekrar Dene</button></div>`;
  wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

// Fişi görünmez pencerede hazırlar, içeriğin yüksekliği kadar rulo kağıda doğrudan yazdırır.
async function fisYazdir({ html, mm, boy, yazici }) {
  const w = new BrowserWindow({ show: false, width: Math.round(mm * 3.78), height: 600, webPreferences: { sandbox: true } });
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const yukseklik = await w.webContents.executeJavaScript('Math.ceil(document.body.getBoundingClientRect().height)');
    const pageSize = { width: Math.round(mm * 1000), height: boy > 0 ? Math.round(boy * 1000) : Math.ceil(yukseklik * 264.6) + 3000 };
    if (process.env.CK_PDF) { fs.writeFileSync(process.env.CK_PDF + '-' + mm + '.pdf', await w.webContents.printToPDF({ pageSize: { width: mm / 25.4, height: pageSize.height / 25400 }, margins: { marginType: 'none' }, printBackground: true })); return { ok: true }; }
    const yazicilar = await w.webContents.getPrintersAsync();
    if (!yazicilar.length) return { ok: false, hata: 'Bu bilgisayarda tanımlı yazıcı yok. Önce fiş yazıcısını işletim sisteminin yazıcı ayarlarından ekleyin.' };
    if (yazici && !yazicilar.some(y => y.name === yazici)) return { ok: false, hata: 'Seçili yazıcı bulunamadı. Yönetim > Fiş bölümünden yeniden seçin.' };
    return await new Promise(bitti => w.webContents.print(
      { silent: true, deviceName: yazici || undefined, printBackground: true, margins: { marginType: 'none' }, pageSize },
      (ok, hata) => bitti({ ok, hata: ok ? '' : 'Fiş yazdırılamadı: ' + hata })));
  } catch (e) { return { ok: false, hata: 'Fiş yazdırılamadı: ' + e.message }; }
  finally { w.destroy(); }
}

// Yazdırma yalnızca kasa sitesinden istenebilir; paneller bu kanala erişemez.
const kasadanMi = e => { try { return new URL(e.senderFrame.url).origin === new URL(KASA).origin; } catch { return false; } };

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (pencere) { pencere.restore(); pencere.focus(); } });
if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  pencere = new BaseWindow({ width: 1440, height: 900, minWidth: 800, minHeight: 560, title: 'Çini Kasa', backgroundColor: '#171310', autoHideMenuBar: true, show: !process.env.CK_GIZLI });
  kasa = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'kasa-preload.js') } });
  for (const k of Object.keys(PANELLER)) panel[k] = panelKur(k);
  ust = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'ust-preload.js') } });
  for (const v of [kasa, ...Object.values(panel), ust]) pencere.contentView.addChildView(v);

  // Kasadaki Yemeksepeti ve Trendyol düğmeleri yeni pencere yerine sağdaki paneli açar.
  kasa.webContents.setWindowOpenHandler(({ url }) => {
    for (const [k, p] of Object.entries(PANELLER)) if (url.startsWith(p.kok)) { sec(k); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  kasa.webContents.on('did-fail-load', (_e, kod, _a, adres, anaCerceve) => { if (anaCerceve && kod !== -3) hataSayfasi(kasa.webContents, KASA); });

  ipcMain.handle('yazicilar', e => kasadanMi(e) ? kasa.webContents.getPrintersAsync() : []);
  ipcMain.handle('yazdir', (e, is) => kasadanMi(e) ? fisYazdir(is) : { ok: false, hata: 'İzin yok' });
  ipcMain.on('mod', (_e, m) => modAyarla(m));
  ipcMain.on('sec', (_e, k) => sec(k));
  ipcMain.on('yenile', () => panel[aktif].webContents.reload());
  ust.webContents.once('did-finish-load', yerlesim);
  ust.webContents.loadFile(path.join(__dirname, 'ust.html'));
  kasa.webContents.loadURL(KASA);
  for (const o of ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']) pencere.on(o, yerlesim);
  pencere.on('focus', () => { pencere.flashFrame(false); if (mod !== 'kapali' && yeni[aktif]) { yeni[aktif] = false; durum(); } });
  pencere.on('closed', () => app.quit());
  global.ck = { fisYazdir, kasa, panel, ust, modAyarla, sec, bildir, yeni, get pencere() { return pencere; }, get aktif() { return aktif; }, get mod() { return mod; } };
});
