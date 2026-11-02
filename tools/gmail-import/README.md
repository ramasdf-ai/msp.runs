# Gmail → submissions sheet

A Google Apps Script that copies club emails from the site's Gmail into the form's response sheet. From there they follow the same rules as form submissions: `yes` in **Approved** publishes, later rows from an approved sender publish automatically, and `no` hides.

It doesn't try to read each club's email layout:
- **Emails with a calendar invite (.ics)** become complete rows (name, date, time, place, link). RunSignUp, Eventbrite, Meetup, and most calendar tools attach one.
- **Other emails** become a row with the subject, the start of the email, and a link back to it. Type the date (and anything else) into that row. Rows without a date never publish.

## Setup (once, in the site's Google account)

1. In Gmail, create a label `msp-events`. Add a filter for each club's sender that applies it (or apply it by hand).
2. Go to [script.google.com](https://script.google.com), click **New project**, and paste in `Code.gs`.
3. Set `SHEET_ID` at the top to the ID from the response sheet's URL (`/spreadsheets/d/<ID>/edit`).
4. Choose `installHourlyTrigger` in the toolbar, click **Run**, and approve the permissions.

After that, it runs every hour. Imported emails get the `msp-imported` label so nothing is added twice.

## Test

`node tools/gmail-import/test.cjs` checks the .ics parsing and column mapping.
