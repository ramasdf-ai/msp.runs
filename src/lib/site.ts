export const SITE = {
  name: 'msp.run',
  tagline: 'the unofficial calendar',
  submitUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSekUOwOl6wrTbYENQ1G7r9An5gK--HuSI3cuv-y986o4uXzvQ/viewform',
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
