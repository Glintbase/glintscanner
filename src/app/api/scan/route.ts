import { checkContext } from '@/lib/scanner/checkContext';
import { checkCode } from '@/lib/scanner/checkCode';
import { checkMachine } from '@/lib/scanner/checkMachine';
import { checkTooling } from '@/lib/scanner/checkTooling';
import { supabase } from '@/lib/supabase/client';

export const runtime = 'edge';

function calculateScore(checks: any[]) {
  return checks.reduce((total, check) => total + (check.score || 0), 0);
}

export async function POST(req: Request) {
  const { url } = await req.json();

  if (!url) {
    return new Response(JSON.stringify({ error: 'URL is required' }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(data) + '\n'));
      };

      try {
        // Step 0: DNS & Reachability Validation
        const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
        if (!isLocal) {
          send({ type: 'progress', check: 'validation', status: 'running' });
          let reachable = false;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);

          try {
            await fetch(url, {
              method: 'HEAD',
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Glintscanner/1.0)'
              }
            });
            reachable = true;
          } catch (headErr) {
            // Some servers block HEAD. Fallback to GET.
            const getController = new AbortController();
            const getTimeoutId = setTimeout(() => getController.abort(), 6000);
            try {
              await fetch(url, {
                method: 'GET',
                signal: getController.signal,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; Glintscanner/1.0)'
                }
              });
              reachable = true;
            } catch (getErr: any) {
              reachable = false;
            } finally {
              clearTimeout(getTimeoutId);
            }
          } finally {
            clearTimeout(timeoutId);
          }

          if (!reachable) {
            throw new Error(`Invalid domain. Please make sure the domain is valid and reachable.`);
          }
          send({ type: 'progress', check: 'validation', status: 'done' });
        }

        // Step 1: Firecrawl extraction
        send({ type: 'progress', check: 'extraction', status: 'running' });
        
        let markdown = '';
        if (process.env.FIRECRAWL_API_KEY) {
          const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
            },
            body: JSON.stringify({ url, formats: ['markdown'] })
          });

          const scrapeResult = await response.json();
          if (scrapeResult.success && scrapeResult.data) {
            markdown = scrapeResult.data.markdown || '';
          } else {
             send({ type: 'warning', message: 'Extraction failed: ' + (scrapeResult.error || 'Unknown error') });
          }
        } else {
          send({ type: 'warning', message: 'FIRECRAWL_API_KEY not set, using mock extraction.' });
          markdown = `# Mock Extraction for ${url}\n\n## Setup\n\`\`\`bash\nnpm install example\n\`\`\``;
        }
        
        send({ type: 'progress', check: 'extraction', status: 'done' });

        // Step 2: All checks in parallel
        send({ type: 'progress', check: 'analysis', status: 'running' });

        const [context, code, machine, agent] = await Promise.all([
          checkContext(url, markdown).then(r => { send({ type: 'check', ...r }); return r; }),
          checkCode(markdown).then(r => { send({ type: 'check', ...r }); return r; }),
          checkMachine(url).then(r => { send({ type: 'check', ...r }); return r; }),
          checkTooling(url, markdown).then(r => { send({ type: 'check', ...r }); return r; })
        ]);

        const checksData = [context, code, machine, agent];
        const score = calculateScore(checksData);
        
        let savedId = null;
        try {
          if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://mock.supabase.co') {
            const { data, error: dbError } = await supabase
              .from('public_scans')
              .insert([{ url, score, checks: checksData }])
              .select('id')
              .single();

            if (dbError) {
              console.error('Database insertion error:', dbError.message);
            } else if (data) {
              savedId = data.id;
            }
          }
        } catch (dbErr: any) {
          console.error('Database connection failed:', dbErr.message);
        }
        
        send({ 
          type: 'complete', 
          score, 
          checks: checksData,
          id: savedId
        });

      } catch (error: any) {
        send({ type: 'error', message: error.message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 
      'Content-Type': 'text/plain', 
      'Transfer-Encoding': 'chunked' 
    }
  });
}
