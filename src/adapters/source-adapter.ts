export interface AdapterParseResult {
  metadata: {
    title?: string;
    author?: string;
    publishedAt?: string;
  };
  chunks: Array<{
    text: string;
    tokenCount?: number;
  }>;
  checksum?: string;
  fetchedAt: string;
}

export interface SourceAdapter {
  supports(url: string): boolean;
  detectType(url: string): 'article' | 'x' | 'youtube' | 'pdf' | 'unknown';
  fetchAndParse(input: { url: string }): Promise<AdapterParseResult>;
}
