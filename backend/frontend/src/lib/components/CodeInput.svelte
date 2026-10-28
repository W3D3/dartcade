<script lang="ts">
  // A bridge pairing code: its charset upper-cased as it's typed, and a code pulled out of a pasted log line.
  import { PinInput } from '$lib/components/ui/pin-input/index.js'
  import { normalizePairingCode, extractPairingCode, CODE_CHARSET, CODE_LENGTH } from '$lib/pairing'

  let {
    value = $bindable(''),
    length = CODE_LENGTH,
    groupAt = 4,
    invalid = false,
    onfocus,
    oninput,
    label = 'Code',
  }: {
    value?: string
    length?: number
    groupAt?: number
    invalid?: boolean
    onfocus?: () => void
    oninput?: (value: string) => void
    /** Accessible name of the code field. */
    label?: string
  } = $props()

  // Lower case is typed too, and upper-cased on the way in
  const pattern = `^[${CODE_CHARSET}${CODE_CHARSET.toLowerCase()}]*$`
  let inputRef = $state<HTMLInputElement | null>(null)

  export function focus() {
    inputRef?.focus()
  }
</script>

<PinInput
  bind:inputRef
  {value}
  onValueChange={(v: string) => {
    value = normalizePairingCode(v)
    oninput?.(value)
  }}
  maxlength={length}
  {groupAt}
  {invalid}
  {pattern}
  pasteTransformer={extractPairingCode}
  onfocus={() => onfocus?.()}
  inputmode="text"
  autocapitalize="characters"
  spellcheck="false"
  aria-label={label}
/>
