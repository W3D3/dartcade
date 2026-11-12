import { describe, expect, it } from 'vitest'
import appSource from '../../App.svelte?raw'
import { hrefs } from '../routes'

// One sample call per builder; the Record type makes a new builder fail typecheck until it has one.
const SAMPLES: Record<keyof typeof hrefs, string[]> = {
  home: [hrefs.home()],
  play: [hrefs.play(), hrefs.play('board=b1')],
  session: [hrefs.session('s1')],
  watch: [hrefs.watch('s1')],
  login: [hrefs.login(), hrefs.login('reset=1')],
  register: [hrefs.register()],
  verify: [hrefs.verify('email=a')],
  forgot: [hrefs.forgot()],
  reset: [hrefs.reset()],
  legal: [hrefs.legal('terms'), hrefs.legal('privacy'), hrefs.legal('imprint')],
  history: [hrefs.history(), hrefs.history('g1')],
  stats: [hrefs.stats()],
  coach: [hrefs.coach(), hrefs.coach('filter=lost')],
  coachChecks: [hrefs.coachChecks()],
  coachLeg: [hrefs.coachLeg('g1', 2)],
  lobby: [hrefs.lobby(), hrefs.lobby('rematch=1')],
  join: [hrefs.join(), hrefs.join('K7Q4MD'), hrefs.join('K7Q4MD', 'via=qr')],
  invites: [hrefs.invites()],
  settings: [hrefs.settings(), hrefs.settings('boards', 'pair')],
  voicePack: [hrefs.voicePack('p1')],
  friends: [hrefs.friends()],
  matchmaking: [hrefs.matchmaking()],
  tournaments: [hrefs.tournaments(), hrefs.tournaments('teams')],
  tournamentJoin: [hrefs.tournamentJoin('K7Q4MD')],
  tournamentNew: [hrefs.tournamentNew()],
  tournament: [hrefs.tournament('t1'), hrefs.tournament('t1', 'code=K7Q4MD')],
  tournamentEdit: [hrefs.tournamentEdit('t1'), hrefs.tournamentEdit('t1', 'saved=open')],
  ranks: [hrefs.ranks()],
  progress: [hrefs.progress()],
  rewards: [hrefs.rewards(), hrefs.rewards(15)],
  achievements: [hrefs.achievements()],
  profile: [hrefs.profile(), hrefs.profile('u1')],
  customise: [hrefs.customise(), hrefs.customise('frame')],
  bigScreen: [hrefs.bigScreen('b1')],
  bigScreenFrame: [hrefs.bigScreenFrame()],
  devStats: [hrefs.devStats()],
  admin: [hrefs.admin()],
  adminUsers: [hrefs.adminUsers()],
  adminGames: [hrefs.adminGames(), hrefs.adminGames('g1')],
  adminFlags: [hrefs.adminFlags()],
  adminRanked: [hrefs.adminRanked()],
  adminSystem: [hrefs.adminSystem()],
  adminDartSamples: [hrefs.adminDartSamples()],
  adminCosmetics: [hrefs.adminCosmetics()],
  adminCoach: [hrefs.adminCoach()],
  adminMinigolf: [hrefs.adminMinigolf(), hrefs.adminMinigolf('course=c1')],
  adminMinigolfReports: [hrefs.adminMinigolfReports()],
  adminMinigolfCourses: [hrefs.adminMinigolfCourses()],
  minigolfBrowse: [hrefs.minigolfBrowse()],
  minigolfCourses: [hrefs.minigolfCourses()],
}

// The router table's keys: '/history/:id', '/profile/customise/:tab?'.
const patterns = [...appSource.matchAll(/^\s*'(\/[^']*)':/gm)].map(m => {
  const re = m[1].replace(/\/:\w+\?/g, '(?:/[^/]+)?').replace(/:\w+/g, '[^/]+')
  return new RegExp(`^${re}$`)
})

describe('hrefs', () => {
  it('reads the router table', () => {
    expect(patterns.length).toBeGreaterThan(40)
  })

  it.each(Object.entries(SAMPLES).flatMap(([name, hrefList]) => hrefList.map(h => [name, h] as const)))(
    '%s: %s is a route in App.svelte',
    (_name, href) => {
      const path = href.slice(1).split('?')[0]
      expect(patterns.some(p => p.test(path))).toBe(true)
    },
  )
})
