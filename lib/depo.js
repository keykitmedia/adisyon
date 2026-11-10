// Vercel sürümünün sunucu tarafı: kayıtlar Postgres'te, giriş şifreyle, değişiklikler kısa aralıklı sorgu ile dağıtılır.
const crypto = require('crypto');
const baslangic = require('../baslangic.json');

const AD = /^[\w.:-]{1,200}$/, RESIM = /^image\/(png|jpeg|webp|gif)$/;
let havuz, kurulum;

function sorgu(metin, deger) {
  if (global.__kasaSorgu) return global.__kasaSorgu(metin, deger);
  if (!havuz) {
    const { Pool } = require('pg');
    havuz = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, max: 3 });
  }
  return havuz.query(metin, deger);
}

// Tablolar ilk istekte kurulur; veritabanı boşsa menü ve masalar başlangıç dosyasından yüklenir.
function hazirla() {
  kurulum = kurulum || (async () => {
    await sorgu(`create sequence if not exists belge_rev;
      create table if not exists belge (c text not null, id text not null, d jsonb, rev bigint not null, kim text, primary key (c, id));
      create index if not exists belge_rev_i on belge (rev);
      create table if not exists gorsel (id text primary key, tur text not null, veri bytea not null);
      create table if not exists giris_deneme (ip text primary key, n int not null, t timestamptz not null)`);
    const { rows } = await sorgu('select count(*)::int as n from belge');
    if (!rows[0].n) for (const [c, belgeler] of Object.entries(baslangic)) for (const [id, d] of Object.entries(belgeler))
      await sorgu(`insert into belge (c, id, d, rev) values ($1, $2, $3, nextval('belge_rev')) on conflict do nothing`, [c, id, d]);
  })().catch(e => { kurulum = null; throw e; });
  return kurulum;
}

const sifre = () => process.env.KASA_SIFRE || '';
const bilet = () => crypto.createHmac('sha256', process.env.KASA_GIZLI || sifre()).update('kasa:' + sifre()).digest('hex');
const girdiMi = q => {
  const m = (q.headers.cookie || '').match(/(?:^|;\s*)kasa=([0-9a-f]{64})/);
  return !!m && crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(bilet()));
};
const ipAl = q => String(q.headers['x-forwarded-for'] || q.socket?.remoteAddress || '').split(',')[0].trim();

const oku = (q, sinir) => new Promise((ok, no) => {
  const p = []; let n = 0;
  q.on('data', d => { n += d.length; if (n > sinir) { no(Object.assign(new Error('büyük'), { kod: 413 })); q.destroy(); } else p.push(d); });
  q.on('end', () => ok(Buffer.concat(p))); q.on('error', no);
});
const gonder = (s, kod, govde = '', tur) => {
  s.statusCode = kod;
  if (tur) s.setHeader('content-type', tur);
  s.setHeader('cache-control', 'no-store');
  s.end(govde);
};
const json = (s, v) => gonder(s, 200, JSON.stringify(v), 'application/json');

// Her API çağrısını sarar: şifre ayarlı mı, giriş yapılmış mı, yazma isteği kasa sayfasından mı.
const korumali = (is, { yazma } = {}) => async (q, s) => {
  try {
    if (!sifre()) return gonder(s, 503, 'KASA_SIFRE ayarlanmadı. Vercel > Settings > Environment Variables bölümünden ekleyin.', 'text/plain;charset=utf-8');
    if (!girdiMi(q)) return gonder(s, 401);
    if (yazma && q.method !== 'GET' && q.headers['x-kasa'] !== '1') return gonder(s, 403);
    await hazirla();
    await is(q, s);
  } catch (e) {
    console.error(e);
    if (!s.headersSent) gonder(s, e.kod || 500);
  }
};

const hepsi = korumali(async (_q, s) => {
  const { rows } = await sorgu('select c, id, d from belge where d is not null');
  const { rows: [r] } = await sorgu('select coalesce(max(rev), 0)::text as rev from belge');
  const veri = {};
  for (const x of rows) (veri[x.c] = veri[x.c] || {})[x.id] = x.d;
  s.setHeader('x-kasa-mod', 'bulut');
  s.setHeader('x-kasa-rev', r.rev);
  json(s, veri);
});

// Son sürümden biraz geriden başlanır; aynı anda yazılan kayıtlar kaçmasın diye. Değişmeyenleri sayfa atlar.
const degisiklikler = korumali(async (q, s) => {
  const rev = Math.max(0, parseInt(q.query?.rev ?? new URL(q.url, 'http://x').searchParams.get('rev')) || 0);
  const { rows } = await sorgu('select c, id, d, rev::bigint::text as r, kim from belge where rev > $1 order by belge.rev limit 1000', [Math.max(0, rev - 20)]);
  json(s, { rev: rows.reduce((m, x) => Math.max(m, +x.r), rev), list: rows.map(({ r, ...x }) => x) });
});

const belge = korumali(async (q, s) => {
  const { c, id } = q.query;
  if (!AD.test(c || '') || !AD.test(id || '')) return gonder(s, 400);
  const kim = String(q.headers['x-kaynak'] || '').slice(0, 40);
  if (q.method === 'PUT') {
    const d = JSON.parse((await oku(q, 4e6)).toString());
    await sorgu(`insert into belge (c, id, d, rev, kim) values ($1, $2, $3, nextval('belge_rev'), $4)
      on conflict (c, id) do update set d = excluded.d, rev = excluded.rev, kim = excluded.kim`, [c, id, d, kim]);
    return gonder(s, 204);
  }
  if (q.method === 'DELETE') {
    await sorgu(`update belge set d = null, rev = nextval('belge_rev'), kim = $3 where c = $1 and id = $2`, [c, id, kim]);
    return gonder(s, 204);
  }
  gonder(s, 405);
}, { yazma: true });

const gorselYukle = korumali(async (q, s) => {
  if (q.method !== 'POST') return gonder(s, 405);
  const tur = q.headers['content-type'] || '';
  if (!RESIM.test(tur)) return gonder(s, 415);
  const b = await oku(q, 3e6), id = crypto.randomBytes(16).toString('hex');
  await sorgu('insert into gorsel (id, tur, veri) values ($1, $2, $3)', [id, tur, b]);
  json(s, { id, url: '/_blob/' + id, sizeBytes: b.length, contentType: tur });
}, { yazma: true });

const gorsel = korumali(async (q, s) => {
  const id = q.query.id || '';
  if (!/^[0-9a-f]{32}$/.test(id)) return gonder(s, 404);
  const { rows } = await sorgu('select tur, veri from gorsel where id = $1', [id]);
  if (!rows.length) return gonder(s, 404);
  s.setHeader('content-type', rows[0].tur);
  s.setHeader('cache-control', 'private, max-age=31536000, immutable');
  s.end(rows[0].veri);
});

const ag = korumali(async (_q, s) => json(s, { bulut: true }));

const sayfa = hata => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kasa Girişi</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#171310;color:#f6f0e7;font:16px system-ui,sans-serif;padding:16px;box-sizing:border-box}form{width:100%;max-width:320px;display:flex;flex-direction:column;gap:12px}h1{margin:0;font-size:24px}
input{padding:13px;border-radius:8px;border:1px solid #4a4036;background:#2a2420;color:inherit;font-size:18px}button{padding:13px;border:0;border-radius:8px;background:#c8101c;color:#fff;font-size:17px;font-weight:600}p{margin:0;color:#ffcf0d}
</style></head><body><form method="post" action="/giris"><h1>Kasa Girişi</h1>${hata ? `<p>${hata}</p>` : ''}<input name="sifre" type="password" autocomplete="current-password" placeholder="Şifre" autofocus required><button>Giriş</button></form></body></html>`;

// Aynı adresten 15 dakikada 5 hatalı denemeden sonra giriş beklemeye alınır.
async function giris(q, s) {
  try {
    const html = (kod, h) => gonder(s, kod, sayfa(h), 'text/html;charset=utf-8');
    if (!sifre()) return gonder(s, 503, 'KASA_SIFRE ayarlanmadı.', 'text/plain;charset=utf-8');
    if (q.method !== 'POST') return html(200);
    await hazirla();
    const ip = ipAl(q);
    const { rows: [d] } = await sorgu(`select n, t > now() - interval '15 minutes' as yeni from giris_deneme where ip = $1`, [ip]);
    if (d && d.yeni && d.n >= 5) return html(429, 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
    const girilen = new URLSearchParams((await oku(q, 2000)).toString()).get('sifre') || '';
    const a = crypto.createHash('sha256').update(girilen).digest(), b = crypto.createHash('sha256').update(sifre()).digest();
    if (!crypto.timingSafeEqual(a, b)) {
      await sorgu(`insert into giris_deneme (ip, n, t) values ($1, 1, now())
        on conflict (ip) do update set n = case when giris_deneme.t > now() - interval '15 minutes' then giris_deneme.n + 1 else 1 end, t = now()`, [ip]);
      return html(401, 'Şifre yanlış.');
    }
    await sorgu('delete from giris_deneme where ip = $1', [ip]);
    s.setHeader('set-cookie', `kasa=${bilet()}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);
    s.statusCode = 303; s.setHeader('location', '/'); s.end();
  } catch (e) { console.error(e); if (!s.headersSent) gonder(s, 500); }
}

module.exports = { hepsi, degisiklikler, belge, gorselYukle, gorsel, ag, giris };
