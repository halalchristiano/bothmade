/**
 * Adds this round's section to the running verification page, inlining the
 * PNGs as data URIs so the artifact stays self-contained.
 *
 *   BOTHMADE_SHOT_DIR=... node scripts/screenshots/append-artifact-section.mjs <artifact.html>
 */
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = process.env.BOTHMADE_SHOT_DIR;
const TARGET = process.argv[2];
if (!SHOTS || !TARGET) {
  console.error('usage: BOTHMADE_SHOT_DIR=<dir> node append-artifact-section.mjs <artifact.html>');
  process.exit(1);
}

const img = (file) =>
  `data:image/png;base64,${fs.readFileSync(path.join(SHOTS, file)).toString('base64')}`;

const figure = (file, alt, caption) =>
  `<figure><img src="${img(file)}" alt="${alt}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;

const article = (was, now, figures) =>
  `<article class="check"><div class="claim">
<div class="line was"><span class="tag was">Was</span><p>${was}</p></div>
<div class="line now"><span class="tag now">Now</span><p>${now}</p></div>
</div><div class="frames">
${figures}
</div></article>`;

const section = `  <section><h2>The launch we confirmed, and the payment it did not open</h2>
${article(
  'Section 1 defines “Ready for Launch” as a state the Agency “has confirmed in writing through the dashboard”, and Section 7 makes that confirmation what Payment 3 is due on. The launch board has the button, stamps the date, tells the client the final invoice follows — and gateReached() read the stage dropdown and nothing else. So the board could say “Confirmed in writing — and what makes Payment 3 due” while the only route that can send Payment 3 refused it as a milestone that had not happened.',
  'Seeded Havisham confirmed Ready for Launch and still at Build, which is the ordinary order of events — moving the stage is a separate act that emails the client again. The board names the one thing left, and it is the payment itself.',
  figure(
    '01-deployment-board-ready-for-launch.png',
    'The launch board with a confirmed project blocked only on its final payment',
    'The deadlock in the studio’s own words: “Confirmed in writing … and what makes Payment 3 due”, with “1 thing in the way — the final payment has not cleared”.'
  )
)}
${article(
  'Priorities agreed with the refusal. The money sat in <code>gated</code> — the bucket for “not owed”, which the page deliberately says nothing about — so the fastest way to get paid was to move a dropdown that emails the client a second time.',
  'The same project, same stage, after the fix: the confirmation moves that money into “Earned but never invoiced”, which is the band that exists to say this is ours to fix rather than theirs.',
  figure(
    '03-priorities-unbilled-after-confirmation.png',
    'Priorities listing the confirmed project under earned but never invoiced',
    '“Earned but never invoiced — send the payment (1) · Havisham Joinery · $1,800 is payable and hasn’t been invoiced”.'
  )
)}
${article(
  'A snooze that failed was a bare <code>return</code>. The row stayed, nothing was said, and the button had simply not worked — on the one screen whose value is that a row you put down stays down. You press “a week”, nothing moves, you assume you misclicked, and the project is back tomorrow having been, as far as you know, dealt with.',
  'The snooze PATCH forced to 500 while everything else on the page keeps working — which is what made the silence so easy to miss. The row deliberately stays put, because the snooze genuinely did not happen, and the page says which project and what that means.',
  figure(
    '04-priorities-snooze-failed.png',
    'Priorities naming the project whose snooze failed',
    '“Havisham Joinery could not be snoozed, so it is still on the list.” — with the row still there underneath it.'
  ) +
    '\n' +
    figure(
      '05-priorities-snooze-route-message.png',
      'The route’s own message shown instead of the generic one',
      'A 404 from the route: its own sentence wins, because it is the half that knows whether this was a vanished project or a bad number.'
    )
)}
${article(
  'Nothing said whether a snooze had worked, so nothing could say when it had not.',
  'A snooze that works still says nothing at all — the row simply moves into Snoozed, where it can be brought back. And the failure reads on a phone, at 393px, with no sideways scroll.',
  figure(
    '06-priorities-snooze-succeeded.png',
    'A successful snooze, with no alert on screen',
    'Zero alerts on screen after a snooze that worked. The banner is for failure only.'
  ) +
    '\n' +
    figure(
      '07-priorities-snooze-failed-phone.png',
      'The same failure on a 393px phone viewport',
      '393×852, horizontal overflow measured at 0px. The snoozed row sits below with “Bring back”.'
    )
)}
</section>
`;

const html = fs.readFileSync(TARGET, 'utf-8');
const marker = '<section><h2>Changes with nothing to photograph';
const at = html.indexOf(marker);
if (at === -1) throw new Error('could not find the tail section to insert before');

fs.writeFileSync(TARGET, html.slice(0, at) + section + '  ' + html.slice(at));
console.log(`inserted ${Buffer.byteLength(section)} bytes; artifact now ${fs.statSync(TARGET).size} bytes`);
