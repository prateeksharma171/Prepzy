import type { ReactNode } from 'react';
import CodeBlock from './CodeBlock';

interface MarkdownContentProps {
  content: string;
}

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;
const NUMBERED_RE = /^\d+\.\s+(.*)$/;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;

  // A fresh regex literal per call (rather than a shared module-level `g`-flagged one) avoids
  // mutable `.lastIndex` state that concurrent/interrupted renders could corrupt.
  for (const match of text.matchAll(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
    const index = match.index;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}-b-${i++}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(
        <code key={`${keyPrefix}-c-${i++}`} className="px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-300 text-[13px] font-mono">
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function renderTextBlock(block: string, keyPrefix: string): ReactNode[] {
  const lines = block.split('\n');
  const elements: ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;
  let i = 0;

  const flushList = () => {
    if (!listBuffer) return;
    const items = listBuffer.items;
    const ordered = listBuffer.ordered;
    const key = `${keyPrefix}-list-${elements.length}`;
    elements.push(
      ordered ? (
        <ol key={key} className="list-decimal pl-5 space-y-1 my-2">
          {items.map((item, idx) => (
            <li key={idx} className="text-zinc-100">
              {renderInline(item, `${key}-${idx}`)}
            </li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="list-disc pl-5 space-y-1 my-2">
          {items.map((item, idx) => (
            <li key={idx} className="text-zinc-100">
              {renderInline(item, `${key}-${idx}`)}
            </li>
          ))}
        </ul>
      )
    );
    listBuffer = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const heading = HEADING_RE.exec(line);
    const bullet = BULLET_RE.exec(line);
    const numbered = NUMBERED_RE.exec(line);

    if (heading) {
      flushList();
      const level = heading[1].length;
      const key = `${keyPrefix}-h-${i}`;
      const text = renderInline(heading[2], key);
      if (level <= 2) {
        elements.push(
          <h2 key={key} className="text-lg font-semibold text-white mt-4 mb-2 text-balance">
            {text}
          </h2>
        );
      } else if (level === 3) {
        elements.push(
          <h3 key={key} className="text-[15px] font-semibold text-zinc-100 mt-3 mb-1.5">
            {text}
          </h3>
        );
      } else {
        elements.push(
          <h4 key={key} className="text-[14px] font-semibold text-zinc-200 mt-2 mb-1">
            {text}
          </h4>
        );
      }
      i++;
      continue;
    }

    if (bullet) {
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(bullet[1]);
      i++;
      continue;
    }

    if (numbered) {
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(numbered[1]);
      i++;
      continue;
    }

    if (line.trim() === '') {
      flushList();
      i++;
      continue;
    }

    flushList();
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !HEADING_RE.test(lines[i]) &&
      !BULLET_RE.test(lines[i]) &&
      !NUMBERED_RE.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    const key = `${keyPrefix}-p-${i}`;
    elements.push(
      <p key={key} className="text-[15px] leading-relaxed text-zinc-100 my-2">
        {renderInline(paraLines.join(' '), key)}
      </p>
    );
  }

  flushList();
  return elements;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let blockIndex = 0;

  for (const match of content.matchAll(/```(\w*)\n?([\s\S]*?)```/g)) {
    const index = match.index;
    if (index > lastIndex) {
      nodes.push(...renderTextBlock(content.slice(lastIndex, index), `blk-${blockIndex++}`));
    }
    nodes.push(<CodeBlock key={`code-${blockIndex++}`} language={match[1]} code={match[2].replace(/\n$/, '')} />);
    lastIndex = index + match[0].length;
  }

  const remaining = content.slice(lastIndex);
  // A fence that's opened but hasn't closed yet — the closing ``` is still streaming in. Render
  // it as an in-progress code block instead of dumping raw ``` markers and code into a plain
  // paragraph, which otherwise stays garbled until the close arrives and everything re-parses at
  // once (looking like the whole reply "appeared" rather than having streamed in).
  const openFence = /```(\w*)\n?([\s\S]*)$/.exec(remaining);
  if (openFence) {
    if (openFence.index > 0) {
      nodes.push(...renderTextBlock(remaining.slice(0, openFence.index), `blk-${blockIndex++}`));
    }
    nodes.push(<CodeBlock key={`code-${blockIndex++}`} language={openFence[1]} code={openFence[2]} />);
  } else if (remaining) {
    nodes.push(...renderTextBlock(remaining, `blk-${blockIndex++}`));
  }

  return <div className="space-y-1">{nodes}</div>;
}
