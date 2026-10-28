// A radio group (bits-ui RadioGroup: one choice of several, arrow keys move between options) for options that
// aren't a SegmentedControl. Root is bits-ui's own, styled by its class; Item takes one of the app's looks.
import { RadioGroup as RadioGroupPrimitive } from 'bits-ui'
import Item from './radio-group-item.svelte'

const Root = RadioGroupPrimitive.Root
export { Root, Item, Root as RadioGroup, Item as RadioGroupItem }
export { radioItemVariants } from './radio-group-variants.js'
