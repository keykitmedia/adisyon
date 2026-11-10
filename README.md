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
