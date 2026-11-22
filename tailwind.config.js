/** Misma configuración que usaba el CDN en index.html */
module.exports = {
  content: ['./index.html', './js/main.js', './js/custom.js'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        accent: '#e4f021',
        gray: { 50: '#1a1a1a', 700: '#d4d4d4', 900: '#000000', 950: '#000000' }
      },
      fontFamily: { sans: ['Poppins', 'sans-serif'] }
    }
  }
}
