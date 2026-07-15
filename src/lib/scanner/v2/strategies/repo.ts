import { Strategy, SimulatedAction, ExtractionResult, BaseNode, BaseEdge } from '../types';
import { generateHash } from './interface';

export class RepoStrategy implements Strategy {
  type_name = 'repo' as const;

  matches(url: string, pageContent: string): number {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('github.com/') || lowerUrl.includes('gitlab.com/')) {
      return 1.0; // Instantly matches with 100% confidence
    }
    return 0.0;
  }

  interact(url: string, pageContent: string): SimulatedAction[] {
    return [];
  }

  private async fetchGithubFile(owner: string, repo: string, path: string): Promise<string> {
    const branches = ['main', 'master'];
    for (const branch of branches) {
      const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
      try {
        const res = await fetch(fileUrl, { headers: { 'User-Agent': 'Glintscanner-V2/2.0' } });
        if (res && res.status === 200) {
          return await res.text().catch(() => '');
        }
      } catch {}
    }
    return '';
  }

  async extract(url: string, pageContent: string, actions: SimulatedAction[]): Promise<ExtractionResult> {
    const entities: BaseNode[] = [];
    const relations: BaseEdge[] = [];

    const githubMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/i);
    if (!githubMatch) {
      // Fallback if not a standard github URL
      const repoHash = generateHash(url);
      const repoNode: BaseNode = {
        id: `repo:${repoHash}`,
        type: 'sdk',
        source_url: url,
        source_strategy: 'repo',
        title: 'Repository Root',
        properties: {},
        extracted_at: new Date().toISOString(),
        confidence: 0.8,
      };
      return { entities: [repoNode], relations: [] };
    }

    const owner = githubMatch[1];
    const repo = githubMatch[2].split('/')[0].split('?')[0].split('#')[0].replace(/\.git$/i, '');
    const repoId = `repo:${owner.toLowerCase()}_${repo.toLowerCase()}`;

    // 1. Core Repository Node (type 'sdk' in the UI/base schema)
    const repoNode: BaseNode = {
      id: repoId,
      type: 'sdk',
      source_url: url,
      source_strategy: 'repo',
      title: `${owner}/${repo}`,
      properties: {
        stars: 'N/A',
        contributors: 'N/A',
        github_url: url,
      },
      extracted_at: new Date().toISOString(),
      confidence: 1.0,
    };
    entities.push(repoNode);

    // 2. Query Metadata from API only if GITHUB_TOKEN is available
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      try {
        const metadataRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers: {
            'Authorization': `token ${githubToken}`,
            'User-Agent': 'Glintscanner-V2/2.0',
          },
        });
        if (metadataRes && metadataRes.status === 200) {
          const repoMeta = await metadataRes.json();
          repoNode.properties.stars = repoMeta.stargazers_count ?? 'N/A';
          repoNode.properties.stars_count = repoMeta.stargazers_count ?? 0;
          repoNode.properties.license = repoMeta.license?.name || 'N/A';
          repoNode.properties.primary_language = repoMeta.language || 'N/A';
        }
      } catch (err: any) {
        console.error('GitHub API query failed (gracefully degrading):', err.message);
      }
    }

    // 3. Extract Files (README) using raw.githubusercontent.com (No API limits)
    const readmeContent = await this.fetchGithubFile(owner, repo, 'README.md') ||
                          await this.fetchGithubFile(owner, repo, 'readme.md');
    if (readmeContent) {
      const readmeHash = generateHash(readmeContent);
      const readmeNode: BaseNode = {
        id: `file:${repoId}_readme`,
        type: 'page',
        source_url: `https://github.com/${owner}/${repo}/blob/main/README.md`,
        source_strategy: 'repo',
        title: 'README.md',
        properties: {
          path: 'README.md',
          wordCount: readmeContent.split(/\s+/).length,
        },
        content_hash: readmeHash,
        extracted_at: new Date().toISOString(),
        confidence: 1.0,
      };
      entities.push(readmeNode);

      // Connect Repository to README
      relations.push({
        id: `rel:${repoId}:readme`,
        from_id: repoNode.id,
        to_id: readmeNode.id,
        relation: 'documented_in',
        source_url: url,
        properties: {},
      });
    }

    // 4. Extract Dependencies from package.json/ Cargo.toml etc.
    const pkgContent = await this.fetchGithubFile(owner, repo, 'package.json');
    if (pkgContent) {
      try {
        const pkgObj = JSON.parse(pkgContent);
        const deps = { ...(pkgObj.dependencies || {}), ...(pkgObj.devDependencies || {}) };
        Object.keys(deps).slice(0, 5).forEach((depName) => {
          const depHash = generateHash(depName);
          const depNode: BaseNode = {
            id: `dependency:${depHash}`,
            type: 'concept',
            source_url: `https://www.npmjs.com/package/${depName}`,
            source_strategy: 'repo',
            title: depName,
            properties: {
              constraint: deps[depName],
              isDev: !!(pkgObj.devDependencies && pkgObj.devDependencies[depName]),
            },
            extracted_at: new Date().toISOString(),
            confidence: 1.0,
          };
          entities.push(depNode);

          // Connect Repository to Dependency
          relations.push({
            id: `rel:${repoId}:dep:${depHash}`,
            from_id: repoNode.id,
            to_id: depNode.id,
            relation: 'depends_on',
            source_url: url,
            properties: {},
          });
        });
      } catch {}
    }

    return { entities, relations };
  }

  get_next_urls(url: string, pageContent: string): string[] {
    // For repo strategies, we don't crawl links inside the repo recursively
    // to avoid giant directory tree dumps. Return empty list.
    return [];
  }
}
