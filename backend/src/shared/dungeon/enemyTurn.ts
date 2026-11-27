// The enemies' turn after every living hero threw (spec: "Enemy turn"): each living enemy carries out
// its intent, an attack hits every living hero (block first unless it pierces), Burn ticks, Chill
// wears off, and block resets (a class may keep part of it).
import { modifiersOf } from './content/classes.js'
import { ENEMIES } from './content/enemies.js'
import type { Intent } from './content/types.js'
import { attackDamage, type Difficulty, type Rules } from './rules.js'
import { alive, type Enemy, type Hero } from './state.js'

/** The intent an enemy shows in this round (1-based). */
export function intentOf(enemy: Enemy, round: number): Intent {
  const pattern: readonly Intent[] = ENEMIES[enemy.kind].pattern
  return pattern[(round - 1) % pattern.length]
}

/** The damage an intent will do per hero, as the screen shows it: after Chill, before block. */
export const intentValue = (enemy: Enemy, round: number, difficulty: Difficulty, rules: Rules): number | null => {
  const intent = intentOf(enemy, round)
  return intent.kind === 'attack' ? attackDamage(intent.value, difficulty, enemy.chilled, rules) : null
}

/** What the turn did, for the screen. */
export type EnemyTurnLog = {
  attacks: { uid: string; hits: { seat: number; blocked: number; damage: number }[] }[]
  burns: { uid: string; damage: number }[]
}

export type EnemyTurnResult = { heroes: Hero[]; enemies: Enemy[]; log: EnemyTurnLog }

export function enemyTurn(heroesIn: Hero[], enemiesIn: Enemy[], round: number, difficulty: Difficulty, rules: Rules): EnemyTurnResult {
  const heroes = heroesIn.map(h => ({ ...h }))
  const enemies = enemiesIn.map(e => ({ ...e }))
  const log: EnemyTurnLog = { attacks: [], burns: [] }

  for (const enemy of enemies.filter(alive)) {
    const intent = intentOf(enemy, round)
    if (intent.kind === 'attack') {
      const amount = attackDamage(intent.value, difficulty, enemy.chilled, rules)
      const hits = heroes.filter(alive).map(h => {
        const blocked = intent.pierce ? 0 : Math.min(h.block, amount)
        h.block -= blocked
        const damage = Math.min(h.hp, amount - blocked)
        h.hp -= damage
        return { seat: h.seat, blocked, damage }
      })
      log.attacks.push({ uid: enemy.uid, hits })
    }
    enemy.chilled = false
  }

  for (const enemy of enemies.filter(e => alive(e) && e.burn > 0)) {
    const damage = Math.min(enemy.hp, enemy.burn)
    enemy.hp -= damage
    log.burns.push({ uid: enemy.uid, damage })
  }

  for (const h of heroes) {
    h.block = Math.floor(h.block * (modifiersOf(h.classId).blockCarry ?? 0))
  }
  return { heroes, enemies, log }
}
