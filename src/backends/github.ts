export interface GithubClientConfig {
  githubToken: string
  githubRepo: string
  githubProjectId?: string
  githubRepositoryId?: string
}

export interface GitHubCreateResult {
  ok: boolean
  status: number
  data: { number: number; html_url: string; node_id?: string } | null
}

export interface GithubClient {
  isDuplicate(issueId: string): Promise<boolean>
  createIssue(title: string, body: string, labels: string[]): Promise<GitHubCreateResult>
}

const GITHUB_API = 'https://api.github.com'

export function parseProjectIds(raw: string): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((s) => String(s).trim()).filter(Boolean)
      }
    } catch {
      // fallback to split
    }
  }
  return trimmed
    .split(',')
    .map((id) => id.replace(/^["']|["']$/g, '').trim())
    .filter(Boolean)
}

export function createGithubClient(config: GithubClientConfig): GithubClient {
  const headers = {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  let cachedRepositoryId = config.githubRepositoryId ?? ''
  let cachedLabels: Map<string, string> | null = null

  async function resolveRepoAndLabels(): Promise<{ repositoryId: string; labelMap: Map<string, string> }> {
    if (cachedRepositoryId && cachedLabels) {
      return { repositoryId: cachedRepositoryId, labelMap: cachedLabels }
    }

    const [owner, name] = config.githubRepo.split('/')
    const res = await fetch(`${GITHUB_API}/graphql`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
    labels(first: 100) {
      nodes {
        id
        name
      }
    }
  }
}`,
        variables: { owner, name },
      }),
    })

    const json = await res.json().catch(() => null)
    const repo = json?.data?.repository
    if (repo?.id && !cachedRepositoryId) {
      cachedRepositoryId = repo.id
    }
    if (!cachedLabels) {
      cachedLabels = new Map<string, string>()
      if (repo?.labels?.nodes) {
        for (const l of repo.labels.nodes) {
          if (l?.name && l?.id) {
            cachedLabels.set(l.name.toLowerCase(), l.id)
          }
        }
      }
    }

    if (!cachedRepositoryId) {
      throw new Error(`Failed to resolve repository ID for ${config.githubRepo}`)
    }

    return { repositoryId: cachedRepositoryId, labelMap: cachedLabels }
  }

  async function isDuplicate(issueId: string): Promise<boolean> {
    try {
      const q = encodeURIComponent(
        `repo:${config.githubRepo} "glitchtip-id:${issueId}" label:glitchtip`,
      )
      const res = await fetch(`${GITHUB_API}/search/issues?q=${q}`, {
        method: 'GET',
        headers,
      })
      if (!res.ok) return false
      const data = await res.json()
      return (data?.total_count ?? 0) > 0
    } catch (err) {
      console.error('GitHub duplicate search failed:', (err as Error).message)
      return false
    }
  }

  async function createIssue(
    title: string,
    body: string,
    labels: string[],
  ): Promise<GitHubCreateResult> {
    try {
      const { repositoryId, labelMap } = await resolveRepoAndLabels()
      const projectIds = parseProjectIds(config.githubProjectId ?? '')

      const input: Record<string, unknown> = {
        repositoryId,
        title,
        body,
      }
      if (projectIds.length > 0) {
        input.projectV2Ids = projectIds
      }
      if (labels.length > 0) {
        const labelIds = labels
          .map((name) => labelMap.get(name.toLowerCase()))
          .filter(Boolean) as string[]
        if (labelIds.length > 0) {
          input.labelIds = labelIds
        }
      }

      const res = await fetch(`${GITHUB_API}/graphql`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
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
          variables: { input },
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || data?.errors?.length) {
        const errorMsg = data?.errors?.map((e: any) => e.message).join('; ') ?? `HTTP ${res.status}`
        console.error('GitHub GraphQL createIssue failed:', errorMsg)
        return { ok: false, status: res.status || 400, data }
      }

      const issue = data?.data?.createIssue?.issue
      if (!issue) {
        console.error('GitHub GraphQL createIssue returned no issue data')
        return { ok: false, status: 200, data: null }
      }

      return {
        ok: true,
        status: 201,
        data: {
          number: issue.number,
          html_url: issue.url,
          node_id: issue.id,
        },
      }
    } catch (err) {
      console.error('GitHub create issue failed:', (err as Error).message)
      return { ok: false, status: 0, data: null }
    }
  }

  return { isDuplicate, createIssue }
}
