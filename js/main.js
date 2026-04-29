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
  sections.forEach(({ id, offsetTop, clientHeight }) => {
    if (scrollY >= offsetTop - 100 && scrollY < offsetTop + clientHeight - 100) {
      navLinks.forEach((link) => {
        link.classList.toggle('active', link.dataset.scroll === id);
      });
    }
  });
};

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById(link.dataset.scroll);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});

document.addEventListener('scroll', updateActiveNav, { passive: true });
updateActiveNav();

/* ── Formulario de contacto ── */
const FORM_ENDPOINT = 'https://formsubmit.co/ajax/rozdiego@gmail.com';

const form      = document.getElementById('contact-form');
const btnSubmit = document.getElementById('btn-submit');
const btnLabel  = btnSubmit.querySelector('.btn-label');
const btnLoading= btnSubmit.querySelector('.btn-loading');
const msgSuccess= document.getElementById('form-success');
const msgError  = document.getElementById('form-error');

const fields = {
  nombre:  document.getElementById('nombre'),
  correo:  document.getElementById('correo'),
  mensaje: document.getElementById('mensaje'),
};

const errors = {
  nombre:  document.getElementById('error-nombre'),
  correo:  document.getElementById('error-correo'),
  mensaje: document.getElementById('error-mensaje'),
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
      }),
    });

    if (res.ok) {
      form.reset();
      msgSuccess.hidden = false;
      msgSuccess.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      msgError.hidden = false;
    }
  } catch {
    msgError.hidden = false;
  } finally {
    setLoading(false);
  }
});
