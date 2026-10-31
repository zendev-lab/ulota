<script lang="ts">
 import {enhance} from "$app/forms";
 import {Button,PageHeader} from "@zendev-lab/spark-ui";
 let {data,form}=$props();const t=$derived(data.messages.personal);const f=$derived(t.importFields);
 const report=$derived(form && "imported" in form ? form.imported : form && "preview" in form ? form.preview : undefined);
</script>
<svelte:head><title>{f.title} · Ulota</title></svelte:head>
<PageHeader title={f.title} lede={f.description}/>
<p>{f.sources}</p><pre><code>pnpm exec tsx scripts/export-bonehub.mts --inventory /path/item_manager.db --todos /path/todo_manager.db --subscriptions /path/subscription_manager.db --output /private/bonehub-export.json</code></pre>
<p>{f.exportHint}</p><p>{f.sizeHint}</p>
<form method="POST" action="?/preview" enctype="multipart/form-data" use:enhance><label>{f.package}<input type="file" name="package" accept="application/json,.json" required/></label><Button type="submit">{f.preview}</Button></form>
{#if form?.failed}<p role="alert">{form.code==="disabled"?f.disabled:form.code==="invalid_relation"?f.relationFailure:f.failure}</p>{/if}
{#if form && "imported" in form}<p role="status">{f.done}</p>{/if}
{#if report}<section aria-labelledby="import-report"><h2 id="import-report">{f.report}</h2><p>{f.noOverwrite}</p>{#each report.warnings as warning}<p>{warning}</p>{/each}{#if report.entries.length===0}<p>{f.empty}</p>{:else}<ul>{#each report.entries as entry (`${entry.capability}:${entry.legacyId}`)}<li><strong>{t[entry.capability]}</strong> <code>{entry.legacyId}</code> — {f[entry.status]}</li>{/each}</ul>{/if}</section>{/if}
{#if form && "preview" in form && form.payload}<form method="POST" action="?/commit" use:enhance><input type="hidden" name="payload" value={form.payload}/><input type="hidden" name="operationId" value={form.operationId}/><Button type="submit" disabled={!form.preview?.entries.some(entry=>entry.status==="create")}>{f.confirm}</Button></form>{/if}
<style>pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--color-surface);border:1px solid var(--color-border);padding:1rem;border-radius:var(--rounded-sm);}ul{list-style:none;padding:0;}li{overflow-wrap:anywhere;}input[type=file]{max-width:100%;}</style>
