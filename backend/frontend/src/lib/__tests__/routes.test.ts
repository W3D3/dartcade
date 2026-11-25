import { describe, expect, it } from 'vitest'
import appSource from '../../App.svelte?raw'
import { hrefs, movedTo } from '../routes'

// One sample call per builder; the Record type makes a new builder fail typecheck until it has one.
const SAMPLES: Record<keyof typeof hrefs, string[]> = {
  home: [hrefs.home()],
  play: [hrefs.play(), hrefs.play('board=b1')],
  missions: [hrefs.missions(), hrefs.missions('friends')],
  missionNew: [hrefs.missionNew()],
  missionEdit: [hrefs.missionEdit('m1')],
  session: [hrefs.session('s1')],
  watch: [hrefs.watch('s1')],
  login: [hrefs.login(), hrefs.login('reset=1')],
  register: [hrefs.register()],
  verify: [hrefs.verify('email=a')],
  forgot: [hrefs.forgot()],
  reset: [hrefs.reset()],
  legal: [hrefs.legal('terms'), hrefs.legal('privacy'), hrefs.legal('imprint')],
  history: [hrefs.history(), hrefs.history('g1'), hrefs.history('g1', 4)],
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
  ranked: [hrefs.ranked()],
  tournaments: [hrefs.tournaments(), hrefs.tournaments('teams')],
  tournamentJoin: [hrefs.tournamentJoin('K7Q4MD')],
  tournamentNew: [hrefs.tournamentNew()],
  tournament: [hrefs.tournament('t1'), hrefs.tournament('t1', 'code=K7Q4MD')],
  tournamentEdit: [hrefs.tournamentEdit('t1'), hrefs.tournamentEdit('t1', 'saved=open')],
  tournamentClaim: [hrefs.tournamentClaim('aB3_x-9')],
  tournamentManage: [hrefs.tournamentManage('t1')],
  tournamentMode: [hrefs.tournamentMode('t1')],
  tournamentPair: [hrefs.tournamentPair('ABCDEFGH'), hrefs.tournamentPair()],
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
  adminGames: [hrefs.adminGames(), hrefs.adminGames('g1'), hrefs.adminGames(undefined, 'status=active')],
  adminFlags: [hrefs.adminFlags()],
  adminRanked: [hrefs.adminRanked()],
  adminActivity: [hrefs.adminActivity()],
  adminActivityGames: [hrefs.adminActivityGames(), hrefs.adminActivityGames('kind=ranked')],
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

// The router table's keys: '/stats/history/:id', '/profile/customise/:tab?'.
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

describe('movedTo', () => {
  it('sends Matchmaking into Play and History into Stats, pages under them included', () => {
    expect(movedTo('/matchmaking')).toBe('/play/ranked')
    expect(movedTo('/matchmaking/ranks')).toBe('/play/ranked/ranks')
    expect(movedTo('/history')).toBe('/stats/history')
    expect(movedTo('/history/g1')).toBe('/stats/history/g1')
  })
  it('lands every moved page on a route', () => {
    for (const old of ['/matchmaking', '/matchmaking/ranks', '/history', '/history/g1'])
      expect(patterns.some(p => p.test(movedTo(old)!))).toBe(true)
  })
  it('leaves other paths alone', () => {
    expect(movedTo('/historyx')).toBeNull()
    expect(movedTo('/stats/history')).toBeNull()
    expect(movedTo('/play')).toBeNull()
  })
})
