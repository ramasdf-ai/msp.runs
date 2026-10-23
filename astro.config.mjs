import { defineConfig } from 'astro/config';

// Set SITE (and BASE for a project-pages URL like user.github.io/msp-run) in the deploy workflow.
export default defineConfig({
  site: process.env.SITE ?? 'https://example.com',
  base: process.env.BASE ?? '/',
});
