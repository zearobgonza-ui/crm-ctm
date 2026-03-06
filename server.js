import "dotenv/config";
import express from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";

import {
  db,
  upsertConversation,
  insertMessage,
  getConversation,
  getMessagesByWaId,
  insertFollowup,
  insertAiLog
} from "./db.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// ============================
// HELPERS
// ============================
function normalizeWaId(v) {
  return String(v || "").replace(/[^\d]/g, "");
}

function safeText(v) {
  return String(v || "").trim();
}

function detectIntent(lastText = "", goal = "unknown") {
  if (goal && goal !== "unknown") return goal;

  const t = String(lastText || "").toLowerCase();

  const intents = {
    start: ["empez", "iniciar", "desde cero", "comenzar", "arrancar", "no tengo", "quiero crear"],
    scale: ["escal", "ya tengo", "clientes", "ventas", "equipo", "negocio", "factur", "agencia"],
    price: ["precio", "cuánto", "cuanto", "costo", "vale", "inversión", "inversion"],
    schedule: ["hora", "horario", "a qué hora", "a que hora", "cuándo", "cuando", "día", "fecha"],
    link: ["link", "liga", "zoom", "registro", "enlace", "url"],
    confirm: ["ya me registré", "ya me registre", "confirmado", "listo", "ya quedó", "ya quedo", "registrado"],
    objection: ["no sé", "no se", "no puedo", "complicado", "difícil", "difícil", "después", "luego"],
    followup: ["ahorita no", "más tarde", "mas tarde", "te aviso", "luego te digo"]
  };

  for (const [intent, keywords] of Object.entries(intents)) {
    if (keywords.some(k => t.includes(k))) return intent;
  }

  return "unknown";
}

function buildAiReply({ conv, last_text = "", goal = "unknown" }) {
  const name = safeText(conv?.name) || "Hey";
  const status = conv?.status || "nuevo";
  const eventDate = safeText(conv?.event_date) || "próxima fecha";
  const intent = detectIntent(last_text, goal);

  let suggestion = "";
  let variant = "standard";

  if (intent === "start") {
    suggestion =
      `Hola ${name} 👋\n\n` +
      `Buenísimo. Si hoy estás buscando *empezar desde cero*, esta clase te va a ayudar a ordenar mejor la idea, visualizar cómo digitalizarla y entender por dónde comenzar con más claridad.\n\n` +
      `La intención es que no improvises, sino que construyas con dirección.\n\n` +
      `Para ubicarte mejor: ¿qué tema, habilidad o experiencia te gustaría convertir en negocio?`;
  } else if (intent === "scale") {
    suggestion =
      `Hola ${name} 👋\n\n` +
      `Perfecto. Si ya tienes algo en marcha y tu intención es *escalarlo*, en esta clase vas a ver cómo darle más estructura, atraer mejores prospectos y visualizar nuevas formas de crecimiento.\n\n` +
      `La idea es crecer con más claridad y no solo con más esfuerzo.\n\n` +
      `Para darte una guía más precisa: ¿hoy qué vendes y qué parte sientes que más necesitas fortalecer?`;
  } else if (intent === "price") {
    suggestion =
      `Hola ${name} 👋\n\n` +
      `Claro. Más que solo ver un costo, lo importante primero es que visualices si esta oportunidad realmente conecta con el punto en el que estás.\n\n` +
      `La clase está pensada para darte claridad sobre cómo construir o escalar un negocio digital con una estructura más sólida.\n\n` +
      `Si quieres, te paso la información completa y también te ubico mejor según si hoy buscas *empezar* o *escalar*.`;
  } else if (intent === "schedule") {
    suggestion =
      `Hola ${name} 👋\n\n` +
      `La fecha del evento es *${eventDate}*.\n\n` +
      `La recomendación es que apartes el espacio con calma para que puedas entrar con enfoque y aprovechar mejor el contenido.\n\n` +
      `Si quieres, también te comparto el acceso y te ubico según tu punto de partida actual.`;
  } else if (intent === "link") {
    suggestion =
      `Hola ${name} 👋\n\n` +
      `Claro, te comparto el acceso para que tengas todo listo.\n\n` +
      `La clase está pensada para ayudarte a visualizar con más claridad cómo construir o escalar un negocio digital con mejor estructura.\n\n` +
      `Si quieres, además de pasarte la liga, te ubico según si hoy buscas *empezar* o *escalar*.`;
  } else if (intent === "confirm") {
    suggestion =
      `Perfecto ${name} 🙌\n\n` +
      `Qué bueno que ya estás dentro.\n\n` +
      `Ahora lo importante es que llegues con claridad sobre tu punto de partida para que aproveches mucho más la clase.\n\n` +
      `Solo para ubicarte mejor: ¿hoy estás buscando *empezar desde cero* o *escalar* algo que ya tienes?`;
    variant = "confirm";
  } else if (intent === "objection") {
    suggestion =
      `Te entiendo, ${name} 👋\n\n` +
      `A veces cuando todavía no hay claridad total es normal sentirlo así.\n\n` +
      `Justo por eso esta clase busca ayudarte a ordenar mejor tu visión, entender tu punto de partida y tomar decisiones con más dirección.\n\n` +
      `Si te parece, te ubico rápido: ¿hoy te visualizas más en *empezar* o en *escalar*?`;
    variant = "objection";
  } else if (intent === "followup") {
    suggestion =
      `Sin problema, ${name} 🙌\n\n` +
      `Lo importante es que no pierdas el contexto de lo que estás buscando construir.\n\n` +
      `Cuando estés listo, retomamos desde tu punto actual para darte una guía más precisa.\n\n` +
      `Mientras tanto, dime algo simple: ¿hoy estás más en *empezar* o en *escalar*?`;
    variant = "followup";
  } else {
    suggestion =
      `Hola ${name} 👋\n\n` +
      `Gracias por escribirme sobre este evento.\n\n` +
      `La intención es ayudarte a visualizar con más claridad cómo construir o escalar un negocio digital con mejor estructura, sin depender de improvisación.\n\n` +
      `Para guiarte mejor desde el inicio: ¿hoy estás buscando *empezar desde cero* o *escalar* algo que ya tienes?`;
  }

  if (status === "seguimiento") {
    suggestion += `\n\nSi quieres, retomamos desde lo que ya has visto y te doy una orientación más puntual para tu caso.`;
  }

  return { suggestion, intent, variant };
}

function buildSequenceMessages(conv) {
  const name = safeText(conv?.name) || "Hey";
  const eventDate = safeText(conv?.event_date) || "próxima fecha";

  return [
    {
      intent: "confirmacion",
      offsetHours: 0,
      text:
        `Hola ${name} 👋\n\n` +
        `Gracias por escribir sobre el evento.\n\n` +
        `La intención es ayudarte a visualizar con más claridad cómo construir o escalar un negocio digital con mejor estructura.\n\n` +
        `Solo para ubicarte mejor desde el inicio: ¿hoy estás buscando empezar desde cero o escalar algo que ya tienes?`
    },
    {
      intent: "recordatorio",
      offsetHours: 24,
      text:
        `Hola ${name} 👋\n\n` +
        `Te recuerdo la fecha del evento: ${eventDate}.\n\n` +
        `La idea es que llegues con claridad sobre tu punto de partida para aprovecharlo mucho más.\n\n` +
        `Si quieres, te ayudo a ubicar si tu mejor ruta hoy es empezar o escalar.`
    },
    {
      intent: "seguimiento",
      offsetHours: 48,
      text:
        `Hola ${name} 👋\n\n` +
        `Paso por aquí para mantenerte ubicado antes del evento.\n\n` +
        `A veces un pequeño ajuste de claridad cambia completamente cómo aprovechas la sesión.\n\n` +
        `¿Hoy te visualizas más en iniciar algo o en escalar lo que ya traes?`
    }
  ];
}

// ============================
// HEALTH
// ============================
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ============================
// METRICS
// ============================
app.get("/api/metrics", (req, res) => {
  const { event_date } = req.query;

  let where = `WHERE (archived = 0 OR archived IS NULL)`;
  const params = [];

  if (event_date) {
    where += ` AND event_date = ?`;
    params.push(event_date);
  }

  const total = db.prepare(`SELECT COUNT(*) as n FROM conversations ${where}`).get(...params)?.n || 0;
  const nuevo = db.prepare(`SELECT COUNT(*) as n FROM conversations ${where} AND status = 'nuevo'`).get(...params)?.n || 0;
  const interesado = db.prepare(`SELECT COUNT(*) as n FROM conversations ${where} AND status = 'interesado'`).get(...params)?.n || 0;
  const confirmado = db.prepare(`SELECT COUNT(*) as n FROM conversations ${where} AND status = 'confirmado'`).get(...params)?.n || 0;
  const seguimiento = db.prepare(`SELECT COUNT(*) as n FROM conversations ${where} AND status = 'seguimiento'`).get(...params)?.n || 0;

  res.json({ total, nuevo, interesado, confirmado, seguimiento });
});

// ============================
// CONVERSATIONS
// ============================
app.get("/conversations", (req, res) => {
  const { event_date, archived, q } = req.query;

  let query = `
    SELECT wa_id, name, status, notes, archived, event_date, created_at, last_message_at
    FROM conversations
    WHERE 1=1
  `;
  const params = [];

  if (archived === "1") {
    query += ` AND archived = 1 `;
  } else {
    query += ` AND (archived = 0 OR archived IS NULL) `;
  }

  if (event_date) {
    query += ` AND event_date = ? `;
    params.push(event_date);
  }

  if (q) {
    query += ` AND (name LIKE ? OR wa_id LIKE ?) `;
    params.push(`%${q}%`, `%${q}%`);
  }

  query += ` ORDER BY last_message_at DESC `;

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

app.get("/api/conversations/:wa_id", (req, res) => {
  const conv = getConversation(req.params.wa_id);
  if (!conv) return res.status(404).json({ error: "Lead no encontrado" });
  res.json(conv);
});

app.post("/api/leads", (req, res) => {
  const { wa_id, name, event_date } = req.body || {};
  const id = normalizeWaId(wa_id);

  if (!id) return res.status(400).json({ error: "wa_id requerido" });

  upsertConversation({
    wa_id: id,
    name: name || null,
    event_date: event_date || null,
    created_at: Date.now(),
    last_message_at: Date.now(),
  });

  res.json({ ok: true, wa_id: id });
});

app.delete("/api/leads", (req, res) => {
  const { wa_ids } = req.body || {};

  if (!Array.isArray(wa_ids) || !wa_ids.length) {
    return res.status(400).json({ error: "wa_ids requerido" });
  }

  const tx = db.transaction((ids) => {
    for (const raw of ids) {
      const wa_id = normalizeWaId(raw);
      db.prepare(`DELETE FROM messages WHERE wa_id = ?`).run(wa_id);
      db.prepare(`DELETE FROM followups WHERE wa_id = ?`).run(wa_id);
      db.prepare(`DELETE FROM ai_logs WHERE wa_id = ?`).run(wa_id);
      db.prepare(`DELETE FROM conversations WHERE wa_id = ?`).run(wa_id);
    }
  });

  tx(wa_ids);
  res.json({ ok: true, deleted: wa_ids.length });
});

app.patch("/api/conversations/:wa_id/archive", (req, res) => {
  db.prepare(`UPDATE conversations SET archived = 1 WHERE wa_id = ?`).run(req.params.wa_id);
  res.json({ ok: true });
});

app.patch("/api/conversations/:wa_id/unarchive", (req, res) => {
  db.prepare(`UPDATE conversations SET archived = 0 WHERE wa_id = ?`).run(req.params.wa_id);
  res.json({ ok: true });
});

app.patch("/api/conversations/:wa_id/status", (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: "status requerido" });

  db.prepare(`
    UPDATE conversations
    SET status = ?
    WHERE wa_id = ?
  `).run(status, req.params.wa_id);

  res.json({ ok: true });
});

app.patch("/api/conversations/:wa_id/notes", (req, res) => {
  const { notes } = req.body || {};

  db.prepare(`
    UPDATE conversations
    SET notes = ?
    WHERE wa_id = ?
  `).run(notes || null, req.params.wa_id);

  res.json({ ok: true });
});

app.patch("/api/conversations/:wa_id/event-date", (req, res) => {
  const { event_date } = req.body || {};

  db.prepare(`
    UPDATE conversations
    SET event_date = ?
    WHERE wa_id = ?
  `).run(event_date || null, req.params.wa_id);

  res.json({ ok: true });
});

// ============================
// MESSAGES / HISTORIAL
// ============================
app.get("/messages/:wa_id", (req, res) => {
  const rows = getMessagesByWaId(req.params.wa_id);
  res.json(rows);
});

app.post("/api/messages", (req, res) => {
  const { wa_id, direction, type, text, timestamp } = req.body || {};
  const id = normalizeWaId(wa_id);

  if (!id) return res.status(400).json({ error: "wa_id requerido" });
  if (!direction) return res.status(400).json({ error: "direction requerido" });

  upsertConversation({
    wa_id: id,
    last_message_at: timestamp || Date.now(),
  });

  insertMessage({
    wa_id: id,
    direction: direction || "inbound",
    type: type || "text",
    text: text || "",
    timestamp: timestamp || Date.now(),
    raw_json: req.body,
  });

  res.json({ ok: true });
});

// ============================
// IMPORT CSV
// ============================
app.post("/api/import-csv", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file requerido" });

  const csvText = req.file.buffer.toString("utf8");
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  let imported = 0;
  const now = Date.now();

  for (const r of records) {
    const name =
      r["Nombre"] || r["NOMBRE"] || r["Name"] || r["name"] || r["nombre"] || "";

    const phoneRaw =
      r["Número"] || r["Numero"] || r["NUMERO"] || r["numero"] || r["phone"] || r["Phone"] || "";

    const event_date =
      r["FechaEvento"] || r["fecha_evento"] || r["event_date"] || r["fecha"] || null;

    const wa_id = normalizeWaId(phoneRaw);
    if (!wa_id) continue;

    upsertConversation({
      wa_id,
      name: name || null,
      event_date,
      created_at: now,
      last_message_at: now,
    });

    imported++;
  }

  res.json({ ok: true, imported });
});

// ============================
// IA COMERCIAL
// ============================
app.post("/api/ai/suggest", (req, res) => {
  try {
    const { wa_id, last_text = "", goal = "unknown" } = req.body || {};
    const id = normalizeWaId(wa_id);

    if (!id) return res.status(400).json({ error: "wa_id requerido" });

    const conv = getConversation(id);
    if (!conv) return res.status(404).json({ error: "Lead no encontrado" });

    const { suggestion, intent, variant } = buildAiReply({
      conv,
      last_text,
      goal,
    });

    insertAiLog({
      wa_id: id,
      intent,
      variant,
      prompt_source: last_text || "",
      suggestion,
      created_at: Date.now(),
    });

    res.json({
      ok: true,
      suggestion,
      intent,
      variant,
    });
  } catch (e) {
    res.status(500).json({ error: "Error IA", detail: String(e?.message || e) });
  }
});

app.get("/api/ai/logs/:wa_id", (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM ai_logs
    WHERE wa_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.params.wa_id);

  res.json(rows);
});

// ============================
// FOLLOWUPS
// ============================
app.get("/api/followups", (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM followups
    WHERE state = 'pending'
    ORDER BY due_at ASC
    LIMIT 200
  `).all();

  res.json(rows);
});

app.patch("/api/followups/:id", (req, res) => {
  const { state } = req.body || {};

  if (!["pending", "sent", "dismissed"].includes(state)) {
    return res.status(400).json({ error: "state inválido" });
  }

  db.prepare(`
    UPDATE followups
    SET state = ?
    WHERE id = ?
  `).run(state, req.params.id);

  res.json({ ok: true });
});

// ============================
// SECUENCIAS
// ============================
app.get("/api/sequences/start/:wa_id", (req, res) => {
  const wa_id = normalizeWaId(req.params.wa_id);
  const conv = getConversation(wa_id);

  if (!conv) return res.status(404).json({ error: "Lead no encontrado" });

  const steps = buildSequenceMessages(conv);
  const now = Date.now();

  let created = 0;
  for (const s of steps) {
    insertFollowup({
      wa_id,
      due_at: now + s.offsetHours * 60 * 60 * 1000,
      intent: s.intent,
      message: s.text,
      state: "pending",
      created_at: now,
    });
    created++;
  }

  res.json({ ok: true, created });
});

// ============================
// WEBHOOK SIMPLE
// ============================
app.post("/webhook/inbound", (req, res) => {
  const secret = req.headers["x-webhook-secret"] || req.body?.secret;

  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { event, data } = req.body || {};
  if (!event || !data) return res.status(400).json({ error: "event y data requeridos" });

  const now = Date.now();

  if (event === "lead.created") {
    const wa_id = normalizeWaId(data.wa_id);
    if (!wa_id) return res.status(400).json({ error: "data.wa_id requerido" });

    upsertConversation({
      wa_id,
      name: data.name || null,
      event_date: data.event_date || null,
      created_at: now,
      last_message_at: now,
    });

    return res.json({ ok: true });
  }

  if (event === "message.inbound") {
    const wa_id = normalizeWaId(data.wa_id);
    if (!wa_id) return res.status(400).json({ error: "data.wa_id requerido" });

    upsertConversation({
      wa_id,
      name: data.name || null,
      event_date: data.event_date || null,
      created_at: now,
      last_message_at: now,
    });

    insertMessage({
      wa_id,
      direction: "inbound",
      type: data.type || "text",
      text: data.text || "",
      timestamp: now,
      raw_json: req.body,
    });

    return res.json({ ok: true });
  }

  if (event === "message.outbound") {
    const wa_id = normalizeWaId(data.wa_id);
    if (!wa_id) return res.status(400).json({ error: "data.wa_id requerido" });

    upsertConversation({
      wa_id,
      last_message_at: now,
    });

    insertMessage({
      wa_id,
      direction: "outbound",
      type: data.type || "text",
      text: data.text || "",
      timestamp: now,
      raw_json: req.body,
    });

    return res.json({ ok: true });
  }

  res.status(400).json({ error: "Evento no soportado" });
});

// ============================
// START
// ============================
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});