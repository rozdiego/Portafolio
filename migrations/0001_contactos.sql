-- Mensajes del formulario de contacto
CREATE TABLE IF NOT EXISTS contactos (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  correo         TEXT NOT NULL,
  mensaje        TEXT NOT NULL,
  fecha          TEXT NOT NULL,            -- ISO 8601 (UTC)
  pais           TEXT,
  ip             TEXT,
  user_agent     TEXT,
  consentimiento INTEGER NOT NULL DEFAULT 1,
  leido          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_contactos_fecha ON contactos (fecha);
