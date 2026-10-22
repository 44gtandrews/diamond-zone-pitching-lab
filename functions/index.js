/* Optional server-only SMS notification, activated separately from Hosting.
 * Never place your phone number or Twilio credentials in public web files.
 * Firebase Functions v2 + Secret Manager + Twilio.
 */
"use strict";
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("node:crypto");
const twilio = require("twilio");

admin.initializeApp();

const sid = defineSecret("TWILIO_ACCOUNT_SID");
const token = defineSecret("TWILIO_AUTH_TOKEN");
const sender = defineSecret("TWILIO_FROM_NUMBER");
const recipient = defineSecret("ADMIN_SMS_TO_NUMBER");

exports.notifyCoachAccessRequestSms = onDocumentCreated({
  document: "coachRequests/{requestUid}",
  region: "us-east1",
  retry: false,
  secrets: [sid, token, sender, recipient]
}, async event => {
  const data = event.data?.data();
  if (!data || data.status !== "pending") return;
  const email = String(data.email || "");
  if (!/^[^\\s/@]+@[^\\s/@]+\\.[^\\s/@]+$/.test(email)) return;

  // At-least-once event delivery can produce duplicates. Claim the event
  // before sending and send at most 20 notifications per UTC day.
  const db = admin.firestore();
  const date = new Date().toISOString().slice(0,10);
  const eventKey = crypto.createHash("sha256")
    .update(String(event.id || event.params.requestUid)).digest("hex");
  const lock = db.collection("_notificationDeliveries").doc(eventKey);
  const quota = db.collection("_notificationQuota").doc(date);
  const claimed = await db.runTransaction(async tx => {
    const [prior, counts] = await Promise.all([tx.get(lock), tx.get(quota)]);
    if (prior.exists || (counts.exists && counts.data().count >= 20)) return false;
    tx.create(lock, {
      eventType: "coachAccessRequestSms",
      requestUid: event.params.requestUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    tx.set(quota, {count:(counts.exists ? counts.data().count : 0)+1}, {merge:true});
    return true;
  });
  if (!claimed) {
    console.log("SMS deduplicated or daily notification cap reached.");
    return;
  }

  const client = twilio(sid.value(), token.value());
  // Limit information to the verified coach email; no player records sent.
  await client.messages.create({
    to: recipient.value(),
    from: sender.value(),
    body: `Diamond Zone: new verified coach access request from ${email}. Review securely at https://dzpitchingportal.app/?view=admin`
  });
  console.log("New coach request SMS sent.");
});
