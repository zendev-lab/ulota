<script lang="ts">
  import { page } from "$app/state";
  let { children, data } = $props();
  const t = $derived(data.messages.personal);
</script>
<div class="personal-shell">
  <header><a href="/">{t.back}</a><a href="/personal" aria-current={page.url.pathname === "/personal" ? "page" : undefined}>{t.title}</a></header>
  <main id="personal-main">{@render children()}</main>
</div>
<style>
  .personal-shell { max-width: 72rem; margin-inline: auto; padding: clamp(1rem, 3vw, 2.5rem); }
  header { display: flex; justify-content: space-between; gap: 1rem; padding-block-end: 1.5rem; border-bottom: 1px solid var(--color-border); }
  main { padding-block: 2rem; min-width: 0; }
  a { color: var(--color-primary); text-underline-offset: .2em; }
  :global(.personal-shell section) { margin-block: 2.5rem; }
  :global(.personal-shell h2) { font-size: 1.25rem; margin-block-end: 1rem; }
  :global(.personal-shell form) { display: flex; flex-wrap: wrap; gap: .75rem; align-items: end; }
  :global(.personal-shell input:not([type=checkbox])), :global(.personal-shell select), :global(.personal-shell textarea) { max-width: 100%; border: 1px solid var(--color-border); border-radius: var(--radius-sm, 6px); padding: .65rem; background: var(--color-surface); color: inherit; font: inherit; }
  :global(.personal-shell label) { display: grid; gap: .4rem; }
  :global(.personal-shell li) { padding-block: .85rem; border-bottom: 1px solid var(--color-border); }
  :global(.personal-shell code) { overflow-wrap: anywhere; }
</style>
