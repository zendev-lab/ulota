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
