# Çini Kasa

Restoran için masa bazlı adisyon ve kasa programı. Masa planı, adisyon, ürün ürün veya toplu ödeme (nakit, kredi kartı, IBAN / havale), X ve Z raporları, günlük, aylık ve yıllık ciro, ürün ve fiyat yönetimi, 80 / 58 mm fiş yazdırma.

Kasa bu bilgisayarda `http://localhost:4173` adresinde çalışır. Aynı ağdaki telefon ve tabletler bilgisayarın IP adresiyle, PIN girerek bağlanır.

## Çalıştırma

**Windows:** [Node.js LTS](https://nodejs.org) kurun, `Cini-Kasa-Baslat.bat` dosyasına çift tıklayın.

**Mac veya Windows, terminalden:**

```bash
node sunucu.js
```

**Masaüstü uygulaması (kasa ve Yemeksepeti paneli yan yana):**

```bash
npm install
npm start
```

## Masaüstü uygulamasını paketleme

Kasa ve Yemeksepeti paneli aynı pencerede açılır, localhost sunucusunu uygulama kendisi başlatır.

```bash
npm install
npm run paketle:win
npm run paketle:mac
```

Çıktı `dist/` klasörüne yazılır. Windows için `dist/Cini Kasa-win32-x64/Cini Kasa.exe` çalıştırılır, Node.js gerekmez.

## Vercel'de çalıştırma

Vercel sürümünde kayıtlar Postgres veritabanında durur, girişte şifre sorulur ve cihazlar birkaç saniyede bir senkronize olur.

1. Vercel'de **Add New > Project** ile bu depoyu içe aktarın. Framework Preset: **Other**. Diğer ayarlar `vercel.json` içinde.
2. Projede **Storage > Create Database** ile bir Postgres veritabanı (Neon veya Supabase) oluşturup projeye bağlayın. `DATABASE_URL` ya da `POSTGRES_URL` kendiliğinden eklenir.
3. **Deployments** bölümünden son dağıtımı **Redeploy** edin.
4. Siteye girin. İlk şifre `184904`; **Yönetim > Giriş ve Ağ** bölümünden hemen değiştirin.
5. Eski kayıtları taşımak için **Yönetim > Veri > Yedekten geri yükle** ile kasanın yedek dosyasını seçin.

İsteğe bağlı ortam değişkenleri: `KASA_SIFRE` yalnızca ilk kurulumda başlangıç şifresi olarak kullanılır; `KASA_GIZLI` oturum çerezlerini imzalayan anahtardır, verilmezse veritabanında rastgele üretilir. Tablolar ilk istekte kendiliğinden kurulur; veritabanı boşsa menü ve masalar `baslangic.json` dosyasından yüklenir.

## Veriler

- `node sunucu.js` ile çalışınca kayıtlar `veri/` klasöründe durur.
- Masaüstü uygulamasında kayıtlar işletim sisteminin uygulama veri klasöründe durur.
- Günlük yedekler kullanıcı klasöründeki `Cini Kasa Yedek` içine alınır.
- Ağdan giriş PIN'i ilk çalıştırmada üretilir, `Yönetim > Ağ ve PIN` bölümünden değiştirilir.

`baslangic.json` yalnızca ilk açılışta kullanılan menü, masa ve ayar verisidir.

## Dosyalar

| Dosya | Görevi |
|---|---|
| `sunucu.js` | Localhost sunucusu, veri kaydı, yedekler, ağ girişi |
| `site/index.html` | Kasa arayüzü |
| `site/yerel-db.js` | Arayüzü sunucuya bağlayan veri katmanı |
| `main.js` | Electron masaüstü uygulaması |
| `Cini-Kasa-Baslat.bat` | Windows başlatıcısı |

Bu program bilgi fişi üretir; mali yazarkasanın (ÖKC) yerine geçmez.

## Lisans ve gizlilik

Yazılım yalnızca Kebapçı Mustafa Usta işletmesine özeldir, bkz. [LICENSE](LICENSE). Kişisel veriler, KVKK ve vergi notları için [KVKK.md](KVKK.md), açık kaynak bileşenler için [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
