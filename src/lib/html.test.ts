// Run: node src/lib/html.test.ts
import assert from 'node:assert/strict';
import { htmlToText, clip, linkParts } from './html.ts';

// Google Calendar style: <br>, bold, redirect-wrapped link, entities
assert.equal(
  htmlToText('Hare: Dr. Dick<br><b>Start:</b> Lake &amp; Bryant<br><br>RSVP <a href="https://www.google.com/url?q=https://minneapolish3.com/runs&amp;sa=D&amp;source=calendar">here</a>&nbsp;!'),
  'Hare: Dr. Dick\nStart: Lake & Bryant\n\nRSVP here (https://minneapolish3.com/runs) !',
);
// link whose text is the URL collapses to the URL
assert.equal(htmlToText('<a href="https://x.org/a">https://x.org/a</a>'), 'https://x.org/a');
// lists and paragraphs
assert.equal(htmlToText('<p>Bring:</p><ul><li>water</li><li>$5</li></ul>'), 'Bring:\n\n• water\n• $5');
// plain text untouched (except trim), including stray < and >
assert.equal(htmlToText(' 3 < 5 miles\nsee you > there '), '3 < 5 miles\nsee you > there');
// cut-off tag at the end is dropped
assert.equal(htmlToText('Meet at the <b>lake</b> <a href="https://ex'), 'Meet at the lake');
// numeric entities
assert.equal(htmlToText('It&#39;s on &#x2014; rain or shine'), "It's on — rain or shine");
// clip at word boundary
assert.equal(clip('one two three four', 12), 'one two…');
// linkParts
assert.deepEqual(linkParts('RSVP (https://a.co/x). Email b@c.org'), [
  { text: 'RSVP (' }, { text: 'https://a.co/x', href: 'https://a.co/x' }, { text: '). Email ' }, { text: 'b@c.org', href: 'mailto:b@c.org' },
]);
console.log('html tests passed');
