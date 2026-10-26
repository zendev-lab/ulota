# Hosted personal capabilities

Personal inventory, todos and subscriptions belong to a Hub user, independently of
workspace access and daemon execution. The Hub temporarily owns their primary
storage. Daemons remain the only execution owners. Future distributed placement
must preserve the same user, domain and record identities; this version has no
replication, offline writes or automatic retries of business mutations.

A local owner identity works without a Hub. Binding explicitly associates that
identity and one registered daemon with an authenticated Hub user and instance.
Neither display names nor emails merge identities. Binding credentials are separate
from runtime and browser credentials. Revocation and replacement invalidate old
credentials immediately; rebinding never transfers business records.

Personal capabilities are statically composed, independently enabled and disabled
by their owner. Disabled capabilities preserve records but deny reads and writes.
Personal sessions receive access through an owner-created session grant. Workspace
sessions require explicit per-capability read/write grants; channel sessions are
not eligible. A daemon token alone grants no access to personal business data.
Every operation validates its user, binding, session and capability at the Hub.
There is no administrator bypass for another user's personal data.

Wire contracts live in spark-protocol. Three independent capability packages own
domain rules and repository ports; Hub storage owns SQLite adapters and migrations.
Hub routes and daemon tools call the same domain services. No second agent runtime,
dynamic discovery mechanism or autonomous scheduler is introduced.

Legacy imports are explicit, validated, transactional and repeatable. Sources are
read-only. Existing imported records are never overwritten by a repeated import.

## Record operations

Hosted records are scoped by authenticated user and stable record id. Every update
and deletion requires the observed revision; stale revisions fail without changing
data. Mutations carry an operation id. The Hub commits the business change and
its request-bound receipt in one transaction, so repeating an identical operation
returns its previous result and changing its payload conflicts. Inventory retains
BoneHub's filtered purchase-cost and calendar-month statistics; no currency is
inferred from locale.

Import packages use `ulota.personal.bonehub` version 1. Export opens explicit source paths read-only in SQLite read transactions, including committed WAL; no source migration runs. Legacy IDs map per user and capability. Apply validates all pending relations before the first write and commits records, mappings and operation receipt in one transaction. Re-import never overwrites a mapped Hub target; changed sources and missing targets are reported. No automatic import, database deletion, iCloud migration or legacy AI adoption occurs.


## Legacy adapter lifetime

The exporter owns BoneHub source conversion; Hub personal import owns record
mapping, transactional writes and receipts. The supported version-1 source format
is frozen. Changes to this adapter are limited to compatibility, correctness and
security fixes; new personal features belong to the capability packages.

Retire this adapter after the intended migrations have been accepted and a
maintainer explicitly ends migration support. Remove the exporter, Hub import
entry point and dedicated wire contracts and instructions together. Preserve
imported records, necessary receipts and published migration history. Deleting
source databases is a separate, explicitly authorized operation.
