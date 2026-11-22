/* ── Scroll reveal ── */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -48px 0px' }
);

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

/* ── Navegación activa por scroll ── */
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');

const updateActiveNav = () => {
  const scrollY = window.pageYOffset;
  const atBottom = window.innerHeight + scrollY >= document.documentElement.scrollHeight - 2;

  // Activa la última sección cuyo inicio ya pasó; al llegar al final de la
  // página (donde ya no se puede hacer más scroll) queda activa la última.
  let current = sections[0];
  sections.forEach((section) => {
    if (scrollY >= section.offsetTop - 100) current = section;
  });
  if (atBottom) current = sections[sections.length - 1];

  navLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.scroll === current.id);
  });
};

navLinks.forEach((link) => {
  if (!link.dataset.scroll) return; // enlaces a otras páginas (p. ej. Blog)
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById(link.dataset.scroll);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});

document.addEventListener('scroll', updateActiveNav, { passive: true });
updateActiveNav();

/* ── Formulario de contacto ── */
const FORM_ENDPOINT = '/api/contact';
const DEFAULT_ERROR = 'Algo salió mal. Escríbeme a';

const form      = document.getElementById('contact-form');
const btnSubmit = document.getElementById('btn-submit');
const btnLabel  = btnSubmit.querySelector('.btn-label');
const btnLoading= btnSubmit.querySelector('.btn-loading');
const msgSuccess= document.getElementById('form-success');
const msgError  = document.getElementById('form-error');
const msgErrorText = document.getElementById('form-error-text');

const fields = {
  nombre:  document.getElementById('nombre'),
  correo:  document.getElementById('correo'),
  mensaje: document.getElementById('mensaje'),
  consentimiento: document.getElementById('consentimiento'),
};

const errors = {
  nombre:  document.getElementById('error-nombre'),
  correo:  document.getElementById('error-correo'),
  mensaje: document.getElementById('error-mensaje'),
  consentimiento: document.getElementById('error-consentimiento'),
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate() {
  let valid = true;

  if (!fields.nombre.value.trim()) {
    showError('nombre', 'El nombre es obligatorio.');
    valid = false;
  } else {
    clearError('nombre');
  }

  if (!fields.correo.value.trim()) {
    showError('correo', 'El correo es obligatorio.');
    valid = false;
  } else if (!EMAIL_RE.test(fields.correo.value.trim())) {
    showError('correo', 'Ingresa un correo válido.');
    valid = false;
  } else {
    clearError('correo');
  }

  if (!fields.mensaje.value.trim()) {
    showError('mensaje', 'El mensaje no puede estar vacío.');
    valid = false;
  } else {
    clearError('mensaje');
  }

  if (!fields.consentimiento.checked) {
    showError('consentimiento', 'Debes aceptar la política de tratamiento de datos.');
    valid = false;
  } else {
    clearError('consentimiento');
  }

  return valid;
}

function showError(field, msg) {
  errors[field].textContent = msg;
  fields[field].classList.add('input-error');
}

function clearError(field) {
  errors[field].textContent = '';
  fields[field].classList.remove('input-error');
}

function setLoading(loading) {
  btnSubmit.disabled = loading;
  btnLabel.hidden    = loading;
  btnLoading.hidden  = !loading;
}

Object.values(fields).forEach((input) => {
  input.addEventListener('input', () => {
    const key = input.id;
    if (errors[key]) clearError(key);
  });
  input.addEventListener('change', () => { if (errors[input.id]) clearError(input.id); });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgSuccess.hidden = true;
  msgError.hidden   = true;

  if (!validate()) return;

  setLoading(true);

  try {
    const res = await fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        nombre:  fields.nombre.value.trim(),
        correo:  fields.correo.value.trim(),
        mensaje: fields.mensaje.value.trim(),
        consentimiento: fields.consentimiento.checked,
        turnstile: (form.querySelector('[name="cf-turnstile-response"]') || {}).value || '',
        _honey: (form.querySelector('[name="_honey"]') || {}).value || '',
      }),
    });

    let data = {};
    try { data = await res.json(); } catch { /* respuesta sin JSON */ }

    if (res.ok && data.ok) {
      form.reset();
      if (window.turnstile) window.turnstile.reset();
      msgSuccess.hidden = false;
      msgSuccess.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      if (data.fields) {
        Object.entries(data.fields).forEach(([k, m]) => { if (errors[k]) showError(k, m); });
      }
      if (window.turnstile) window.turnstile.reset();
      msgErrorText.textContent =
        data.error === 'captcha'      ? 'No pudimos verificar que eres una persona. Inténtalo de nuevo o escríbeme a' :
        data.error === 'rate_limited' ? 'Has enviado varios mensajes seguidos. Inténtalo más tarde o escríbeme a' :
        DEFAULT_ERROR;
      if (data.error !== 'validation') msgError.hidden = false;
    }
  } catch {
    msgErrorText.textContent = DEFAULT_ERROR;
    msgError.hidden = false;
  } finally {
    setLoading(false);
  }
});
