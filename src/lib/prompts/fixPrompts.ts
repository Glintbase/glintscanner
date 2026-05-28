export const FIX_PROMPTS = {
  llms_txt: `Create an llms.txt file at the root of my documentation site.
Place it at: [domain]/llms.txt

Structure it exactly as follows:
Line 1: # [Product Name]
Line 2: Blank line
Line 3: One paragraph summary of what the product does and who it's for.
Line 4: Blank line
Line 5: ## Technical Constraints
- Rate limits
- Authentication requirements
- SDK language support
- Known limitations
Line 6: Blank line
Line 7: ## Key Documentation
- [URL]: [one-line description] (repeat for top 10 most important pages)

My docs are at: [URL]
My product does: [brief description]`,

  llms_full_txt: `Create an llms-full.txt file at the root of my documentation site.
This should contain the entire documentation merged into a single Markdown file.`,

  link_header: `Add a Link HTTP header to my homepage pointing to my API catalog or machine-readable documentation.
Format: Link: <https://api.example.com/catalog>; rel="api-catalog"`,

  token_bloat: `My documentation is returning excessive HTML to AI agents.
Implement server-side content negotiation in my app.

When a request includes the header 'Accept: text/markdown',
return ONLY the technical content as clean Markdown.

Strip completely: navigation menus, footers, cookie banners,
sidebar links, breadcrumbs, social sharing buttons,
interactive widgets, and any HTML not containing technical content.

The response should contain only:
- Page title as H1
- Section headings as H2/H3
- Body text
- Code blocks with language tags
- Parameter tables
- No HTML tags, no CSS, no scripts`,

  incomplete_snippets: `Review every code example in my documentation.
For each snippet, ensure it is fully self-contained and executable.

Every code block must include:
1. All import / require statements at the top
2. Package installation command in a comment
3. Authentication initialization if the code makes API calls
4. All variables defined before use — no undefined references
5. Inline comments explaining WHY each step is done, not just what

An AI agent copying this snippet must be able to run it
without searching for any additional information.`,

  structural_issues: `Review the markdown structure of my documentation. Ensure there is a consistent header hierarchy (H1 -> H2 -> H3) with no skipped levels. Agents rely on this hierarchy for context.`
};
