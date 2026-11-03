# Hub-hosted personal capabilities

The user selected merging BoneHub into Ulota as three independently enabled,
in-repository capabilities: inventory, personal todos and subscriptions, each with
pages and agent tools. Personal todos remain separate from agent work checklists.

During the design discussion the user rejected an implicit OS-user-only data model
and selected personal use across multiple devices, local identity with optional Hub
binding, and Hub custody of primary data before future distributed storage. Hub
pages are the first management surface; local Web links to them. Personal sessions
may use enabled capabilities; workspace sessions require explicit permission.

This deliberately extends Hub ownership to personal business storage without
moving execution, repository state or local artifacts out of the daemon. Reuse Hub
accounts and device authorization rather than introducing another login system.
No distributed sync, background reminders, Tauri shell migration or legacy data
removal is included. The application repository stays usable.

See [the contract](../contracts/personal-capabilities.md).
