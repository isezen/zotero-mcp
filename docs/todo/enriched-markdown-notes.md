# Plan: Zenginlestirilmis Markdown Not Sistemi

**Durum:** Planlanmis (henuz uygulanmadi)
**Tarih:** 2026-01-30

## Amac

PDF makalelerin icerigini, formuller dahil (LaTeX formatinda), Zotero'da
child note olarak saklamak ve zotero-mcp uzerinden Claude'a sunmak.
Bu sayede Claude, makalenin metin + formul icerigine hizlica erisir;
figur analizi gerektiginde orijinal PDF'e basvurur.

## Motivasyon

Zotero'nun mevcut fulltext sistemi (`pdfWorker` / `.zotero-ft-cache`)
sadece duz metin uretir:

- Formuller kayipli (yapisal bilgi yok, sadece Unicode semboller)
- Figurler/gorseller tamamen eksik
- Tablo yapisi bozuk

Claude LaTeX formatindaki formulleri dogal olarak okuyup anlar. PDF'den
markdown + LaTeX cikarimi yapan bir arac kullanilarak, makale icerigi
cok daha zengin bir sekilde saklanabilir.

## Yontem

### 1. PDF → Markdown Donusumu (Dis Arac)

Kullanici, secilen bir PDF-to-Markdown araci ile makalenin PDF'ini
markdown formatina cevirir. Bu arac:

- Metin icerigini markdown olarak cikarir
- Formulleri LaTeX formatinda (`$...$`, `$$...$$`) yazar
- Tablo yapilarini markdown tablo olarak korur
- Figur referanslarini metin olarak belirtir

**Not:** Arac secimi kullaniciya aittir. zotero-mcp bu donusumu yapmaz,
sadece sonucu okur. Olasi araclar:

- [Marker](https://github.com/VikParuchuri/marker) — PDF → Markdown, LaTeX formul destegi
- [Nougat](https://github.com/facebookresearch/nougat) — Akademik PDF → Markdown (Meta AI)
- [MathPix](https://mathpix.com/) — Ticari, yuksek dogruluklu formul cikarimi
- [PyMuPDF4LLM](https://github.com/pymupdf/PyMuPDF-Utilities) — PDF → LLM-optimized Markdown

### 2. Zotero'ya Child Note Olarak Ekleme

Markdown ciktisi, ilgili makalenin child note'u olarak Zotero'ya eklenir:

```
POST /users/{userID}/items
Content-Type: application/json

[
  {
    "itemType": "note",
    "parentItem": "<makalenin_item_key>",
    "note": "<HTML olarak markdown icerigi>",
    "tags": [
      { "tag": "markdown-fulltext" }
    ]
  }
]
```

**Tanimlama:** Not, `markdown-fulltext` tag'i ile isaretlenir. Bu tag,
zotero-mcp'nin notu otomatik olarak tanimlamasini saglar.

**Icerik formati:** Zotero notlari HTML olarak saklanir. Markdown
icerigi iki sekilde saklanabilir:

- **Secenek A:** `<pre>` blogu icinde ham markdown
  ```html
  <pre class="markdown-fulltext">
  # Makale Basligi
  ...
  $E = mc^2$
  ...
  </pre>
  ```

- **Secenek B:** Markdown → HTML donusumu yapilmis icerik
  (Zotero'da okunabilir, ancak LaTeX formulleri HTML'de kaybolabilir)

**Onerilen:** Secenek A — Claude ham markdown + LaTeX'i dogal olarak okur.

### 3. zotero-mcp Okuma Stratejisi

`get_item_fulltext` tool'undaki fallback zinciri genisletilir:

```
1. Child note'lar arasinda "markdown-fulltext" tag'li not var mi?
   ├─ EVET → Not icerigini dondur (source: "markdown-note")
   └─ HAYIR ↓
2. Yerel .zotero-ft-cache mevcut mu? (forceRemote degilse)
   ├─ EVET → Cache'den oku (source: "local")
   └─ HAYIR ↓
3. API /fulltext endpoint'i
   ├─ EVET → API'den al (source: "api")
   └─ HAYIR → "No full-text content available" mesaji
```

### 4. Yeni MCP Tool (Opsiyonel)

Markdown notu olusturmak icin yeni bir tool eklenebilir:

```
create_markdown_note(itemKey, content)
```

Bu tool:
- `parentItem` olarak `itemKey`'i ayarlar
- `markdown-fulltext` tag'ini ekler
- Mevcut markdown notu varsa gunceller (PATCH)
- Icerik 250K sinirini asarsa uyari verir

## Teknik Kisitlar

| Kisit                        | Deger / Aciklama                        |
| ---------------------------- | --------------------------------------- |
| Not boyut siniri (sync)      | 250.000 karakter                        |
| Not boyut siniri (yerel DB)  | ~1 milyar byte (SQLite siniri)          |
| Tipik makale boyutu          | 40.000–80.000 karakter (5-30 sayfa)     |
| Icerik formati               | HTML (Zotero tarafindan sanitize edilir) |
| Tag filtresi                 | `markdown-fulltext` (sabit, degismez)   |
| API yazma                    | `POST /items` + `Zotero-Write-Token`    |
| API okuma                    | `GET /items/{key}/children`             |

## Uygulama Adimlari

1. **`zotero-api.ts`:** `getItemChildren()` fonksiyonu zaten mevcut.
   Tag filtresi icin ek bir yardimci fonksiyon eklenebilir
   (veya client tarafinda filtreleme yapilir).

2. **`index.ts` — `get_item_fulltext` guncelleme:**
   Fallback zincirinin basina markdown-note kontrolu eklenir.
   Yeni `source: "markdown-note"` degeri dondurulur.

3. **`index.ts` — Yeni tool (opsiyonel): `create_markdown_note`:**
   Markdown icerigini child note olarak olusturur.

4. **Testler:** Yeni fallback mantigi icin unit testler eklenir.

5. **Dokumanlar:** README, CLAUDE.md, CHANGELOG guncellenir.

## Acik Sorular

- [ ] Markdown icerigi `<pre>` blogu icinde mi yoksa HTML'e donusturulmus
      mu saklanmali?
- [ ] 250K sinirini asan makaleler icin otomatik bolme yapilmali mi?
- [ ] Markdown notu guncelleme (PATCH) mi yoksa silip yeniden olusturma mi
      tercih edilmeli?
- [ ] PDF → Markdown donusumu zotero-mcp icinde mi (yeni bagimlilık) yoksa
      dis arac olarak mi kalacak?
- [ ] `create_markdown_note` tool'u ilk surumde mi yoksa sonraki bir
      iterasyonda mi eklenecek?

## Kaynaklar

- [Zotero Web API v3: Write Requests](https://www.zotero.org/support/dev/web_api/v3/write_requests)
- [Zotero Web API v3: Full-Text Content](https://www.zotero.org/support/dev/web_api/v3/fulltext_content)
- [Zotero Web API v3: Basics](https://www.zotero.org/support/dev/web_api/v3/basics)
- [Zotero Forum: Note Character Limits](https://forums.zotero.org/discussion/31735/notes-characters-length)
- [Zotero Forum: Note File Size Limits](https://forums.zotero.org/discussion/7211/note-file-size-limits)
- [Zotero GitHub: pdf-worker](https://github.com/zotero/pdf-worker)
