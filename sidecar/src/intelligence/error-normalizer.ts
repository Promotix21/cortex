/**
 * Error Normalizer
 *
 * Strips dynamic data (UUIDs, hex, numbers, timestamps) from error messages
 * to create stable signatures for fuzzy matching.
 */

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX_REGEX = /\b0x[0-9a-f]+\b/gi;
const NUMBER_REGEX = /\b\d+\b/g;
const TIMESTAMP_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g;
const FILE_LINE_REGEX = /:\d+(?::\d+)?/g;
const QUOTED_STR_REGEX = /['"`](.*?)['"`]/g;

/**
 * Normalize an error message by replacing dynamic parts with placeholders.
 */
export function normalizeError(message: string): string {
  if (!message) return '';

  let normalized = message;

  // Replace timestamps
  normalized = normalized.replace(TIMESTAMP_REGEX, '<timestamp>');

  // Replace UUIDs
  normalized = normalized.replace(UUID_REGEX, '<uuid>');

  // Replace Hex addresses
  normalized = normalized.replace(HEX_REGEX, '<hex>');

  // Replace file line/column numbers
  normalized = normalized.replace(FILE_LINE_REGEX, ':<line>');

  // Replace standalone numbers (but keep them if they're likely part of a version or error code)
  // Simple heuristic: only replace if they aren't preceded by 'v' or 'version'
  normalized = normalized.replace(/\b(?<!v|version\s)\d+\b/gi, '<num>');

  // Replace quoted strings (often contain dynamic file paths or names)
  normalized = normalized.replace(QUOTED_STR_REGEX, '"<str>"');

  // Collapse multiple spaces and trim
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Create a stable signature from an error type and message.
 */
export function createErrorSignature(type: string, message: string): string {
  const normalized = normalizeError(message);
  return `${type}:${normalized.slice(0, 150)}`;
}
