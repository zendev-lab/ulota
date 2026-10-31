<script lang="ts">
 import { enhance } from "$app/forms";
 import { Button, PageHeader } from "@zendev-lab/spark-ui";
 let { data, form } = $props();
 const t = $derived(data.messages.personal); const f = $derived(t.todoFields);
 const v = $derived(form && "values" in form ? form.values : undefined); const selected = $derived(data.selected);
 const dependencies = $derived(form && "dependencies" in form ? form.dependencies ?? [] : selected?.dependencies ?? []);
 const statuses = ["Todo", "InProgress", "Completed", "Cancelled", "Paused"] as const;
</script>
<svelte:head><title>{t.todos} · Ulota</title></svelte:head>
<PageHeader title={t.todos} lede={f.description} />
<form method="GET"><label>{f.search}<input type="search" name="q" value={data.filters.search} /></label><label>{f.status}<select name="status" value={data.filters.status ?? ""}><option value="">{f.all}</option>{#each statuses as status}<option value={status}>{f[status]}</option>{/each}</select></label><label>{f.priority}<select name="priority" value={data.filters.priority ?? ""}><option value="">{f.all}</option>{#each [1,2,3,4,5] as priority}<option value={priority}>{priority}</option>{/each}</select></label><Button type="submit" variant="secondary">{f.filter}</Button></form>
<dl class="statistics"><div><dt>{f.total}</dt><dd>{data.stats.total_tasks}</dd></div><div><dt>{f.completed}</dt><dd>{data.stats.completed_tasks}</dd></div><div><dt>{f.overdue}</dt><dd>{data.stats.overdue_tasks}</dd></div><div><dt>{f.hours}</dt><dd>{data.stats.completed_hours} / {data.stats.total_estimated_hours}</dd></div></dl>
{#if form?.failed}<p role="alert">{form.code === "conflict" ? f.conflict : form.code === "invalid_relation" ? f.relationFailure : t.failure}</p>{/if}{#if form?.saved}<p role="status">{t.saved}</p>{/if}
<section aria-labelledby="todo-editor"><h2 id="todo-editor">{selected ? f.edit : f.add}</h2><form method="POST" action="?/save" use:enhance class="editor">
<input type="hidden" name="id" value={v?.id ?? selected?.id ?? ""} /><input type="hidden" name="expectedRevision" value={v?.expectedRevision ?? selected?.revision ?? ""} /><input type="hidden" name="operationId" value={v?.operationId ?? data.operationId} />
<label>{f.title}<input name="title" value={v?.title ?? selected?.title ?? ""} required /></label>
<label>{f.status}<select name="status" value={v?.status ?? selected?.status ?? "Todo"}>{#each statuses as status}<option value={status}>{f[status]}</option>{/each}</select></label>
<label>{f.priority}<select name="priority" value={v?.priority ?? selected?.priority ?? 2}>{#each [1,2,3,4,5] as priority}<option value={priority}>{priority}</option>{/each}</select></label>
<label>{f.dueDate}<input type="date" name="due_date" value={v?.due_date ?? selected?.due_date ?? ""} /></label>
<label>{f.estimatedHours}<input type="number" min="0" step="any" name="estimated_hours" value={v?.estimated_hours ?? selected?.estimated_hours ?? 0} required /></label>
<label>{f.parent}<select name="parent_id" value={v?.parent_id ?? selected?.parent_id ?? ""}><option value="">{f.none}</option>{#each data.allItems.filter(item => item.id !== selected?.id) as item (item.id)}<option value={item.id}>{item.title}</option>{/each}</select></label>
<fieldset class="wide"><legend>{f.dependencies}</legend>{#if data.allItems.length === 0}<p>{f.none}</p>{/if}{#each data.allItems.filter(item => item.id !== selected?.id) as item (item.id)}<label class="dependency"><input type="checkbox" name="dependencies" value={item.id} checked={dependencies.includes(item.id)} />{item.title}</label>{/each}</fieldset>
<label class="wide">{f.details}<textarea name="description" rows="3" value={v?.description ?? selected?.description ?? ""}></textarea></label><div class="wide actions"><Button type="submit">{t.save}</Button>{#if selected}<Button href="/personal/todos" variant="ghost">{f.cancel}</Button>{/if}</div>
</form></section>
<section aria-label={t.todos}>{#if data.items.length === 0}<p>{f.empty}</p>{:else}<ul>{#each data.items as item (item.id)}<li><div class="task-heading"><strong>{item.title}</strong><span>{f[item.status]} · {f.priority} {item.priority}</span></div>{#if item.description}<p class="details">{item.description}</p>{/if}<p>{f.dueDate}: {item.due_date ?? f.none} · {f.estimatedHours}: {item.estimated_hours}</p>{#if item.completed_at}<p>{f.completedAt}: {item.completed_at}</p>{/if}{#if item.parent_id}<p>{f.parent}: {data.allItems.find(parent => parent.id === item.parent_id)?.title}</p>{/if}{#if item.dependencies.length}<p>{f.dependencies}: {item.dependencies.map(id => data.allItems.find(task => task.id === id)?.title).join(", ")}</p>{/if}<div class="actions"><Button href="?edit={encodeURIComponent(item.id)}" variant="ghost">{f.edit}</Button><form method="POST" action="?/delete" use:enhance><input type="hidden" name="id" value={item.id} /><input type="hidden" name="expectedRevision" value={item.revision} /><input type="hidden" name="operationId" value={data.deleteOperations[item.id]} /><Button type="submit" variant="danger">{f.delete}</Button></form></div></li>{/each}</ul>{/if}</section>
<style>
.statistics { display:flex; flex-wrap:wrap; gap:1.5rem 3rem; margin-block:2rem; } dd { margin:.25rem 0 0; font-variant-numeric:tabular-nums; font-weight:600; }
.editor { align-items: start; display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)); } .wide { grid-column:1 / -1; } .editor input:not([type=checkbox]), .editor select, .editor textarea { width:100%; box-sizing:border-box; } .actions, .task-heading { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; } .task-heading { justify-content:space-between; } .details { white-space:pre-wrap; } ul { padding:0; list-style:none; } .dependency { display:flex !important; align-items:center; } fieldset { border:1px solid var(--color-border); padding:1rem; } @media(max-width:40rem) { .editor { grid-template-columns:minmax(0,1fr); } }
</style>
