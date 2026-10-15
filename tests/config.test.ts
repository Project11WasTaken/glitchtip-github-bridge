import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('loads all required and optional config from env vars', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123'
    process.env.GITHUB_REPO = 'owner/repo'
    process.env.GLITCHTIP_API_URL = 'http://web:8000'
    process.env.GLITCHTIP_API_TOKEN = 'gt_token'
    process.env.GLITCHTIP_WEBHOOK_SECRET = 'my-secret'
    process.env.WEBHOOK_PORT = '4000'
    process.env.GITHUB_PROJECT_ID = 'PVT_kwDOBnNbdM4BFB5m'
    process.env.GITHUB_REPOSITORY_ID = 'R_kgDOQ_R2hg'

    const config = loadConfig()

    expect(config.githubToken).toBe('ghp_test123')
    expect(config.githubRepo).toBe('owner/repo')
    expect(config.githubRepositoryId).toBe('R_kgDOQ_R2hg')
    expect(config.githubProjectId).toBe('PVT_kwDOBnNbdM4BFB5m')
    expect(config.glitchtipApiUrl).toBe('http://web:8000')
    expect(config.glitchtipApiToken).toBe('gt_token')
    expect(config.webhookSecret).toBe('my-secret')
    expect(config.port).toBe(4000)
  })

  it('uses defaults for optional vars', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123'
    process.env.GITHUB_REPO = 'owner/repo'
    process.env.GLITCHTIP_API_URL = 'http://web:8000'
    process.env.GLITCHTIP_API_TOKEN = 'gt_token'

    const config = loadConfig()

    expect(config.webhookSecret).toBe('')
    expect(config.port).toBe(3001)
    expect(config.githubProjectId).toBe('')
    expect(config.githubRepositoryId).toBe('')
  })

  it('falls back to GITHUB_PROJECT_V2_ID if GITHUB_PROJECT_ID is not set', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123'
    process.env.GITHUB_REPO = 'owner/repo'
    process.env.GLITCHTIP_API_URL = 'http://web:8000'
    process.env.GLITCHTIP_API_TOKEN = 'gt_token'
    process.env.GITHUB_PROJECT_V2_ID = 'PVT_kwFallback'

    const config = loadConfig()

    expect(config.githubProjectId).toBe('PVT_kwFallback')
  })

  it('throws when required env var is missing', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123'
    expect(() => loadConfig()).toThrow('GITHUB_REPO')
  })

  it('returns a frozen object', () => {
    process.env.GITHUB_TOKEN = 'ghp_test123'
    process.env.GITHUB_REPO = 'owner/repo'
    process.env.GLITCHTIP_API_URL = 'http://web:8000'
    process.env.GLITCHTIP_API_TOKEN = 'gt_token'

    const config = loadConfig()

    expect(() => {
      ;(config as any).port = 9999
    }).toThrow()
  })
})
