<!-- FriendsTabs inside the Tabs.Root and panel the Friends page gives it. -->
<script lang="ts">
  import * as Tabs from '$lib/components/ui/tabs/index.js'
  import FriendsTabs from '$lib/components/friends/FriendsTabs.svelte'

  let { tab, counts }: { tab: string; counts: { all: number; online: number; requests: number } } = $props()
</script>

<Tabs.Root value={tab}>
  <FriendsTabs {counts} />
  <Tabs.Content value={tab} id="p">panel</Tabs.Content>
</Tabs.Root>
