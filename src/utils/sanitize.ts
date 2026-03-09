const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>\s*/gi;
const ORPHAN_THINK_END_RE = /^[\s\S]*?<\/think>\s*/i;
const THINK_TAG_RE = /<\/?think>/gi;

export function stripThinkingTokens(text: string): string {
  if (!text) {
    return '';
  }

  return text
    .replace(THINK_BLOCK_RE, '')
    .replace(ORPHAN_THINK_END_RE, '')
    .replace(THINK_TAG_RE, '')
    .trimStart();
}

export class ThinkingTokenStreamSanitizer {
  private buffer = '';
  private hasReleasedContent = false;

  public push(chunk: string): string {
    if (!chunk) {
      return '';
    }

    if (this.hasReleasedContent) {
      return stripThinkingTokens(chunk);
    }

    this.buffer += chunk;

    const closingTagIndex = this.buffer.toLowerCase().indexOf('</think>');
    if (closingTagIndex >= 0) {
      const sanitized = stripThinkingTokens(this.buffer);
      this.buffer = '';
      this.hasReleasedContent = true;
      return sanitized;
    }

    const normalizedBuffer = this.buffer.toLowerCase();
    const mightBeThinking =
      normalizedBuffer.includes('<think') ||
      normalizedBuffer.includes('</think') ||
      normalizedBuffer.startsWith('okay') ||
      normalizedBuffer.startsWith('let me') ||
      normalizedBuffer.startsWith('i need');

    if (mightBeThinking) {
      return '';
    }

    if (this.buffer.length >= 120) {
      const flushed = this.buffer;
      this.buffer = '';
      this.hasReleasedContent = true;
      return stripThinkingTokens(flushed);
    }

    return '';
  }

  public flush(): string {
    if (!this.buffer) {
      return '';
    }

    const flushed = stripThinkingTokens(this.buffer);
    this.buffer = '';
    this.hasReleasedContent = true;
    return flushed;
  }
}
