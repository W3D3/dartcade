<script lang="ts">
  // Who invited you, ringed in lime (the invite toast, the drawer, an invite link). offset: the
  // background around it, as a ring-offset class.
  import Avatar from '$lib/components/Avatar.svelte'

  let { name, size, offset }: { name: string; size: number; offset: string } = $props()
</script>

<span class="flex m-[3px] shrink-0 rounded-full ring-[2.5px] ring-accent ring-offset-1 {offset}">
  <Avatar {name} {size} />
</span>
