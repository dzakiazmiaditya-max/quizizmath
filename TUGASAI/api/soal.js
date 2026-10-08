const { handleSoal } = require("../server");

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metode tidak diizinkan." });
  }
  const [status, data] = await handleSoal(req.body);
  return res.status(status).json(data);
};
