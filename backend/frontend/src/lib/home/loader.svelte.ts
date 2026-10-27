// One Home section's request: its data, whether it is loading and the refusal to show. Each section
// has its own, so one failing never blanks the page. It loads when created; `load` can run again to refresh.
type Result<T> = { data?: T; error?: { error: string } }

export class Loader<T> {
  data = $state<T | null>(null)
  error = $state('')
  loading = $state(true)

  constructor(private readonly request: () => Promise<Result<T>>) {
    void this.load()
  }

  async load(): Promise<void> {
    try {
      const { data, error } = await this.request()
      if (data) {
        this.data = data
        this.error = ''
      } else {
        this.error = error?.error ?? 'Something went wrong'
      }
    } catch {
      this.error = 'Something went wrong'
    } finally {
      this.loading = false
    }
  }
}
