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
sadece sonucu okur. Arac secenekleri ve karsilastirmasi asagidadir.

#### Arac Secenekleri

| Ozellik | PaddleOCR-VL-1.5 ⭐ | PaddleOCR-VL | paddleocr (pipeline) | MinerU 2.5 | dots.ocr | Marker |
|---------|---------------------|--------------|----------------------|------------|----------|--------|
| **Lisans** | Apache 2.0 | Apache 2.0 | Apache 2.0 | AGPL-3.0 | MIT | GPL-3.0 |
| **Yaklasim** | Tek VLM | Tek VLM | Pipeline (<100M) | Tek VLM | Tek VLM | Pipeline |
| **Parametre** | 0.9B | 0.9B | <100M (coklu model) | 1.2B | 1.7B | Pipeline (kucuk) |
| **LaTeX formul** | ✅ **SOTA (CDM 94.21%)** | ✅ CDM 91.43% | ✅ PP-FormulaNet | ✅ Iyi | ✅ Iyi | ✅ Var |
| **Tablo destegi** | HTML (TEDS 90.97%) | HTML | HTML (SLANeXt) | HTML+LaTeX | HTML | Markdown |
| **Okuma sirasi** | ✅ SOTA | ✅ SOTA | ✅ Iyi | ✅ SOTA | ✅ SOTA | ✅ Iyi |
| **JSON cikti** | ✅ | ✅ | ✅ Tam layout | ✅ Tam layout | ✅ bbox+kategori | ✅ JSON modu |
| **Markdown cikti** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **OmniDocBench** | **94.5%** | 92.56% | — | 90.67% | 87.5% | — |
| **Apple MLX** | ❌ (cok yeni) | ✅ [MLX port](https://huggingface.co/gamhtoi/PaddleOCR-VL-MLX) | ❌ (CPU calısır) | ✅ vlm-mlx | ❌ | ⚠️ MPS |
| **Kurulum** | Docker/vLLM | `pip install paddleocr[all]` | `pip install paddleocr[doc-parser]` | `pip install mineru[all]` | git clone + vLLM | `pip install marker-pdf` |
| **MCP server** | ❌ | ❌ | ❌ | ✅ [mcp-mineru](https://github.com/TINKPA/mcp-mineru) | ❌ | ❌ |

> **Not:** `paddleocr` pip paketi (v3.4.0, 29 Ocak 2026) hem PP-StructureV3
> (pipeline) hem de PaddleOCR-VL (VLM) backend'lerini icerir. Kurulum:
> `pip install "paddleocr[all]"` ile her ikisi de kullanilabilir.

#### Cikti Formati Ozeti (LaTeX + JSON + Markdown destekleyenler)

| Arac | Formul → LaTeX | JSON cikti | Markdown cikti |
|------|:--------------:|:----------:|:--------------:|
| **PaddleOCR-VL-1.5** | ✅ | ✅ | ✅ |
| **PaddleOCR-VL** | ✅ | ✅ | ✅ |
| **paddleocr (pipeline)** | ✅ | ✅ | ✅ |
| **MinerU 2.5** | ✅ | ✅ | ✅ |
| **dots.ocr** | ✅ | ✅ | ✅ |
| **Marker** | ✅ | ✅ | ✅ |

> Yalnizca uc kriteri de (LaTeX formul + JSON + Markdown) karsilayan araclar
> listelenmistir. Elenenler: Nougat, MathPix (JSON yok), PyMuPDF4LLM (LaTeX+JSON yok).

#### GPU Hiz Karsilastirmasi (A100, FastDeploy)

| Model | Sayfa/sn | Token/sn | 512 sayfa toplam | RTX 4090D VRAM |
|-------|----------|----------|------------------|----------------|
| **PaddleOCR-VL-1.5** | **1.43** | **2016** | 944 sn | 16.3 GB |
| PaddleOCR-VL | 1.23 | 1700 | 1104 sn | — |
| MinerU 2.5 | 1.00 | 1415 | 1356 sn | — |
| MonkeyOCR-pro-1.2B | 0.63 | 949 | 2152 sn | — |
| dots.ocr | 0.28 | 374 | 3236 sn | — |

> Kaynak: [PaddleOCR-VL-1.5 arxiv makalesi, Tablo 6](https://arxiv.org/html/2601.21957v1)

#### Apple M1 Max 32 GB Performans Tahmini

| Arac | Backend | 8 sayfa | 20 sayfa | 100 makale (ort. 15 s.) | Bellek |
|------|---------|---------|----------|-------------------------|--------|
| **PaddleOCR-VL** | MLX (topluluk) | **~30 sn** | **~1.2 dk** | **~6.5 saat** | ~4 GB |
| paddleocr pipeline | CPU | ~50 sn | ~2 dk | ~11 saat | ~4-6 GB |
| MinerU | vlm-mlx-engine | ~6 dk | ~15 dk | ~19 saat | ~6-8 GB |
| Marker | MPS (PyTorch) | ~2 dk | ~5 dk | ~6 saat | ~3-4 GB |
| dots.ocr | MPS (PyTorch) | ~60 dk | ~2.5 saat | ~125 saat | ~10-15 GB |

> **Not:** PaddleOCR-VL MLX tahmini M4 Max benchmark'ina (~2-3 sn/goruntu)
> dayanir. M1 Max biraz daha yavas olabilir (~3-5 sn/goruntu).
> PaddleOCR-VL-**1.5** icin MLX portu henuz mevcut degil (29 Ocak 2026'da cikti).

#### Saklama Limitleri Karsilastirmasi

| | Yerel (`.zotero-ft-cache`) | API (`/fulltext`) | Child Note |
|---|---|---|---|
| **PDF limiti** | Varsayilan 100 sayfa | Belgelenmemis | — |
| **Metin limiti** | Varsayilan 500K karakter | Belgelenmemis | **250K karakter** (sync) |
| **Format** | Duz metin | Duz metin | HTML |
| **Formul/figur** | ❌ Yok | ❌ Yok | ✅ LaTeX yazilabilir |
| **Yapi/duzen** | ❌ Kayip | ❌ Kayip | ✅ Korunabilir |

> Tipik bir akademik makale markdown formatinda ~40-80K karakter tutar,
> 250K limitinin cok altinda kalir.

#### Tavsiye (Ocak 2026)

##### Donanim Bazinda Onerilen Arac

| | Apple M1 Max 32 GB | RTX 3090 24 GB (Linux) |
|---|---|---|
| **1. Tercih** | PaddleOCR-VL (MLX) | PaddleOCR-VL-1.5 (CUDA) |
| **Dogruluk** | %92.56 | **%94.5** |
| **Formul CDM** | %91.43 | **%94.21** |
| **Hiz** | ~3-5 sn/goruntu | ~0.8-1.2 sayfa/sn |
| **Bellek** | ~4 GB | ~16 GB |
| **2. Tercih** | paddleocr pipeline (CPU) | MinerU 2.5 (vLLM) |
| **Neden 2.?** | MLX gerektirmez, zaten kurulu | MCP server mevcut |

##### Apple M1 Max 32 GB — PaddleOCR-VL (MLX)

1. ✅ **MLX native** — ~3-5 sn/goruntu, ~4 GB bellek
2. ✅ **OmniDocBench %92.56** — MinerU (%90.67) ve dots.ocr'dan (%87.5) iyi
3. ✅ **Formul CDM %91.43** — cok iyi LaTeX cikarimi
4. ✅ **0.9B parametre** — en kompakt SOTA model
5. ✅ **Apache 2.0** — en ozgur lisans

```bash
# MLX portu kurulumu
pip install mlx transformers pillow
# Model: gamhtoi/PaddleOCR-VL-MLX (HuggingFace)
```

**2. tercih:** `paddleocr` pipeline (CPU) — `narin_belgesel/.venv`'de
zaten kurulu (v3.3.3), ~5-8 sn/goruntu, MLX gerektirmez.

```bash
# Zaten kurulu olan paddleocr ile kullanim
pip install "paddleocr[doc-parser]"
```

**Takip edilecek gelisme: PaddleOCR-VL-1.5 MLX portu**
- PaddleOCR-VL-1.5 (29 Ocak 2026) OmniDocBench'te %94.5, formul CDM %94.21
  ile en yuksek skoru tutuyor. MLX portu ciktiginda oyun tamamen degisir.
- 0.9B parametre → MLX'te M1 Max'te ~2-4 sn/goruntu beklenir.

##### RTX 3090 24 GB (Linux) — PaddleOCR-VL-1.5 (CUDA)

1. ✅ **OmniDocBench %94.5** — tum modeller arasinda en yuksek (SOTA)
2. ✅ **Formul CDM %94.21** — tum modeller arasinda en yuksek
3. ✅ **A100'de 1.43 sayfa/sn** → RTX 3090'da ~1.0-1.2 sayfa/sn
4. ✅ **RTX 4090D'de 16.3 GB VRAM** → 24 GB'ye rahatca sigar
5. ✅ **Apache 2.0** — en ozgur lisans

```bash
# Kurulum (Linux + CUDA)
pip install "paddleocr[all]"
# veya dogrudan vLLM ile
vllm serve PaddlePaddle/PaddleOCR-VL-1.5 --trust-remote-code
```

**2. tercih:** MinerU 2.5 — MCP server mevcut (Claude entegrasyonu hazir),
ama dogruluk (%90.67) ve hiz (1.00 sayfa/sn) daha dusuk.

```bash
pip install mineru[all]
mineru -p input.pdf -o output/ -b vlm-vllm-engine
```

**Toplu is icin alternatifler:** Replicate API, RunPod/Lambda Labs bulut GPU

#### Diger Araclar

- [PaddleOCR (pipeline)](https://github.com/PaddlePaddle/PaddleOCR) — PP-StructureV3, CPU'da calisir, `pip install paddleocr[doc-parser]`
- [Marker](https://github.com/VikParuchuri/marker) — Hizli pipeline, iyi genel kalite, formul SOTA degil
- [dots.ocr](https://github.com/rednote-hilab/dots.ocr) — En zengin JSON (bbox+11 kategori), Apple destegi zayif
- [Nougat](https://github.com/facebookresearch/nougat) — Meta AI, akademik PDF'ler icin, Apple destegi zayif
- [MathPix](https://mathpix.com/) — Ticari, yuksek dogruluklu formul cikarimi, API-tabanli
- [PyMuPDF4LLM](https://github.com/pymupdf/PyMuPDF-Utilities) — Hafif, hizli, formul destegi sinirli

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

### Zotero API & Internals
- [Zotero Web API v3: Write Requests](https://www.zotero.org/support/dev/web_api/v3/write_requests)
- [Zotero Web API v3: Full-Text Content](https://www.zotero.org/support/dev/web_api/v3/fulltext_content)
- [Zotero Web API v3: Basics](https://www.zotero.org/support/dev/web_api/v3/basics)
- [Zotero Forum: Note Character Limits](https://forums.zotero.org/discussion/31735/notes-characters-length)
- [Zotero Forum: Note File Size Limits](https://forums.zotero.org/discussion/7211/note-file-size-limits)
- [Zotero GitHub: pdf-worker](https://github.com/zotero/pdf-worker)

### PDF → Markdown Araclari
- [PaddleOCR GitHub](https://github.com/PaddlePaddle/PaddleOCR) — v3.4.0, PP-StructureV3 + PaddleOCR-VL
- [PaddleOCR-VL-1.5 Paper (arxiv)](https://arxiv.org/html/2601.21957v1)
- [PaddleOCR-VL Paper (arxiv)](https://arxiv.org/html/2510.14528v1)
- [PaddleOCR-VL-1.5 HuggingFace](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5)
- [PaddleOCR-VL MLX Port (topluluk)](https://huggingface.co/gamhtoi/PaddleOCR-VL-MLX)
- [paddleocr PyPI](https://pypi.org/project/paddleocr/)
- [MinerU GitHub](https://github.com/opendatalab/MinerU)
- [MinerU2.5 Paper (arxiv)](https://arxiv.org/abs/2509.22186)
- [mcp-mineru (Claude MCP Server)](https://github.com/TINKPA/mcp-mineru)
- [dots.ocr GitHub](https://github.com/rednote-hilab/dots.ocr)
- [dots.ocr Paper (arxiv)](https://arxiv.org/abs/2512.02498)
- [Marker GitHub](https://github.com/datalab-to/marker)
- [Nougat GitHub](https://github.com/facebookresearch/nougat)

### Benchmark & Karsilastirma
- [OmniDocBench (CVPR 2025)](https://github.com/opendatalab/OmniDocBench)
- [Formula Extraction Benchmark (arxiv)](https://arxiv.org/abs/2512.09874)
- [Production-Grade LLM Inference on Apple Silicon (arxiv)](https://arxiv.org/abs/2511.05502)
- [PaddleOCR 3.0 Technical Report (arxiv)](https://arxiv.org/abs/2507.05595)
