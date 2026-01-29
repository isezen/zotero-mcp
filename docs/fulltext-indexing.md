# Zotero Full-Text Indexing: Teknik Dokuman

Bu dokuman, Zotero'nun PDF dosyalarından tam metin (full-text) icerigi nasil
cikardigi, nerede sakladigi ve API uzerinden nasil sunuldugunu aciklar.

## 1. Genel Bakis

Zotero, kutuphanedeki PDF ve HTML eklerinin icerigini **otomatik olarak
indeksler**. Bu indeks sayesinde:

- Zotero icinde tam metin aramasi yapilabilir
- zotero.org ve mobil uygulamalarda arama calisir
- Senkronize cihazlarda ayni arama sonuclari elde edilir
- MCP gibi araclar full-text icerigi programatik olarak okuyabilir

## 2. Metin Cikarma Sureci

### 2.1. Zotero 5/6: Harici pdftotext

Zotero 5.0.36 oncesinde `pdftotext` ve `pdfinfo` araclarini kullanicilar
manuel indiriyordu. 5.0.36 ile bu araclar Zotero'ya gomulu hale geldi.

Zotero soyle bir komut calistiriyordu:

```
pdfinfo <dosya.pdf> <.zotero-ft-info>
pdftotext -enc UTF-8 -nopgbrk -l 500 <dosya.pdf> <.zotero-ft-cache>
```

Parametreler:

| Parametre    | Anlam                                           |
| ------------ | ----------------------------------------------- |
| `-enc UTF-8` | Cikti kodlamasi UTF-8                           |
| `-nopgbrk`   | Sayfa sonu karakterlerini kaldirma              |
| `-l 500`     | Maksimum 500 sayfa (pdftotext tarafinda sinir)  |

Bu araclar **Xpdf** projesinden geliyordu. Zotero, Windows icin `pdfinfo`'yu
ozel olarak derlemis ve ciktiyi dosyaya yonlendirme destegi eklemisti.

### 2.2. Zotero 7: Dahili PDF Worker

Zotero 7 ile birlikte harici `pdftotext`/`pdfinfo` ikili dosyalari terk edildi.
Yerine **JavaScript tabanli `pdfWorker`** sistemi geldi:

- **`pdfWorker/manager.js`** — PDF islemlerini yoneten yonetici
- **`getFullText()`** — Tam metni PDF'den cikaran fonksiyon
- Mozilla'nin **pdf.js** kutuphanesi ile entegre

Bu gecis, platforma ozgu ikili dosya sorunlarini ortadan kaldirdi ve metin
cikarma ile PDF goruntuleyicinin ayni motoru kullanmasini sagladi.

## 3. Cache Dosyalari

Her eklentinin depolama dizininde (`storage/{KEY}/`) su dosyalar bulunabilir:

| Dosya                    | Icerik                                              |
| ------------------------ | --------------------------------------------------- |
| `.zotero-ft-cache`       | Cikarilmis duz metin (UTF-8)                        |
| `.zotero-ft-info`        | PDF meta bilgisi (sayfa sayisi, yazar, baslik vb.)   |
| `.zotero-ft-unprocessed` | Henuz islenmemis icerik (senkronizasyondan gelen)    |

### Yasam dongüsu:

1. PDF eklentisi kutupaneye eklenir
2. Zotero, bilgisayar 30 sn bosta kaldiginda indeksleme baslatir
3. Once `.zotero-ft-unprocessed` dosyasi olusturulur (senkronize icerik icin)
4. Islenince `.zotero-ft-cache` ve `.zotero-ft-info` dosyalari olusturulur
5. `.zotero-ft-unprocessed` silinir

### Onemli notlar:

- Bu dosyalar Zotero tarafindan yonetilir, **elle degistirilmemeli**
- `.zotero-ft-cache` salt metin icerir — tablo yapisi, figur, formul **yoktur**
- Dosyalar varsayilan olarak gizlidir (`.` ile basladiklari icin)

## 4. Indeksleme Sinirlari

Zotero'nun varsayilan indeksleme sinirlari:

| Sinir             | Varsayilan Deger     |
| ----------------- | -------------------- |
| Maksimum karakter | 500.000 (~100k kelime, ~180-200 sayfa) |
| Maksimum sayfa    | 100                  |
| pdftotext siniri  | 500 sayfa (`-l 500`) |

Bu degerler **Zotero Tercihler > Arama** panelinden degistirilebilir.
Deger `0` yapilirsa indeksleme tamamen devre disi kalir.

**Uyari:** Cok yuksek degerler (3M karakter, 500 sayfa gibi) Zotero'nun
"Not Responding" durumuna dusmesine neden olabilir.

## 5. OCR Destegi

Zotero **OCR yapmaz**. PDF'te gomulu metin katmani (text layer) yoksa
— yani PDF taranmis bir gorsel ise — Zotero bu PDF'i indeksleyemez.
Indeksleme icin PDF'in oncelikle OCR yazilimi ile islenmis olmasi gerekir.

## 6. Indeks Durumu Dogrulama

Bir eklentinin indekslenip indekslenmedigini kontrol etmek icin:

1. Zotero'da eklentiyi secin
2. Sag panelde **"Indexed: Yes"** veya **"Indexed: No"** yazisina bakin
3. Indekslenmemisse yesil ok ikonuyla **Reindex** yapilabilir

## 7. Zotero Web API v3: Full-Text Endpoint'leri

### 7.1. Tam metni oku

```
GET /users/{userID}/items/{itemKey}/fulltext
```

Basarili yanit (`200 OK`):

```json
{
  "content": "Makalenin tam metni burada...",
  "indexedPages": 6,
  "totalPages": 6
}
```

### 7.2. Tam metni yaz

```
PUT /users/{userID}/items/{itemKey}/fulltext
Content-Type: application/json
```

PDF icin:
```json
{
  "content": "...",
  "indexedPages": 6,
  "totalPages": 6
}
```

Metin belgesi icin:
```json
{
  "content": "...",
  "indexedChars": 5000,
  "totalChars": 5000
}
```

### 7.3. Degisen icerikleri sorgula

```
GET /users/{userID}/fulltext?since={version}
```

Yanit: item key → versiyon eslesmesi (senkronizasyon icin).

### 7.4. API alanlari

| Alan           | Tur      | Aciklama                              |
| -------------- | -------- | ------------------------------------- |
| `content`      | string   | Cikarilmis duz metin                  |
| `indexedPages` | integer  | Indekslenen sayfa sayisi (PDF)        |
| `totalPages`   | integer  | Toplam sayfa sayisi (PDF)             |
| `indexedChars` | integer  | Indekslenen karakter (metin belgesi)  |
| `totalChars`   | integer  | Toplam karakter (metin belgesi)       |

Versiyon takibi `Last-Modified-Version` header'i ile yapilir.

## 8. Full-Text vs. Orijinal PDF

| Ozellik            | Full-Text (`.zotero-ft-cache`) | Orijinal PDF               |
| ------------------ | ------------------------------ | -------------------------- |
| Format             | Duz metin (plain text)         | PDF (binary)               |
| Tablolar           | Duz metin olarak (yapisiz)     | Orijinal tablo yapisi      |
| Figurler/Gorseller | **Yok** (tamamen kayip)        | Korunmus                   |
| Formuller          | Metin temsili (kayipli)        | Orijinal goruntu           |
| Sayfa duzeni       | Kayip                          | Korunmus                   |
| Dosya boyutu       | Kucuk (KB)                     | Buyuk (MB)                 |
| Erisim hizi        | Cok hizli                      | Yavas (ozellikle API'den)  |
| Kullanim           | Arama, hizli onizleme          | Detayli inceleme, analiz   |

## 9. zotero-mcp'deki Kullanim

| MCP Tool              | Kaynak                  | Aciklama                         |
| --------------------- | ----------------------- | -------------------------------- |
| `get_item_fulltext`   | `.zotero-ft-cache` veya API `/fulltext` | Cikarilmis duz metin |
| `read_attachment`     | Local PDF veya API download | Orijinal dosya (PDF)         |
| `get_item_attachments`| API `/children`         | Ek listesi ve meta bilgi         |

Uc tool'da da `forceRemote` parametresi ile yerel depolama atlanip
dogrudan API'den veri cekilebilir.

## Kaynaklar

- [Zotero: PDF Full-Text Indexing](https://www.zotero.org/support/pdf_fulltext_indexing)
- [Zotero Web API v3: Full-Text Content](https://www.zotero.org/support/dev/web_api/v3/fulltext_content)
- [Zotero GitHub: pdf-worker](https://github.com/zotero/pdf-worker)
- [Zotero GitHub: cross-xpdf (eski pdftotext)](https://github.com/zotero/cross-xpdf)
- [Forum: Full-text index ve PDF search farki](https://forums.zotero.org/discussion/101089/difference-between-full-text-index-and-pdf-search)
- [Forum: .zotero-ft-cache bilgi](https://forums.zotero.org/discussion/122926/info-on-complementary-zotero-library-files)
- [Forum: Full-text cache nedir](https://forums.zotero.org/discussion/24845/where-is-stored-the-full-text-index-in-zotero)
- [Forum: Indeksleme sinirlari](https://forums.zotero.org/discussion/22459/indexing-in-zotero-standalone-limit-characters-or-pages)
