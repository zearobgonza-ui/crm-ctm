import Database from "better-sqlite3";

export const db = new Database("wa.sqlite");

// ============================
// CREAR TABLAS
// ============================
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    wa_id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT DEFAULT 'nuevo',
    notes TEXT,
    archived INTEGER DEFAULT 0,
    event_date TEXT,
    created_at INTEGER,
    last_message_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    type TEXT NOT NULL,
    text TEXT,
    timestamp INTEGER NOT NULL,
    raw_json TEXT
  );

  CREATE TABLE IF NOT EXISTS followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id TEXT NOT NULL,
    due_at INTEGER NOT NULL,
    intent TEXT,
    message TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id TEXT NOT NULL,
    intent TEXT,
    variant TEXT,
    prompt_source TEXT,
    suggestion TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_wa_id_timestamp
  ON messages(wa_id, timestamp);

  CREATE INDEX IF NOT EXISTS idx_followups_wa_id
  ON followups(wa_id);

  CREATE INDEX IF NOT EXISTS idx_followups_due_at
  ON followups(due_at);

  CREATE INDEX IF NOT EXISTS idx_ai_logs_wa_id
  ON ai_logs(wa_id);
`);

// ============================
// MIGRACIONES SEGURAS
// Por si la base ya existía
// ============================
try { db.exec(`ALTER TABLE conversations ADD COLUMN status TEXT DEFAULT 'nuevo';`); } catch {}
try { db.exec(`ALTER TABLE conversations ADD COLUMN notes TEXT;`); } catch {}
try { db.exec(`ALTER TABLE conversations ADD COLUMN archived INTEGER DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE conversations ADD COLUMN event_date TEXT;`); } catch {}
try { db.exec(`ALTER TABLE conversations ADD COLUMN created_at INTEGER;`); } catch {}
try { db.exec(`ALTER TABLE conversations ADD COLUMN last_message_at INTEGER;`); } catch {}

// ============================
// HELPERS
// ============================

/**
 * Crea o actualiza un lead/conversation
 */
export function upsertConversation({
  wa_id,
  name = null,
  status = "nuevo",
  notes = null,
  archived = 0,
  event_date = null,
  created_at = Date.now(),
  last_message_at = Date.now(),
}) {
  db.prepare(`
    INSERT INTO conversations (
      wa_id, name, status, notes, archived, event_date, created_at, last_message_at
    ) VALUES (
      @wa_id, @name, @status, @notes, @archived, @event_date, @created_at, @last_message_at
    )
    ON CONFLICT(wa_id) DO UPDATE SET
      name = COALESCE(excluded.name, conversations.name),
      status = COALESCE(excluded.status, conversations.status),
      notes = COALESCE(excluded.notes, conversations.notes),
      archived = COALESCE(excluded.archived, conversations.archived),
      event_date = COALESCE(excluded.event_date, conversations.event_date),
      last_message_at = excluded.last_message_at
  `).run({
    wa_id: String(wa_id),
    name: name || null,
    status: status || "nuevo",
    notes: notes || null,
    archived: archived ?? 0,
    event_date: event_date || null,
    created_at: created_at || Date.now(),
    last_message_at: last_message_at || Date.now(),
  });
}

/**
 * Inserta un mensaje de la conversación
 */
export function insertMessage({
  wa_id,
  direction = "inbound",
  type = "text",
  text = "",
  timestamp = Date.now(),
  raw_json = null,
}) {
  db.prepare(`
    INSERT INTO messages (
      wa_id, direction, type, text, timestamp, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(wa_id),
    String(direction),
    String(type),
    text ? String(text) : null,
    Number(timestamp),
    raw_json ? JSON.stringify(raw_json) : null
  );

  // Actualiza fecha de último movimiento en la conversación
  db.prepare(`
    UPDATE conversations
    SET last_message_at = ?
    WHERE wa_id = ?
  `).run(Number(timestamp), String(wa_id));
}

/**
 * Obtener conversación por wa_id
 */
export function getConversation(wa_id) {
  return db.prepare(`
    SELECT *
    FROM conversations
    WHERE wa_id = ?
  `).get(String(wa_id));
}

/**
 * Obtener mensajes de una conversación
 */
export function getMessagesByWaId(wa_id) {
  return db.prepare(`
    SELECT *
    FROM messages
    WHERE wa_id = ?
    ORDER BY timestamp ASC
  `).all(String(wa_id));
}

/**
 * Guardar followup
 */
export function insertFollowup({
  wa_id,
  due_at,
  intent = null,
  message,
  state = "pending",
  created_at = Date.now(),
}) {
  db.prepare(`
    INSERT INTO followups (
      wa_id, due_at, intent, message, state, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(wa_id),
    Number(due_at),
    intent,
    String(message),
    String(state),
    Number(created_at)
  );
}

/**
 * Guardar log de IA
 */
export function insertAiLog({
  wa_id,
  intent = null,
  variant = null,
  prompt_source = null,
  suggestion,
  created_at = Date.now(),
}) {
  db.prepare(`
    INSERT INTO ai_logs (
      wa_id, intent, variant, prompt_source, suggestion, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(wa_id),
    intent,
    variant,
    prompt_source,
    String(suggestion),
    Number(created_at)
  );
}