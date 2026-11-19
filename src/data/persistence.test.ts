import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LevelDB } from './db'
import { createRepositories, DEFAULT_PROFILE_NAME } from './repositories'

let database: LevelDB
let repos: ReturnType<typeof createRepositories>

beforeEach(async () => {
  database = new LevelDB('level-test-' + Math.random())
  repos = createRepositories(database)
})

describe('persistance locale', () => {
  it('crée un profil par défaut puis le conserve après réouverture', async () => {
    expect((await repos.profile.get()).displayName).toBe(DEFAULT_PROFILE_NAME)
    await repos.profile.setName('  Aria  ')
    database.close()
    await database.open() // simule un redémarrage
    expect((await repos.profile.get()).displayName).toBe('Aria')
  })
  it('retombe sur le nom par défaut si le nom est vide', async () => {
    await repos.profile.setName('   ')
    expect((await repos.profile.get()).displayName).toBe(DEFAULT_PROFILE_NAME)
  })
  it('persiste les réglages', async () => {
    await repos.settings.set('showDemoData', false)
    expect((await repos.settings.getAll()).showDemoData).toBe(false)
    expect((await repos.settings.getAll()).reducedMotion).toBe(false)
  })
  it('bascule et réinitialise les quêtes de démo', async () => {
    await repos.demo.toggleQuest('q1')
    expect(await database.demoQuestState.count()).toBe(1)
    await repos.demo.toggleQuest('q1')
    expect(await database.demoQuestState.count()).toBe(0)
    await repos.demo.toggleQuest('q2')
    await repos.demo.reset()
    expect(await database.demoQuestState.count()).toBe(0)
  })
})
