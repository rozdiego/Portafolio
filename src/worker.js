/**
 * Worker del portafolio.
 * Los archivos estáticos los sirve Cloudflare directamente (assets); este script
 * solo se ejecuta para /api/* (ver "run_worker_first" en wrangler.jsonc).
 *
 * POST /api/contact  { nombre, correo, mensaje, turnstile, _honey }
 *   1. Valida origen y datos
 *   2. Verifica Turnstile
 *   3. Limita envíos por IP (KV)
 *   4. Guarda el mensaje en D1 y envía correo con Email Routing (send_email)
 *
 * KV solo se usa para el límite de envíos por IP. Una tarea diaria (cron,
 * ver scheduled) borra los mensajes con más de 12 meses.
 */
import { EmailMessage } from 'cloudflare:email';

const ALLOWED_ORIGINS = new Set([
  'https://www.rozdiego.com',
  'https://rozdiego.com',
  'https://staging.rozdiego.com',
]);

const LIMITS = { nombre: 100, correo: 200, mensaje: 5000 };
const MAX_BODY_BYTES = 20 * 1024;
const RATE_LIMIT_PER_HOUR = 5;
const RETENTION_MONTHS = 12; // plazo de conservación de los mensajes (política de privacidad)
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== '/api/contact') {
      return json({ ok: false, error: 'not_found' }, 404);
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST' });
    }

    // Solo aceptamos peticiones que vengan de nuestro propio sitio
    const origin = request.headers.get('Origin');
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return json({ ok: false, error: 'forbidden_origin' }, 403);
    }

    // Cuerpo acotado y JSON válido
    const declared = Number(request.headers.get('Content-Length') || 0);
    if (declared > MAX_BODY_BYTES) return json({ ok: false, error: 'too_large' }, 413);

    let data;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'too_large' }, 413);
      data = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: 'bad_json' }, 400);
    }

    // Trampa para bots: campo oculto relleno -> fingimos éxito y no hacemos nada
    if (typeof data._honey === 'string' && data._honey.trim() !== '') {
      return json({ ok: true });
    }

    const nombre = clean(data.nombre);
    const correo = clean(data.correo);
    const mensaje = typeof data.mensaje === 'string' ? data.mensaje.replace(/\r\n/g, '\n').trim() : '';

    const fieldErrors = {};
    if (!nombre) fieldErrors.nombre = 'El nombre es obligatorio.';
    else if (nombre.length > LIMITS.nombre) fieldErrors.nombre = 'El nombre es demasiado largo.';
    if (!correo) fieldErrors.correo = 'El correo es obligatorio.';
    else if (correo.length > LIMITS.correo || !EMAIL_RE.test(correo)) fieldErrors.correo = 'Ingresa un correo válido.';
    if (data.consentimiento !== true) fieldErrors.consentimiento = 'Debes aceptar la política de tratamiento de datos.';
    if (!mensaje) fieldErrors.mensaje = 'El mensaje no puede estar vacío.';
    else if (mensaje.length > LIMITS.mensaje) fieldErrors.mensaje = 'El mensaje es demasiado largo.';
    if (Object.keys(fieldErrors).length) {
      return json({ ok: false, error: 'validation', fields: fieldErrors }, 422);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Turnstile
    const token = typeof data.turnstile === 'string' ? data.turnstile : '';
    if (!(await verifyTurnstile(token, ip, env))) {
      return json({ ok: false, error: 'captcha' }, 400);
    }

    // Límite por IP (best effort: KV es eventualmente consistente)
    const rlKey = `rl:${ip}`;
    const count = Number((await env.CONTACTS.get(rlKey)) || 0);
    if (count >= RATE_LIMIT_PER_HOUR) {
      return json({ ok: false, error: 'rate_limited' }, 429, { 'Retry-After': '3600' });
    }
    await env.CONTACTS.put(rlKey, String(count + 1), { expirationTtl: 3600 });

    const now = new Date();
    const record = {
      nombre,
      correo,
      mensaje,
      fecha: now.toISOString(),
      consentimiento: true,
      ip,
      pais: request.cf?.country || null,
      userAgent: (request.headers.get('User-Agent') || '').slice(0, 300),
    };
    const id = crypto.randomUUID();

    // Guardamos copia y enviamos el correo; basta con que uno de los dos funcione
    const [stored, mailed] = await Promise.allSettled([
      saveMessage(id, record, env),
      sendMail(record, env),
    ]);
    if (stored.status === 'rejected') console.error('Guardado en D1 falló:', stored.reason);
    if (mailed.status === 'rejected') console.error('Envío de correo falló:', mailed.reason);

    if (stored.status === 'rejected' && mailed.status === 'rejected') {
      return json({ ok: false, error: 'delivery_failed' }, 502);
    }
    // Aprovechamos cada envío para borrar los mensajes que ya superaron la retención
    ctx.waitUntil(purgeExpired(env));
    return json({ ok: true });
  },

  // Tarea diaria (cron). Solo se ejecuta si se activa "triggers.crons" en wrangler.jsonc,
  // lo que requiere un subdominio workers.dev registrado en la cuenta.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(purgeExpired(env));
  },
};

/* ───────── utilidades ───────── */

async function purgeExpired(env) {
  try {
    const res = await env.DB
      .prepare('DELETE FROM contactos WHERE fecha < ?')
      .bind(monthsAgoISO(RETENTION_MONTHS))
      .run();
    const n = res.meta?.changes ?? 0;
    if (n) console.log(`Retención: ${n} mensajes eliminados`);
  } catch (err) {
    console.error('Retención falló:', err);
  }
}

function monthsAgoISO(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

async function saveMessage(id, r, env) {
  await env.DB
    .prepare(
      `INSERT INTO contactos (id, nombre, correo, mensaje, fecha, pais, ip, user_agent, consentimiento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .bind(id, r.nombre, r.correo, r.mensaje, r.fecha, r.pais, r.ip, r.userAgent)
    .run();
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

// Texto de una sola línea: sin saltos ni caracteres de control
function clean(v) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : '';
}

async function verifyTurnstile(token, ip, env) {
  if (!token || token.length > 2048) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const out = await res.json();
    return out.success === true;
  } catch (err) {
    console.error('Turnstile falló:', err);
    return false;
  }
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Cabecera MIME con texto UTF-8 (RFC 2047)
function encodeHeader(str) {
  return `=?UTF-8?B?${utf8ToBase64(str)}?=`;
}

async function sendMail(r, env) {
  const from = env.CONTACT_FROM;
  const to = env.CONTACT_TO;

  const cuerpo = [
    `Nombre: ${r.nombre}`,
    `Correo: ${r.correo}`,
    `Fecha: ${r.fecha}`,
    `País: ${r.pais || 'desconocido'}`,
    '',
    r.mensaje,
    '',
    '— Enviado desde el formulario de rozdiego.com',
  ].join('\r\n');

  const body = utf8ToBase64(cuerpo).replace(/.{76}/g, '$&\r\n');

  const raw = [
    `From: ${encodeHeader('Formulario rozdiego.com')} <${from}>`,
    `To: <${to}>`,
    `Reply-To: ${encodeHeader(r.nombre)} <${r.correo}>`,
    `Subject: ${encodeHeader(`Nuevo mensaje de ${r.nombre}`)}`,
    `Date: ${new Date(r.fecha).toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@rozdiego.com>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');

  await env.EMAIL.send(new EmailMessage(from, to, raw));
}
