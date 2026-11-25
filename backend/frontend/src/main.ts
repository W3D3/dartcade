import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('#app element missing')
mount(App, { target })
// The app's own BootLoader is up now: drop the static one from index.html
document.getElementById('boot')?.remove()
