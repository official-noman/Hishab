# Hishab — money tracker

A private expense tracker for you and your family. It reads **bank and bKash statements** (PDF, photo, CSV or TXT), adds **cash expenses**, understands **spoken entries** like “Fare 50 taka for bus and rickshaw”, shows **weekly charts**, and builds a **full report** — all on your phone, with no account and no server.

- Works offline after the first load.
- Data stays in your phone's browser.
- English interface.
- Up to 3 (or more) family members.
- PDF text, scanned PDFs, screenshots and photos are read on the device.
- Voice entry in English or Bangla, with a preview before saving.
- **Ask Hishab** — an on-device assistant for spending, merchants, dates, bills, POS and saved contacts.
- ATM and bKash **Cash Out** move money to Cash instead of counting as an expense.

### What's new in 1.3.4

- **Ask Hishab assistant** (top-right chat icon or More → Ask Hishab). Ask questions such as
  “How much did I spend on shopping last month?”, “How much at Rizq restaurant?”,
  “List POS transactions”, “Show bill payments this year” or “Show my last 10 transactions”.
- Answers include the total, matching transaction details and dates. All 111+ demo or real
  transactions can be searched by category, merchant, note, account, member, date, phone number
  or a saved contact name.
- **Saved contacts**: save a name and phone number once, then ask by name or number. The same
  number updates the saved name. Contacts are included in backups and undo.
- **Help & examples** panel explains how to ask, with one-tap example questions.
- The assistant is rule-based and runs entirely on the phone; no API key, account or server.
- Cash-out handling from 1.3.3 is unchanged: the amount moves from Bank/bKash to Cash and is not
  an expense, while fees and charges remain normal expenses.

---

## 1. Put it on your phone (fastest — no APK needed)

The app is a **PWA** (a website that installs like an app). You do **not** need an APK to use it. Use a recent version of Chrome on Android or Safari on iPhone, because the PDF and OCR tools need a modern browser. Voice entry uses the phone's built-in speech service; support and accuracy vary by browser and phone.

### Step 1 — Put the app online (free)

Pick one:

**Netlify Drop (easiest)**

1. On a computer, open <https://app.netlify.com/drop>.
2. Drag the whole **Hishab project folder** into the page.
   - Do not upload `node_modules` or `.git` if they exist.
3. Wait a few seconds. Netlify gives you a link like `https://sunny-hishab-123.netlify.app`.
4. Open that link on your phone.

**GitHub Pages**

1. Create a GitHub repository and upload the project files.
2. Go to **Settings → Pages**.
3. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Open the link GitHub gives you.

**Cloudflare Pages**

1. Open <https://pages.cloudflare.com>.
2. Create a project and upload the folder (or connect the Git repository).
3. Open the `*.pages.dev` link.

> The link must start with **https://** for installation and offline mode. Netlify, GitHub Pages and Cloudflare all give you HTTPS automatically.

### Step 2 — Install it

**Android (Chrome)**

1. Open your HTTPS link in Chrome.
2. Tap the **⋮** menu.
3. Tap **Install app** or **Add to Home screen**.
4. Tap **Install**.

**iPhone (Safari)**

1. Open the link in Safari.
2. Tap the **Share** button.
3. Tap **Add to Home Screen**.
4. Tap **Add**.

The Hishab icon now appears on your home screen. Open it like a normal app.

### Quick test on your own Wi-Fi (optional)

You can try the app on your phone before hosting it:

1. On the computer, run:
   ```bash
   npm start
   ```
2. The terminal prints two addresses. Use the **Phone** one, for example:
   ```
   http://192.168.0.105:5173
   ```
3. Connect the phone to the **same Wi-Fi** and open that address.

This is only for testing. Chrome will not offer "Install" on a plain `http://` address, so use the HTTPS hosting above for the real app.

---

## 2. How to get an APK file

> **Prebuilt APK:** the release folder already contains
> **`Hishab-APK/Hishab-1.3.4.apk`**. It is a standalone, signed Android 5.0+
> app that bundles the whole website inside the APK, works fully offline and
> needs no hosting. The assistant, contacts and cash-out handling are included.
> `Hishab-APK/Hishab-Share.zip` is the same APK in a ZIP for sharing.
> The PWABuilder steps below are only for making your own hosted wrapper.

An APK is an Android installer file. Hishab is a PWA, so another way to make an APK is **PWABuilder**. It wraps your hosted app in a small Android app (a Trusted Web Activity).

### Step 1 — Host the app first

Follow **Section 1, Step 1** above. You need a public HTTPS link, for example:

```
https://sunny-hishab-123.netlify.app
```

### Step 2 — Generate the APK with PWABuilder

1. Open <https://www.pwabuilder.com> on a computer.
2. Paste your HTTPS link and click **Start**.
3. PWABuilder checks the manifest and service worker. Hishab already has both.
4. Click **Package for stores**.
5. Choose **Android**.
6. In the Android options:
   - **Package ID**: use something like `com.yourname.hishab` (must be unique).
   - **App name**: `Hishab`.
   - **Signing**: for personal use, let PWABuilder create a test key. For Google Play, use your own key and keep it safe.
7. Click **Generate**.
8. Download the ZIP. Inside you will find:
   - `*.apk` — install this on your phone.
   - `*.aab` — only needed for Google Play.
   - `assetlinks.json` — see the note below.
   - signing key files — keep them safe.

### Step 3 — Install the APK on your phone

1. Copy the `.apk` file to your phone (USB, Google Drive, Telegram, etc.).
2. Tap the file.
3. Android may say *"For your security, your phone is not allowed to install unknown apps from this source."*
4. Tap **Settings**, enable **Allow from this source**, then go back and tap **Install**.
5. Open **Hishab** from your app list.

### Step 4 — Remove the browser address bar (optional but recommended)

A PWABuilder APK opens your website inside a minimal browser. To make it look like a real full-screen app, Android checks this file:

```
https://your-site.com/.well-known/assetlinks.json
```

1. Open the `assetlinks.json` file from the PWABuilder ZIP.
2. On your hosting, create a folder named `.well-known` at the **root** of the site.
3. Put `assetlinks.json` inside it.
4. Open `https://your-site.com/.well-known/assetlinks.json` in a browser to confirm it loads.
5. Reopen the APK. The address bar should disappear.

On Netlify Drop, create the folder on your computer, put the file inside, and drag the folder again.

### Important things to know about the APK

- The APK still loads your hosted website. **Do not delete the hosting** or the APK will show an error.
- After the first load, it works offline because the app is cached.
- When you update the website, the APK gets the new version automatically.
- A PWABuilder APK is for Android. iPhone users should use **Add to Home Screen** in Safari.
- A **fully standalone APK with no hosting at all** is already available at `Hishab-APK/Hishab-1.3.4.apk`. It uses the custom WebView wrapper in `android/`, bundles the whole app, and does not need Capacitor or Android Studio.

### Alternative: Bubblewrap (command line)

For advanced users with Node.js, Java and Android SDK installed:

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://your-site.com/manifest.webmanifest
bubblewrap build
```

Bubblewrap asks for the package name, app name and signing key, then creates the APK/AAB in the project folder.

---

## 3. Run it on a computer

Requirements: **Node.js 18 or newer**. There are no other packages to install.

```bash
npm start
```

Open <http://localhost:5173>.

Useful URLs:

| URL | What it does |
| --- | --- |
| `http://localhost:5173` | Normal app |
| `http://localhost:5173/?demo=1` | Loads demo data (only if the app is empty) |
| `http://localhost:5173/#/import` | Import screen |
| `http://localhost:5173/#/report` | Report screen |

Run the tests:

```bash
npm test
```

Expected: 10 parser tests, 13 analytics tests, 6 extraction tests and 12 voice tests.

---

## 4. First setup

1. Open **More**.
2. Tap each member and rename them. Defaults are **Me**, **Family 1**, **Family 2**; the demo uses **Me**, **Dad**, **Mom**.
3. Set a **monthly budget** if you want the budget card.
4. Enter **opening balances** for Bank, bKash and Cash if you want the balance cards to match the real world.
5. Go to **Import** and add your first statement.

Everything is optional. You can start by adding one cash expense.

---

## 5. Import bank and bKash statements

Open the **Import** tab.

You can add:

- **PDF** statements (text-based or scanned)
- **Photos and screenshots** — JPG, PNG, WEBP, GIF, BMP
- **CSV / TSV** files from internet banking
- **TXT** files
- **Pasted text** (optional extra)

### Add several files at once

1. Tap **Choose files**.
2. Select **multiple PDFs and photos** in one go. On Android you can long-press to select several.
3. The files appear in a list. Tap **Add more files** to add another batch.
4. Remove a file with the **×** button if you picked the wrong one.
5. Choose **Source**:
   - **Auto** — best for most files.
   - **Bank** — if the app guesses wrong.
   - **bKash** — for bKash statements.
6. Choose **Whose transactions?** — Me, Dad, Mom, etc.
7. Tap **Read and preview**.
8. Wait while the app reads the files. Photos and scanned PDFs take longer because OCR runs on the phone.
9. Check the preview:
   - Each row shows date, description, category, account and amount.
   - Change **Type** from Expense to Income or Transfer if needed.
   - Untick anything you do not want.
   - Rows that already exist are marked **exists** and are skipped.
10. Tap **Add N transactions**.

After adding, the date filter switches to the imported statement's date range, so the new rows appear immediately in Activity, the Home charts, Reports and budget progress. Use **All time** if you want to see older data again.

### Undo the last change

Open **More → Data & backup**. If the last action changed your data, **Undo last change** appears at the top. It restores the snapshot from just before that action — imports, manual adds/edits/deletes, voice saves, budget or opening-balance changes, member changes, backup restores, demo data and clear-all. Only the most recent change is kept, and the undo snapshot stays available after closing the app.

### What the app recognises

- Debit / credit columns.
- Single amount columns with `-` or `Dr` / `Cr`.
- bKash `Send Money`, `Payment`, `Cash Out`, `Cash In`, `Add Money`, `Received`, `Refund`.
- BRAC Bank statement columns (`DATE`, `PARTICULARS`, `CHQ.NO`, `WITHDRAW`, `DEPOSIT`, `BALANCE`).
- bKash screenshot columns (`Date & Time`, `Transaction Type`, `Transaction Details`, `Out`, `In`, `Charge/Fee`, `Balance`), including a header that is partly scrolled off or repeated in the middle of a page.
- bKash charges are kept as separate fee rows, and Pay Later purchases/reversals adjust the balance only by their charge.
- Dates in `DD/MM/YYYY`, `YYYY-MM-DD`, `DD Mon YYYY`, `DD-Mon-YY` and Bengali month names.
- Amounts with commas, `৳`, `Tk`, `BDT`.

### Transfers are not spending

These are saved as **transfers** and excluded from income/expense totals:

- ATM withdrawal
- bKash **Cash Out**
- bKash **Cash In**
- **Add Money**
- Cash deposit
- Self transfer

They only move money between Bank, bKash and Cash, so they do not inflate your spending.

### Tips for photos and scanned PDFs

- Use a **straight, clear screenshot** or photo.
- Avoid shadows, glare and tilted pages.
- Crop out unrelated parts if the text is very small.
- One statement per image works best.
- Dark-mode screenshots are inverted automatically.
- After OCR, **always check the preview**. OCR can confuse `0` and `O`, or `1` and `l`.
- Limit: 12 files at a time, 25 MB per file, first 8 scanned pages per PDF.

### CSV format

The first row should be a header. These column names are understood:

```
Date, Description, Reference, Debit, Credit, Balance
```

or:

```
Date, Time, Trx ID, Description, Amount, Balance
```

Example bank CSV:

```csv
Date,Description,Reference,Debit,Credit,Balance
01/10/2026,Salary Credit,SAL-OCT-26,,58000.00,81250.00
02/10/2026,ATM Withdrawal,ATM-4412,5000.00,,76250.00
03/10/2026,House Rent,RENT-OCT,12000.00,,64250.00
```

Example bKash CSV:

```csv
Date,Time,Trx ID,Description,Amount,Balance
01/10/2026,10:22,9A8B7C6D1E,Send Money to 01712345678,-1200.00,5400.00
03/10/2026,09:10,A1B2C3D4E5,Cash Out,-2000.00,2950.00
05/10/2026,18:30,T1U2V3W4X5,Received from 01719876543,3000.00,5950.00
```

If your bank uses different column names, rename the header cells to one of the names above.

### Duplicate protection

Hishab creates a fingerprint from source, date, amount, reference and note. If you import the same statement twice, the second copy is marked **exists** and is not added. Repeated but separate rows (for example two `IB/BKASH` transfers of ৳200 on the same day) are tracked one-for-one, so importing a 42-row statement into 41 existing rows adds the missing row instead of hiding it as a duplicate.

---

## 6. Quick entry: cash and voice

### Cash expenses

Cash is often missing from statements. Add it in two taps:

1. Tap the **+** button at the bottom.
2. Choose **Expense** (or **Cash expense** from the home screen).
3. Enter amount, category, account (Cash), member and date.
4. Tap **Save**.

Cash expenses count in every total, chart and report.

You can also edit or delete any transaction from **Activity**.

### Voice entry

You can add a transaction by speaking. Hishab fills the amount, category, account, date, member and note, then shows a preview before saving.

1. Tap the **microphone** button above the **+** button on Home or Activity, or tap **Speak a transaction** inside the add form.
2. Choose **English** or **Bangla**.
3. Say the amount and what it was for. Examples:
   - “Fare 50 taka for bus and rickshaw”
   - “Lunch 200 taka”
   - “Received 5,000 taka salary”
   - “Transfer 1,000 taka from bank to cash”
   - “Dad spent 500 on medicine yesterday”
   - “বাস ভাড়া ৫০ টাকা” (Bangla)
4. Check the amount, category, account, date and note in the preview.
5. Tap **Save transaction**. To change something first, tap **Edit details**.

Hishab understands:

- Amounts as digits or words — “50”, “fifty”, “one thousand two hundred”, “1.5 lakh”.
- Expense, income and transfer wording.
- Categories from words such as bus, rickshaw, fare, lunch, medicine, salary, bill and groceries.
- Cash, Bank and bKash accounts.
- Member names, plus “today”, “yesterday” and “day before yesterday”.

For example, **“Fare 50 taka for bus and rickshaw”** becomes:

- Amount: **৳50**
- Type: **Expense**
- Category: **Transport**
- Account: **Cash**
- Note: **Bus and rickshaw**

Transfers stay out of income/expense totals, just like imported transfers.

Voice is handled by your phone's speech service. Hishab does not record or store audio. Some phones need an internet connection for speech recognition; the preview and saving work without a server. If your browser does not support voice, tap **Edit details** and type the transaction.

---

## 7. Filters, weekly review and reports

### Date filter

Use the date pill at the top of Home or Report:

- This week
- Last week
- This month (default)
- Last month
- Last 30 days
- This year
- All time
- Custom dates

### Home

- Net balance, income, expense and savings rate.
- Monthly budget progress.
- **Weekly review** — grouped bars for income and expense by week.
- **Spending by category** — donut chart.
- Account balances for Bank, bKash and Cash.
- Recent transactions.

Negative net balance is shown in red with a minus sign.

### Report

- Summary cards.
- Weekly table with income, expense and net per week.
- Category and member breakdown.
- Account totals.
- Top 5 expenses.
- Insights and budget advice.
- Buttons: **Print / PDF**, **CSV**, **Share**.

For a PDF, tap **Print / PDF** and choose **Save as PDF** in the print dialog.

---

## 8. Family members

- Use the member pill at the top to switch between **Everyone**, **Me**, **Dad**, **Mom**, etc.
- All totals, charts and reports follow the selected member.
- Add, rename or delete members in **More → Family members**.
- Deleting a member moves their transactions to another member; it does not delete the transactions.

To share data with another phone, use **Download backup** and send the JSON file. On the other phone, use **Restore backup**. Members with the same name are merged, and duplicate transactions are skipped.

---

## 9. Backup, restore and moving to a new phone

Your data is stored in the browser's `localStorage` on that device.

**Important:** clearing browser data, uninstalling the browser, or using "Clear all data" inside the app will delete the data. Take backups.

### Back up

1. Open **More**.
2. Tap **Download backup**.
3. A file like `hishab-backup-2026-10-22.json` is saved.
4. Keep it in Google Drive, email it to yourself, or send it to your other phone.

### Restore

1. Open **More** on the new phone.
2. Tap **Restore backup**.
3. Choose the JSON file.
4. Hishab merges the data. Existing duplicates are skipped.

### Move from browser to APK

The APK uses the same website storage as Chrome only if the site origin is the same. In practice, the safest way is:

1. In the browser version, **Download backup**.
2. Install and open the APK.
3. **Restore backup** inside the APK.

---

## 10. Privacy

- No account, no sign-in, no cloud.
- No analytics or tracking scripts.
- No CDN requests: PDF.js, Tesseract.js and the OCR language files are stored with the app.
- Statements are read on the device and never uploaded.
- Voice audio is not recorded or stored by Hishab. Your browser or phone speech service handles it, and some phones send audio to their speech provider. Check your phone's speech settings if you want fully on-device recognition.
- The only network request is loading the app itself (and updates), plus whatever your phone's speech service needs when you use voice. The voice text parser itself is offline.

If you host on Netlify/GitHub/Cloudflare, the host can see normal web-server logs (IP address, browser), like any website. Your financial data is never sent to them.

---

## 11. Offline use and updates

- The service worker caches the app and all import tools after the first successful load.
- After that, you can open Hishab without internet and import PDFs/photos offline.
- Voice text parsing works offline, but the phone's speech recognition may still need internet depending on the device and browser.
- When you deploy a new version, the service worker downloads it in the background. Close and reopen the app to use the update.
- If the app looks stale after an update, close all Hishab tabs/windows and open it again.

---

## 12. Troubleshooting

| Problem | Fix |
| --- | --- |
| No **Install** option on Android | The site must be HTTPS. Open in Chrome, not inside Facebook/Telegram. Try ⋮ → **Add to Home screen**. |
| No **Install** option on iPhone | Use **Safari**, tap Share → **Add to Home Screen**. |
| APK will not install | Allow **Install unknown apps** for the app you opened the APK from (Files/Chrome). |
| APK opens with an address bar | Upload `.well-known/assetlinks.json` from the PWABuilder ZIP to your site root. |
| APK shows "site can't be reached" | Your hosting was deleted or renamed. Re-deploy and generate the APK again, or restore the same URL. |
| OCR finds nothing | Use a clearer, straight screenshot. Crop to the statement. Try a PDF or CSV instead. |
| OCR mixes up numbers | Correct the row in the preview before adding. |
| Photo will not open | HEIC/HEIF from iPhone is not supported by most browsers. Convert to JPG or take a screenshot. |
| Microphone is blocked | Allow microphone permission for the site in your browser settings, then reopen the voice sheet. Browsers also block microphones on `file://` pages, so use HTTPS or `http://localhost:5173`. |
| Voice says it is not available | Your browser does not support the Web Speech API. Use **Edit details** or the normal form. |
| Voice needs internet | Some phone speech services are online-only. Connect once, or type the entry instead. |
| Voice heard the wrong amount or note | Tap **Edit details**, correct the fields and save. You can also tap the mic and say it again. |
| PDF says password protected | Remove the password in your bank app or PDF viewer, then import again. |
| PDF has no text | It is a scanned PDF. Hishab will OCR the first 8 pages automatically. |
| CSV imports nothing | Check the header row. It needs a date column and a debit/credit or amount column. |
| Amounts look doubled | Check whether ATM/cash-out rows were imported as **Transfer**, not Expense. |
| Data disappeared | Browser storage was cleared, or you used a private/incognito window. Restore your backup. |
| App is in English but I want Bengali | This version is English-only by request. |

---

## 13. Project structure

```
.
├── index.html                 App shell, CSP, splash screen
├── manifest.webmanifest       PWA manifest (name, icons, shortcuts)
├── sw.js                      Service worker (offline cache)
├── server.mjs                 Tiny local static server
├── package.json               Scripts, no runtime dependencies
├── assets
│   ├── css/app.css            Design system, mobile layout, print styles
│   ├── js
│   │   ├── app.js             Router, actions, import flow, backups
│   │   ├── extract.js         PDF text, scanned-PDF OCR, photo OCR
│   │   ├── parsers.js         Bank/bKash CSV and text parser
│   │   ├── analytics.js       Totals, weekly series, report builder
│   │   ├── store.js           State, storage, demo data, merge
│   │   ├── categories.js      Categories, accounts, classifiers
│   │   ├── charts.js          Hand-made SVG charts
│   │   ├── components.js      Shared UI pieces
│   │   ├── i18n.js            UI strings
│   │   ├── voice.js           Voice parser + browser speech wrapper
│   │   ├── utils.js           Dates, money, formatting
│   │   └── views/             Home, Activity, Import, Report, More
│   └── vendor
│       ├── pdf.min.mjs        PDF.js (text + rendering)
│       ├── pdf.worker.min.mjs
│       ├── tesseract*.js      Tesseract.js OCR
│       ├── tesseract-core/    OCR WebAssembly engine
│       └── tessdata/          English + Bangla OCR data
├── icons/                     App icons
├── tests/                     Node test suites
└── tools/make-icons.mjs       Icon generator
```

---

## 14. Tests

```bash
npm test
```

- `tests/parsers.test.mjs` — CSV, text, dates, transfers, Dr/Cr.
- `tests/analytics.test.mjs` — totals, filters, weekly series, budgets, backup merge.
- `tests/extract.test.mjs` — file detection, OCR clean-up, OCR-style statements.
- `tests/voice.test.mjs` — spoken amounts, categories, accounts, dates, members and Bengali input.

---

## 15. Known limitations

- Bank and bKash formats change. If a statement is not recognised, export CSV or paste the text.
- OCR is a helper, not a guarantee. Always review the preview.
- Scanned PDFs are OCR'd up to 8 pages per file.
- HEIC photos are not supported by the browser. Use JPG/PNG.
- Data lives in one browser on one device. Cross-phone sharing is manual (JSON backup).
- The app does not connect to banks or bKash automatically.
- Voice recognition depends on your browser and phone. Some speech services need internet, and noisy places can mishear amounts. Always check the preview before saving.
- Hishab parses the text from your phone's speech service; it does not record or keep audio.
- Currency is Bangladeshi Taka (৳). Latin digits are used.
- The APK is a wrapper around the hosted app, not an offline-only bundle.

---

## 16. Credits

- [PDF.js](https://mozilla.github.io/pdf.js/) — Apache-2.0.
- [Tesseract.js](https://github.com/naptha/tesseract.js) — Apache-2.0.
- Tesseract language data (`tessdata_fast`) — Apache-2.0.

Built for personal and family use.
