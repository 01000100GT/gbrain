import { describe, test, expect } from 'bun:test';
import { parseMarkdown, serializeMarkdown, splitBody } from '../src/core/markdown.ts';

describe('Markdown Parser', () => {
  test('parses frontmatter + compiled_truth + timeline', () => {
    const md = `---
type: person
title: Pedro Franceschi
tags: [founder, fintech]
---

Pedro is the co-founder of Brex.

---

- 2024-01-15: Met at dinner
- 2024-03-20: Brex Series D
`;
    const parsed = parseMarkdown(md);
    expect(parsed.type).toBe('person');
    expect(parsed.title).toBe('Pedro Franceschi');
    expect(parsed.tags).toEqual(['founder', 'fintech']);
    expect(parsed.compiled_truth).toContain('co-founder of Brex');
    expect(parsed.timeline).toContain('Met at dinner');
    expect(parsed.timeline).toContain('Brex Series D');
  });

  test('handles no timeline separator', () => {
    const md = `---
type: company
title: Brex
---

Brex is a fintech company.
They do corporate cards.
`;
    const parsed = parseMarkdown(md);
    expect(parsed.compiled_truth).toContain('fintech company');
    expect(parsed.timeline).toBe('');
  });

  test('handles empty body', () => {
    const md = `---
type: concept
title: Empty Page
---
`;
    const parsed = parseMarkdown(md);
    expect(parsed.compiled_truth).toBe('');
    expect(parsed.timeline).toBe('');
  });

  test('removes type, title, tags from frontmatter object', () => {
    const md = `---
type: person
title: Test
tags: [a, b]
custom_field: hello
---

Content
`;
    const parsed = parseMarkdown(md);
    expect(parsed.frontmatter).not.toHaveProperty('type');
    expect(parsed.frontmatter).not.toHaveProperty('title');
    expect(parsed.frontmatter).not.toHaveProperty('tags');
    expect(parsed.frontmatter).toHaveProperty('custom_field', 'hello');
  });

  test('infers type from file path', () => {
    const md = `---
title: Someone
---
Content
`;
    const parsed = parseMarkdown(md, 'people/someone.md');
    expect(parsed.type).toBe('person');
  });

  test('infers slug from file path', () => {
    const md = `---
type: person
title: Test
---
Content
`;
    const parsed = parseMarkdown(md, 'people/pedro-franceschi.md');
    expect(parsed.slug).toBe('people/pedro-franceschi');
  });
});

describe('splitBody', () => {
  test('splits at first standalone ---', () => {
    const body = 'Above the line\n\n---\n\nBelow the line';
    const { compiled_truth, timeline } = splitBody(body);
    expect(compiled_truth).toContain('Above the line');
    expect(timeline).toContain('Below the line');
  });

  test('returns all as compiled_truth if no separator', () => {
    const body = 'Just some content\nWith multiple lines';
    const { compiled_truth, timeline } = splitBody(body);
    expect(compiled_truth).toBe(body);
    expect(timeline).toBe('');
  });

  test('handles --- at end of content', () => {
    const body = 'Content here\n\n---\n';
    const { compiled_truth, timeline } = splitBody(body);
    expect(compiled_truth).toContain('Content here');
    expect(timeline.trim()).toBe('');
  });
});

describe('serializeMarkdown', () => {
  test('round-trips through parse and serialize', () => {
    const original = `---
type: person
title: Pedro Franceschi
tags:
  - founder
  - fintech
custom: value
---

Pedro is the co-founder of Brex.

---

- 2024-01-15: Met at dinner
`;
    const parsed = parseMarkdown(original);
    const serialized = serializeMarkdown(
      parsed.frontmatter,
      parsed.compiled_truth,
      parsed.timeline,
      { type: parsed.type, title: parsed.title, tags: parsed.tags },
    );

    // Re-parse the serialized version
    const reparsed = parseMarkdown(serialized);
    expect(reparsed.type).toBe(parsed.type);
    expect(reparsed.title).toBe(parsed.title);
    expect(reparsed.compiled_truth).toBe(parsed.compiled_truth);
    expect(reparsed.timeline).toBe(parsed.timeline);
    expect(reparsed.frontmatter.custom).toBe('value');
  });
});
