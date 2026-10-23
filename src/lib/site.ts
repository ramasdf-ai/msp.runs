export const SITE = {
  name: 'msp.run',
  tagline: 'the unofficial calendar',
  // TODO: replace with the real Google Form once created.
  submitUrl: 'https://forms.gle/REPLACE_ME',
  contactEmail: 'hello@example.com',
  instagram: 'https://www.instagram.com/',
};

export const TYPE_LABEL: Record<string, string> = {
  race: 'Race',
  'group-run': 'Group Run',
  social: 'Social Run',
  trail: 'Trail Run',
};

export const url = (path: string) =>
  (import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + path.replace(/^\//, '')).replace(/\/+$/, '') || '/';
