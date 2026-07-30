// Harnais de développement hors ligne : rend une page de l'application avec
// Supabase, Auth et Societe doublés, sans réseau. Utile dans les sessions
// cloud où le conteneur n'atteint pas Supabase.
//   npx vite --config .harness/vite.config.mjs
// puis http://localhost:5199/?page=flux (ou ?page=parametres)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const ici = (p) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  root: ici('.'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^.*\/lib\/supabase$/, replacement: ici('./stubs/supabase.js') },
      { find: /^.*\/contexts\/Auth$/, replacement: ici('./stubs/Auth.jsx') },
      { find: /^.*\/contexts\/Societe$/, replacement: ici('./stubs/Societe.jsx') },
    ],
  },
  server: { port: 5199, fs: { allow: [ici('..')] } },
})
