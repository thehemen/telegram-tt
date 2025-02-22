import type { ApiFormattedText, ApiMessageEntity } from '../api/types';
import { ApiMessageEntityTypes } from '../api/types';

import { RE_LINK_TEMPLATE } from '../config';
import { IS_EMOJI_SUPPORTED } from './windowEnvironment';

export const ENTITY_CLASS_BY_NODE_NAME: Record<string, ApiMessageEntityTypes> = {
  B: ApiMessageEntityTypes.Bold,
  STRONG: ApiMessageEntityTypes.Bold,
  I: ApiMessageEntityTypes.Italic,
  EM: ApiMessageEntityTypes.Italic,
  INS: ApiMessageEntityTypes.Underline,
  U: ApiMessageEntityTypes.Underline,
  S: ApiMessageEntityTypes.Strike,
  STRIKE: ApiMessageEntityTypes.Strike,
  DEL: ApiMessageEntityTypes.Strike,
  CODE: ApiMessageEntityTypes.Code,
  PRE: ApiMessageEntityTypes.Pre,
  BLOCKQUOTE: ApiMessageEntityTypes.Blockquote,
};

// Represents the various “types” of nodes we can have.
enum ASTNodeType {
  Root = 'root',
  Text = 'text',
  Bold = 'bold',
  Italic = 'italic',
  Underline = 'underline',
  Strike = 'strike',
  Spoiler = 'spoiler',
  Code = 'code',       // Inline code
  Pre = 'pre',         // Code block
  Link = 'link',       // TextUrl
  CustomEmoji = 'customEmoji',
  // ... Extend with 'blockquote', 'mention', etc. as needed.
}

// A node in our AST.
interface ASTNode {
  type: ASTNodeType;
  text?: string;             // Used for plain text nodes or link text, code text, etc.
  url?: string;              // For link nodes
  documentId?: string;       // For custom emoji
  language?: string;         // For triple-backtick code block with optional language
  children?: ASTNode[];      // Nested children (e.g., bold inside italic)
}

// Telegram’s entity structure. (Simplified from your codebase)
interface ApiMessageEntity {
  type: string;       // e.g. 'bold', 'italic', 'spoiler', 'textUrl', etc.
  offset: number;     // Where in the final text the format begins
  length: number;     // The length of the formatted substring
  url?: string;       // For 'textUrl'
  documentId?: string;// For 'customEmoji'
  language?: string;  // For code blocks
}

// The final output your parser returns.
interface ApiFormattedText {
  text: string;
  entities?: ApiMessageEntity[];
}

interface Token {
  type: 'text' | 'bold' | 'italic' | 'codeBlock' | 'inlineCode' | 'strikethrough' | 'spoiler' | 'openBracket' | 'closeBracket' | 'parenOpen' | 'parenClose' | 'customEmoji' | 'newline' | 'whitespace';
  value: string;
}

function tokenizeMarkdown(input: string): Token[] {
  // Example patterns for some basic tokens:
  // This is not an exhaustive approach; you might handle them with more advanced logic or multiple passes.
  
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Check for triple backticks (code block)
    if (input.startsWith('```', i)) {
      tokens.push({ type: 'codeBlock', value: '```' });
      i += 3;
      continue;
    }
    // Check for single backtick (inline code)
    if (input[i] === '`') {
      tokens.push({ type: 'inlineCode', value: '`' });
      i += 1;
      continue;
    }
    // Check for bold marker **
    if (input.startsWith('**', i)) {
      tokens.push({ type: 'bold', value: '**' });
      i += 2;
      continue;
    }
    // Check for italic marker __
    if (input.startsWith('__', i)) {
      tokens.push({ type: 'italic', value: '__' });
      i += 2;
      continue;
    }
    // Check for strikethrough marker ~~
    if (input.startsWith('~~', i)) {
      tokens.push({ type: 'strikethrough', value: '~~' });
      i += 2;
      continue;
    }
    // Check for spoiler marker ||
    if (input.startsWith('||', i)) {
      tokens.push({ type: 'spoiler', value: '||' });
      i += 2;
      continue;
    }
    // Check for [ or ] or ( or )
    if (input[i] === '[') {
      tokens.push({ type: 'openBracket', value: '[' });
      i += 1;
      continue;
    }
    if (input[i] === ']') {
      tokens.push({ type: 'closeBracket', value: ']' });
      i += 1;
      continue;
    }
    if (input[i] === '(') {
      tokens.push({ type: 'parenOpen', value: '(' });
      i += 1;
      continue;
    }
    if (input[i] === ')') {
      tokens.push({ type: 'parenClose', value: ')' });
      i += 1;
      continue;
    }

    // Otherwise, accumulate text until we hit a marker or end-of-string
    let textBuffer = '';
    while (
      i < input.length &&
      !input.startsWith('```', i) &&
      !input.startsWith('**', i) &&
      !input.startsWith('__', i) &&
      !input.startsWith('~~', i) &&
      !input.startsWith('||', i) &&
      !['`', '[', ']', '(', ')'].includes(input[i])
    ) {
      textBuffer += input[i];
      i += 1;
    }
    if (textBuffer) {
      tokens.push({ type: 'text', value: textBuffer });
    }
  }

  return tokens;
}

function parseTokensToAST(tokens: Token[]): ASTNode {
  const root: ASTNode = { type: ASTNodeType.Root, children: [] };
  let i = 0;

  function parseInline(parent: ASTNode, endTokenType?: Token['type']): void {
    while (i < tokens.length) {
      const token = tokens[i];

      // If an end token is expected and we encounter it, consume it and return.
      if (endTokenType && token.type === endTokenType) {
        i++; // consume closing marker
        return;
      }

      switch (token.type) {
        case 'text':
          parent.children!.push({ type: ASTNodeType.Text, text: token.value });
          i++;
          break;

        case 'bold':
          i++; // consume the opening '**'
          const boldNode: ASTNode = { type: ASTNodeType.Bold, children: [] };
          parent.children!.push(boldNode);
          // Recursively parse until we hit the closing bold marker.
          parseInline(boldNode, 'bold');
          break;

        case 'italic':
          i++; // consume the opening '__'
          const italicNode: ASTNode = { type: ASTNodeType.Italic, children: [] };
          parent.children!.push(italicNode);
          parseInline(italicNode, 'italic');
          break;

        case 'strikethrough':
          i++; // consume the opening '~~'
          const strikeNode: ASTNode = { type: ASTNodeType.Strike, children: [] };
          parent.children!.push(strikeNode);
          parseInline(strikeNode, 'strikethrough');
          break;

        case 'spoiler':
          i++; // consume the opening '||'
          const spoilerNode: ASTNode = { type: ASTNodeType.Spoiler, children: [] };
          parent.children!.push(spoilerNode);
          parseInline(spoilerNode, 'spoiler');
          break;

        case 'inlineCode':
          i++; // consume the opening '`'
          const codeNode: ASTNode = { type: ASTNodeType.Code, children: [] };
          parent.children!.push(codeNode);
          parseInline(codeNode, 'inlineCode');
          break;

        case 'codeBlock':
          // Consume the opening triple-backticks.
          i += 1; 
          const codeBlock: ASTNode = { type: ASTNodeType.Pre, children: [] };
          // Collect raw text until we see the closing triple-backticks.
          const blockText: string[] = [];
          while (i < tokens.length && tokens[i].type !== 'codeBlock') {
            blockText.push(tokens[i].value);
            i += 1;
          }
          // Consume the closing triple-backticks if present.
          if (i < tokens.length && tokens[i].type === 'codeBlock') {
            i += 1;
          }
          // Combine the collected text.
          let combined = blockText.join('');
          // Remove a leading newline if present.
          if (combined.startsWith('\n')) {
            combined = combined.slice(1);
          }
          // Optionally, also trim trailing newlines:
          combined = combined.replace(/\n+$/, '');
          codeBlock.text = combined;
          parent.children!.push(codeBlock);
          break;

        case 'openBracket':
          // This case handles links or custom emoji.
          i++; // consume '['
          const linkText: string[] = [];
          while (i < tokens.length && tokens[i].type !== 'closeBracket') {
            linkText.push(tokens[i].value);
            i++;
          }
          if (i < tokens.length && tokens[i].type === 'closeBracket') {
            i++; // consume ']'
          }
          // Next token should be '('
          if (i < tokens.length && tokens[i].type === 'parenOpen') {
            i++; // consume '('
            const urlText: string[] = [];
            while (i < tokens.length && tokens[i].type !== 'parenClose') {
              urlText.push(tokens[i].value);
              i++;
            }
            if (i < tokens.length && tokens[i].type === 'parenClose') {
              i++; // consume ')'
            }
            const fullUrl = urlText.join('').trim();
            if (fullUrl.startsWith('customEmoji:')) {
              const docId = fullUrl.replace('customEmoji:', '');
              parent.children!.push({
                type: ASTNodeType.CustomEmoji,
                text: linkText.join(''),
                documentId: docId,
              });
            } else {
              parent.children!.push({
                type: ASTNodeType.Link,
                text: linkText.join(''),
                url: fullUrl,
              });
            }
          }
          break;

        default:
          // If we encounter an unexpected token, we treat it as text.
          parent.children!.push({ type: ASTNodeType.Text, text: token.value });
          i++;
          break;
      }
    }
  }

  parseInline(root);
  return root;
}

function flattenAST(
  node: ASTNode,
  parentTypes: ASTNodeType[] = [],
  currentOffset: { value: number } = { value: 0 },
  entities: ApiMessageEntity[] = [],
  textAccumulator: string[] = [],
): { text: string, entities: ApiMessageEntity[] } {
  let startOffset = currentOffset.value;

  // For Pre nodes, include language if available.
  if (node.type === ASTNodeType.Pre) {
    let content = node.text || '';
    if (node.language) {
      // Prepend the language and a newline.
      content = node.language + "\n" + content;
    }
    textAccumulator.push(content);
    currentOffset.value += content.length;
  }
  // Otherwise, if it's a leaf text node:
  else if (
    (node.type === ASTNodeType.Text ||
     node.type === ASTNodeType.Code ||
     node.type === ASTNodeType.CustomEmoji ||
     node.type === ASTNodeType.Link) && node.text
  ) {
    textAccumulator.push(node.text);
    currentOffset.value += node.text.length;
  }

  // Recurse into children.
  if (node.children) {
    for (const child of node.children) {
      flattenAST(child, [...parentTypes, node.type], currentOffset, entities, textAccumulator);
    }
  }

  const endOffset = currentOffset.value;

  // Determine if this node corresponds to an entity.
  let entityType: string | undefined;
  let extraData: Partial<ApiMessageEntity> = {};

  switch (node.type) {
    case ASTNodeType.Bold:
      entityType = ApiMessageEntityTypes.Bold;
      break;
    case ASTNodeType.Italic:
      entityType = ApiMessageEntityTypes.Italic;
      break;
    case ASTNodeType.Underline:
      entityType = ApiMessageEntityTypes.Underline;
      break;
    case ASTNodeType.Strike:
      entityType = ApiMessageEntityTypes.Strike;
      break;
    case ASTNodeType.Spoiler:
      entityType = ApiMessageEntityTypes.Spoiler;
      break;
    case ASTNodeType.Code:
      entityType = ApiMessageEntityTypes.Code;
      break;
    case ASTNodeType.Pre:
      entityType = ApiMessageEntityTypes.Pre;
      // Optionally store language
      if (node.language) extraData.language = node.language;
      break;
    case ASTNodeType.CustomEmoji:
      entityType = ApiMessageEntityTypes.CustomEmoji;
      extraData.documentId = node.documentId;
      break;
    case ASTNodeType.Link:
      if (node.url && node.url !== node.text) {
        entityType = ApiMessageEntityTypes.TextUrl;
        extraData.url = node.url;
      } else {
        entityType = ApiMessageEntityTypes.Url;
      }
      break;
  }

  if (entityType && endOffset > startOffset) {
    entities.push({
      type: entityType,
      offset: startOffset,
      length: endOffset - startOffset,
      ...extraData,
    });
  }

  return { text: textAccumulator.join(''), entities };
}

function decodeHTMLEntities(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

export default function parseHtmlAsFormattedText(input: string): ApiFormattedText {
  // Detect if the input ends with a <br> tag (possibly with whitespace)
  const preserveTrailingNewline = /<br\s*\/?>\s*$/i.test(input);

  // 1. Strip redundant &nbsp; characters.
  input = input.replace(/&nbsp;/g, ' ');

  // 2. Replace <div><br></div> with newline (for Safari).
  input = input.replace(/<div><br([^>]*)?><\/div>/g, '\n');
  // 3. Replace <br> tags with newline.
  input = input.replace(/<br([^>]*)?>/g, '\n');

  // 4. Replace <div> tags with newlines.
  input = input.replace(/<\/div>(\s*)<div>/g, '\n');
  input = input.replace(/<div>/g, '\n');
  input = input.replace(/<\/div>/g, '');

  // 5. If custom emoji are not supported, replace any <img> with its alt text wrapped in square brackets.
  if (!IS_EMOJI_SUPPORTED) {
    input = input.replace(/\[<img[^>]+alt="([^"]+)"[^>]*>]/gm, '[$1]');
  }

  // 6. If the original input did not have a trailing <br>,
  // then trim any accidental trailing newlines.
  if (!preserveTrailingNewline) {
    input = input.replace(/\n+$/, '');
  }

  // 6. Tokenize the (cleaned) input.
  const tokens = tokenizeMarkdown(input);

  // 8. Build the AST.
  const astRoot = parseTokensToAST(tokens);

  // 9. Flatten the AST to produce text and entities.
  var { text, entities } = flattenAST(astRoot);

  // 10. If we need to preserve a trailing newline (from a trailing <br>)
  // and the text doesn't already end with one, append a newline.
  if (preserveTrailingNewline && !text.endsWith('\n')) {
    text += '\n';
  }

  // 11. Decode HTML entities in the final text so that &lt;br&gt; becomes "<br>"
  const finalText = decodeHTMLEntities(text);

  return {
    text: finalText,
    entities: entities.length ? entities : undefined,
  };
}

export function fixImageContent(fragment: HTMLDivElement) {
  fragment.querySelectorAll('img').forEach((node) => {
    if (node.dataset.documentId) { // Custom Emoji
      node.textContent = (node as HTMLImageElement).alt || '';
    } else { // Regular emoji with image fallback
      node.replaceWith(node.alt || '');
    }
  });
}
