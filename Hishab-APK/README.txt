HISHAB RELEASE FOLDER - VERSION 1.3.4
=====================================

Hishab-1.3.4.apk
  Standalone Android app. Install this on a phone. No website or internet
  connection is required after installation. Version 1.3.4, minimum Android
  5.0 (API 21), target Android 14 (API 34).

Hishab-Share.zip
  The same APK plus INSTALL.txt in one ZIP, for sharing through apps that
  block .apk attachments.

Hishab-Web-PWA.zip
  Website / PWA version. Upload its contents to an HTTPS static host, then
  install it from Chrome with "Install app" or "Add to Home screen".

INSTALL.txt
  Phone installation steps, upgrade notes, troubleshooting and Bangla help.

SHA256.txt
  Checksums so you can confirm the files were not corrupted during transfer.

What changed in 1.3.4
---------------------
- NEW: Ask Hishab, an on-device assistant. Open it from the chat icon in the
  top bar or from More -> Ask Hishab.
- Ask questions in your own words, for example:
    "How much did I spend on shopping last month?"
    "How much at Rizq restaurant?"
    "List POS transactions"
    "Show bill payments this year"
    "Show my last 10 transactions"
    "What is my bank balance?"
- Answers show the total, matching transaction details, account, member and
  dates. Search works across categories, merchants, notes, accounts, members,
  date ranges, phone numbers and saved contact names.
- NEW: Saved contacts. Save a name and phone number once, then ask by name or
  number. Saving the same number again updates the name. Contacts are included
  in backups, restore, merge and undo. You can also delete a contact.
- NEW: Help & examples panel with a short guide and one-tap example questions.
- The assistant is local and rule-based. It has no API key, account, cloud
  service or external AI request. Nothing leaves the phone.
- Cash-out handling from 1.3.3 is included: ATM withdrawals and bank/bKash
  "Cash Out" move the same amount from Bank or bKash to Cash. They are not
  expenses, so the total balance is unchanged. Fees such as "Cash Out charge"
  remain normal expenses.

Build identity
--------------
Package: com.hishab.app
Version name: 1.3.4
Version code: 4
Minimum Android: 5.0 (API 21)
Target Android: 14 (API 34)
Compile SDK: 35
Signing certificate SHA-256:
FF:28:F1:4E:51:17:6A:6B:CE:35:03:21:A0:58:8B:DE:B0:7E:BE:AB:78:EC:30:99:D4:6E:FD:00:8B:2C:92:6E

Permissions: INTERNET only. The permission is used by the local loopback
server inside the app; the app does not require a remote website to work.

Keep the signing key safe if you plan to publish updates. An Android update
must be signed with the same key as the installed app.

Verification
------------
The APK is signed, zipaligned, and its resources.arsc is stored uncompressed
as required by Android 11+. Compare the three hashes in SHA256.txt with the
files you downloaded.

Windows PowerShell:
  Get-FileHash .\Hishab-1.3.4.apk -Algorithm SHA256

Linux / macOS:
  sha256sum -c SHA256.txt
