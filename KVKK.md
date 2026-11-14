# Kişisel veriler ve yasal notlar

Bu not hukuki görüş değildir. Programın hangi veriyi nerede tuttuğunu ve
işletmenin dikkat etmesi gerekenleri özetler. Kesin değerlendirme için bir
avukata ve mali müşavire danışın.

## Program hangi kişisel veriyi tutar?

| Veri | Nerede | Ne kadar süre |
|---|---|---|
| Müşteri adı, telefonu, adresi | **Tutulmaz** | — |
| Personel adları (Yönetim > Personel ve fişteki kasiyer adı) | Kasa veritabanı | Personel listesinden silinene kadar; fişlerde fiş silinene kadar |
| Hatalı giriş denemesinin IP adresi (yalnızca Vercel sürümü) | Postgres `giris_deneme` tablosu | En fazla 1 gün |
| Oturum çerezi (`kasa`) | Tarayıcı | 30 gün; yalnızca giriş için zorunlu çerez, izleme yapılmaz |
| Fiş ayrıntıları (ürün, tutar, masa, ödeme türü) | Kasa veritabanı | 90 gün, sonra toplam ciroya dönüşür |

Program reklam, analiz veya izleme aracı içermez. Yazı tipleri kasanın kendi
sunucusundan verilir; Google Fonts gibi dış sunuculara istek gitmez. Site arama
motorlarına kapalıdır (`noindex`, `robots.txt`).

**Öneri:** Personel listesine gerçek ad yerine "Kasa 1", "Garson 2" gibi görev
adları yazılırsa program neredeyse hiç kişisel veri tutmaz.

## Vercel sürümü: yurt dışına aktarım

Vercel ve veritabanı sağlayıcısının (Neon, Supabase vb.) sunucuları Türkiye
dışındadır. Personel adı veya IP adresi gibi kişisel veriler bu sunuculara
yazılırsa KVKK m.9 kapsamında **yurt dışına aktarım** sayılabilir. 2024
değişikliğinden sonra bu aktarım için kural olarak KVKK'nın **standart
sözleşmesinin** imzalanması ve imzadan sonraki **5 iş günü içinde Kuruma
bildirilmesi** gerekir. Bildirim yapılmazsa idari para cezası öngörülmüştür.

Pratik seçenekler:

1. Vercel sürümünde kişisel veri tutmamak: personel adı yerine görev adı
   kullanın. Hatalı giriş kayıtları 1 günde silinir.
2. Kişisel veri tutulacaksa sağlayıcıyla KVKK standart sözleşmesi imzalayıp
   Kuruma bildirmek.
3. Kasayı yerel çalıştırmak (Mac veya Windows uygulaması). Veri işletmenin
   bilgisayarında kalır, yurt dışına çıkmaz.

## VERBİS

Kurulun 2025/1572 sayılı kararına göre yıllık çalışan sayısı 50'den az ve yıllık
mali bilanço toplamı 100 milyon TL'den az olan, ana faaliyeti özel nitelikli
veri işleme olmayan veri sorumluları VERBİS'e kayıttan muaftır. Muafiyet; personel
aydınlatma metni, veri güvenliği ve saklama-imha gibi diğer yükümlülükleri
kaldırmaz.

## Personel için aydınlatma metni (örnek)

> Kebapçı Mustafa Usta olarak, kasa programında oturum açan ve fiş düzenleyen
> çalışanlarımızın adını, iş sözleşmesinin ifası ve işletmenin meşru menfaati
> kapsamında, satışların kimin tarafından yapıldığını takip etmek amacıyla
> işliyoruz. Bu bilgi yalnızca işletme yetkilileri tarafından görülür, 90 gün
> sonra fiş ayrıntılarıyla birlikte silinir. KVKK m.11'deki haklarınızı
> kullanmak için işletme yönetimine başvurabilirsiniz.

Bu metni işletmenin kendi bilgileriyle tamamlayıp çalışanlara imzalatın.

## Vergi ve fiş

- Program **bilgi fişi** üretir; fişte "BİLGİ FİŞİDİR, MALİ DEĞERİ YOKTUR"
  yazar. Mali yazarkasa (ÖKC), e-Arşiv veya e-Adisyon yerine geçmez.
- e-Adisyon, Gelir İdaresi Başkanlığı'nın yazılı bildirim yaptığı veya
  ebelge.gib.gov.tr'de duyurduğu işletmeler için zorunludur. İşletmenize böyle
  bir bildirim gelip gelmediğini mali müşavirinizle kontrol edin.
- Fiş ayrıntıları 90 gün sonra silinir. Vergi kayıtlarının asıl kaynağı ÖKC ve
  e-belgelerdir; bu programın kayıtlarına dayanılmamalıdır.

## Lisanslar

Yazılım işletmeye özeldir, bkz. `LICENSE`. Kullanılan açık kaynak bileşenler ve
yazı tiplerinin lisansları `THIRD_PARTY_NOTICES.md` ve `site/fonts/OFL.txt`
dosyalarındadır. "Yemeksepeti" adı yalnızca işletmenin kendi Yemeksepeti
panelini açan düğmede geçer; program Yemeksepeti verisini okumaz veya
kopyalamaz.
