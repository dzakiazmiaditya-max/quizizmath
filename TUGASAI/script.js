const $ = (id) => document.getElementById(id);
let sesi, soal, jawaban, i, mulai, tick;

// ---------- Rumus samar di latar ----------
const RUMUS = [
  "E = mc²", "a² + b² = c²", "x = (−b ± √(b² − 4ac)) / 2a", "∫ x dx = x²/2 + C",
  "sin²θ + cos²θ = 1", "e^(iπ) + 1 = 0", "L = π r²", "∑ k = n(n+1) / 2",
  "log(ab) = log a + log b", "f′(x) = lim (f(x+h) − f(x)) / h", "(a + b)² = a² + 2ab + b²",
  "V = 4/3 π r³", "∞", "√2 ≈ 1,414", "Δ = b² − 4ac", "tan θ = sin θ / cos θ",
];
(function buatLatar() {
  const box = $("rumusBg");
  for (let n = 0; n < 24; n++) {
    const el = document.createElement("span");
    el.className = "rumus";
    el.textContent = RUMUS[n % RUMUS.length];
    el.style.left = Math.random() * 88 + "%";
    el.style.top = Math.random() * 94 + "%";
    el.style.fontSize = 1.1 + Math.random() * 1.9 + "rem";
    el.style.setProperty("--rot", Math.random() * 30 - 15 + "deg");
    el.style.setProperty("--dur", 10 + Math.random() * 10 + "s");
    el.style.setProperty("--delay", -Math.random() * 14 + "s");
    el.style.setProperty("--maks", (0.08 + Math.random() * 0.1).toFixed(2));
    box.appendChild(el);
  }
})();

// ---------- Utilitas ----------
const fmt = (d) => String(Math.floor(d / 60)).padStart(2, "0") + ":" + String(d % 60).padStart(2, "0");
const tampil = (id) => ["setup", "kuis", "hasil"].forEach((s) => $(s).classList.toggle("hidden", s !== id));
const nilaiRadio = (n) => document.querySelector(`input[name=${n}]:checked`).value;
const huruf = (k) => String.fromCharCode(65 + k);

// ---------- Mulai sesi ----------
$("mulai").onclick = async () => {
  const btn = $("mulai");
  $("err").classList.add("hidden");
  btn.disabled = true; btn.classList.add("loading"); btn.textContent = "AI sedang membuat 10 soal";
  try {
    const r = await fetch("/api/soal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jenjang: nilaiRadio("jenjang"), kesulitan: nilaiRadio("kesulitan") }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Gagal membuat soal.");
    sesi = d.sesi; soal = d.soal; jawaban = []; i = 0; mulai = Date.now();
    clearInterval(tick);
    $("timer").textContent = "00:00";
    tick = setInterval(() => ($("timer").textContent = fmt(Math.floor((Date.now() - mulai) / 1000))), 250);
    tampil("kuis"); render();
  } catch (e) {
    $("err").textContent = e.message; $("err").classList.remove("hidden");
  } finally {
    btn.disabled = false; btn.classList.remove("loading"); btn.textContent = "Mulai latihan";
  }
};

// ---------- Tampilkan soal ----------
function render() {
  const s = soal[i];
  $("nomor").textContent = `Soal ${i + 1} dari ${soal.length}`;
  $("bar").style.width = ((i + 1) / soal.length) * 100 + "%";
  $("tanya").textContent = s.pertanyaan;
  $("lanjut").disabled = true;
  $("lanjut").textContent = i === soal.length - 1 ? "Selesai dan lihat skor" : "Soal berikutnya";
  const box = $("pilihan");
  box.innerHTML = "";
  s.pilihan.forEach((p, k) => {
    const b = document.createElement("button");
    b.className = "opsi";
    const h = document.createElement("span"); h.className = "huruf"; h.textContent = huruf(k);
    const t = document.createElement("span"); t.textContent = p;
    b.append(h, t);
    b.onclick = () => {
      jawaban[i] = k;
      [...box.children].forEach((c, n) => c.classList.toggle("dipilih", n === k));
      $("lanjut").disabled = false;
    };
    box.appendChild(b);
  });
}

$("lanjut").onclick = async () => {
  if (i < soal.length - 1) { i++; render(); return; }
  clearInterval(tick);
  $("lanjut").disabled = true;
  $("lanjut").textContent = "AI sedang menganalisis jawaban";
  try {
    const r = await fetch("/api/nilai", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sesi, jawaban }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    tampilHasil(d);
  } catch (e) { alert(e.message); tampil("setup"); }
};

// ---------- Hasil ----------
function tampilHasil(d) {
  $("ring").style.setProperty("--p", d.skor);
  $("skor").textContent = d.skor;
  $("pesan").textContent = d.skor >= 80 ? "Luar biasa!" : d.skor >= 60 ? "Bagus, terus berlatih!" : "Jangan menyerah, coba lagi!";
  $("nBenar").textContent = d.benar;
  $("nSalah").textContent = d.total - d.benar;
  $("waktu").textContent = fmt(d.durasi);

  const analisis = $("analisisAi");
  analisis.replaceChildren();
  if (d.analisis) {
    const judul = document.createElement("h3");
    judul.textContent = "Umpan balik AI";
    analisis.appendChild(judul);
    const ringkasan = document.createElement("p");
    ringkasan.textContent = d.analisis.ringkasan;
    analisis.appendChild(ringkasan);
    const tambahDaftar = (label, item) => {
      if (!item.length) return;
      const subjudul = document.createElement("h4");
      subjudul.textContent = label;
      const daftar = document.createElement("ul");
      item.forEach((teks) => {
        const li = document.createElement("li");
        li.textContent = teks;
        daftar.appendChild(li);
      });
      analisis.append(subjudul, daftar);
    };
    tambahDaftar("Materi yang perlu dilatih", d.analisis.materiPerluDilatih);
    tambahDaftar("Langkah berikutnya", d.analisis.langkahBerikutnya);
    analisis.classList.remove("hidden");
  } else {
    analisis.textContent = d.errorAnalisis || "Umpan balik AI tidak tersedia.";
    analisis.classList.remove("hidden");
  }

  const box = $("detail");
  box.innerHTML = "";
  d.detail.forEach((x, n) => {
    const el = document.createElement("div");
    el.className = "review" + (x.benar ? "" : " salah");
    const baris = (teks, kelas) => {
      const p = document.createElement("p");
      if (kelas) p.className = kelas;
      p.textContent = teks;
      el.appendChild(p);
    };
    const kepala = document.createElement("p");
    const lencana = document.createElement("span");
    lencana.className = "lencana"; lencana.textContent = x.benar ? "Benar" : "Salah";
    kepala.append(lencana, " Soal " + (n + 1));
    el.appendChild(kepala);
    baris("Topik: " + x.topik);
    baris(x.pertanyaan);
    const label = (k) => (k === null ? "tidak dijawab" : huruf(k) + ". " + x.pilihan[k]);
    baris("Jawabanmu: " + label(x.dipilih));
    if (!x.benar) baris("Jawaban benar: " + label(x.jawaban));
    if (x.pembahasan) baris("Pembahasan: " + x.pembahasan, "bahas");
    box.appendChild(el);
  });
  tampil("hasil");
}

$("ulang").onclick = () => tampil("setup");
