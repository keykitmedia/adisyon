// Vercel sürümünün sunucu tarafı: kayıtlar Postgres'te, giriş şifreyle, değişiklikler kısa aralıklı sorgu ile dağıtılır.
const crypto = require('crypto');
const sifreler = require('./sifre');
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
      create table if not exists giris_deneme (ip text primary key, n int not null, t timestamptz not null);
      create table if not exists ayar (k text primary key, v text not null)`);
    // Şifre veritabanında özet olarak durur; ilk şifre KASA_SIFRE ya da 184904'tür ve Yönetim'den değiştirilir.
    await sorgu('insert into ayar (k, v) values ($1, $2), ($3, $4) on conflict do nothing',
      ['sifre', sifreler.hashle(process.env.KASA_SIFRE || sifreler.VARSAYILAN), 'gizli', crypto.randomBytes(32).toString('hex')]);
    const { rows } = await sorgu('select count(*)::int as n from belge');
    if (!rows[0].n) for (const [c, belgeler] of Object.entries(baslangic)) for (const [id, d] of Object.entries(belgeler))
      await sorgu(`insert into belge (c, id, d, rev) values ($1, $2, $3, nextval('belge_rev')) on conflict do nothing`, [c, id, d]);
  })().catch(e => { kurulum = null; throw e; });
  return kurulum;
}

// Ayarlar birkaç saniyelik önbellekle okunur; şifre değişince diğer sunucu örnekleri en geç 15 saniyede görür.
let ayarlar = null;
async function ayarAl(taze) {
  if (!taze && ayarlar && Date.now() - ayarlar.t < 15000) return ayarlar;
  const { rows } = await sorgu('select k, v from ayar');
  const a = Object.fromEntries(rows.map(r => [r.k, r.v]));
  return (ayarlar = { sifre: a.sifre, gizli: process.env.KASA_GIZLI || a.gizli, t: Date.now() });
}
const bilet = a => crypto.createHmac('sha256', a.gizli).update('kasa:' + a.sifre).digest('hex');
const cerez = a => `kasa=${bilet(a)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`;
const girdiMi = (q, a) => {
  const m = (q.headers.cookie || '').match(/(?:^|;\s*)kasa=([0-9a-f]{64})/);
  return !!m && crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(bilet(a)));
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

// Her API çağrısını sarar: giriş yapılmış mı, yazma isteği kasa sayfasından mı.
const korumali = (is, { yazma } = {}) => async (q, s) => {
  try {
    await hazirla();
    if (!girdiMi(q, await ayarAl())) return gonder(s, 401);
    if (yazma && q.method !== 'GET' && q.headers['x-kasa'] !== '1') return gonder(s, 403);
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

const ag = korumali(async (q, s) => {
  if (q.method === 'POST') {
    const { eski, yeni } = JSON.parse((await oku(q, 1000)).toString());
    const a = await ayarAl(true);
    if (!sifreler.dogrula(eski, a.sifre)) return gonder(s, 400, JSON.stringify({ hata: 'Mevcut şifre yanlış.' }), 'application/json;charset=utf-8');
    if (!sifreler.gecerli(yeni)) return gonder(s, 400, JSON.stringify({ hata: 'Yeni şifre 4 ile 64 karakter arasında olmalı.' }), 'application/json;charset=utf-8');
    await sorgu(`update ayar set v = $1 where k = 'sifre'`, [sifreler.hashle(yeni)]);
    s.setHeader('set-cookie', cerez(await ayarAl(true)));
  }
  json(s, { bulut: true });
}, { yazma: true });

function cikis(_q, s) {
  s.statusCode = 303; s.setHeader('location', '/giris');
  s.setHeader('set-cookie', 'kasa=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  s.end();
}

// Aynı adresten 15 dakikada 5 hatalı denemeden sonra giriş beklemeye alınır.
async function giris(q, s) {
  try {
    const html = (kod, h) => gonder(s, kod, sifreler.sayfa(h), 'text/html;charset=utf-8');
    if (q.method !== 'POST') return html(200);
    await hazirla();
    const ip = ipAl(q);
    const { rows: [d] } = await sorgu(`select n, t > now() - interval '15 minutes' as yeni from giris_deneme where ip = $1`, [ip]);
    if (d && d.yeni && d.n >= 5) return html(429, 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
    const girilen = new URLSearchParams((await oku(q, 2000)).toString()).get('sifre') || '';
    const a = await ayarAl(true);
    if (!sifreler.dogrula(girilen, a.sifre)) {
      await sorgu(`insert into giris_deneme (ip, n, t) values ($1, 1, now())
        on conflict (ip) do update set n = case when giris_deneme.t > now() - interval '15 minutes' then giris_deneme.n + 1 else 1 end, t = now()`, [ip]);
      return html(401, 'Şifre yanlış.');
    }
    await sorgu('delete from giris_deneme where ip = $1', [ip]);
    // Hatalı giriş kayıtları IP adresi içerir; bir günden eskiler tutulmaz.
    await sorgu("delete from giris_deneme where t < now() - interval '1 day'");
    s.setHeader('set-cookie', cerez(a));
    s.statusCode = 303; s.setHeader('location', '/'); s.end();
  } catch (e) { console.error(e); if (!s.headersSent) gonder(s, 500); }
}

module.exports = { hepsi, degisiklikler, belge, gorselYukle, gorsel, ag, giris, cikis };
