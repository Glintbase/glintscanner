export const dynamic = 'force-static';

export async function GET() {
  const data = {
    "$schema": "https://glama.ai/mcp/schemas/connector.json",
    "claim": "glama_claim_Rhux5tVDfp7ceLujWSyM4ISV8gfXJ9Hf"
  };

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
