<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button, PageHeader } from "@zendev-lab/spark-ui";
  let { data, form } = $props();
  const t = $derived(data.messages.personal);
  const f = $derived(t.inventoryFields);
  const values = $derived(form && "values" in form ? form.values : undefined);
  const selected = $derived(data.selected);
  const statuses = ["Active", "Inactive", "Sold", "Lost", "Damaged"] as const;
  const number = (value: number) => new Intl.NumberFormat(data.locale, { maximumFractionDigits: 2 }).format(value);
</script>
<svelte:head><title>{t.inventory} · Ulota</title></svelte:head>
<PageHeader title={t.inventory} lede={f.unitNote} />
<form method="GET" class="filters"><label>{f.search}<input name="q" value={data.filters.searchQuery} type="search" /></label><label>{f.status}<select name="status" value={data.filters.selectedStatus ?? ""}><option value="">{f.allStatuses}</option>{#each statuses as status}<option value={status}>{f[status]}</option>{/each}</select></label><label>{f.tags}<select name="tag" value={data.filters.selectedTag ?? ""}><option value="">{f.allTags}</option>{#each data.allTags as tag}<option value={tag}>{tag}</option>{/each}</select></label><Button type="submit" variant="secondary">{f.filter}</Button></form>
<dl class="statistics"><div><dt>{f.itemCount}</dt><dd>{data.stats.total_items}</dd></div><div><dt>{f.totalPurchase}</dt><dd>{number(data.stats.total_purchase_cost)}</dd></div><div><dt>{f.heldPurchase}</dt><dd>{number(data.stats.current_asset_value)}</dd></div><div><dt>{f.dailyCost}</dt><dd>{number(data.stats.average_daily_spending)}</dd></div></dl>
{#if form?.failed}<p role="alert">{form.code === "conflict" ? f.conflict : t.failure}</p>{/if}
{#if form?.saved}<p role="status">{t.saved}</p>{/if}
<section aria-labelledby="inventory-editor"><h2 id="inventory-editor">{selected ? f.editItem : f.addItem}</h2>
<form method="POST" action="?/save" use:enhance class="editor">
  <input type="hidden" name="originalTagsText" value={values?.originalTagsText ?? selected?.tags.join("\n") ?? ""} /><input type="hidden" name="id" value={values?.id ?? selected?.id ?? ""} /><input type="hidden" name="expectedRevision" value={values?.expectedRevision ?? selected?.revision ?? ""} /><input type="hidden" name="operationId" value={values?.operationId ?? data.operationId} />
  <label>{f.name}<input name="name" value={values?.name ?? selected?.name ?? ""} required /></label>
  <label>{f.status}<select name="status" value={values?.status ?? selected?.status ?? "Active"}>{#each statuses as status}<option value={status}>{f[status]}</option>{/each}</select></label>
  <label>{f.purchaseDate}<input name="purchase_date" type="date" value={values?.purchase_date ?? selected?.purchase_date ?? data.today} required /></label>
  <label>{f.purchasePrice}<input name="purchase_price" type="number" min="0" step="any" value={values?.purchase_price ?? selected?.purchase_price ?? 0} required /></label>
  <label>{f.expectedYears}<input name="expected_years" type="number" min="0" step="any" value={values?.expected_years ?? selected?.expected_years ?? ""} /></label>
  <label>{f.salePrice}<input name="sale_price" type="number" min="0" step="any" value={values?.sale_price ?? selected?.sale_price ?? 0} /></label>
  <label>{f.saleDate}<input name="sale_date" type="date" value={values?.sale_date ?? selected?.sale_date ?? ""} /></label>
  <label>{f.tags}<textarea name="tags" rows="2" value={values?.tags ?? selected?.tags.join("\n") ?? ""}></textarea><small>{f.tagsHint}</small></label>
  <label class="wide">{f.notes}<textarea name="notes" rows="3" value={values?.notes ?? selected?.notes ?? ""}></textarea></label>
  <div class="wide actions"><Button type="submit">{t.save}</Button>{#if selected}<Button href="/personal/inventory" variant="ghost">{f.cancel}</Button>{/if}</div>
</form></section>
<section aria-label={t.inventory}>{#if data.items.length === 0}<p>{f.empty}</p>{:else}
<p id="inventory-scroll-hint" class="table-hint">{f.scrollHint}</p><div class="table-scroll" role="region" aria-label={t.inventory} aria-describedby="inventory-scroll-hint"><table><thead><tr><th>{f.name}</th><th>{f.status}</th><th>{f.purchaseDate}</th><th>{f.purchasePrice}</th><th>{f.tags}</th><th>{f.edit}</th></tr></thead><tbody>{#each data.items as item (item.id)}<tr><th scope="row">{item.name}</th><td>{f[item.status]}</td><td>{item.purchase_date}</td><td>{number(item.purchase_price)}</td><td>{item.tags.join(", ")}</td><td><div class="actions"><Button href="?edit={encodeURIComponent(item.id)}" variant="ghost">{f.edit}</Button><form method="POST" action="?/delete" use:enhance><input type="hidden" name="id" value={item.id} /><input type="hidden" name="expectedRevision" value={item.revision} /><input type="hidden" name="operationId" value={data.deleteOperations[item.id]} /><Button type="submit" variant="danger">{f.delete}</Button></form></div></td></tr>{/each}</tbody></table></div>{/if}</section>
<section aria-labelledby="purchase-trend"><h2 id="purchase-trend">{f.trend}</h2><p>{f.trendNote}</p><table><thead><tr><th>{f.month}</th><th>{f.amount}</th><th>{f.count}</th></tr></thead><tbody>{#each data.trend as month (month.month)}<tr><th scope="row">{month.month}</th><td>{number(month.amount)}</td><td>{month.count}</td></tr>{/each}</tbody></table></section>
<style>
.statistics { display: flex; flex-wrap: wrap; gap: 1.5rem 3rem; margin-block: 2rem; } dt { font-size: .875rem; } dd { margin: .25rem 0 0; font-variant-numeric: tabular-nums; font-weight: 600; }
.editor { align-items: start; display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); } .wide { grid-column: 1 / -1; } .editor input, .editor select, .editor textarea { width: 100%; box-sizing: border-box; }
.actions { display: flex; gap: .5rem; align-items: center; } .table-scroll { max-width: 100%; overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; } th, td { text-align: start; border-bottom: 1px solid var(--color-border); padding: .75rem .5rem; } .table-scroll table { min-width: 44rem; }
.table-hint { display: none; font-size: var(--text-caption); color: var(--color-ink-muted); }
@media(max-width: 40rem) { .table-hint { display: block; } .editor { grid-template-columns: minmax(0, 1fr); } .statistics { gap: 1rem 2rem; } }
</style>
