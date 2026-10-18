import { defineConfig, presetWind3 } from 'unocss';

export default defineConfig({
  presets: [presetWind3()],
  shortcuts: {
    card: 'bg-white border border-solid border-zinc-200 rounded-xl p-5 sm:p-6 mb-4',
    muted: 'text-zinc-500 text-sm leading-relaxed',
    actions: 'flex flex-wrap gap-2',
    badge: 'text-xs text-zinc-500 whitespace-nowrap',
    'section-head': 'flex items-start justify-between gap-3 mb-4',
  },
});
