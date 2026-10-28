// bits-ui Tabs (arrow keys, Home/End, only the selected tab in the tab order); our Trigger adds the house looks.
import { Tabs as TabsPrimitive } from 'bits-ui'
import Trigger from './tabs-trigger.svelte'

const Root = TabsPrimitive.Root
const List = TabsPrimitive.List
const Content = TabsPrimitive.Content

export { Root, List, Trigger, Content }
