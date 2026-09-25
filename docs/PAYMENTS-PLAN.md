# Coins, Bucks and how real-money payments would fit in (#76)

Status: **plan only. Nothing in the game can take money.** `BUCKS_POLICY.cashPurchases` is `false`, and there is no checkout,
store, card form or payment call anywhere in the code. This page explains the economy as built and what a real payment
system needs before it is switched on.

## The economy as built (alpha)

| | Coins | Bucks |
|---|---|---|
| Stored as | `wallet.credit` (the existing Credit, shown as COINS) | `wallet.bucks` (same wallet, no second wallet) |
| Earned by | Banked points (1 per 250, was 100), missions, crate extras | 5 every 5 levels (levels 5, 10, 15…); older saves are paid once for levels already reached |
| Bought with money | Never | Planned, **disabled** |
| Spent on | Lazer scooter parts (30–150 each, about 2.5× the old prices), Sometimes Summer longboard parts, daily deals | Mafioso parts only: Crown Y Bars 6, wheel pairs 5, double clamp 3, grip tape 1 |

- **Crates.** Two types instead of four: **Street Crate** (common 75 %, rare 21 %, epic 3.5 %, legendary 0.5 %) and
  **Legend Crate** (rare 55 %, epic 36 %, legendary 9 %). Old unopened Pro crates become Street crates and Signature crates
  become Legend crates. Crates come from career stage III (Street) and stage V (Legend), and about one level in ten
  (Street). Daily bonuses no longer give a crate.
- **Mafioso** parts are *legendary*. You get one from a lucky crate (about 1 in 16 Legend crates, about 1 in 250 Street
  crates) or buy it with Bucks. They are never sold for Coins or put on a daily deal.
- **Crates are never sold for money**, not even later. Paid loot boxes are restricted or banned in some countries (for
  example Belgium and the Netherlands), and some app stores require the odds to be shown. Here everything premium can
  be bought directly with Bucks, and the odds are published in the game.

## Why the alpha wallet cannot hold paid Bucks

The alpha wallet is a browser save. The cloud copy is a copy of that same save. A player can edit it, so it is fine for
earned currency but must **never** hold anything someone paid for. Paid Bucks need a balance the server owns.

## What turning payments on requires

1. **A server ledger.** Add a `bucks_ledger` table (account id, amount ±, reason, external payment id UNIQUE, time) to
   the Sites account database, as an additive migration in `server/account-schema.ts`, the same way the email columns
   were added. The balance is the sum of the ledger. Earned Bucks can stay local; paid Bucks exist only on the server.
2. **Checkout on the server.** On the web, use a Stripe Checkout Session created by a Sites server endpoint
   (`POST /api/bucks/checkout`, signed-in players only). The endpoint picks a fixed pack by id (for example 10 Bucks,
   30 Bucks, 70 Bucks) and never trusts a price sent by the client. Put the secret key and the webhook secret in the
   Sites environment only, never in Git or browser code.
3. **Grant by webhook, idempotently.** `POST /api/bucks/webhook` verifies Stripe's signature and inserts one ledger row
   per payment id (UNIQUE), so a webhook sent twice can never grant twice. Refunds and chargebacks insert negative rows.
4. **Spend on the server.** Buying a Mafioso part with paid Bucks must be a server transaction: check the balance, add
   the debit row and record ownership in one atomic step. The client then mirrors the result, the same way
   `CreditEconomy` works today.
5. **Apps.** If the game ships as an iOS or Android app, digital currency has to go through Apple or Google in-app
   purchase (which take a 15–30 % fee), with receipts checked on the server. The web version can use Stripe.
6. **Players and law.** You need a purchase confirmation screen, receipts, and terms and a refund policy. Collect sales
   tax or VAT (for example with Stripe Tax). Add age gating and parental consent for players under 13 (COPPA) and keep
   spending limits for minors. Keep showing the crate odds.
7. **Testing.** Use Stripe test mode keys in a non-production Sites environment and test cards. Test a replayed
   webhook, a failed payment, a refund, and two tabs spending at the same time.

## Pack pricing suggestion (to decide)

About $0.20 per Buck, so a 20-Buck complete premium setup costs about $4:

| Pack | Price |
|---|---|
| 10 Bucks | $1.99 |
| 30 Bucks | $4.99 |
| 70 Bucks | $9.99 |

Earned Bucks (25 by level 25) keep the premium parts reachable without paying.

## Where the numbers live

| Setting | File |
|---|---|
| Crate odds, crate extras, level rewards, mission pay | `src/data/progress.ts` |
| Lazer prices | `LAZER_PRICE` in `src/data/scooterParts.ts` |
| Mafioso prices | `src/data/scooterParts.ts` |
| Longboard prices | `src/data/longboardParts.ts` |
| Coins per point, Bucks cap, cash switch | `CREDIT_POLICY` and `BUCKS_POLICY` in `src/data/credit.ts` |
| Tests | `tests/progress.test.ts`, `tests/credit.test.ts` |
