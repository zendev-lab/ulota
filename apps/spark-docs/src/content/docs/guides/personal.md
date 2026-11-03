---
title: Personal capabilities
---

Personal capabilities use an explicitly bound Hub account. Local daemon identity remains available without a Hub. Device registration alone does not grant access to personal data. Revoke a personal binding before replacing it; replacement never transfers existing records. Inventory, personal todos and subscriptions will be independently enabled. Their primary data is hosted by the Hub; offline writes and distributed synchronization are not available.

## Link a device

Open `/personal` on your Hub and sign in. Local users can explicitly choose the
local Hub account. Create a pairing code for a registered device, open `/personal`
on that device's local Web, and enter the Hub address and code. Pairing expires
after ten minutes and requires that device's registration credentials.

Enable personal tools separately. Start a personal conversation on a linked
device, or explicitly grant a workspace conversation read or write access to a
specific tool. Message-platform conversations cannot receive these grants.
Revocation takes effect on subsequent requests. Personal conversations are excluded
from general Hub session lists and require their owning account even on loopback.

## Inventory plugin

After enabling inventory, `/personal/inventory` and the daemon `inventory` tool share the same Hub records. Create, edit, delete, filter by status/tag, and inspect costs and monthly purchase trends. Amounts retain their original unit without inferred currency; current asset value means held purchase cost. Updates and deletion require the current revision. Refresh and review after a stale-edit conflict. Disabling the capability retains records and immediately closes access.

## Personal todos

Enable todos to use `/personal/todos` or the `personal_todo` tool. Track status, priority, due dates, estimated hours, parents and dependencies. Relations must belong to the same owner and cannot form cycles. Remove references before deletion. Completion records a timestamp; reopening clears it. Filters apply to both records and statistics. Cancelled tasks are excluded from overdue counts.

## Subscriptions

Enable subscriptions to use `/personal/subscriptions` or the `subscription` tool. Renew advances the stored next payment date by one calendar cycle, clamping month ends. Lifetime subscriptions cannot renew. Cancel also turns off auto-renew. Costs retain the legacy 30-day month and 365-day year estimates, grouped by currency without exchange rates. Estimated spent is not a payment ledger. Reminder days are retained preferences; no background reminders run.

## Import from BoneHub

Run the explicit exporter in the repository; omit any source you do not want to import:

```sh
pnpm exec tsx scripts/export-bonehub.mts --inventory /path/item_manager.db --todos /path/todo_manager.db --subscriptions /path/subscription_manager.db --output /private/bonehub-export.json
```

Each database is read in its own read-only SQLite transaction, including committed WAL. There is no shared transaction across three source files. No migrations or source business writes run. Retain the original databases and keep the JSON export private. The exporter normalizes legacy `note`/`notes`, JSON tags, integer booleans and todo dependency tables. Invalid dates, numbers or relations are rejected. Legacy `depreciation_ratio`, absent from the current item model, is not imported and produces a package warning.

Sign into the Hub, enable the capabilities in the package and open `/personal/import` to upload, preview and explicitly confirm. Maximum size is 10 MiB; for larger uploads within this limit, the Hub operator must start with `BODY_SIZE_LIMIT=16M`. New records, legacy mappings and operation receipts commit atomically. Repeating an import skips existing mappings, reports changed sources or deleted targets and never overwrites Hub edits. Keep the old App, iCloud data and source databases.

Legacy todo due dates stored by the old UI as UTC ISO timestamps are normalized to their stored UTC calendar date.
