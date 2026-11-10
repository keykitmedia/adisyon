// Çini Kasa ve Yemeksepeti panelini tek pencerede yan yana açar. Her iki siteye de kullanıcı kendisi giriş yapar.
const { app, BaseWindow, BrowserWindow, WebContentsView, ipcMain } = require('electron');
const fs = require('fs'), path = require('path');
const { baslat } = require('./sunucu');

const PORT = +process.env.KASA_PORT || 4173;
const PANEL = process.env.PANEL_URL || 'https://partner-app.yemeksepeti.com/live-orders';
const BAR = 38, BOY = { kucuk: 380, orta: 520, buyuk: 760 };

let pencere, kasa, panel, ust, mod = 'orta';
const ayarDosya = () => path.join(app.getPath('userData'), 'pencere.json');
try { mod = JSON.parse(fs.readFileSync(ayarDosya(), 'utf8')).mod || mod; } catch {}

function yerlesim() {
  const { width: G, height: Y } = pencere.getContentBounds();
  if (mod === 'kapali') {
    panel.setVisible(false);
    kasa.setBounds({ x: 0, y: 0, width: G, height: Y });
    ust.setBounds({ x: G - 158, y: Y - 50, width: 150, height: BAR });
  } else {
    const g = mod === 'tam' ? G : Math.min(BOY[mod], G - 360), x = G - g;
    kasa.setBounds({ x: 0, y: 0, width: Math.max(x, 1), height: Y });
    ust.setBounds({ x, y: 0, width: g, height: BAR });
    panel.setBounds({ x, y: BAR, width: g, height: Y - BAR });
    panel.setVisible(true);
  }
  ust.webContents.send('mod', mod);
}

// Fişi görünmez pencerede hazırlar, içeriğin yüksekliği kadar rulo kağıda doğrudan yazdırır.
async function fisYazdir({ html, mm, yazici }) {
  const w = new BrowserWindow({ show: false, width: Math.round(mm * 3.78), height: 600, webPreferences: { sandbox: true } });
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const yukseklik = await w.webContents.executeJavaScript('Math.ceil(document.body.getBoundingClientRect().height)');
    const pageSize = { width: mm * 1000, height: Math.ceil(yukseklik * 264.6) + 3000 };
    if (process.env.CK_PDF) { fs.writeFileSync(process.env.CK_PDF + '-' + mm + '.pdf', await w.webContents.printToPDF({ pageSize: { width: mm / 25.4, height: pageSize.height / 25400 }, margins: { marginType: 'none' }, printBackground: true })); return { ok: true }; }
    const yazicilar = await w.webContents.getPrintersAsync();
    if (!yazicilar.length) return { ok: false, hata: 'Bu Mac\'te tanımlı yazıcı yok. Önce fiş yazıcısını Sistem Ayarları > Yazıcılar\'dan ekleyin.' };
    if (yazici && !yazicilar.some(y => y.name === yazici)) return { ok: false, hata: 'Seçili yazıcı bulunamadı. Yönetim > İşletme bölümünden yeniden seçin.' };
    return await new Promise(bitti => w.webContents.print(
      { silent: true, deviceName: yazici || undefined, printBackground: true, margins: { marginType: 'none' }, pageSize },
      (ok, hata) => bitti({ ok, hata: ok ? '' : 'Fiş yazdırılamadı: ' + hata })));
  } catch (e) { return { ok: false, hata: 'Fiş yazdırılamadı: ' + e.message }; }
  finally { w.destroy(); }
}

function modAyarla(m) {
  mod = m;
  fs.writeFileSync(ayarDosya(), JSON.stringify({ mod }));
  yerlesim();
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (pencere) { pencere.restore(); pencere.focus(); } });

app.whenReady().then(async () => {
  const sunucu = await baslat({ port: PORT, veriKlasoru: app.getPath('userData') });
  app.on('before-quit', sunucu.bitir);
  pencere = new BaseWindow({ width: 1440, height: 900, minWidth: 800, minHeight: 560, title: 'Çini Kasa', backgroundColor: '#171310', show: !process.env.CK_GIZLI });
  kasa = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'kasa-preload.js') } });
  panel = new WebContentsView();
  ust = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'ust-preload.js') } });
  for (const v of [kasa, panel, ust]) pencere.contentView.addChildView(v);

  // Kasadaki Yemeksepeti düğmesi yeni pencere yerine yandaki paneli açar; giriş pencereleri normal açılır.
  kasa.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://partner-app.yemeksepeti.com/')) { if (mod === 'kapali') modAyarla('orta'); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  // Panelin kendi bağlantıları sağ tarafta açılır; giriş pencereleri normal açılır.
  panel.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://partner-app.yemeksepeti.com/')) { panel.webContents.loadURL(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  ipcMain.handle('yazicilar', () => kasa.webContents.getPrintersAsync());
  ipcMain.handle('yazdir', (_e, is) => fisYazdir(is));
  ipcMain.on('mod', (_e, m) => modAyarla(m));
  ipcMain.on('yenile', () => panel.webContents.reload());
  ust.webContents.once('did-finish-load', yerlesim);
  ust.webContents.loadFile(path.join(__dirname, 'ust.html'));
  kasa.webContents.loadURL(sunucu.url);
  panel.webContents.loadURL(PANEL);
  pencere.on('resize', yerlesim);
  pencere.on('closed', () => app.quit());
  global.ck = { fisYazdir, kasa, panel, ust, modAyarla, get pencere() { return pencere; } };
});
