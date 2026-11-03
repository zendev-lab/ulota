<script lang="ts">
  import { deserialize, enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { Button, PageHeader } from "@zendev-lab/spark-ui";
  import { HumanInteractionPanel } from "@zendev-lab/spark-ui/conversation";
  import { SafeMarkdown } from "@zendev-lab/spark-ui/markdown";
  let { data, form } = $props();
  const t = $derived(data.messages.personal);
  const human = $derived(data.messages.personal.human);
  async function respond(wait: NonNullable<typeof data.interactions>[number], response: { status: "answered" | "cancelled"; answers: Record<string, unknown> }) {
    const body = new FormData();
    body.set("humanRequestId", wait.humanRequestId);
    body.set("humanResponseId", wait.humanResponseId);
    body.set("status", response.status);
    body.set("answers", JSON.stringify(response.answers));
    const result = deserialize(await (await fetch("?/respond", { method: "POST", body })).text());
    if (result.type !== "success") throw new Error(t.failure);
    await invalidateAll();
  }
</script>
<svelte:head><title>{t.conversations} · Ulota</title></svelte:head>
<PageHeader title={t.conversations} />
<Button variant="secondary" onclick={() => void invalidateAll()}>{t.refresh}</Button>
{#if !data.snapshot}<p role="status">{t.unavailable}</p>{:else}
  {#if data.snapshot.snapshot.messages.length === 0}<p>{t.emptyChat}</p>{/if}
  <ol class="messages">{#each data.snapshot.snapshot.messages.filter(message => message.display !== false) as message (message.id)}<li><strong>{message.role}</strong><SafeMarkdown source={message.text} /></li>{/each}</ol>
  <form method="POST" action="?/send" use:enhance><label>{t.message}<textarea name="prompt" rows="4" required maxlength="32000"></textarea></label><input type="hidden" name="submissionId" value={data.submissionId} /><Button type="submit">{t.send}</Button></form>
{/if}
{#if data.interactions === null}<p role="status">{t.unavailable}</p>{:else}
  {#each data.interactions ?? [] as wait (wait.humanRequestId)}
    <HumanInteractionPanel title={wait.title} prompt={wait.prompt} questions={wait.questions} mode={wait.mode} labels={human} onRespond={response => respond(wait, response)} />
  {/each}
{/if}
{#if form?.failed}<p role="alert">{t.failure}</p>{/if}
<style>.messages { list-style: none; padding: 0; max-width: 72ch; } label { flex: 1; } textarea { width: 100%; }</style>
