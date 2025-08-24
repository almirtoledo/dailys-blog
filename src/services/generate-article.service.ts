import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import OpenAI from 'openai';

@Injectable()
export class GenerateArticleService {
  private readonly ai: OpenAI;
  private readonly logger = new Logger(GenerateArticleService.name);

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      this.logger.error('OPENAI_API_KEY is not set');
      return;
    }
    this.ai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generate(keyword?: string): Promise<{
    title: string;
    subtitle: string;
    content: string;
  }> {
    if (!this.ai) {
      this.logger.error(
        'OpenAI client is not initialized. Set OPENAI_API_KEY in env.',
      );
      throw new Error('OpenAI client not initialized');
    }

    this.logger.log('Requesting article generation from OpenAI...');

    const systemPrompt = `
You are an assistant that MUST return exactly one valid JSON object and nothing else.
The JSON object must contain exactly the keys: "title", "subtitle", "content".
- "title": short, SEO-friendly title (string).
- "subtitle": short SEO-friendly subtitle (string).
- "content": a full article body as a single string containing HTML paragraph tags only (use <p>...</p> for each paragraph). No other HTML tags are allowed.
Requirements for the article:
- Evergreen topic useful long-term.
- 100% focused on SEO for Google (include natural language, semantic phrases, and practical sections useful to readers).
- High readability and performance (concise paragraphs, clear headings in text form if needed but do NOT include <h1>/<h2> tags — only paragraphs).
- Keep the article between ~3 and ~12 paragraphs.
- Do not include images, scripts, or any binary data.
- Do not include explanations, surrounding text, or metadata outside the single JSON object.
- Do not include markdown code fences or backticks.
Return only valid JSON (no leading/trailing text).
`;

    const userPromptBase = `Generate an evergreen SEO-optimized article following the system instructions above.
Make sure "content" uses <p>...</p> tags for each paragraph and is valid JSON string content (HTML inside).
Keep language in Portuguese (pt-BR).`;
    const topicInstruction =
      keyword && keyword.trim()
        ? `\nFoque o artigo no tópico em tendência: "${keyword.trim()}".`
        : '';
    const userPrompt = userPromptBase + topicInstruction;

    try {
      const completion = (await this.ai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1600,
      })) as unknown;

      let raw: string | undefined;
      const compRecord = completion as Record<string, unknown> | null;
      if (compRecord && Array.isArray(compRecord['choices'])) {
        const choices = compRecord['choices'] as unknown[];
        if (choices.length > 0) {
          const first = choices[0] as Record<string, unknown> | null;
          if (
            first &&
            typeof first['message'] === 'object' &&
            first['message'] !== null
          ) {
            const message = first['message'] as Record<string, unknown>;
            const content = message['content'];
            if (typeof content === 'string') {
              raw = content;
            }
          }
        }
      }

      if (!raw) {
        this.logger.error('Empty response from OpenAI');
        throw new Error('Empty response from OpenAI');
      }

      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      const jsonText =
        firstBrace !== -1 && lastBrace !== -1
          ? raw.slice(firstBrace, lastBrace + 1)
          : raw;

      const cleaned = jsonText
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/g, '')
        .trim();

      let parsedUnknown: unknown;
      try {
        parsedUnknown = JSON.parse(cleaned);
      } catch (parseErr) {
        this.logger.error(
          'Failed to parse JSON from AI response',
          parseErr instanceof Error ? parseErr.message : String(parseErr),
        );
        this.logger.debug('Raw AI response:', raw);
        throw new Error('Failed to parse JSON from AI response');
      }

      // Validate parsed shape
      if (typeof parsedUnknown !== 'object' || parsedUnknown === null) {
        this.logger.error('Parsed JSON is not an object');
        throw new Error('Parsed JSON is not an object');
      }

      const parsedObj = parsedUnknown as Record<string, unknown>;
      const title =
        typeof parsedObj.title === 'string' ? parsedObj.title.trim() : '';
      const subtitle =
        typeof parsedObj.subtitle === 'string' ? parsedObj.subtitle.trim() : '';
      let content =
        typeof parsedObj.content === 'string' ? parsedObj.content : '';

      if (!title || !subtitle || !content) {
        this.logger.warn(
          'Parsed JSON is missing expected keys or they are not strings. Saving raw response for inspection.',
        );
      }

      if (!content.includes('<p')) {
        const paragraphs = content
          .split(/\n{2,}|\r\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);

        content =
          paragraphs.length > 0
            ? paragraphs.map((p) => `<p>${p}</p>`).join('')
            : `<p>${String(content).trim()}</p>`;
      } else {
        content = content.trim();
      }

      const result = { title, subtitle, content };

      const outDir = path.join(process.cwd(), 'generated');

      fs.mkdirSync(outDir, { recursive: true });
      const filename = `article-${Date.now()}.json`;
      const filePath = path.join(outDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');

      this.logger.log(`Article saved to ${filePath}`);

      return result;
    } catch (error) {
      this.logger.error(
        'Error generating article',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
}
