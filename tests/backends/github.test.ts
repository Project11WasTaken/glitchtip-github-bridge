import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGithubClient } from '../../src/backends/github.js'

describe('GitHub client', () => {
  const config = {
    githubToken: 'ghp_test123',
    githubRepo: 'owner/repo',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('isDuplicate', () => {
    it('returns true when issue with marker exists', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ total_count: 1 }), { status: 200 }),
      )

      const client = createGithubClient(config)
      const result = await client.isDuplicate('42')

      expect(result).toBe(true)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/search/issues?q='),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer ghp_test123',
          }),
        }),
      )
    })

    it('returns false when no matching issue exists', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ total_count: 0 }), { status: 200 }),
      )

      const client = createGithubClient(config)
      const result = await client.isDuplicate('42')

      expect(result).toBe(false)
    })

    it('returns false on API error (fail-open)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))

      const client = createGithubClient(config)
      const result = await client.isDuplicate('42')

      expect(result).toBe(false)
    })

    it('returns false on non-200 response (fail-open)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      )

      const client = createGithubClient(config)
      const result = await client.isDuplicate('42')

      expect(result).toBe(false)
    })
  })

  describe('createIssue', () => {
    it('creates an issue via GraphQL and returns result with labelIds', async () => {
      const repoQueryResponse = {
        data: {
          repository: {
            id: 'R_kgDOTest',
            labels: {
              nodes: [
                { id: 'LA_bug', name: 'bug' },
                { id: 'LA_gt', name: 'glitchtip' },
              ],
            },
          },
        },
      }
      const createIssueResponse = {
        data: {
          createIssue: {
            issue: {
              id: 'I_kwDOTestIssue',
              number: 42,
              url: 'https://github.com/owner/repo/issues/42',
            },
          },
        },
      }
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(repoQueryResponse), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(createIssueResponse), { status: 200 }))

      const client = createGithubClient(config)
      const result = await client.createIssue('[GlitchTip] Error', 'body', ['bug'])

      expect(result.ok).toBe(true)
      expect(result.data?.html_url).toBe('https://github.com/owner/repo/issues/42')
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/graphql',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            query: `mutation CreateIssue($input: CreateIssueInput!) {
  createIssue(input: $input) {
    issue {
      id
      number
      url
    }
  }
}`,
            variables: {
              input: {
                repositoryId: 'R_kgDOTest',
                title: '[GlitchTip] Error',
                body: 'body',
                labelIds: ['LA_bug'],
              },
            },
          }),
        }),
      )
    })

    it('returns error result on API failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: [{ message: 'Not Found' }] }), { status: 404 }),
      )

      const client = createGithubClient(config)
      const result = await client.createIssue('Title', 'body', ['bug'])

      expect(result.ok).toBe(false)
      expect(result.status).toBe(0)
    })

    it('returns error result on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('DNS resolution failed'))

      const client = createGithubClient(config)
      const result = await client.createIssue('Title', 'body', ['bug'])

      expect(result.ok).toBe(false)
      expect(result.status).toBe(0)
      expect(result.data).toBeNull()
    })

    it('creates issue directly with projectV2Ids and labelIds via GraphQL when configured', async () => {
      const repoQueryResponse = {
        data: {
          repository: {
            id: 'R_kgDOTest',
            labels: {
              nodes: [
                { id: 'LA_bug', name: 'bug' },
              ],
            },
          },
        },
      }
      const createIssueResponse = {
        data: {
          createIssue: {
            issue: {
              id: 'I_kwDOTestIssue',
              number: 42,
              url: 'https://github.com/owner/repo/issues/42',
            },
          },
        },
      }
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(repoQueryResponse), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(createIssueResponse), { status: 200 }))

      const client = createGithubClient({
        ...config,
        githubProjectId: 'PVT_kwDOBnNbdM4BFB5m',
      })
      const result = await client.createIssue('[GlitchTip] Error', 'body', ['bug'])

      expect(result.ok).toBe(true)
      expect(result.data?.number).toBe(42)
      expect(result.data?.html_url).toBe('https://github.com/owner/repo/issues/42')

      // Verify GraphQL createIssue mutation was called with both projectV2Ids and labelIds in single mutation
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/graphql',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            query: `mutation CreateIssue($input: CreateIssueInput!) {
  createIssue(input: $input) {
    issue {
      id
      number
      url
    }
  }
}`,
            variables: {
              input: {
                repositoryId: 'R_kgDOTest',
                title: '[GlitchTip] Error',
                body: 'body',
                projectV2Ids: ['PVT_kwDOBnNbdM4BFB5m'],
                labelIds: ['LA_bug'],
              },
            },
          }),
        }),
      )
    })

    it('uses githubRepositoryId from config when provided', async () => {
      const repoQueryResponse = {
        data: {
          repository: {
            id: 'R_kgDOTest',
            labels: { nodes: [] },
          },
        },
      }
      const createIssueResponse = {
        data: {
          createIssue: {
            issue: {
              id: 'I_kwDOTestIssue',
              number: 99,
              url: 'https://github.com/owner/repo/issues/99',
            },
          },
        },
      }
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify(repoQueryResponse), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(createIssueResponse), { status: 200 }))

      const client = createGithubClient({
        ...config,
        githubProjectId: 'PVT_kwDOBnNbdM4BFB5m',
        githubRepositoryId: 'R_kgDOPreConfigured',
      })
      const result = await client.createIssue('Title', 'body', [])

      expect(result.ok).toBe(true)
      expect(result.data?.number).toBe(99)
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/graphql',
        expect.objectContaining({
          body: expect.stringContaining('"repositoryId":"R_kgDOPreConfigured"'),
        }),
      )
    })
  })
})

