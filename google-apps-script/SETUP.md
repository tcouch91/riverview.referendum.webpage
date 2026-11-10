# Petition Form Setup

How the form works now:

1. A visitor submits the form on riverviewreferendum.org.
2. A small Google Apps Script saves the request as a row in a Google Sheet. **The sheet is the master list.**
3. The script then emails `contactus@riverviewreferendum.org`, which forwards to two people.
4. The visitor sees "Request Received!" **only** after the save is confirmed. If anything fails, they're told
   it was not sent and get a one-click email with their details filled in.

If an email gets lost or lands in spam, the request is still in the sheet, and the sheet's
"Email Notification" column shows whether each email went out.

Do the parts in order. Part A needs to be working before the test email in Part B.

---

## Part A: Create contactus@riverviewreferendum.org (free, Namecheap)

The domain's DNS is at Namecheap, and Namecheap's free email forwarding is already switched on for it.
You only need to add the address.

1. Sign in at namecheap.com and go to **Domain List**, then click **Manage** next to `riverviewreferendum.org`.
2. On the **Domain** tab, scroll to **Redirect Email**. The mail setting above it should already say **Email Forwarding**.
3. Click **Add Forwarder**:
   - Alias: `contactus`
   - Forward to: the first person's email address
4. Click **Add Forwarder** again:
   - Alias: `contactus` (the same alias)
   - Forward to: the second person's email address
5. Click the green checkmark to save each one.
6. **Test:** from a third email account (not either destination), send a message to
   `contactus@riverviewreferendum.org`. Both people should receive it within a few minutes. Ask them to check spam,
   and if it's there, mark it "Not spam."

Notes:
- If Namecheap won't let you use the same alias twice, use **ImprovMX** (improvmx.com, free tier)
  or **Forward Email** (forwardemail.net, free). Both let one alias forward to several addresses.
  You'd change the domain's MX records to point at them instead.
- Forwarding is receive-only. Replies will come from each person's own address. To *send* as
  contactus@, you'd need a paid mailbox (for example Namecheap Private Email or Zoho Mail, about $1–$3/month).

---

## Part B: Google Sheet + Apps Script (free)

### B1. Pick the Google account
Use a **campaign Google account** if you have one, rather than someone's personal account. The sheet lives in this
account, and notification emails will come **from this account's Gmail address**.

> **Gmail gotcha:** don't make this same Gmail address one of the two contactus@ forwarding destinations.
> Gmail hides mail you sent that comes back to you, so it would only appear in Sent, not the Inbox.

### B2. Create the sheet and script
1. Signed in to that account, go to **sheets.new**. Name the sheet **Riverview Petition Requests**.
2. In the sheet, click **Extensions → Apps Script**.
3. Delete everything in the editor, then paste in the entire contents of `google-apps-script/Code.gs` from this repo.
4. Click the project name ("Untitled project") and rename it **Riverview Petition Form**. Click **Save** (💾).

### B3. Set the recipient and time zone
1. In Apps Script, click **Project Settings** (⚙️ gear on the left).
2. Under **General settings**, set **Time zone** to *(GMT-05:00) Eastern Time – New York*.
3. Scroll to **Script Properties**, then **Add script property**:
   - Property: `NOTIFY_EMAILS`
   - Value: `contactus@riverviewreferendum.org`
4. Click **Save script properties**.

The recipient address lives here, not in the code, so no personal address is ever in the public repo.
To change who gets notified later, edit only this value. No redeploy is needed.

### B4. Authorize and test
1. Go back to the **Editor** (`< >` icon). In the function dropdown at the top, choose **setup**, then click **Run**.
2. Google asks for permission. Click **Review permissions**, choose the account, then
   **Advanced → Go to Riverview Petition Form (unsafe) → Allow**.
   (The "unverified" warning appears because this is your own private script, not a published app.)
3. Check that:
   - The sheet now has a **Submissions** tab with a header row.
   - Both forwarding destinations received **"Test: Riverview petition form is connected."**

### B5. Deploy it as a web app
1. Click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Fill in:
   - Description: `v1`
   - Execute as: **Me**
   - Who has access: **Anyone**. This is required so website visitors can submit. They can only add a row;
     they can't see the sheet.
4. Click **Deploy** and copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfy.../exec`.
5. Paste that URL into a new browser tab. You should see `{"ok":true,"service":"Riverview petition form",...}`.

### B6. Connect the website
1. In `index.html`, find this line near the bottom:
   ```js
   const FORM_ENDPOINT = 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE';
   ```
   Replace the placeholder with your Web app URL, keeping the quotes.
2. Commit and push. GitHub Pages updates the live site within a few minutes.

### B7. End-to-end test on the live site
1. Open https://riverviewreferendum.org/#sign-petition. Hard-refresh first (Ctrl+F5).
2. Submit the form with your own details.
3. Confirm all three:
   - The page shows **Request Received!**
   - A new row appears in the **Submissions** tab, with "Sent …" in **Email Notification**.
   - Both people received the notification email. Hitting **Reply** should reply to the person who submitted.
4. Delete the test row.

### B8. Share the sheet with the team
Click **Share** in the sheet and add the volunteers who handle visits. Remember that it contains voters' names,
addresses and phone numbers, so share it only with people who need it. The last column,
**Volunteer Follow-up Notes**, is free for the team to track who's visiting whom.

---

## Ongoing

- **The sheet is the source of truth.** Glance at it every few days. Any row whose **Email Notification**
  column says `FAILED` never reached the inbox and needs a follow-up.
- **Changing the script later:** paste in the new code, then go to **Deploy → Manage deployments**, click
  the pencil, set Version to **New version**, and click **Deploy**. This keeps the same URL.
  (Choosing "New deployment" creates a *new* URL, which you'd then have to update in `index.html`.)
- **Limits:** a free Gmail account can send about 100 script emails per day, far more than this form needs.
  Even past that limit, submissions are still saved to the sheet.
