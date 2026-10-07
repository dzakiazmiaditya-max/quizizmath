// Latihan Soal Matematika - server (tanpa dependensi, hanya modul bawaan Node.js 18+).
// Jalankan: node server.js   (butuh Secret XAI_API_KEY dan SESSION_SECRET)
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PUBLIK = __dirname;
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

const XAI_URL = process.env.XAI_URL || "https://api.x.ai/v1/responses";
// Nama model bisa diganti lewat Secrets/env tanpa mengubah kode.
const XAI_MODEL = process.env.XAI_MODEL || "grok-4.7";
const JUMLAH_SOAL = 10;

const JENJANG = {
  SD: "Sekolah Dasar (kelas 1-6): operasi hitung, pecahan sederhana, bangun datar, satuan, soal cerita",
  SMP: "SMP (kelas 7-9): aljabar dasar, persamaan linear, perbandingan, geometri, statistika dasar, teorema Pythagoras",
  SMA: "SMA (kelas 10-12): fungsi, trigonometri, logaritma, barisan dan deret, limit, turunan, peluang",
};
const KESULITAN = {
  Mudah: "mudah, satu langkah penyelesaian",
  Sedang: "sedang, 2-3 langkah penyelesaian",
  Sulit: "sulit, butuh beberapa langkah dan ketelitian",
};

const SESI_TTL = 3 * 60 * 60 * 1000;

class SessionError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function kunciSesi() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET harus diatur dengan minimal 32 karakter.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function buatTokenSesi(soal, mulai) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", kunciSesi(), iv);
  const isi = Buffer.concat([cipher.update(JSON.stringify({ soal, mulai }), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), isi].map((bagian) => bagian.toString("base64url")).join(".");
}

function bacaTokenSesi(token) {
  if (typeof token !== "string" || token.length > 50000) {
    throw new SessionError("Sesi tidak valid atau sudah kedaluwarsa.", 400);
  }
  const bagian = token.split(".");
  if (bagian.length !== 3) throw new SessionError("Sesi tidak valid atau sudah kedaluwarsa.", 400);

  const key = kunciSesi();
  let payload;
  try {
    const [iv, tag, isi] = bagian.map((nilai) => Buffer.from(nilai, "base64url"));
    if (iv.length !== 12 || tag.length !== 16 || !isi.length) {
      throw new Error("Format token tidak valid.");
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    payload = JSON.parse(Buffer.concat([decipher.update(isi), decipher.final()]).toString("utf8"));
  } catch (_) {
    throw new SessionError("Sesi tidak valid atau sudah kedaluwarsa.", 400);
  }

  if (!payload || !Number.isFinite(payload.mulai) || !Array.isArray(payload.soal) ||
      Date.now() - payload.mulai > SESI_TTL || payload.mulai > Date.now()) {
    throw new SessionError("Sesi tidak valid atau sudah kedaluwarsa.", 410);
  }
  const soal = valid({ soal: payload.soal });
  if (!soal) throw new SessionError("Data sesi tidak valid.", 400);
  return { soal, mulai: payload.mulai };
}

function valid(data) {
  const soal = data && data.soal;
  if (!Array.isArray(soal) || soal.length !== JUMLAH_SOAL) return null;
  const hasil = [];
  const pertanyaanUnik = new Set();
  for (const s of soal) {
    if (!s || typeof s.pertanyaan !== "string" || !s.pertanyaan.trim() ||
        typeof s.topik !== "string" || !s.topik.trim() ||
        typeof s.pembahasan !== "string" || !s.pembahasan.trim() ||
        !Array.isArray(s.pilihan) || s.pilihan.some((p) => typeof p !== "string" || !p.trim())) return null;
    const pertanyaan = s.pertanyaan.trim();
    const normalized = pertanyaan.toLocaleLowerCase("id").replace(/\s+/g, " ");
    if (pertanyaanUnik.has(normalized)) return null;
    pertanyaanUnik.add(normalized);
    const pilihan = s.pilihan.map((p) => String(p).trim());
    const kunci = Number(s.jawaban);
    if (pilihan.length !== 4 || pilihan.some((p) => !p) ||
        new Set(pilihan.map((p) => p.toLocaleLowerCase("id"))).size !== 4) return null;
    if (!Number.isInteger(kunci) || kunci < 0 || kunci > 3) return null;
    hasil.push({
      pertanyaan,
      topik: String(s.topik).trim(),
      pilihan,
      jawaban: kunci,
      pembahasan: String(s.pembahasan || "").trim(),
    });
  }
  return hasil;
}

function acakSoal(soal) {
  const hasil = soal.map((s) => {
    const pilihan = s.pilihan.map((teks, indeks) => ({ teks, benar: indeks === s.jawaban }));
    for (let i = pilihan.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [pilihan[i], pilihan[j]] = [pilihan[j], pilihan[i]];
    }
    return {
      ...s,
      pilihan: pilihan.map((p) => p.teks),
      jawaban: pilihan.findIndex((p) => p.benar),
    };
  });
  for (let i = hasil.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [hasil[i], hasil[j]] = [hasil[j], hasil[i]];
  }
  return hasil;
}

// Ambil objek JSON dari teks, walau dibungkus ```json ... ```
function ekstrakJson(teks) {
  const awal = teks.indexOf("{");
  const akhir = teks.lastIndexOf("}");
  if (awal === -1 || akhir <= awal) throw new Error("tidak ada JSON");
  return JSON.parse(teks.slice(awal, akhir + 1));
}

function teksDariRespons(data) {
  const bagian = [];
  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if ((c.type === "output_text" || c.type === "text") && c.text) bagian.push(c.text);
    }
  }
  return bagian.join("\n");
}

// Tool (function calling): model "memanggil" buat_soal dan mengisi argumennya sebagai soal.
const TOOLS = [
  {
    type: "function",
    name: "buat_soal",
    description: "Menyimpan 10 soal matematika pilihan ganda yang sudah dibuat.",
    parameters: {
      type: "object",
      properties: {
        soal: {
          type: "array",
          description: "Tepat 10 soal.",
          items: {
            type: "object",
            properties: {
              pertanyaan: { type: "string", description: "Teks soal, tanpa LaTeX." },
              topik: { type: "string", description: "Topik matematika utama yang diuji." },
              pilihan: { type: "array", items: { type: "string" }, description: "Tepat 4 pilihan yang berbeda." },
              jawaban: { type: "integer", description: "Indeks 0-3 dari pilihan yang benar." },
              pembahasan: { type: "string", description: "Penjelasan singkat langkah penyelesaian." },
            },
            required: ["pertanyaan", "topik", "pilihan", "jawaban", "pembahasan"],
          },
        },
      },
      required: ["soal"],
    },
  },
];

// Ambil argumen dari function_call; kalau model membalas teks biasa, coba baca JSON dari teks.
function soalDariRespons(data) {
  for (const item of data.output || []) {
    if (item.type === "function_call" && item.name === "buat_soal") {
      return typeof item.arguments === "string" ? JSON.parse(item.arguments) : item.arguments;
    }
  }
  return ekstrakJson(teksDariRespons(data));
}

async function mintaSoal(jenjang, kesulitan) {
  const kunciApi = process.env.XAI_API_KEY;
  if (!kunciApi) throw new Error("XAI_API_KEY belum diatur di Secrets.");

  const kode = crypto.randomInt(1000, 1000000);
  const prompt =
    `Buat tepat ${JUMLAH_SOAL} soal matematika pilihan ganda berbahasa Indonesia.\n` +
    `Jenjang: ${JENJANG[jenjang]}.\n` +
    `Tingkat kesulitan: ${KESULITAN[kesulitan]}.\n` +
    `Gunakan topik dan konteks yang beragam, jangan mengulang tipe soal. Kode variasi: ${kode}.\n` +
    "Aturan: tulis matematika sebagai teks biasa (contoh: 3/4, x^2, akar(16)), tanpa LaTeX. " +
    "Setiap soal harus menyebutkan topik, punya tepat 4 pilihan berbeda dan hanya satu yang benar. " +
    "Pastikan jawaban benar secara matematis, pengecoh masuk akal, tidak ada soal ambigu, dan pembahasan menjelaskan langkahnya.\n" +
    "Kirim hasilnya dengan memanggil fungsi buat_soal.";

  const payload = {
    model: XAI_MODEL,
    input: [
      { role: "system", content: "Kamu ahli pendidikan matematika Indonesia. Buat soal akurat, sesuai jenjang, bervariasi, dan selalu kirim lewat fungsi buat_soal." },
      { role: "user", content: prompt },
    ],
    tools: TOOLS,
    tool_choice: "required", // hanya ada satu tool, jadi model wajib memanggilnya
  };

  const batasWaktu = Date.now() + 55000;
  for (let percobaan = 0; percobaan < 3; percobaan++) {
    const sisaWaktu = batasWaktu - Date.now();
    if (sisaWaktu <= 0) break;
    const r = await fetch(XAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${kunciApi}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(sisaWaktu),
    });
    if (!r.ok) {
      let pesan = (await r.text()).slice(0, 200);
      try {
        const err = JSON.parse(pesan).error;
        pesan = typeof err === "object" && err ? err.message || JSON.stringify(err) : String(err);
      } catch (_) {}
      throw new Error(`xAI API error (${r.status}): ${pesan}`);
    }
    let soal = null;
    try {
      soal = valid(soalDariRespons(await r.json()));
    } catch (_) {}
    if (soal) return soal;
  }
  throw new Error("AI mengembalikan format soal yang tidak valid. Coba lagi.");
}

async function handleSoal(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [400, { error: "Permintaan soal tidak valid." }];
  }
  const { jenjang, kesulitan } = body;
  if (!Object.hasOwn(JENJANG, jenjang) || !Object.hasOwn(KESULITAN, kesulitan)) {
    return [400, { error: "Jenjang atau tingkat kesulitan tidak valid." }];
  }
  try {
    kunciSesi();
  } catch (e) {
    return [500, { error: e.message }];
  }
  let soal;
  try {
    soal = acakSoal(await mintaSoal(jenjang, kesulitan));
  } catch (e) {
    return [502, { error: e.message }];
  }
  const mulai = Date.now();
  let sesi;
  try {
    sesi = buatTokenSesi(soal, mulai);
  } catch (e) {
    return [500, { error: e.message }];
  }
  return [200, { sesi, soal: soal.map((s) => ({ pertanyaan: s.pertanyaan, topik: s.topik, pilihan: s.pilihan })) }];
}

const TOOL_ANALISIS = [{
  type: "function",
  name: "analisis_hasil",
  description: "Memberikan umpan balik belajar yang dipersonalisasi dari hasil kuis.",
  parameters: {
    type: "object",
    properties: {
      ringkasan: { type: "string", description: "Umpan balik singkat yang suportif dan spesifik." },
      materiPerluDilatih: { type: "array", items: { type: "string" }, description: "Topik yang perlu dipelajari lagi." },
      langkahBerikutnya: { type: "array", items: { type: "string" }, description: "Saran latihan konkret berikutnya." },
    },
    required: ["ringkasan", "materiPerluDilatih", "langkahBerikutnya"],
  },
}];

async function analisisAi(detail, skor) {
  const kunciApi = process.env.XAI_API_KEY;
  if (!kunciApi) throw new Error("XAI_API_KEY belum diatur di environment server.");
  const ringkasan = detail.map((s, i) => ({
    nomor: i + 1,
    topik: s.topik,
    benar: s.benar,
    jawabanDipilih: s.dipilih === null ? "tidak dijawab" : s.pilihan[s.dipilih],
    jawabanBenar: s.pilihan[s.jawaban],
  }));
  const r = await fetch(XAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${kunciApi}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: XAI_MODEL,
      input: [
        { role: "system", content: "Kamu tutor matematika yang suportif. Analisis pola kesalahan berdasarkan data kuis, jangan mengubah skor objektif, dan berikan saran belajar yang singkat serta spesifik dalam bahasa Indonesia." },
        { role: "user", content: `Skor objektif: ${skor}/100. Data jawaban: ${JSON.stringify(ringkasan)}. Berikan umpan balik personal dan 2-3 langkah belajar lewat fungsi analisis_hasil.` },
      ],
      tools: TOOL_ANALISIS,
      tool_choice: "required",
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (!r.ok) {
    let pesan = (await r.text()).slice(0, 200);
    try {
      const err = JSON.parse(pesan).error;
      pesan = typeof err === "object" && err ? err.message || JSON.stringify(err) : String(err);
    } catch (_) {}
    throw new Error(`xAI API error (${r.status}): ${pesan}`);
  }
  const ai = soalDariAnalisis(await r.json());
  if (!ai || typeof ai.ringkasan !== "string" ||
      !Array.isArray(ai.materiPerluDilatih) || !Array.isArray(ai.langkahBerikutnya)) {
    throw new Error("AI mengembalikan format analisis yang tidak valid.");
  }
  return {
    ringkasan: ai.ringkasan.slice(0, 1000),
    materiPerluDilatih: ai.materiPerluDilatih.filter((x) => typeof x === "string").slice(0, 5),
    langkahBerikutnya: ai.langkahBerikutnya.filter((x) => typeof x === "string").slice(0, 5),
  };
}

function soalDariAnalisis(data) {
  for (const item of data.output || []) {
    if (item.type === "function_call" && item.name === "analisis_hasil") {
      return typeof item.arguments === "string" ? JSON.parse(item.arguments) : item.arguments;
    }
  }
  return ekstrakJson(teksDariRespons(data));
}

async function handleNilai(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [400, { error: "Permintaan penilaian tidak valid." }];
  }
  let data;
  try {
    data = bacaTokenSesi(body.sesi);
  } catch (e) {
    return [e instanceof SessionError ? e.status : 500, { error: e.message }];
  }

  const durasi = Math.floor((Date.now() - data.mulai) / 1000);
  const dipilih = Array.isArray(body.jawaban) ? body.jawaban : [];
  let benar = 0;
  const detail = data.soal.map((s, i) => {
    const pilih = Number.isInteger(dipilih[i]) && dipilih[i] >= 0 && dipilih[i] < s.pilihan.length ? dipilih[i] : null;
    const ok = pilih === s.jawaban;
    if (ok) benar++;
    return { ...s, dipilih: pilih, benar: ok };
  });
  const skor = Math.round((benar / JUMLAH_SOAL) * 100);
  let analisis = null;
  let errorAnalisis = null;
  try {
    analisis = await analisisAi(detail, skor);
  } catch (e) {
    errorAnalisis = "Skor objektif berhasil dihitung, tetapi umpan balik AI tidak tersedia. " + e.message;
    console.error(errorAnalisis);
  }
  return [200, { skor, benar, total: JUMLAH_SOAL, durasi, detail, analisis, errorAnalisis }];
}

function bacaBody(req) {
  return new Promise((resolve) => {
    let isi = "";
    req.on("data", (c) => { isi += c; if (isi.length > 1e5) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(isi || "{}")); } catch (_) { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  const kirim = (kode, data) => {
    res.writeHead(kode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
  };
  const url = req.url.split("?")[0];

  if (req.method === "POST" && url === "/api/soal") {
    const [kode, data] = await handleSoal(await bacaBody(req));
    return kirim(kode, data);
  }
  if (req.method === "POST" && url === "/api/nilai") {
    const [kode, data] = await handleNilai(await bacaBody(req));
    return kirim(kode, data);
  }

  if (req.method === "GET") {
    let rel;
    try { rel = url === "/" ? "index.html" : decodeURIComponent(url).replace(/^\/+/, ""); }
    catch (_) { return kirim(400, { error: "URL tidak valid." }); }
    const file = path.join(PUBLIK, path.normalize(rel));
    if (!file.startsWith(PUBLIK + path.sep)) return kirim(403, { error: "Dilarang." });
    return fs.readFile(file, (err, isi) => {
      if (err) return kirim(404, { error: "Tidak ditemukan." });
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(isi);
    });
  }
  kirim(404, { error: "Tidak ditemukan." });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, "0.0.0.0", () => console.log(`Server berjalan di port ${PORT}`));
}

module.exports = { handleSoal, handleNilai };
