<script lang="ts">
  import { enhance } from "$app/forms";
  import { Button, PageHeader } from "@zendev-lab/spark-ui";

  let { data, form } = $props();
  const t = $derived(data.messages.personal);
  const capabilities = $derived(data.signedIn ? data.installed : []);
  const canGrant = $derived(data.signedIn && data.bindings.some(binding => !binding.revokedAt && binding.localOwnerId) && data.sessionOptions.length > 0 && capabilities.length > 0);
</script>
<svelte:head><title>{t.title} · Ulota</title></svelte:head>
<PageHeader title={t.title} lede={t.body} />
{#if form?.failed}<p role="alert">{t.failure}</p>{/if}
{#if form?.saved}<p role="status">{t.saved}</p>{/if}
{#if !data.signedIn}
  <p>{t.signInBody}</p><Button href="/login?next=%2Fpersonal">{t.signIn}</Button>
  {#if data.localSignIn}<form method="POST" action="?/localSignIn"><Button type="submit" variant="secondary">{t.localSignIn}</Button></form>{/if}
{:else}
  <section aria-labelledby="personal-tools"><h2 id="personal-tools">{t.plugins}</h2><ul>
    {#each capabilities as capability}
      <li><form method="POST" action="?/toggle" use:enhance>
        <strong>{t[capability]}</strong><span>{data.enabled.includes(capability) ? t.enabled : t.disabled}</span>
        <input type="hidden" name="capability" value={capability} /><input type="hidden" name="enabled" value={String(!data.enabled.includes(capability))} />
        <Button type="submit" variant="secondary">{data.enabled.includes(capability) ? t.disable : t.enable}</Button>
        {#if data.enabled.includes(capability)}<Button href="/personal/{capability}" variant="ghost">{t.open}</Button>{/if}
      </form></li>
    {/each}
  </ul></section>
  <section aria-labelledby="personal-devices"><h2 id="personal-devices">{t.devices}</h2>
    {#if data.daemons.length === 0}<p>{t.noDevices}</p>{:else}
      <form method="POST" action="?/pair" use:enhance><label>{t.device}<select name="runtimeId" required>{#each data.daemons as device}<option value={device.id}>{device.name}</option>{/each}</select></label><Button type="submit">{t.pair}</Button></form>
    {/if}
    {#if form?.pairing}<div role="status"><p>{t.pairHint}</p><code>{form.pairing.token}</code></div>{/if}
    <ul>{#each data.bindings.filter(binding => !binding.revokedAt) as binding (binding.id)}
      <li><form method="POST" action="?/revoke" use:enhance><span>{data.daemons.find(device => device.id === binding.runtimeId)?.name ?? t.device}</span>{#if !binding.localOwnerId}<span>{t.notPaired}</span>{/if}<input type="hidden" name="id" value={binding.id} /><Button type="submit" variant="danger">{t.revoke}</Button></form></li>
    {/each}</ul>
  </section>
  <section aria-labelledby="personal-conversations"><h2 id="personal-conversations">{t.conversations}</h2>
    <form method="POST" action="?/conversation" use:enhance><label>{t.device}<select name="bindingId" required>{#each data.bindings.filter(binding => !binding.revokedAt && binding.localOwnerId) as binding}<option value={binding.id}>{data.daemons.find(device => device.id === binding.runtimeId)?.name ?? t.device}</option>{/each}</select></label><input type="hidden" name="sessionId" value={(form && "retrySessionId" in form ? form.retrySessionId : undefined) ?? data.newSessionId} /><Button type="submit" disabled={!data.bindings.some(binding => !binding.revokedAt && binding.localOwnerId)}>{t.newConversation}</Button></form>
    {#if data.conversations.length === 0}<p>{t.emptyConversations}</p>{:else}<ul>{#each data.conversations as conversation (conversation.sessionId)}<li>{#if conversation.session}<a href="/personal/sessions/{conversation.sessionId}">{conversation.session.name ?? t.title}</a>{:else}<span>{t.unavailable}</span>{/if}</li>{/each}</ul>{/if}
  </section>
  <section aria-labelledby="personal-permissions"><h2 id="personal-permissions">{t.workspaceAccess}</h2>
    {#if !canGrant}<p id="personal-grant-hint">{t.permissionPrerequisite}</p>{/if}
    <form method="POST" action="?/grant" use:enhance>
      <label>{t.device}<select disabled={!canGrant} name="bindingId" required>{#each data.bindings.filter(binding => !binding.revokedAt && binding.localOwnerId) as binding}<option value={binding.id}>{data.daemons.find(device => device.id === binding.runtimeId)?.name ?? t.device}</option>{/each}</select></label>
      <label>{t.session}<select disabled={!canGrant} name="sessionId" required>{#each data.sessionOptions as session}<option value={session.sessionId}>{session.name}</option>{/each}</select></label>
      <label>{t.capability}<select disabled={!canGrant} name="capability">{#each capabilities as capability}<option value={capability}>{t[capability]}</option>{/each}</select></label>
      <label class="permission-write"><input disabled={!canGrant} type="checkbox" name="canWrite" />{t.write}</label><Button type="submit" disabled={!canGrant}>{t.grant}</Button>
    </form>
    <ul>{#each data.grants as grant}<li><form method="POST" action="?/grant" use:enhance><span>{t[grant.capability as "inventory" | "todos" | "subscriptions"]}</span><code>{grant.sessionId}</code><input type="hidden" name="bindingId" value={grant.bindingId} /><input type="hidden" name="sessionId" value={grant.sessionId} /><input type="hidden" name="capability" value={grant.capability} /><input type="hidden" name="revoke" value="true" /><Button type="submit" variant="secondary">{t.remove}</Button></form></li>{/each}</ul>
  </section>
{/if}

<style>.permission-write { display: flex !important; align-items: center; }</style>
