<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button, PageHeader } from "@zendev-lab/spark-ui";
  let { data, form } = $props();
  const t = $derived(data.messages.web.personal);
</script>
<svelte:head><title>{t.title} · Ulota</title></svelte:head>
<section class="personal"><PageHeader title={t.title} lede={t.body} />
{#if data.personal.binding}
  <p>{t.linked}</p><Button href={new URL("/personal", data.personal.binding.serverUrl).toString()}>{t.openHub}</Button>
  <form method="POST" action="?/unbind" use:enhance><Button type="submit" variant="secondary">{t.unbind}</Button></form>
{:else}
  <p>{t.unbound}</p><form method="POST" action="?/bind" use:enhance>
    <label>{t.hubUrl}<input type="url" name="serverUrl" required /></label>
    <label>{t.code}<input type="password" name="token" required autocomplete="off" /></label><Button type="submit">{t.bind}</Button>
  </form>
{/if}
{#if form?.failed}<p role="alert">{t.failure}</p>{/if}
</section>
<style>.personal { max-width: 44rem; margin-inline: auto; padding: 2rem; } form { display: grid; gap: 1rem; margin-block: 1.5rem; } label { display: grid; gap: .5rem; } input { color: inherit; background: var(--color-surface); border: 1px solid var(--color-border); padding: .75rem; border-radius: var(--radius-sm, 6px); font: inherit; }</style>
