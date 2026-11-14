// Kasa giriş şifresi: yerel sunucu ve Vercel sürümü birlikte kullanır. Şifre düz metin tutulmaz, scrypt özetiyle saklanır.
const crypto = require('crypto');

const VARSAYILAN = '184904';

const hashle = sifre => {
  const tuz = crypto.randomBytes(16).toString('hex');
  return `scrypt:${tuz}:${crypto.scryptSync(String(sifre), tuz, 32).toString('hex')}`;
};

const dogrula = (sifre, kayit) => {
  const [tur, tuz, ozet] = String(kayit || '').split(':');
  if (tur !== 'scrypt' || !tuz || !ozet) return false;
  const a = crypto.scryptSync(String(sifre), tuz, 32), b = Buffer.from(ozet, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const gecerli = s => typeof s === 'string' && s.length >= 4 && s.length <= 64;

const sayfa = hata => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Kasa Girişi</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#171310;color:#f6f0e7;font:16px system-ui,sans-serif;padding:16px;box-sizing:border-box}form{width:100%;max-width:320px;display:flex;flex-direction:column;gap:12px}h1{margin:0;font-size:24px}
input{padding:13px;border-radius:8px;border:1px solid #4a4036;background:#2a2420;color:inherit;font-size:22px;text-align:center;letter-spacing:.15em}button{padding:13px;border:0;border-radius:8px;background:#c8101c;color:#fff;font-size:17px;font-weight:600}p{margin:0;color:#ffcf0d}
</style></head><body><form method="post" action="/giris"><h1>Kasa Girişi</h1>${hata ? `<p>${hata}</p>` : ''}<input name="sifre" type="password" autocomplete="current-password" placeholder="Şifre" aria-label="Şifre" autofocus required><button>Giriş</button></form></body></html>`;

module.exports = { VARSAYILAN, hashle, dogrula, gecerli, sayfa };
